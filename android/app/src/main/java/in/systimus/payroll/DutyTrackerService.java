package in.systimus.payroll;

import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.ApplicationExitInfo;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationAvailability;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.List;
import java.util.UUID;

/**
 * Where the engineer is, reported for as long as they are on duty -- including
 * after the app has been swiped out of the recents list.
 *
 * WHY THIS EXISTS. The community background-geolocation plugin binds its
 * service and nothing more, and a bound-only service dies with its last client:
 * swiping the app away destroys the activity, the binding goes, and the plugin
 * then removes the location updates and calls stopSelf on purpose. An engineer
 * who tidied the app off their screen after the last call of the day stopped
 * being tracked, stayed logged in, and drove home unmeasured. One of them read
 * 166 km on his own odometer against 102 in the app, and the day board showed
 * the last position at 3:12pm against a logout at 8:03pm.
 *
 * So this service is STARTED as well as bound. Started means Android keeps it
 * alive after the activity is gone, and the ongoing notification -- which the
 * engineer can see and tap to come back -- is what makes that legitimate.
 *
 * SENDING FROM HERE (1.5). In 1.4 a fix taken while the app was away waited on
 * the phone until the app opened again, so the board saw nothing for hours and
 * the kilometres arrived in one late lump. Now every fix goes into the Outbox
 * and the Uploader posts it from here, with the app open or not, keeping the
 * time each was TAKEN. The web app hands over where to send and as whom
 * (start / configure); a web app from before that hands over nothing, and then
 * this behaves exactly as 1.4 did.
 *
 * And it says what it sees, as events beside the fixes: Location switched off
 * and on, the internet gone and back, and the app stopped by the phone. Those
 * are what let the server tell a stretch the engineer chose not to record from
 * one the phone failed to.
 *
 * Two guards. It stops itself sixteen hours after the duty session started,
 * matching DutySession.MAX_DURATION_HOURS on the server, so a forgotten duty
 * cannot track somebody all night. And it holds at most TrackerRules.MAX_FIXES
 * fixes, dropping the oldest, so a phone that never comes back online cannot
 * fill its storage.
 */
public class DutyTrackerService extends Service {
    static final String ACTION_LOCATION = "in.systimus.payroll.DUTY_LOCATION";
    static final String EXTRA_LOCATION = "location";
    static final String EXTRA_CLIENT_KEY = "client_key";
    static final String EXTRA_FROM_APP = "from_app";
    static final String EXTRA_FRESH = "fresh";
    private static final String ACTION_TICK = "in.systimus.payroll.DUTY_TICK";

    static final String PREFS = "duty_tracker";
    /** 1.4's held fixes. Moved into the Outbox on first use, then gone. */
    static final String KEY_BUFFER = "buffer";
    static final String KEY_WANTED = "wanted";
    static final String KEY_TITLE = "title";
    static final String KEY_TEXT = "text";
    static final String KEY_DISTANCE = "distance";
    static final String KEY_INTERVAL = "interval";
    static final String KEY_STARTED_AT = "started_at";
    static final String KEY_RESTARTED = "restarted";

    // Where to send, and as whom: written by the plugin.
    static final String KEY_NATIVE = "native";
    static final String KEY_BASE_URL = "base_url";
    static final String KEY_ACCESS = "access";
    static final String KEY_REFRESH = "refresh";
    static final String KEY_APP_VERSION = "app_version";
    /** Whose tokens we hold (TrackerRules.ownerKey). */
    static final String KEY_USER = "user";
    /** Whose duty this is: the owner stamped on every fix and event. */
    static final String KEY_OWNER = "owner";
    static final String KEY_OWNER_JSON = "owner_json";
    static final String KEY_SESSION_ID = "session_id";
    static final String KEY_CASE = "case";
    static final String KEY_STATUS = "status";
    static final String KEY_AUTH_BLOCKED = "auth_blocked";
    static final String KEY_LAST_UPLOAD_AT = "last_upload_at";
    static final String KEY_LAST_UPLOAD_STATUS = "last_upload_status";
    static final String KEY_DROPPED = "dropped";

