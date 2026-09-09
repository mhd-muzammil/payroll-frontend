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
import android.os.Build;
import android.os.IBinder;

import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONArray;
import org.json.JSONObject;

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
 *   taken, and handed over by drain() when the app next opens, so the
 *   kilometres land on the day they were driven rather than being lost;
 *
 *   and it stops itself after sixteen hours, the same rule the server applies
 *   to a duty session nobody closed.
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
    private DutyTrackerService.LocalBinder binder;
    private PluginCall watcher;
    private ServiceConnection connection;

    @Override
    public void load() {
        super.load();
        DutyTrackerService.createChannel(getContext());
        LocalBroadcastManager.getInstance(getContext()).registerReceiver(
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        if (watcher == null) {
                            return;
                        }
                        Location location = intent.getParcelableExtra(DutyTrackerService.EXTRA_LOCATION);
                        if (location != null) {
                            watcher.resolve(describe(location));
                        }
                    }
                },
                new IntentFilter(DutyTrackerService.ACTION_LOCATION)
        );
    }

    /**
     * Go on duty: start reporting, and keep this call open to stream the fixes.
     *
     * The engineer's phone has already been asked for the location permission
     * by the page before this is called, so a refusal here is reported rather
     * than prompted for again.
     */
    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void start(PluginCall call) {
        if (getPermissionState("location") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Location permission is not granted.", "NOT_AUTHORIZED");
            return;
        }
        call.setKeepAlive(true);
        watcher = call;

        float distance = call.getFloat("distanceFilter", 10f);
        int interval = call.getInt("interval", 30000);
        prefs().edit()
                .putBoolean(DutyTrackerService.KEY_WANTED, true)
                .putString(DutyTrackerService.KEY_TITLE, call.getString("title", "On duty"))
                .putString(DutyTrackerService.KEY_TEXT, call.getString("text", "Recording your route"))
                .putFloat(DutyTrackerService.KEY_DISTANCE, distance)
                .putLong(DutyTrackerService.KEY_INTERVAL, interval)
                .apply();

        Intent intent = new Intent(getContext(), DutyTrackerService.class);
        try {
            // Started AND bound. Started is what keeps it alive when the app
            // goes; bound is what lets a fix reach the WebView while it is here.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception refused) {
            call.reject("Could not start the tracker: " + refused.getMessage());
            watcher = null;
            return;
        }
        bind(intent, distance, interval);
    }

    private void bind(Intent intent, final float distance, final int interval) {
        if (binder != null) {
            binder.service().listen(distance, interval);
            return;
        }
        connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder service) {
                binder = (DutyTrackerService.LocalBinder) service;
                binder.service().listen(distance, interval);
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                binder = null;
            }
        };
        getContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
    }

    /** Off duty: stop reporting and take the notification down. */
    @PluginMethod
    public void stop(PluginCall call) {
        if (watcher != null) {
            watcher.release(getBridge());
            watcher = null;
        }
        if (binder != null) {
            binder.service().stopTracking();
        } else {
            // Not bound (the app was restarted): ask the service itself to go.
            prefs().edit().putBoolean(DutyTrackerService.KEY_WANTED, false).apply();
            getContext().stopService(new Intent(getContext(), DutyTrackerService.class));
        }
        unbind();
        call.resolve();
    }

    /**
     * Hand over every fix taken while the app was not here, and forget them.
     *
     * Cleared as they are handed over, on purpose: the web app puts them
     * straight into its own queue, which is stored on the phone too, so the
     * handover is the moment responsibility passes. Keeping a second copy here
     * would mean sending some of them twice.
     */
    @PluginMethod
    public void drain(PluginCall call) {
        SharedPreferences prefs = prefs();
        JSONArray held = DutyTrackerService.readBuffer(prefs);
        boolean restarted = prefs.getBoolean(DutyTrackerService.KEY_RESTARTED, false);
        prefs.edit()
                .remove(DutyTrackerService.KEY_BUFFER)
                .putBoolean(DutyTrackerService.KEY_RESTARTED, false)
                .apply();

        JSArray locations = new JSArray();
        for (int i = 0; i < held.length(); i++) {
            JSONObject fix = held.optJSONObject(i);
            if (fix != null) {
                locations.put(fix);
            }
        }
        JSObject result = new JSObject();
        result.put("locations", locations);
        // True when Android killed and restarted the service, so whatever
        // happened across that hole was never seen and must not be charged as
        // a straight line.
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
        call.resolve(result);
    }

    /** Whether the tracker is running, and how much it is holding. */
    @PluginMethod
    public void state(PluginCall call) {
        SharedPreferences prefs = prefs();
        JSObject result = new JSObject();
        result.put("wanted", prefs.getBoolean(DutyTrackerService.KEY_WANTED, false));
        result.put("buffered", DutyTrackerService.readBuffer(prefs).length());
        result.put("bound", binder != null);
        call.resolve(result);
    }

    /**
     * The app is going away.
     *
     * The service is NOT stopped -- that is the entire reason this plugin
     * exists. The community plugin stops its service here, which is what lost
     * an engineer his drive home.
     */
    @Override
    protected void handleOnDestroy() {
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

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(DutyTrackerService.PREFS, Context.MODE_PRIVATE);
    }

    private static JSObject describe(Location location) {
        JSObject fix = new JSObject();
        fix.put("latitude", location.getLatitude());
        fix.put("longitude", location.getLongitude());
        fix.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : null);
        fix.put("speed", location.hasSpeed() ? location.getSpeed() : null);
        fix.put("bearing", location.hasBearing() ? location.getBearing() : null);
        fix.put("time", location.getTime());
        return fix;
    }
}
