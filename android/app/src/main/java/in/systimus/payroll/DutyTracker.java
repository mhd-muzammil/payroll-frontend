package in.systimus.payroll;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * The app's own duty tracker: positions that keep coming after the app is gone.
 *
 * Deliberately a SECOND way of tracking rather than a change to the
 * @capacitor-community/background-geolocation plugin, which is left exactly as
 * it is. The web app picks this one when the phone has it and falls back to the
 * community plugin otherwise -- so an APK without this still behaves as it
 * always did, and if this turns out to misbehave on somebody's phone the web
 * app can go back to the old path in one line, with no new APK on 24 phones.
 *
 * What it adds over the plugin it sits beside:
 *
 *   the service is STARTED as well as bound, so swiping the app away does not
 *   destroy it (see DutyTrackerService);
 *
 *   a fix taken while the app is dead is kept on the phone with the time it was
 *   taken -- and, from 1.5, sent from the phone itself as soon as there is
 *   signal, when the web app says where to (see Uploader). A web app that does
 *   not say still gets every held fix from drain(), as in 1.4;
 *
 *   GPS switched off and on, the internet gone and back, and the app stopped by
 *   the phone, recorded as events the day board can show;
 *
 *   and it stops itself sixteen hours after the duty session started, the same
 *   rule the server applies to a session nobody closed.
 *
 * Every method a 1.4 APK lacks is one the web app expects to be refused with
 * "not implemented" there, and then it carries on the old way.
 */
@CapacitorPlugin(
        name = "DutyTracker",
        permissions = {
                @Permission(
                        strings = {
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                                Manifest.permission.ACCESS_FINE_LOCATION
                        },
                        alias = "location"
                )
        }
)
public class DutyTracker extends Plugin {
    private static final String TAG = "DutyTracker";

    private volatile DutyTrackerService.LocalBinder binder;
    private volatile PluginCall watcher;
    private ServiceConnection connection;
    private BroadcastReceiver fixReceiver;

