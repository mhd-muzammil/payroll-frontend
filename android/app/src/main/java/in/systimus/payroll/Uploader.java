package in.systimus.payroll;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;

/**
 * Sends what the outbox holds to the server from the phone itself.
 *
 * WHY. Until 1.5 every position went out through the web page, and a page only
 * runs while the app is open: Android freezes it in the background and it is
 * gone once the app is swiped away. Fixes then sat on the phone until the
 * engineer next opened the app -- hours later, sometimes the next morning --
 * and the board read "No signal" for a man who was riding the whole time. Now
 * the service posts them itself, open app or not, and the page only shows them.
 *
 * ONE SENDER. While this sends, the page sends nothing, so a fix never travels
 * two ways at once. Each still carries its client_key: a request that timed out
 * after the server had stored it is simply sent again, and stored once.
 *
 * One thread, never the plugin's. Every request has a connect and a read
 * timeout -- Android's default for both is forever, and a half-open socket at a
 * tower handover would otherwise hold the uploader for hours.
 */
final class Uploader {
    static final String EVENTS_PATH = "/api/tracking/events/";
    static final String PINGS_PATH = "/api/tracking/ping/batch/";
    static final String REFRESH_PATH = "/api/auth/refresh/";

    private static final String TAG = "DutyTracker";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final Object NET_LOCK = new Object();

    private final Context context;
    private final DutyTrackerService service;
    private final DutyTrackerService.Awake awake;
    private final ExecutorService thread = Executors.newSingleThreadExecutor(new ThreadFactory() {
        @Override
        public Thread newThread(Runnable runnable) {
            return new Thread(runnable, "DutyTrackerUpload");
        }
    });
    private final TrackerRules.Hold hold = new TrackerRules.Hold();

    private boolean scheduled;
    private boolean heartbeatWanted;
    /** elapsedRealtime of the last request, for the thirty-second rule; -1 before the first. */
    private volatile long lastAttempt = -1L;

    /** What one pass learned along the way. */
    private static final class Pass {
        boolean noted;
        boolean lastAnswered;
        boolean anyAnswered;
    }

    /** The server's answer, or status -1 when there was none at all. */
    private static final class Reply {
        final int status;
        final String body;

        Reply(int status, String body) {
            this.status = status;
            this.body = body;
        }

        boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /** Where to send and as whom, read once per pass. */
    private static final class Connection {
        final String baseUrl;
        final String user;
        final String appVersion;
        String access;
        String refresh;

        Connection(String baseUrl, String access, String refresh, String user, String appVersion) {
            this.baseUrl = baseUrl;
            this.access = access;
            this.refresh = refresh;
            this.user = user;
            this.appVersion = appVersion;
        }
    }

    Uploader(Context context, DutyTrackerService service, DutyTrackerService.Awake awake) {
        this.context = context.getApplicationContext();
        this.service = service;
        this.awake = awake;
    }

    /**
     * Send soon, unless a pass is already waiting to run.
     *
     * @param heartbeat say "still here" even when there is nothing to send
     */
    void trigger(boolean heartbeat) {
        synchronized (this) {
            if (heartbeat) {
                heartbeatWanted = true;
            }
            if (scheduled) {
                return;
            }
            scheduled = true;
        }
        // Held from now rather than from when the thread gets to it: the alarm
        // tick that asked for this pass lets go of its own hold straight after.
        awake.hold();
        try {
            thread.execute(new Runnable() {
                @Override
                public void run() {
                    pass();
                }
            });
        } catch (RejectedExecutionException shutDown) {
            synchronized (this) {
                scheduled = false;
            }
            awake.letGo();
        }
    }

    /** Whether a fix should start a pass: thirty seconds since the last request. */
    boolean dueFromFix() {
        return TrackerRules.dueFromFix(SystemClock.elapsedRealtime(), lastAttempt);
    }

    /** No new passes; one already running finishes. */
    void shutdown() {
        thread.shutdown();
    }

    private void pass() {
        boolean heartbeat;
        synchronized (this) {
            scheduled = false;
            heartbeat = heartbeatWanted;
            heartbeatWanted = false;
        }
        try {
            run(heartbeat);
        } catch (RuntimeException unexpected) {
            // Never the death of the service: the next pass simply tries again.
            Log.w(TAG, "upload pass failed", unexpected);
        } finally {
            awake.letGo();
        }
    }

    private void run(boolean heartbeat) {
        SharedPreferences prefs = DutyTrackerService.prefs(context);
        Connection connection = connection(prefs);
        if (connection == null) {
            return;
        }
        Outbox outbox = Outbox.get(context);
        outbox.prune(System.currentTimeMillis() - TrackerRules.MAX_AGE_MS);
        // The order of the pass, and what waits for what, is TrackerRules.upload.
        TrackerRules.upload(new PassLink(connection, outbox), hold, connection.user,
                prefs.getString(DutyTrackerService.KEY_OWNER, null), heartbeat);
    }