    // What the tracker has seen: written here and by the Uploader.
    /** The first fix taken at or after this time is the far side of a gap (after_gap). */
    static final String KEY_GAP_AT = "gap_at";
    static final String KEY_GPS = "gps";
    static final String KEY_NET_LAST = "net_last";
    static final String KEY_NET_OFF = "net_off";
    static final String KEY_ALIVE_AT = "alive_at";
    static final String KEY_LAST_LATITUDE = "last_latitude";
    static final String KEY_LAST_LONGITUDE = "last_longitude";
    static final String KEY_STARTED_PENDING = "tracker_started_pending";
    /** A stop of the tracker too recent to judge when a new process found it, waiting for its end (settleStop). */
    static final String KEY_STOPPED_AT = "stopped_at";
    static final String KEY_STOPPED_WHY = "stopped_why";

    /** Taken around the tokens, so a refresh never writes over a sign-out. */
    static final Object CONFIG_LOCK = new Object();

    private static final String TAG = "DutyTracker";
    private static final String CHANNEL_ID = "in.systimus.payroll.duty";
    private static final int NOTIFICATION_ID = 8801;
    private static final long TICK_MS = 2L * 60L * 1000L;
    private static final long WAKE_MS = 60L * 1000L;

    /** Whether this process has already looked at how the one before it ended. */
    private static boolean processSeen = false;
    /** Whether a tracker is listening in this process right now. */
    private static volatile boolean tracking = false;

    private final IBinder binder = new LocalBinder();
    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private volatile boolean listening = false;
    /** True while an activity is bound, i.e. while a fix has somewhere to go. */
    private volatile boolean attached = false;
    private volatile boolean foreground = false;
    private volatile boolean startedByApp = false;
    private volatile boolean fixSeen = false;
    private volatile boolean requestFailed = false;

    private HandlerThread ioThread;
    /** Fixes, GPS readings and ticks, one at a time and off the main thread. */
    private Handler io;
    private Awake awake;
    private Uploader uploader;
    private BroadcastReceiver gpsReceiver;
    private BroadcastReceiver tickReceiver;
    private PendingIntent tickIntent;
    private ConnectivityManager.NetworkCallback networkCallback;

    class LocalBinder extends android.os.Binder {
        DutyTrackerService service() {
            return DutyTrackerService.this;
        }
    }

    /**
     * A partial wake lock around each tick and upload, so the CPU does not
     * sleep halfway through a request. Counted here rather than by Android:
     * Android's own counting combined with a timeout throws "under-locked" the
     * day a timeout and a release both let go.
     */
    static final class Awake {
        private final PowerManager.WakeLock lock;
        private int holders;

