package in.systimus.payroll;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONObject;

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
 * A fix that arrives while the app is dead has nowhere to go: the WebView is
 * gone, and with it the plugin's broadcast receiver. Those fixes are written to
 * a buffer on the phone, with the time each was TAKEN, and handed over the next
 * time the app opens. The kilometres then land on the day they were driven.
 *
 * Two guards. It stops itself sixteen hours after it started, matching
 * DutySession.MAX_DURATION_HOURS on the server, so a forgotten duty cannot
 * track somebody all night. And it holds at most BUFFER_LIMIT fixes, dropping
 * the oldest, so a phone that never comes back online cannot fill its storage.
 */
public class DutyTrackerService extends Service {
    static final String ACTION_LOCATION = "in.systimus.payroll.DUTY_LOCATION";
    static final String EXTRA_LOCATION = "location";

    static final String PREFS = "duty_tracker";
    static final String KEY_BUFFER = "buffer";
    static final String KEY_WANTED = "wanted";
    static final String KEY_TITLE = "title";
    static final String KEY_TEXT = "text";
    static final String KEY_DISTANCE = "distance";
    static final String KEY_INTERVAL = "interval";
    static final String KEY_STARTED_AT = "started_at";
    static final String KEY_RESTARTED = "restarted";

    private static final String TAG = "DutyTracker";
    private static final String CHANNEL_ID = "in.systimus.payroll.duty";
    private static final int NOTIFICATION_ID = 8801;

    /** The most fixes to keep on the phone. A day of 30-second fixes is ~2900. */
    private static final int BUFFER_LIMIT = 6000;

    /** Matches DutySession.MAX_DURATION_HOURS on the server. */
    private static final long MAX_DURATION_MS = 16L * 60L * 60L * 1000L;

    private final IBinder binder = new LocalBinder();
    private FusedLocationProviderClient client;
    private LocationCallback callback;
    private boolean listening = false;
    /** True while an activity is bound, i.e. while a fix has somewhere to go. */
    private boolean attached = false;

    class LocalBinder extends android.os.Binder {
        DutyTrackerService service() {
            return DutyTrackerService.this;
        }
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
            // Re-arm only if duty was actually on, and tell the app that the
            // fixes either side of this are not one continuous journey.
            if (!prefs.getBoolean(KEY_WANTED, false)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            prefs.edit().putBoolean(KEY_RESTARTED, true).apply();
            Log.i(TAG, "restarted by the system; re-arming");
        }
        startInForeground(prefs.getString(KEY_TITLE, "On duty"), prefs.getString(KEY_TEXT, "Recording your route"));
        listen(prefs.getFloat(KEY_DISTANCE, 10f), prefs.getLong(KEY_INTERVAL, 30000L));
        return START_STICKY;
    }

    /**
     * Begin, or continue, reporting positions.
     *
     * Called by the plugin when the engineer goes on duty, and by
     * onStartCommand when Android restarts the service on its own.
     */
    void listen(float distanceFilterMetres, long intervalMs) {
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
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location location : result.getLocations()) {
                    if (location != null) {
                        onFix(location);
                    }
                }
            }
        };
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
                .setMinUpdateDistanceMeters(distanceFilterMetres)
                .setWaitForAccurateLocation(false)
                .build();
        try {
            client.requestLocationUpdates(request, callback, Looper.getMainLooper());
            listening = true;
        } catch (SecurityException denied) {
            // The permission was withdrawn while we were running. Stop rather
            // than sit in the notification tray reporting nothing.
            Log.w(TAG, "location permission is gone; stopping", denied);
            stopTracking();
        }
    }

    /** A position from the OS: straight to the app if it is there, else to the phone. */
    private void onFix(Location location) {
        long startedAt = prefs().getLong(KEY_STARTED_AT, 0L);
        if (startedAt > 0L && System.currentTimeMillis() - startedAt > MAX_DURATION_MS) {
            Log.i(TAG, "sixteen hours; stopping on our own");
            stopTracking();
            return;
        }
        if (attached) {
            Intent intent = new Intent(ACTION_LOCATION);
            intent.putExtra(EXTRA_LOCATION, location);
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
            return;
        }
        buffer(location);
    }

    /**
     * Keep a fix the app was not there to receive.
     *
     * Stored with the time it was taken, because that is what decides which
     * day's kilometres it belongs to, and the app can be hours away from
     * opening again.
     */
    private void buffer(Location location) {
        SharedPreferences prefs = prefs();
        JSONArray held = readBuffer(prefs);
        try {
            JSONObject fix = new JSONObject();
            fix.put("latitude", location.getLatitude());
            fix.put("longitude", location.getLongitude());
            if (location.hasAccuracy()) {
                fix.put("accuracy", location.getAccuracy());
            }
            if (location.hasSpeed()) {
                fix.put("speed", location.getSpeed());
            }
            if (location.hasBearing()) {
                fix.put("bearing", location.getBearing());
            }
            fix.put("time", location.getTime());
            held.put(fix);
        } catch (Exception malformed) {
            Log.w(TAG, "could not hold a fix", malformed);
            return;
        }
        // Oldest first out. A phone that never comes back must not fill up.
        while (held.length() > BUFFER_LIMIT) {
            held.remove(0);
        }
        prefs.edit().putString(KEY_BUFFER, held.toString()).apply();
    }

    /** Everything held, in the order it was taken. Cleared by the caller. */
    static JSONArray readBuffer(SharedPreferences prefs) {
        String raw = prefs.getString(KEY_BUFFER, null);
        if (raw == null || raw.isEmpty()) {
            return new JSONArray();
        }
        try {
            return new JSONArray(raw);
        } catch (Exception malformed) {
            return new JSONArray();
        }
    }

    void stopTracking() {
        if (listening && client != null && callback != null) {
            client.removeLocationUpdates(callback);
        }
        listening = false;
        prefs().edit().putBoolean(KEY_WANTED, false).putLong(KEY_STARTED_AT, 0L).apply();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (listening && client != null && callback != null) {
            client.removeLocationUpdates(callback);
        }
        listening = false;
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
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
        } catch (Exception refused) {
            // Android 12+ can refuse to foreground a service started from the
            // background. Nothing is retried here: tracking then behaves as it
            // did before this service existed, and the app says so.
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