    /** This phone's outbox and the server, for one pass. */
    private final class PassLink implements TrackerRules.Link {
        private final Connection connection;
        private final Outbox outbox;
        private final Pass pass = new Pass();

        PassLink(Connection connection, Outbox outbox) {
            this.connection = connection;
            this.outbox = outbox;
        }

        @Override
        public List<TrackerRules.Event> events() {
            return outbox.events();
        }

        @Override
        public List<TrackerRules.Fix> fixes() {
            return outbox.fixes();
        }

        @Override
        public boolean heartbeatAllowed() {
            return service.heartbeatAllowed();
        }

        @Override
        public TrackerRules.Answer sendEvents(List<TrackerRules.Event> events) {
            List<String> keys = new ArrayList<>();
            String body = eventsBody(events, keys);
            return settled(send(connection, EVENTS_PATH, body, pass), false, keys);
        }

        @Override
        public TrackerRules.Answer sendFixes(List<TrackerRules.Fix> fixes) {
            List<String> keys = new ArrayList<>();
            String body = pingsBody(fixes, keys);
            return settled(send(connection, PINGS_PATH, body, pass), true, keys);
        }

        @Override
        public TrackerRules.Answer probe() {
            Reply reply = send(connection, PINGS_PATH, "{\"pings\":[]}", pass);
            return reply == null ? null : new TrackerRules.Answer(reply.status, null);
        }

        @Override
        public long elapsed() {
            return SystemClock.elapsedRealtime();
        }

        @Override
        public boolean anyAnswered() {
            return pass.anyAnswered;
        }

        @Override
        public boolean lastAnswered() {
            return pass.lastAnswered;
        }

        @Override
        public boolean signalChanged() {
            return pass.noted;
        }

        /** A 2xx takes what the server acknowledged off the phone. Null: stop this pass. */
        private TrackerRules.Answer settled(Reply reply, boolean fixes, List<String> keys) {
            if (reply == null) {
                return null;
            }
            return new TrackerRules.Answer(reply.status, reply.ok() ? settle(outbox, fixes, keys, reply) : null);
        }
    }

    private Connection connection(SharedPreferences prefs) {
        synchronized (DutyTrackerService.CONFIG_LOCK) {
            if (!prefs.getBoolean(DutyTrackerService.KEY_NATIVE, false)
                    || prefs.getBoolean(DutyTrackerService.KEY_AUTH_BLOCKED, false)) {
                return null;
            }
            String baseUrl = prefs.getString(DutyTrackerService.KEY_BASE_URL, null);
            String access = prefs.getString(DutyTrackerService.KEY_ACCESS, null);
            if (baseUrl == null || access == null || access.isEmpty()) {
                return null;
            }
            String version = prefs.getString(DutyTrackerService.KEY_APP_VERSION, null);
            return new Connection(
                    baseUrl,
                    access,
                    prefs.getString(DutyTrackerService.KEY_REFRESH, null),
                    prefs.getString(DutyTrackerService.KEY_USER, null),
                    version != null ? version : appVersion(context));
        }
    }

    /**
     * POST with the access token; on a 401, refresh it once and try once more.
     *
     * Returns null when this pass must stop: the sign-in is no longer good, and
     * asking again every thirty seconds would only be refused again, so nothing
     * more is tried until the app hands over new tokens with configure().
     */
    private Reply send(Connection connection, String path, String body, Pass pass) {
        Reply reply = post(connection.baseUrl + path, connection.access, body, connection.appVersion, pass);
        if (reply.status != 401) {
            return reply;
        }
        if (connection.refresh == null || connection.refresh.isEmpty()) {
            blockSignIn(connection);
            return null;
        }
        JSONObject ask = new JSONObject();
        try {
            ask.put("refresh", connection.refresh);
        } catch (JSONException impossible) {
            return reply;
        }
        Reply refreshed = post(connection.baseUrl + REFRESH_PATH, null, ask.toString(), connection.appVersion, pass);
        if (refreshed.status == 401) {
            blockSignIn(connection);
            return null;
        }
        String access = token(refreshed, "access");
        if (!refreshed.ok() || access == null) {
            // No answer, or a server error: the next pass tries again.
            return reply;
        }
        if (!saveTokens(connection, access, token(refreshed, "refresh"))) {
            // The app changed the tokens while we were refreshing; its are newer.
            return null;
        }
        return post(connection.baseUrl + path, connection.access, body, connection.appVersion, pass);
    }

