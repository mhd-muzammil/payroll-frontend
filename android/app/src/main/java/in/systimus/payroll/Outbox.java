package in.systimus.payroll;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.DatabaseUtils;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Everything the tracker has taken that the server has not yet confirmed:
 * positions, and the GPS, signal and app events that explain the gaps between
 * them.
 *
 * WHY A DATABASE. 1.4 kept its held fixes as one JSON string in the
 * preferences, read and written whole on every fix, on the main thread, with
 * nothing to stop drain() and the service touching it at the same moment: a fix
 * could be lost, or handed over twice under two keys. Here each fix is a row,
 * written once and removed only when the server has said it has it.
 *
 * ONE LOCK. Every read and write takes it, and nothing holds it while talking
 * to the server: the uploader copies a batch out, lets go, posts it, and comes
 * back to remove the keys the server acknowledged. So drain() and state(),
 * which run on the thread every Capacitor plugin shares, never wait on a
 * network.
 */
final class Outbox {
    static final String DATABASE = "duty_tracker.db";
    private static final String TAG = "DutyTracker";

    private static Outbox instance;

    private final Context context;
    private final Helper helper;

    private Outbox(Context context) {
        this.context = context;
        this.helper = new Helper(context);
    }

    /** The one outbox, with whatever a 1.4 APK left held moved into it on first use. */
    static synchronized Outbox get(Context context) {
        if (instance == null) {
            instance = new Outbox(context.getApplicationContext());
            instance.adoptOldBuffer();
        }
        return instance;
    }