    @Override
    public void load() {
        super.load();
        DutyTrackerService.createChannel(getContext());
        fixReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                PluginCall current = watcher;
                if (current == null) {
                    return;
                }
                Location location = intent.getParcelableExtra(DutyTrackerService.EXTRA_LOCATION);
                if (location != null) {
                    current.resolve(describe(location, intent.getStringExtra(DutyTrackerService.EXTRA_CLIENT_KEY)));
                }
            }
        };
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(
                fixReceiver, new IntentFilter(DutyTrackerService.ACTION_LOCATION));
        // Queued on the thread that runs every call from the page, ahead of
        // all of them: whether the last process died with duty on is read
        // before start() can write over the answer.
        final Context app = getContext().getApplicationContext();
        getBridge().execute(() -> DutyTrackerService.noticeNewProcess(app));
    }

    /**
     * What this APK can do, for the web app to choose its path by. A 1.4 APK
     * refuses the call ("not implemented"), and that is the answer too.
     */
    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject result = new JSObject();
        result.put("nativeUpload", true);
        result.put("gpsEvents", true);
        result.put("netEvents", true);
        call.resolve(result);
    }

    /**
     * Go on duty: start reporting, and keep this call open to stream the fixes.
     *
     * The engineer's phone has already been asked for the location permission
     * by the page before this is called, so a refusal here is reported rather
     * than prompted for again.
     *
     * Refused -- NOT_AUTHORIZED or START_FAILED -- only when nothing is
     * tracking, and with duty marked not wanted first, so Android does not
     * restart a tracker the page has just been told failed and gone to the
     * community plugin instead: two trackers would draw two trails. GPS, signal
     * and the app being stopped are never errors; they are events.
     *
     * Options beyond 1.4's (title, text, distanceFilter, interval): baseUrl,
     * access, refresh, appVersion and userId say where to send and as whom;
     * fresh, sessionId and sessionStartedAt which duty this is; caseId and
     * status what the fixes are tagged with.
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void start(PluginCall call) {
        boolean running = DutyTrackerService.isTracking();
        SharedPreferences prefs = prefs();
        if (getPermissionState("location") != PermissionState.GRANTED && !running) {
            prefs.edit().putBoolean(DutyTrackerService.KEY_WANTED, false).apply();
            call.reject("Location permission is not granted.", "NOT_AUTHORIZED");
            return;
        }

        float distance = call.getFloat("distanceFilter", 10f);
        int interval = call.getInt("interval", 30000);
        boolean fresh = Boolean.TRUE.equals(call.getBoolean("fresh", false));
        JSObject options = call.getData();
        synchronized (DutyTrackerService.CONFIG_LOCK) {
            SharedPreferences.Editor edit = prefs.edit()
                    .putBoolean(DutyTrackerService.KEY_WANTED, true)
                    .putString(DutyTrackerService.KEY_TITLE, call.getString("title", "On duty"))
                    .putString(DutyTrackerService.KEY_TEXT, call.getString("text", "Recording your route"))
                    .putFloat(DutyTrackerService.KEY_DISTANCE, distance)
                    .putLong(DutyTrackerService.KEY_INTERVAL, interval);
            // Sending from the phone only when the page says where to. A page
            // from before 1.5 says nothing and keeps doing its own sending.
            boolean sending = TrackerRules.baseUrl(options.opt("baseUrl")) != null;
            edit.putBoolean(DutyTrackerService.KEY_NATIVE, sending);
            String access = applyConnection(options, prefs, edit);
            applyOwner(options, sending, access, edit);
            TrackerRules.Clock clock = TrackerRules.clockOnStart(
                    fresh,
                    TrackerRules.ownerKey(options.opt("sessionId")),
                    TrackerRules.parseTime(options.opt("sessionStartedAt")),
                    prefs.getString(DutyTrackerService.KEY_SESSION_ID, null),
                    prefs.getLong(DutyTrackerService.KEY_STARTED_AT, 0L),
                    running,
                    System.currentTimeMillis());
            applyClock(clock, edit);
            applyContext(options, fresh, edit);
            edit.apply();
        }

        Intent intent = new Intent(getContext(), DutyTrackerService.class)
                .putExtra(DutyTrackerService.EXTRA_FROM_APP, true)
                .putExtra(DutyTrackerService.EXTRA_FRESH, fresh);
        try {
            // Started AND bound. Started is what keeps it alive when the app
            // goes; bound is what lets a fix reach the WebView while it is here.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception refused) {
            if (!running) {
                prefs.edit().putBoolean(DutyTrackerService.KEY_WANTED, false).apply();
                call.reject("Could not start the tracker: " + refused.getMessage(), "START_FAILED");
                return;
            }
            // The tracker already running carries on; this call watches it.
            Log.w(TAG, "could not start the tracker again; the running one carries on", refused);
        }
        call.setKeepAlive(true);
        PluginCall previous = watcher;
        watcher = call;
        if (previous != null && previous != call) {
            previous.release(getBridge());
        }
        bind();
    }

    private void bind() {
        if (connection != null) {
            return;
        }
        connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder service) {
                binder = (DutyTrackerService.LocalBinder) service;
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                binder = null;
            }
        };
        getContext().bindService(new Intent(getContext(), DutyTrackerService.class), connection, Context.BIND_AUTO_CREATE);
    }

    /**
     * New tokens, a different user, or a sign-out ({access: null, refresh: null}).
     *
     * Signed out, the service sends nothing and keeps everything -- drain()
     * hands it to the page, which decides whose it is. A different user's
     * tokens never carry this duty's fixes: they wait for their owner.
     */
    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences prefs = prefs();
        JSObject options = call.getData();
        synchronized (DutyTrackerService.CONFIG_LOCK) {
            SharedPreferences.Editor edit = prefs.edit();
            applyConnection(options, prefs, edit);
            applyClock(TrackerRules.clockOnConfigure(
                    TrackerRules.ownerKey(options.opt("sessionId")),
                    TrackerRules.parseTime(options.opt("sessionStartedAt")),
                    prefs.getString(DutyTrackerService.KEY_SESSION_ID, null),
                    prefs.getLong(DutyTrackerService.KEY_STARTED_AT, 0L),
                    System.currentTimeMillis()), edit);
            edit.apply();
        }
        DutyTrackerService.LocalBinder bound = binder;
        if (bound != null) {
            bound.service().uploadSoon();
        }
        call.resolve();
    }

    /** The case and status the next fixes are tagged with: Check In, Check Out. */
    @PluginMethod
    public void setContext(PluginCall call) {
        SharedPreferences.Editor edit = prefs().edit();
        applyContext(call.getData(), false, edit);
        edit.apply();
        call.resolve();
    }

    /** Off duty: stop reporting and take the notification down. */
    @PluginMethod
    public void stop(PluginCall call) {
        PluginCall previous = watcher;
        watcher = null;
        if (previous != null) {
            previous.release(getBridge());
        }
        DutyTrackerService.LocalBinder bound = binder;
        if (bound != null) {
            bound.service().stopTracking();
        } else {
            // Not bound (the app was restarted): ask the service itself to go.
            DutyTrackerService.markStopped(prefs());
            getContext().stopService(new Intent(getContext(), DutyTrackerService.class));
        }
        unbind();
        call.resolve();
    }

    /**
     * Hand over what is waiting on the phone, and forget it: the oldest, and
     * no more than the web app's own queues keep (TrackerRules.handOver). The
     * rest waits here for the next drain(), or for the phone to send it.
     *
     * Cleared as it is handed over, on purpose: the web app puts it straight
     * into its own queue, which is stored on the phone too, so the handover is
     * the moment responsibility passes. Keeping a second copy here would mean
     * sending some of it twice. Each fix and event keeps its client_key, so
     * one the uploader had already sent is stored once all the same, and its
     * owner, so the page never sends one as the wrong person.
     */
    @PluginMethod
    public void drain(PluginCall call) {
        SharedPreferences prefs = prefs();
        TrackerRules.Handover held = Outbox.get(getContext())
                .take(TrackerRules.HANDOVER_FIXES, TrackerRules.HANDOVER_EVENTS);
        boolean restarted = prefs.getBoolean(DutyTrackerService.KEY_RESTARTED, false);
        prefs.edit().putBoolean(DutyTrackerService.KEY_RESTARTED, false).apply();

        JSArray locations = new JSArray();
        for (TrackerRules.Fix fix : held.fixes) {
            locations.put(describe(fix));
        }
        JSArray events = new JSArray();
        for (TrackerRules.Event event : held.events) {
            events.put(describe(event));
        }
        JSObject result = new JSObject();
        result.put("locations", locations);
        result.put("events", events);
        // True when Android killed and restarted the service.
        result.put("restarted", restarted);
        call.resolve(result);
    }

    /**
     * Which build of the APK this phone is running.
     *
     * The app never told the server this, so nobody could answer "who has the
     * new version and who is still on the old one" -- and every APK goes out as
     * a file passed around by hand, so there is no store to ask either. The web
     * app puts what this returns on every request it makes, which is how the
     * office panel can name the phones still to be updated.
     *
     * A phone whose APK predates this method reports nothing at all, and that
     * absence is itself the answer: it has not been updated.
     */
    @PluginMethod
    public void appInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            android.content.pm.PackageInfo info = getContext()
                    .getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            result.put("version", info.versionName);
            result.put(
                    "build",
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                            ? info.getLongVersionCode()
                            : info.versionCode);
        } catch (Exception unknown) {
            // Cannot happen for our own package, but a version we could not
            // read must not stop the app from working.
            result.put("version", null);
            result.put("build", null);
        }
        result.put("android", Build.VERSION.RELEASE);
        result.put("batteryExempt", batteryExempt());
        call.resolve(result);
    }

    /**
     * Whether the tracker is running, and how it is getting on.
     *
     * lastUploadStatus is the HTTP status of the uploader's last request, or
     * null when it got no answer at all (or has not tried): the page takes over
     * the sending only when the server is answering the phone with errors, not
     * when there is simply no signal.
     */
    @PluginMethod
    public void state(PluginCall call) {
        SharedPreferences prefs = prefs();
        Outbox outbox = Outbox.get(getContext());
        int fixes = outbox.fixCount();
        long oldest = outbox.oldestFixAt();
        JSObject result = new JSObject();
        result.put("wanted", prefs.getBoolean(DutyTrackerService.KEY_WANTED, false));
        result.put("bound", binder != null);
        result.put("outbox", fixes);
        result.put("events", outbox.eventCount());
        // 1.4's name for the same number.
        result.put("buffered", fixes);
        result.put("oldestAt", oldest >= 0 ? (Object) oldest : JSONObject.NULL);
        result.put("lastUploadAt", prefs.contains(DutyTrackerService.KEY_LAST_UPLOAD_AT)
                ? (Object) prefs.getLong(DutyTrackerService.KEY_LAST_UPLOAD_AT, 0L)
                : JSONObject.NULL);
        result.put("lastUploadStatus", prefs.contains(DutyTrackerService.KEY_LAST_UPLOAD_STATUS)
                ? (Object) prefs.getInt(DutyTrackerService.KEY_LAST_UPLOAD_STATUS, 0)
                : JSONObject.NULL);
        result.put("dropped", prefs.getInt(DutyTrackerService.KEY_DROPPED, 0));
        result.put("gpsOn", DutyTrackerService.locationEnabled(getContext()));
        result.put("batteryExempt", batteryExempt());
        call.resolve(result);
    }

    /**
     * Ask Android to leave the app out of battery optimisation.
     *
     * Without it a phone lying still with the screen off (Doze) may hold the
     * two-minute tick back to one every nine minutes or more, and the board
     * reads "No signal" for an engineer who is simply at a customer. Shows
     * Android's own yes/no box; resolves with whether the app is now exempt.
     */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        if (batteryExempt()) {
            JSObject result = new JSObject();
            result.put("exempt", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, intent, "batteryExemptionAnswered");
        } catch (RuntimeException noSuchScreen) {
            // Some phones do not have the box. Report what is true.
            getBridge().releaseCall(call);
            JSObject result = new JSObject();
            result.put("exempt", batteryExempt());
            call.resolve(result);
        }
    }

    @ActivityCallback
    private void batteryExemptionAnswered(PluginCall call, ActivityResult answer) {
        if (call == null) {
            return;
        }
        JSObject result = new JSObject();
        result.put("exempt", batteryExempt());
        call.resolve(result);
        getBridge().releaseCall(call);
    }

    /**
     * The app is going away.
     *
     * The service is NOT stopped -- that is the entire reason this plugin
     * exists. The community plugin stops its service here, which is what lost
     * an engineer his drive home. The receiver goes, though: left registered,
     * every time the activity was recreated another one was added, keeping the
     * old plugin alive with it.
     */
    @Override
    protected void handleOnDestroy() {
        if (fixReceiver != null) {
            LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(fixReceiver);
            fixReceiver = null;
        }
        unbind();
        super.handleOnDestroy();
    }

    private void unbind() {
        if (connection != null) {
            try {
                getContext().unbindService(connection);
            } catch (IllegalArgumentException notBound) {
                // Already gone; nothing to do.
            }
            connection = null;
        }
        binder = null;
    }

    /**
     * The tokens, and whose they are, from whichever of them a call carries.
     * Returns the access token in force after it.
     *
     * "Whose" is the user_id inside the access token itself, which is who the
     * server credits; the userId the page passed only for a token without one,
     * and nobody when the two disagree (TrackerRules.tokenHolder). Never left
     * over from before: a supervisor signing in on an engineer's phone must not
     * inherit the engineer's identity, or the engineer's fixes would go out as
     * theirs.
     */
    private static String applyConnection(JSObject options, SharedPreferences prefs, SharedPreferences.Editor edit) {
        if (options.has("baseUrl")) {
            putOrRemove(edit, DutyTrackerService.KEY_BASE_URL, TrackerRules.baseUrl(options.opt("baseUrl")));
        }
        if (options.has("appVersion")) {
            putOrRemove(edit, DutyTrackerService.KEY_APP_VERSION, text(options.opt("appVersion")));
        }
        String access = prefs.getString(DutyTrackerService.KEY_ACCESS, null);
        boolean tokens = false;
        if (options.has("access")) {
            access = text(options.opt("access"));
            putOrRemove(edit, DutyTrackerService.KEY_ACCESS, access);
            tokens = true;
        }
        if (options.has("refresh")) {
            putOrRemove(edit, DutyTrackerService.KEY_REFRESH, text(options.opt("refresh")));
            tokens = true;
        }
        if (tokens) {
            // New tokens deserve a new try, whatever the old ones were told.
            edit.remove(DutyTrackerService.KEY_AUTH_BLOCKED);
        }
        if (tokens || options.has("userId")) {
            String user = access == null ? null : TrackerRules.tokenHolder(
                    TrackerRules.ownerKey(tokenUserId(access)), TrackerRules.ownerKey(options.opt("userId")));
            putOrRemove(edit, DutyTrackerService.KEY_USER, user);
        }
        return access;
    }

    /**
     * The owner of this duty, stamped on everything it records: the user the
     * page names, else the one the tokens belong to. A page from before 1.5
     * names nobody and sends for itself, so its fixes stay untagged, which is
     * what they were.
     */
    private static void applyOwner(JSObject options, boolean sending, String access, SharedPreferences.Editor edit) {
        Object owner = sending ? userId(options, access) : given(options.opt("userId"));
        putOrRemove(edit, DutyTrackerService.KEY_OWNER, TrackerRules.ownerKey(owner));
        putOrRemove(edit, DutyTrackerService.KEY_OWNER_JSON, TrackerRules.ownerKey(owner) == null ? null : Outbox.json(owner));
    }

    private static void applyClock(TrackerRules.Clock clock, SharedPreferences.Editor edit) {
        if (clock == null) {
            return;
        }
        edit.putLong(DutyTrackerService.KEY_STARTED_AT, clock.startedAt);
        putOrRemove(edit, DutyTrackerService.KEY_SESSION_ID, clock.sessionId);
    }

    /** caseId and status where the call carries them; a Login starts with neither. */
    private static void applyContext(JSObject options, boolean reset, SharedPreferences.Editor edit) {
        if (options.has("caseId")) {
            putOrRemove(edit, DutyTrackerService.KEY_CASE, Outbox.json(options.opt("caseId")));
        } else if (reset) {
            edit.remove(DutyTrackerService.KEY_CASE);
        }
        if (options.has("status")) {
            String status = text(options.opt("status"));
            edit.putString(DutyTrackerService.KEY_STATUS, status == null ? "" : status);
        } else if (reset) {
            edit.remove(DutyTrackerService.KEY_STATUS);
        }
    }

    private static Object userId(JSObject options, String access) {
        Object named = given(options.opt("userId"));
        return named != null ? named : tokenUserId(access);
    }

    private static Object given(Object raw) {
        return TrackerRules.ownerKey(raw) == null ? null : raw;
    }

    /**
     * user_id from inside a token the server signed. Read, not checked: it
     * only decides whose fixes these tokens may carry, and the server checks
     * the signature on every request anyway.
     */
    private static Object tokenUserId(String token) {
        if (token == null) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length < 2) {
            return null;
        }
        try {
            byte[] payload = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
            Object id = new JSONObject(new String(payload, StandardCharsets.UTF_8)).opt("user_id");
            return id == JSONObject.NULL ? null : id;
        } catch (IllegalArgumentException | JSONException unreadable) {
            return null;
        }
    }

    private static String text(Object raw) {
        if (!(raw instanceof String)) {
            return null;
        }
        String value = ((String) raw).trim();
        return value.isEmpty() ? null : value;
    }

    private static void putOrRemove(SharedPreferences.Editor edit, String key, String value) {
        if (value == null) {
            edit.remove(key);
        } else {
            edit.putString(key, value);
        }
    }

    private boolean batteryExempt() {
        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private SharedPreferences prefs() {
        return DutyTrackerService.prefs(getContext());
    }

    /** A live fix for the screen. client_key is there when the phone is the one sending it. */
    private static JSObject describe(Location location, String clientKey) {
        JSObject fix = new JSObject();
        fix.put("latitude", location.getLatitude());
        fix.put("longitude", location.getLongitude());
        fix.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        fix.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        fix.put("bearing", location.hasBearing() ? location.getBearing() : null);
        fix.put("time", location.getTime());
        if (clientKey != null) {
            fix.put("client_key", clientKey);
        }
        return fix;
    }

    /** A held fix for drain(): what 1.4 handed over, plus what the phone now knows about it. */
    private static JSObject describe(TrackerRules.Fix fix) {
        JSObject out = new JSObject();
        out.put("latitude", fix.latitude);
        out.put("longitude", fix.longitude);
        if (fix.accuracy != null) {
            out.put("accuracy", fix.accuracy);
        }
        if (fix.speed != null) {
            out.put("speed", fix.speed);
        }
        if (fix.bearing != null) {
            out.put("bearing", fix.bearing);
        }
        out.put("time", fix.time);
        out.put("client_key", fix.key);
        Object owner = Outbox.value(fix.ownerJson);
        if (owner != null) {
            out.put("owner", owner);
        }
        out.put("after_gap", fix.afterGap);
        out.put("status", fix.status == null ? "" : fix.status);
        Object caseId = Outbox.value(fix.caseJson);
        if (caseId != null) {
            out.put("case_id", caseId);
        }
        if (fix.battery != null) {
            out.put("battery_level", fix.battery);
        }
        if (fix.charging != null) {
            out.put("is_charging", fix.charging);
        }
        return out;
    }

    /** A held event for drain(), ready for events/ as it stands. */
    private static JSObject describe(TrackerRules.Event event) {
        JSObject out = new JSObject();
        out.put("kind", event.kind);
        out.put("at", TrackerRules.iso(event.at));
        out.put("client_key", event.key);
        if (event.latitude != null && event.longitude != null) {
            out.put("latitude", event.latitude);
            out.put("longitude", event.longitude);
        }
        out.put("detail", event.detail == null ? "" : event.detail);
        Object owner = Outbox.value(event.ownerJson);
        if (owner != null) {
            out.put("owner", owner);
        }
        return out;
    }
}