    /**
     * Keep the refreshed tokens -- unless the app has meanwhile signed out or
     * handed over others. Writing ours back then would sign a signed-out phone
     * back in.
     *
     * The web app and this uploader each refresh on their own. That works only
     * because the server does not blacklist a refresh token once it has been
     * rotated (BLACKLIST_AFTER_ROTATION = False); if it ever did, the second
     * one to refresh would be refused and the engineer signed out.
     */
    private boolean saveTokens(Connection connection, String access, String refresh) {
        SharedPreferences prefs = DutyTrackerService.prefs(context);
        synchronized (DutyTrackerService.CONFIG_LOCK) {
            if (!Objects.equals(prefs.getString(DutyTrackerService.KEY_ACCESS, null), connection.access)
                    || !Objects.equals(prefs.getString(DutyTrackerService.KEY_REFRESH, null), connection.refresh)) {
                return false;
            }
            SharedPreferences.Editor edit = prefs.edit().putString(DutyTrackerService.KEY_ACCESS, access);
            if (refresh != null) {
                edit.putString(DutyTrackerService.KEY_REFRESH, refresh);
            }
            edit.apply();
        }
        connection.access = access;
        if (refresh != null) {
            connection.refresh = refresh;
        }
        return true;
    }

    private void blockSignIn(Connection connection) {
        SharedPreferences prefs = DutyTrackerService.prefs(context);
        synchronized (DutyTrackerService.CONFIG_LOCK) {
            if (Objects.equals(prefs.getString(DutyTrackerService.KEY_ACCESS, null), connection.access)
                    && Objects.equals(prefs.getString(DutyTrackerService.KEY_REFRESH, null), connection.refresh)) {
                prefs.edit().putBoolean(DutyTrackerService.KEY_AUTH_BLOCKED, true).apply();
            }
        }
        Log.w(TAG, "the server refused the sign-in; holding everything until the app signs in again");
    }

    private Reply post(String url, String bearer, String body, String appVersion, Pass pass) {
        awake.touch();
        long at = System.currentTimeMillis();
        lastAttempt = SystemClock.elapsedRealtime();
        Reply reply = request(url, bearer, body, appVersion);
        note(reply, at, pass);
        return reply;
    }

    /** What this attempt says about the signal, and for state(). */
    private void note(Reply reply, long at, Pass pass) {
        SharedPreferences prefs = DutyTrackerService.prefs(context);
        boolean answered = reply.status > 0;
        pass.lastAnswered = answered;
        pass.anyAnswered |= answered;
        String kind = netAfter(prefs, answered);
        if (kind != null) {
            Log.i(TAG, kind);
            DutyTrackerService.record(context, kind, at, null, null, "");
            pass.noted = true;
        }
        SharedPreferences.Editor edit = prefs.edit();
        if (answered) {
            edit.putInt(DutyTrackerService.KEY_LAST_UPLOAD_STATUS, reply.status);
        } else {
            edit.remove(DutyTrackerService.KEY_LAST_UPLOAD_STATUS);
        }
        if (reply.ok()) {
            edit.putLong(DutyTrackerService.KEY_LAST_UPLOAD_AT, System.currentTimeMillis());
        }
        edit.apply();
    }

    /** Move the signal state on by one attempt; "net_off", "net_on" or null. */
    static String netAfter(SharedPreferences prefs, boolean answered) {
        synchronized (NET_LOCK) {
            TrackerRules.Net net = new TrackerRules.Net(
                    prefs.getInt(DutyTrackerService.KEY_NET_LAST, TrackerRules.NET_UNKNOWN),
                    prefs.getBoolean(DutyTrackerService.KEY_NET_OFF, false));
            String kind = net.after(answered);
            prefs.edit()
                    .putInt(DutyTrackerService.KEY_NET_LAST, net.last)
                    .putBoolean(DutyTrackerService.KEY_NET_OFF, net.off)
                    .apply();
            return kind;
        }
    }

    /** A new duty starts with nothing known about the signal. */
    static void resetNet(SharedPreferences prefs) {
        synchronized (NET_LOCK) {
            prefs.edit().remove(DutyTrackerService.KEY_NET_LAST).remove(DutyTrackerService.KEY_NET_OFF).apply();
        }
    }