    synchronized void addFix(TrackerRules.Fix fix) {
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            insert(db, fix);
            trim(db, "fixes", "time", TrackerRules.MAX_FIXES);
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not keep a fix", failed);
        }
    }

    synchronized void addEvent(TrackerRules.Event event) {
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            ContentValues values = new ContentValues();
            values.put("client_key", event.key);
            values.put("owner", event.owner);
            values.put("owner_json", event.ownerJson);
            values.put("kind", event.kind);
            values.put("at", event.at);
            values.put("latitude", event.latitude);
            values.put("longitude", event.longitude);
            values.put("detail", event.detail == null ? "" : event.detail);
            db.insertWithOnConflict("events", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            trim(db, "events", "at", TrackerRules.MAX_EVENTS);
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not keep an event", failed);
        }
    }

    /** Every fix waiting, oldest first. A copy: nothing here changes under the caller. */
    synchronized List<TrackerRules.Fix> fixes() {
        try {
            return readFixes(helper.getReadableDatabase());
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not read the waiting fixes", failed);
            return new ArrayList<>();
        }
    }

    /** Every event waiting, oldest first. */
    synchronized List<TrackerRules.Event> events() {
        try {
            return readEvents(helper.getReadableDatabase());
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not read the waiting events", failed);
            return new ArrayList<>();
        }
    }

    synchronized void removeFixes(Collection<String> keys) {
        remove("fixes", keys);
    }

    synchronized void removeEvents(Collection<String> keys) {
        remove("events", keys);
    }

    /** Forget what the server would refuse as older than two days anyway. */
    synchronized void prune(long before) {
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            db.execSQL("DELETE FROM fixes WHERE time < ?", new Object[] {before});
            db.execSQL("DELETE FROM events WHERE at < ?", new Object[] {before});
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not prune the outbox", failed);
        }
    }

    synchronized int fixCount() {
        return count("fixes");
    }

    synchronized int eventCount() {
        return count("events");
    }

    /** When the oldest waiting fix was taken, or -1 if none is waiting. */
    synchronized long oldestFixAt() {
        try {
            return DatabaseUtils.longForQuery(
                    helper.getReadableDatabase(), "SELECT IFNULL(MIN(time), -1) FROM fixes", null);
        } catch (RuntimeException failed) {
            return -1L;
        }
    }

    /**
     * Hand over the oldest waiting -- at most what the web app can keep (see
     * TrackerRules.handOver) -- and forget it.
     *
     * Only what is handed over is deleted, by key: if reading fails part-way,
     * nothing is lost, it is simply handed over next time.
     */
    synchronized TrackerRules.Handover take(int maxFixes, int maxEvents) {
        TrackerRules.Handover handed;
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            handed = TrackerRules.handOver(readFixes(db), readEvents(db), maxFixes, maxEvents);
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not read the outbox to hand it over", failed);
            return new TrackerRules.Handover(new ArrayList<TrackerRules.Fix>(), new ArrayList<TrackerRules.Event>());
        }
        List<String> fixKeys = new ArrayList<>();
        for (TrackerRules.Fix fix : handed.fixes) {
            fixKeys.add(fix.key);
        }
        List<String> eventKeys = new ArrayList<>();
        for (TrackerRules.Event event : handed.events) {
            eventKeys.add(event.key);
        }
        remove("fixes", fixKeys);
        remove("events", eventKeys);
        return handed;
    }

    /**
     * Move the fixes a 1.4 APK was holding into the outbox, once.
     *
     * 1.4 kept them in the preferences under "buffer", with no client_key, until
     * the page drained them. Left there they would never be sent -- nothing in
     * 1.5 reads that key -- so the morning a phone is updated could lose
     * whatever it held. Each gets a key made from the fix itself, so a move
     * interrupted half-way and run again cannot store any of them twice.
     * KEY_RESTARTED is left exactly where it is, for drain() to report.
     */
    private void adoptOldBuffer() {
        SharedPreferences prefs = context.getSharedPreferences(DutyTrackerService.PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(DutyTrackerService.KEY_BUFFER, null);
        if (raw == null) {
            return;
        }
        int moved = 0;
        try {
            JSONArray held = raw.isEmpty() ? new JSONArray() : new JSONArray(raw);
            SQLiteDatabase db = helper.getWritableDatabase();
            db.beginTransaction();
            try {
                for (int i = 0; i < held.length(); i++) {
                    JSONObject fix = held.optJSONObject(i);
                    if (fix == null) {
                        continue;
                    }
                    double latitude = fix.optDouble("latitude", Double.NaN);
                    double longitude = fix.optDouble("longitude", Double.NaN);
                    long time = fix.optLong("time", 0L);
                    if (!finite(latitude) || !finite(longitude) || time <= 0L) {
                        continue;
                    }
                    insert(db, new TrackerRules.Fix(0L, oldKey(time, latitude, longitude), null, null, time,
                            latitude, longitude, optional(fix, "accuracy"), optional(fix, "speed"),
                            optional(fix, "bearing"), false, "", null, null, null));
                    moved++;
                }
                trim(db, "fixes", "time", TrackerRules.MAX_FIXES);
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
        } catch (JSONException malformed) {
            // 1.4 read a malformed buffer as empty as well.
            Log.w(TAG, "the 1.4 buffer could not be read; dropping it", malformed);
        } catch (RuntimeException failed) {
            // Left in place: the next start tries again, and the keys repeat.
            Log.w(TAG, "could not move the 1.4 buffer yet", failed);
            return;
        }
        // commit(), on disk before anything is handed over: a web app from
        // before 1.5 gives every drained fix a key of its own, so a buffer that
        // came back after a crash would reach the server twice. Never the main
        // thread -- nothing there opens the outbox.
        prefs.edit().remove(DutyTrackerService.KEY_BUFFER).commit();
        Log.i(TAG, "moved " + moved + " held fixes from 1.4 into the outbox");
    }

    /** A client_key for a 1.4 fix, the same however many times it is made. */
    private static String oldKey(long time, double latitude, double longitude) {
        return "v14-" + Long.toString(time, 36)
                + "-" + Long.toHexString(Double.doubleToLongBits(latitude))
                + "-" + Long.toHexString(Double.doubleToLongBits(longitude));
    }

    // ---------------------------------------------------------------- JSON values

    /**
     * A user or case id as JSON text, so it comes back out as the same type it
     * went in: the web app compares what drain() returns with what it holds.
     */
    static String json(Object value) {
        if (value == null || value == JSONObject.NULL) {
            return null;
        }
        if (value instanceof String) {
            return JSONObject.quote((String) value);
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return null;
    }

    /** The value json() wrote, or null. */
    static Object value(String json) {
        if (json == null) {
            return null;
        }
        try {
            Object value = new JSONTokener(json).nextValue();
            return value == JSONObject.NULL ? null : value;
        } catch (JSONException malformed) {
            return null;
        }
    }

    // ---------------------------------------------------------------- storage

    private static void insert(SQLiteDatabase db, TrackerRules.Fix fix) {
        ContentValues values = new ContentValues();
        values.put("client_key", fix.key);
        values.put("owner", fix.owner);
        values.put("owner_json", fix.ownerJson);
        values.put("time", fix.time);
        values.put("latitude", fix.latitude);
        values.put("longitude", fix.longitude);
        values.put("accuracy", fix.accuracy);
        values.put("speed", fix.speed);
        values.put("bearing", fix.bearing);
        values.put("after_gap", fix.afterGap ? 1 : 0);
        values.put("status", fix.status == null ? "" : fix.status);
        values.put("case_json", fix.caseJson);
        values.put("battery", fix.battery);
        if (fix.charging != null) {
            values.put("charging", fix.charging ? 1 : 0);
        }
        db.insertWithOnConflict("fixes", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    /** Oldest first out, so a phone that never comes back online cannot fill up. */
    private static void trim(SQLiteDatabase db, String table, String timeColumn, int limit) {
        long count = DatabaseUtils.queryNumEntries(db, table);
        if (count > limit) {
            db.execSQL("DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table
                    + " ORDER BY " + timeColumn + ", id LIMIT " + (count - limit) + ")");
        }
    }

    private void remove(String table, Collection<String> keys) {
        if (keys == null || keys.isEmpty()) {
            return;
        }
        List<String> all = new ArrayList<>(keys);
        try {
            SQLiteDatabase db = helper.getWritableDatabase();
            db.beginTransaction();
            try {
                for (int from = 0; from < all.size(); from += 400) {
                    List<String> chunk = all.subList(from, Math.min(all.size(), from + 400));
                    StringBuilder marks = new StringBuilder();
                    for (int i = 0; i < chunk.size(); i++) {
                        marks.append(i == 0 ? "?" : ",?");
                    }
                    db.delete(table, "client_key IN (" + marks + ")", chunk.toArray(new String[0]));
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
        } catch (RuntimeException failed) {
            Log.w(TAG, "could not remove sent entries", failed);
        }
    }

    private int count(String table) {
        try {
            return (int) DatabaseUtils.queryNumEntries(helper.getReadableDatabase(), table);
        } catch (RuntimeException failed) {
            return 0;
        }
    }

    private static List<TrackerRules.Fix> readFixes(SQLiteDatabase db) {
        List<TrackerRules.Fix> fixes = new ArrayList<>();
        try (Cursor c = db.query("fixes", null, null, null, null, null, "time, id")) {
            int id = c.getColumnIndexOrThrow("id");
            int key = c.getColumnIndexOrThrow("client_key");
            int owner = c.getColumnIndexOrThrow("owner");
            int ownerJson = c.getColumnIndexOrThrow("owner_json");
            int time = c.getColumnIndexOrThrow("time");
            int latitude = c.getColumnIndexOrThrow("latitude");
            int longitude = c.getColumnIndexOrThrow("longitude");
            int accuracy = c.getColumnIndexOrThrow("accuracy");
            int speed = c.getColumnIndexOrThrow("speed");
            int bearing = c.getColumnIndexOrThrow("bearing");
            int afterGap = c.getColumnIndexOrThrow("after_gap");
            int status = c.getColumnIndexOrThrow("status");
            int caseJson = c.getColumnIndexOrThrow("case_json");
            int battery = c.getColumnIndexOrThrow("battery");
            int charging = c.getColumnIndexOrThrow("charging");
            while (c.moveToNext()) {
                fixes.add(new TrackerRules.Fix(
                        c.getLong(id),
                        c.getString(key),
                        c.getString(owner),
                        c.getString(ownerJson),
                        c.getLong(time),
                        c.getDouble(latitude),
                        c.getDouble(longitude),
                        optional(c, accuracy),
                        optional(c, speed),
                        optional(c, bearing),
                        c.getInt(afterGap) != 0,
                        c.getString(status),
                        c.getString(caseJson),
                        optional(c, battery),
                        c.isNull(charging) ? null : c.getInt(charging) != 0));
            }
        }
        return fixes;
    }

    private static List<TrackerRules.Event> readEvents(SQLiteDatabase db) {
        List<TrackerRules.Event> events = new ArrayList<>();
        try (Cursor c = db.query("events", null, null, null, null, null, "at, id")) {
            int id = c.getColumnIndexOrThrow("id");
            int key = c.getColumnIndexOrThrow("client_key");
            int owner = c.getColumnIndexOrThrow("owner");
            int ownerJson = c.getColumnIndexOrThrow("owner_json");
            int kind = c.getColumnIndexOrThrow("kind");
            int at = c.getColumnIndexOrThrow("at");
            int latitude = c.getColumnIndexOrThrow("latitude");
            int longitude = c.getColumnIndexOrThrow("longitude");
            int detail = c.getColumnIndexOrThrow("detail");
            while (c.moveToNext()) {
                events.add(new TrackerRules.Event(
                        c.getLong(id),
                        c.getString(key),
                        c.getString(owner),
                        c.getString(ownerJson),
                        c.getString(kind),
                        c.getLong(at),
                        optional(c, latitude),
                        optional(c, longitude),
                        c.getString(detail)));
            }
        }
        return events;
    }

    private static Double optional(Cursor c, int column) {
        return c.isNull(column) ? null : c.getDouble(column);
    }

    private static Double optional(JSONObject fix, String name) {
        double value = fix.optDouble(name, Double.NaN);
        return finite(value) ? value : null;
    }

    static boolean finite(double value) {
        return !Double.isNaN(value) && !Double.isInfinite(value);
    }

    private static final class Helper extends SQLiteOpenHelper {
        Helper(Context context) {
            super(context, DATABASE, null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE fixes ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "client_key TEXT NOT NULL UNIQUE,"
                    + "owner TEXT,"
                    + "owner_json TEXT,"
                    + "time INTEGER NOT NULL,"
                    + "latitude REAL NOT NULL,"
                    + "longitude REAL NOT NULL,"
                    + "accuracy REAL,"
                    + "speed REAL,"
                    + "bearing REAL,"
                    + "after_gap INTEGER NOT NULL DEFAULT 0,"
                    + "status TEXT NOT NULL DEFAULT '',"
                    + "case_json TEXT,"
                    + "battery REAL,"
                    + "charging INTEGER)");
            db.execSQL("CREATE INDEX fixes_time ON fixes (time)");
            db.execSQL("CREATE TABLE events ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "client_key TEXT NOT NULL UNIQUE,"
                    + "owner TEXT,"
                    + "owner_json TEXT,"
                    + "kind TEXT NOT NULL,"
                    + "at INTEGER NOT NULL,"
                    + "latitude REAL,"
                    + "longitude REAL,"
                    + "detail TEXT NOT NULL DEFAULT '')");
            db.execSQL("CREATE INDEX events_at ON events (at)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Version 1 is the only one.
        }
    }
}