        Awake(Context context) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            lock = power == null ? null : power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "payroll:duty");
            if (lock != null) {
                lock.setReferenceCounted(false);
            }
        }

        synchronized void hold() {
            holders++;
            touch();
        }

        /** Another sixty seconds from now, for a pass that is still working. */
        synchronized void touch() {
            if (lock == null || holders == 0) {
                return;
            }
            try {
                lock.acquire(WAKE_MS);
            } catch (RuntimeException refused) {
                Log.w(TAG, "could not hold the phone awake", refused);
            }
        }

        synchronized void letGo() {
            if (holders > 0) {
                holders--;
            }
            if (holders == 0 && lock != null && lock.isHeld()) {
                try {
                    lock.release();
                } catch (RuntimeException alreadyGone) {
                    // Its sixty seconds ran out first.
                }
            }
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ioThread = new HandlerThread("DutyTrackerIO");
        ioThread.start();
        io = new Handler(ioThread.getLooper());
        awake = new Awake(this);
        uploader = new Uploader(this, this, awake);
        final Context app = getApplicationContext();
        // First thing on the thread that writes: how the last process ended,
        // read before anything here stamps over the evidence.
        onIo(() -> noticeNewProcess(app));
    }

    /**
     * Run on the tracker's own thread. Whatever goes wrong with one fix or one
     * tick is logged and the next one carries on: an exception escaping here
     * would end the app, and with it every kilometre after it.
     */
    private boolean onIo(Runnable work) {
        return io.post(() -> {
            try {
                work.run();
            } catch (RuntimeException unexpected) {
                Log.w(TAG, "a tracking step failed; carrying on", unexpected);
            }
        });
    }

    @Override
    public IBinder onBind(Intent intent) {
        attached = true;
        return binder;
    }

    @Override
    public void onRebind(Intent intent) {
        attached = true;
    }

    /**
     * The app has gone -- backgrounded, swiped away, or crashed.
     *
     * NOTHING is stopped here. This is the whole point of the class: the
     * community plugin's own onUnbind removes the location updates and calls
     * stopSelf, which is exactly the behaviour that lost an engineer's drive
     * home. Returning true asks Android to call onRebind when the app returns,
     * so the fixes go straight back to the WebView instead of the buffer.
     */
    @Override
    public boolean onUnbind(Intent intent) {
        attached = false;
        return true;
    }

    /**
     * The app was swiped off the recents list.
     *
     * Deliberately does not stop the service. The manifest also sets
     * stopWithTask="false"; this override is here so that nobody removes that
     * attribute and quietly reintroduces the bug.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        attached = false;
        Log.i(TAG, "app swiped away; still tracking");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = prefs();
        if (intent == null) {
            // Android restarted us after killing the process (START_STICKY).
            // Re-arm only if duty was actually on, and let drain() say so.
            if (!prefs.getBoolean(KEY_WANTED, false)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            prefs.edit().putBoolean(KEY_RESTARTED, true).apply();
            Log.i(TAG, "restarted by the system; re-arming");
        }
        // Before anything that might stop us: a service started with
        // startForegroundService that stops without ever going to the
        // foreground takes the whole app down with it.
        startInForeground(prefs.getString(KEY_TITLE, "On duty"), prefs.getString(KEY_TEXT, "Recording your route"));
        if (!prefs.getBoolean(KEY_WANTED, false)) {
            // stop() reached us before this start did: off duty wins.
            stopTracking();
            return START_NOT_STICKY;
        }
        if (TrackerRules.expired(prefs.getLong(KEY_STARTED_AT, 0L), System.currentTimeMillis())) {
            Log.i(TAG, "sixteen hours; stopping on our own");
            stopTracking();
            return START_NOT_STICKY;
        }
        boolean fromApp = intent != null && intent.getBooleanExtra(EXTRA_FROM_APP, false);
        if (fromApp) {
            startedByApp = true;
        }
        if (intent != null && intent.getBooleanExtra(EXTRA_FRESH, false)) {
            newDuty(prefs);
        } else if (fromApp) {
            // The app has the tracker going again in front of the engineer: a
            // stop still waiting to be judged is over.
            settleStop(this, System.currentTimeMillis());
        }
        listen(prefs.getFloat(KEY_DISTANCE, 10f), prefs.getLong(KEY_INTERVAL, 30000L));
        onIo(this::started);
        return START_STICKY;
    }

    /**
     * A Login. Nothing of the last duty carries over: the first fix is the far
     * side of the trip to work (after_gap), GPS and signal start unknown, and
     * yesterday's last position is not this morning's. Done before listening
     * starts, so nothing this duty sees is judged against the last one.
     */
    private static void newDuty(SharedPreferences prefs) {
        SharedPreferences.Editor edit = prefs.edit()
                .remove(KEY_GPS)
                .remove(KEY_GAP_AT)
                .remove(KEY_STARTED_PENDING)
                .remove(KEY_STOPPED_AT)
                .remove(KEY_STOPPED_WHY)
                .remove(KEY_LAST_LATITUDE)
                .remove(KEY_LAST_LONGITUDE);
        if (prefs.getBoolean(KEY_NATIVE, false)) {
            // Any time at all: the first fix after a Login is the one, even
            // one the phone worked out a moment before.
            edit.putLong(KEY_GAP_AT, 1L);
        }
        edit.apply();
        Uploader.resetNet(prefs);
    }

    /**
     * Begin, or continue, reporting positions.
     *
     * Called from onStartCommand: when the engineer goes on duty, whenever the
     * page starts it again, and when Android restarts the service on its own.
     */
    synchronized void listen(float distanceFilterMetres, long intervalMs) {
        SharedPreferences prefs = prefs();
        if (prefs.getLong(KEY_STARTED_AT, 0L) == 0L) {
            prefs.edit().putLong(KEY_STARTED_AT, System.currentTimeMillis()).apply();
        }
        if (listening) {
            return;
        }
        if (client == null) {
            client = LocationServices.getFusedLocationProviderClient(this);
        }
        // Delivered on the io thread (see requestLocationUpdates below).
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location location : result.getLocations()) {
                    if (location == null) {
                        continue;
                    }
                    try {
                        onFix(location);
                    } catch (RuntimeException unexpected) {
                        Log.w(TAG, "could not take a fix; carrying on", unexpected);
                    }
                }
            }

            @Override
            public void onLocationAvailability(LocationAvailability availability) {
                // NOT "Location off": indoors, an underpass or a phone in a bike's
                // seat box says exactly the same with Location on. Only a reason
                // to look at the switch itself.
                try {
                    readGps(true);
                } catch (RuntimeException unexpected) {
                    Log.w(TAG, "could not read the Location switch", unexpected);
                }
            }
        };
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
                .setMinUpdateDistanceMeters(distanceFilterMetres)
                .setWaitForAccurateLocation(false)
                .build();
        try {
            requestFailed = false;
            client.requestLocationUpdates(request, callback, ioThread.getLooper())
                    .addOnFailureListener(failure -> {
                        requestFailed = true;
                        Log.w(TAG, "location updates were refused", failure);
                    });
            listening = true;
            tracking = true;
            fixSeen = false;
        } catch (SecurityException denied) {
            // The permission was withdrawn while we were running. Stop rather
            // than sit in the notification tray reporting nothing.
            Log.w(TAG, "location permission is gone; stopping", denied);
            stopTracking();
            return;
        }
        watch();
    }

    /**
     * A position from the OS.
     *
     * Sending from here: into the outbox, every time, and to the app's screen
     * if it is there. From a web app that does its own sending (before 1.5):
     * straight to the app if it is there, else into the outbox for drain(), as
     * 1.4 did -- never both, or the page would send it twice under two keys.
     */
    private void onFix(Location location) {
        if (!listening) {
            return;
        }
        SharedPreferences prefs = prefs();
        long now = System.currentTimeMillis();
        if (TrackerRules.expired(prefs.getLong(KEY_STARTED_AT, 0L), now)) {
            Log.i(TAG, "sixteen hours; stopping on our own");
            stopTracking();
            return;
        }
        double latitude = location.getLatitude();
        double longitude = location.getLongitude();
        if (!Outbox.finite(latitude) || !Outbox.finite(longitude)) {
            return;
        }
        boolean sending = prefs.getBoolean(KEY_NATIVE, false);
        long time = TrackerRules.fixTime(location.getTime(), now);
        String key = null;
        if (sending || !attached) {
            key = UUID.randomUUID().toString();
            boolean afterGap = sending && takeGap(prefs, time);
            outbox().addFix(new TrackerRules.Fix(
                    0L,
                    key,
                    prefs.getString(KEY_OWNER, null),
                    prefs.getString(KEY_OWNER_JSON, null),
                    time,
                    latitude,
                    longitude,
                    location.hasAccuracy() ? finiteOrNull(location.getAccuracy()) : null,
                    location.hasSpeed() ? finiteOrNull(location.getSpeed()) : null,
                    location.hasBearing() ? finiteOrNull(location.getBearing()) : null,
                    afterGap,
                    sending ? prefs.getString(KEY_STATUS, "") : "",
                    sending ? prefs.getString(KEY_CASE, null) : null,
                    sending ? batteryLevel() : null,
                    sending ? charging() : null));
        }
        if (attached) {
            Intent intent = new Intent(ACTION_LOCATION);
            intent.putExtra(EXTRA_LOCATION, location);
            if (key != null) {
                intent.putExtra(EXTRA_CLIENT_KEY, key);
            }
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
        }
        fixSeen = true;
        // Recording again: a stop still waiting to be judged ends with this fix.
        settleStop(this, now);
        boolean back = prefs.getBoolean(KEY_STARTED_PENDING, false);
        SharedPreferences.Editor edit = prefs.edit()
                .putLong(KEY_ALIVE_AT, now)
                .putLong(KEY_LAST_LATITUDE, Double.doubleToRawLongBits(latitude))
                .putLong(KEY_LAST_LONGITUDE, Double.doubleToRawLongBits(longitude));
        if (back) {
            edit.remove(KEY_STARTED_PENDING);
        }
        edit.apply();
        if (back) {
            // The first real fix after the phone stopped the app.
            Log.i(TAG, "tracking again");
            record(this, "tracker_started", time, latitude, longitude, "");
        }
        if (sending && (back || uploader.dueFromFix())) {
            uploader.trigger(false);
        }
    }

    /**
     * Whether this fix is the first taken after a Login, or after Location was
     * switched off. By the time it was TAKEN, not delivered: a fix the phone
     * held from just before the switch-off is on the near side of the gap.
     */
    private static boolean takeGap(SharedPreferences prefs, long time) {
        long gapAt = prefs.getLong(KEY_GAP_AT, 0L);
        if (gapAt <= 0L || time < gapAt) {
            return false;
        }
        prefs.edit().remove(KEY_GAP_AT).apply();
        return true;
    }

    /**
     * After every start from the app or from Android, on the io thread: the
     * Location switch as found, the alive stamp, and whatever is waiting sent.
     */
    private void started() {
        if (!listening) {
            return;
        }
        SharedPreferences prefs = prefs();
        readGps(false);
        if (recording()) {
            prefs.edit().putLong(KEY_ALIVE_AT, System.currentTimeMillis()).apply();
        }
        if (prefs.getBoolean(KEY_NATIVE, false)) {
            uploader.trigger(false);
        }
    }

    /**
     * Look at the Location switch, and record a change.
     *
     * @param running a change notification while tracking ("switched"), as
     *                against a reading taken as tracking starts ("found")
     */
    private void readGps(boolean running) {
        if (!listening) {
            return;
        }
        boolean enabled = locationEnabled(this);
        long at = System.currentTimeMillis();
        SharedPreferences prefs = prefs();
        String last = prefs.getString(KEY_GPS, null);
        TrackerRules.GpsChange change = TrackerRules.gpsChange(last, enabled, running);
        String now = enabled ? "on" : "off";
        if (!now.equals(last)) {
            SharedPreferences.Editor edit = prefs.edit().putString(KEY_GPS, now);
            if (TrackerRules.gapAfter(change) && prefs.getBoolean(KEY_NATIVE, false)) {
                edit.putLong(KEY_GAP_AT, at);
            }
            edit.apply();
        }
        if (change == null) {
            return;
        }
        Log.i(TAG, change.kind + " (" + change.detail + ")");
        record(this, change.kind, at, null, null, change.detail);
        if (prefs.getBoolean(KEY_NATIVE, false)) {
            uploader.trigger(false);
        }
    }

    /**
     * Every two minutes while on duty, even in Doze: "still here" to the
     * server, the alive stamp, and the sixteen-hour check.
     *
     * An alarm and not a Handler: a Handler's clock stops while the CPU sleeps,
     * so a phone parked at a customer for forty minutes, screen off, sent
     * nothing -- and read "No signal" on the board the whole visit.
     */
    private void tick() {
        if (!listening) {
            return;
        }
        armTick();
        SharedPreferences prefs = prefs();
        long now = System.currentTimeMillis();
        if (TrackerRules.expired(prefs.getLong(KEY_STARTED_AT, 0L), now)) {
            Log.i(TAG, "sixteen hours; stopping on our own");
            stopTracking();
            return;
        }
        if (recording()) {
            prefs.edit().putLong(KEY_ALIVE_AT, now).apply();
        }
        if (prefs.getBoolean(KEY_NATIVE, false)) {
            uploader.trigger(true);
        }
    }

    /** See TrackerRules.heartbeat. */
    boolean heartbeatAllowed() {
        return TrackerRules.heartbeat(listening, foreground, requestFailed, startedByApp, fixSeen, locationEnabled(this));
    }

    /**
     * See TrackerRules.recording. Only then is alive_at stamped: a service
     * Android restarted in the background, recording nothing, must not move
     * the moment a later "phone stopped the app" is timed from.
     */
    private boolean recording() {
        return TrackerRules.recording(listening, foreground, requestFailed, startedByApp, fixSeen);
    }

    /** The app handed over new tokens: try now rather than at the next tick. */
    void uploadSoon() {
        if (listening && prefs().getBoolean(KEY_NATIVE, false)) {
            uploader.trigger(false);
        }
    }

    /** The Location switch, the tick and the network: watched while listening, and only then. */
    private synchronized void watch() {
        if (gpsReceiver == null) {
            gpsReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    onIo(() -> readGps(true));
                }
            };
            IntentFilter filter = new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION);
            filter.addAction(LocationManager.MODE_CHANGED_ACTION);
            try {
                ContextCompat.registerReceiver(this, gpsReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
            } catch (RuntimeException refused) {
                Log.w(TAG, "could not watch the Location switch", refused);
                gpsReceiver = null;
            }
        }
        if (tickReceiver == null) {
            tickReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    awake.hold();
                    boolean queued = onIo(() -> {
                        try {
                            tick();
                        } finally {
                            awake.letGo();
                        }
                    });
                    if (!queued) {
                        awake.letGo();
                    }
                }
            };
            try {
                ContextCompat.registerReceiver(this, tickReceiver, new IntentFilter(ACTION_TICK),
                        ContextCompat.RECEIVER_NOT_EXPORTED);
            } catch (RuntimeException refused) {
                Log.w(TAG, "could not listen for the tick", refused);
                tickReceiver = null;
            }
        }
        armTick();
        if (networkCallback == null) {
            ConnectivityManager connectivity = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivity != null) {
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        // Only a reason to try: a network is not the internet, so
                        // it is the upload that decides net_off and net_on.
                        if (prefs().getBoolean(KEY_NATIVE, false)) {
                            uploader.trigger(false);
                        }
                    }
                };
                try {
                    connectivity.registerDefaultNetworkCallback(networkCallback);
                } catch (RuntimeException refused) {
                    Log.w(TAG, "could not watch the network", refused);
                    networkCallback = null;
                }
            }
        }
    }

    private synchronized void unwatch() {
        if (gpsReceiver != null) {
            try {
                unregisterReceiver(gpsReceiver);
            } catch (IllegalArgumentException notRegistered) {
                // Already gone.
            }
            gpsReceiver = null;
        }
        if (tickReceiver != null) {
            try {
                unregisterReceiver(tickReceiver);
            } catch (IllegalArgumentException notRegistered) {
                // Already gone.
            }
            tickReceiver = null;
        }
        if (tickIntent != null) {
            AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarms != null) {
                alarms.cancel(tickIntent);
            }
            tickIntent = null;
        }
        if (networkCallback != null) {
            ConnectivityManager connectivity = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            try {
                if (connectivity != null) {
                    connectivity.unregisterNetworkCallback(networkCallback);
                }
            } catch (IllegalArgumentException notRegistered) {
                // Already gone.
            }
            networkCallback = null;
        }
    }

    /**
     * The next tick, two minutes on, allowed to fire in Doze. Inexact on
     * purpose: it needs no exact-alarm permission, and two minutes give or
     * take is all a heartbeat needs.
     */
    private synchronized void armTick() {
        if (!listening) {
            return;
        }
        AlarmManager alarms = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }
        if (tickIntent == null) {
            tickIntent = PendingIntent.getBroadcast(this, 0, new Intent(ACTION_TICK).setPackage(getPackageName()),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        try {
            alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    SystemClock.elapsedRealtime() + TICK_MS, tickIntent);
        } catch (RuntimeException refused) {
            Log.w(TAG, "could not set the tick", refused);
        }
    }

    void stopTracking() {
        synchronized (this) {
            if (listening && client != null && callback != null) {
                client.removeLocationUpdates(callback);
            }
            listening = false;
            tracking = false;
            unwatch();
        }
        markStopped(prefs());
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        foreground = false;
        stopSelf();
    }

    /** Off duty, as far as a restart by Android is concerned. */
    static void markStopped(SharedPreferences prefs) {
        prefs.edit()
                .putBoolean(KEY_WANTED, false)
                .putLong(KEY_STARTED_AT, 0L)
                .remove(KEY_STARTED_PENDING)
                .remove(KEY_STOPPED_AT)
                .remove(KEY_STOPPED_WHY)
                .apply();
    }

    @Override
    public void onDestroy() {
        synchronized (this) {
            if (listening && client != null && callback != null) {
                client.removeLocationUpdates(callback);
            }
            listening = false;
            tracking = false;
            unwatch();
        }
        foreground = false;
        uploader.shutdown();
        ioThread.quitSafely();
        super.onDestroy();
    }

    /** Whether a tracker is listening in this process -- so start() never refuses one that is running. */
    static boolean isTracking() {
        return tracking;
    }

    /**
     * Once per process, before this process writes anything of its own: did the
     * one before it die while the engineer was on duty?
     *
     * Android, or the phone maker's battery manager, can stop the app without a
     * word -- and then nothing records, and the board can only show a gap. A
     * NEW process that finds duty still wanted is the proof that this happened,
     * so that is the only place "tracker_stopped" is ever written. A running
     * service started again by the page is not new, whatever its last fix says.
     *
     * Called from the plugin as it loads, queued ahead of anything the page
     * asks for (start() would otherwise overwrite the evidence), and from the
     * service for a restart by Android with no page at all. Whichever comes
     * first does it.
     *
     * A stop of under fifteen minutes is not judged here: it is not over. A
     * restart by Android in the background gets no location on Android 11 and
     * later, so the outage can run on for hours in this very process. It waits
     * -- across further restarts too -- for its end: the first fix, or the app
     * starting the tracker (settleStop).
     */
    static void noticeNewProcess(Context context) {
        synchronized (DutyTrackerService.class) {
            if (processSeen) {
                return;
            }
            processSeen = true;
            try {
                // Whatever a 1.4 APK was holding goes into the outbox now.
                Outbox.get(context);
                SharedPreferences prefs = prefs(context);
                if (!prefs.getBoolean(KEY_WANTED, false)) {
                    return;
                }
                long now = System.currentTimeMillis();
                // A stop an earlier process left waiting, with no fix since, is
                // where this outage began.
                long at = prefs.getLong(KEY_STOPPED_AT, 0L);
                String why = prefs.getString(KEY_STOPPED_WHY, "");
                if (at <= 0L) {
                    Exit exit = lastExit(context);
                    at = TrackerRules.stoppedAt(
                            exit.at, prefs.getLong(KEY_ALIVE_AT, 0L), prefs.getLong(KEY_STARTED_AT, 0L), now);
                    why = at == exit.at ? exit.reason : "";
                }
                if (at <= 0L) {
                    return;
                }
                if (!TrackerRules.worthReporting(at, now)) {
                    prefs.edit().putLong(KEY_STOPPED_AT, at).putString(KEY_STOPPED_WHY, why).apply();
                    return;
                }
                reportStop(context, prefs, at, why);
            } catch (RuntimeException failed) {
                Log.w(TAG, "could not tell how the last run ended", failed);
            }
        }
    }

    /**
     * A stop left waiting by noticeNewProcess, judged now that it is over: at
     * the first fix since, or when the app starts the tracker in front of the
     * engineer. A line on the day board only if it lasted over fifteen minutes.
     */
    private static void settleStop(Context context, long now) {
        synchronized (DutyTrackerService.class) {
            SharedPreferences prefs = prefs(context);
            long at = prefs.getLong(KEY_STOPPED_AT, 0L);
            if (at <= 0L) {
                return;
            }
            if (TrackerRules.worthReporting(at, now)) {
                reportStop(context, prefs, at, prefs.getString(KEY_STOPPED_WHY, ""));
            } else {
                prefs.edit().remove(KEY_STOPPED_AT).remove(KEY_STOPPED_WHY).apply();
            }
        }
    }

    /** tracker_stopped now, and tracker_started at the first real fix after it. */
    private static void reportStop(Context context, SharedPreferences prefs, long at, String why) {
        record(context, "tracker_stopped", at, null, null, why);
        prefs.edit()
                .putBoolean(KEY_STARTED_PENDING, true)
                .remove(KEY_STOPPED_AT)
                .remove(KEY_STOPPED_WHY)
                .apply();
        Log.i(TAG, "the app was stopped while on duty; noted");
    }

    /** The app's last process exit, as Android recorded it. */
    private static final class Exit {
        final long at;
        final String reason;

        Exit(long at, String reason) {
            this.at = at;
            this.reason = reason;
        }
    }

    private static Exit lastExit(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                ActivityManager activities = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
                List<ApplicationExitInfo> exits = activities == null
                        ? null
                        : activities.getHistoricalProcessExitReasons(context.getPackageName(), 0, 1);
                if (exits != null && !exits.isEmpty()) {
                    ApplicationExitInfo exit = exits.get(0);
                    return new Exit(exit.getTimestamp(), exitReason(exit.getReason()));
                }
            } catch (RuntimeException unavailable) {
                // Not every phone keeps the record; the alive stamp stands in.
            }
        }
        return new Exit(0L, "");
    }

    /** A few words for why the phone stopped the app, kept with the event for whoever looks into it. */
    @RequiresApi(Build.VERSION_CODES.R)
    private static String exitReason(int reason) {
        switch (reason) {
            case ApplicationExitInfo.REASON_LOW_MEMORY:
                return "low memory";
            case ApplicationExitInfo.REASON_SIGNALED:
                return "killed";
            case ApplicationExitInfo.REASON_USER_REQUESTED:
                return "force stopped";
            case ApplicationExitInfo.REASON_USER_STOPPED:
                return "stopped by the user";
            case ApplicationExitInfo.REASON_CRASH:
            case ApplicationExitInfo.REASON_CRASH_NATIVE:
                return "crashed";
            case ApplicationExitInfo.REASON_ANR:
                return "not responding";
            case ApplicationExitInfo.REASON_PERMISSION_CHANGE:
                return "permission changed";
            case ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE:
                return "too much battery";
            case ApplicationExitInfo.REASON_DEPENDENCY_DIED:
                return "dependency died";
            case ApplicationExitInfo.REASON_EXIT_SELF:
                return "exited";
            default:
                return "other";
        }
    }

    /**
     * Keep an event for the server, owned by this duty's owner, at the given
     * position or else the last one seen.
     */
    static void record(Context context, String kind, long at, Double latitude, Double longitude, String detail) {
        SharedPreferences prefs = prefs(context);
        if (latitude == null || longitude == null) {
            latitude = null;
            longitude = null;
            if (prefs.contains(KEY_LAST_LATITUDE) && prefs.contains(KEY_LAST_LONGITUDE)) {
                latitude = Double.longBitsToDouble(prefs.getLong(KEY_LAST_LATITUDE, 0L));
                longitude = Double.longBitsToDouble(prefs.getLong(KEY_LAST_LONGITUDE, 0L));
            }
        }
        Outbox.get(context).addEvent(new TrackerRules.Event(
                0L,
                UUID.randomUUID().toString(),
                prefs.getString(KEY_OWNER, null),
                prefs.getString(KEY_OWNER_JSON, null),
                kind,
                at,
                latitude,
                longitude,
                detail));
    }

    /** Whether the phone's Location switch is on. The only thing gps_off and gps_on are ever read from. */
    static boolean locationEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        return manager != null && LocationManagerCompat.isLocationEnabled(manager);
    }

    /** 0-1, the way the web app sends it, so the server reads both alike. */
    private Double batteryLevel() {
        BatteryManager battery = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        if (battery == null) {
            return null;
        }
        int percent = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        // 0 is what some phones answer when they cannot say.
        return percent > 0 && percent <= 100 ? percent / 100.0 : null;
    }

    private Boolean charging() {
        BatteryManager battery = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
        return battery == null ? null : battery.isCharging();
    }

    private static Double finiteOrNull(float value) {
        return Float.isNaN(value) || Float.isInfinite(value) ? null : (double) value;
    }

    private Outbox outbox() {
        return Outbox.get(this);
    }

    private SharedPreferences prefs() {
        return prefs(this);
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void startInForeground(String title, String text) {
        createChannel(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent tap = null;
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            tap = PendingIntent.getActivity(
                    this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (tap != null) {
            builder.setContentIntent(tap);
        }
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, builder.build(), type);
            foreground = true;
        } catch (Exception refused) {
            // Android 12+ can refuse to foreground a service started from the
            // background. Nothing is retried here: tracking then behaves as it
            // did before this service existed, and the app says so.
            foreground = false;
            Log.w(TAG, "could not go to the foreground", refused);
        }
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Duty tracking", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shows while your route is being recorded.");
        channel.enableLights(false);
        channel.enableVibration(false);
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }
}