    /**
     * Take off the phone what the server now has, and count what it refused
     * for good.
     *
     * Null when the answer cannot be read as one of ours: everything is kept and
     * sent again, which the client_keys make harmless.
     */
    private TrackerRules.Acks settle(Outbox outbox, boolean fixes, List<String> keys, Reply reply) {
        List<TrackerRules.Rejection> rejected = new ArrayList<>();
        try {
            JSONObject answer = new JSONObject(reply.body == null ? "" : reply.body);
            if (!answer.has("stored")) {
                Log.w(TAG, "an answer that is not the server's; sending again later");
                return null;
            }
            JSONArray refused = answer.optJSONArray("rejected");
            if (refused != null) {
                for (int i = 0; i < refused.length(); i++) {
                    JSONObject item = refused.optJSONObject(i);
                    if (item != null) {
                        rejected.add(new TrackerRules.Rejection(item.optInt("index", -1), item.optString("reason", "")));
                    }
                }
            }
        } catch (JSONException unreadable) {
            Log.w(TAG, "could not read the server's answer; sending again later");
            return null;
        }
        TrackerRules.Acks acks = TrackerRules.acks(keys, rejected);
        if (fixes) {
            outbox.removeFixes(acks.remove);
        } else {
            outbox.removeEvents(acks.remove);
        }
        if (acks.dropped > 0) {
            Log.w(TAG, acks.dropped + (fixes ? " fixes" : " events") + " refused by the server for good; dropped");
            addDropped(acks.dropped);
        }
        return acks;
    }

    private void addDropped(int count) {
        SharedPreferences prefs = DutyTrackerService.prefs(context);
        synchronized (Uploader.class) {
            prefs.edit().putInt(DutyTrackerService.KEY_DROPPED, prefs.getInt(DutyTrackerService.KEY_DROPPED, 0) + count).apply();
        }
    }

    // ---------------------------------------------------------------- the wire

    /** The fixes exactly as the web app posts them; `keys` gets their client_keys in the same order. */
    private static String pingsBody(List<TrackerRules.Fix> batch, List<String> keys) {
        JSONArray pings = new JSONArray();
        for (TrackerRules.Fix fix : batch) {
            JSONObject ping = new JSONObject();
            try {
                ping.put("latitude", fix.latitude);
                ping.put("longitude", fix.longitude);
                ping.put("accuracy", orNull(fix.accuracy));
                ping.put("speed", orNull(fix.speed));
                ping.put("after_gap", fix.afterGap);
                ping.put("status", fix.status == null ? "" : fix.status);
                ping.put("case_id", orNull(Outbox.value(fix.caseJson)));
                ping.put("timestamp", TrackerRules.iso(fix.time));
                ping.put("client_key", fix.key);
                ping.put("battery_level", orNull(fix.battery));
                ping.put("is_charging", orNull(fix.charging));
            } catch (JSONException unwritable) {
                // Only a non-finite number can do this, and none is stored.
                continue;
            }
            pings.put(ping);
            keys.add(fix.key);
        }
        JSONObject body = new JSONObject();
        try {
            body.put("pings", pings);
        } catch (JSONException impossible) {
            // A JSONArray under a fixed name cannot be refused.
        }
        return body.toString();
    }

    private static String eventsBody(List<TrackerRules.Event> batch, List<String> keys) {
        JSONArray events = new JSONArray();
        for (TrackerRules.Event event : batch) {
            JSONObject item = new JSONObject();
            try {
                item.put("kind", event.kind);
                item.put("at", TrackerRules.iso(event.at));
                item.put("client_key", event.key);
                if (event.latitude != null && event.longitude != null) {
                    item.put("latitude", event.latitude);
                    item.put("longitude", event.longitude);
                }
                item.put("detail", event.detail == null ? "" : event.detail);
            } catch (JSONException unwritable) {
                continue;
            }
            events.put(item);
            keys.add(event.key);
        }
        JSONObject body = new JSONObject();
        try {
            body.put("events", events);
        } catch (JSONException impossible) {
            // As above.
        }
        return body.toString();
    }

    private static Object orNull(Object value) {
        return value == null ? JSONObject.NULL : value;
    }

    private static String token(Reply reply, String name) {
        if (reply.body == null) {
            return null;
        }
        try {
            String value = new JSONObject(reply.body).optString(name, "");
            return value.isEmpty() ? null : value;
        } catch (JSONException unreadable) {
            return null;
        }
    }

    private static Reply request(String url, String bearer, String body, String appVersion) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            // A redirect is a misconfiguration, and following one would carry
            // the engineer's token to wherever it points.
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            // Without it the server refuses a position outright (app_only).
            connection.setRequestProperty("X-Payroll-Client", "app");
            if (appVersion != null) {
                connection.setRequestProperty("X-Payroll-App-Version", appVersion);
            }
            if (bearer != null) {
                connection.setRequestProperty("Authorization", "Bearer " + bearer);
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            String text;
            try {
                text = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            } catch (IOException cutOff) {
                // The server answered; only its body was lost. The status stands.
                text = null;
            }
            return new Reply(status, text);
        } catch (IOException | RuntimeException noAnswer) {
            return new Reply(-1, null);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) {
            return "";
        }
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = stream.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** "1.5.0 (7)", the same text the web app puts on its own requests. */
    static String appVersion(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long build = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            return info.versionName + " (" + build + ")";
        } catch (Exception unknown) {
            return null;
        }
    }
}
