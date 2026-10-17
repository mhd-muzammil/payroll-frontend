package in.systimus.payroll;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Every decision the duty tracker makes about what to record and what to send,
 * with nothing of Android in it, so that each rule can be checked on a computer
 * rather than on a phone in somebody's pocket.
 *
 * The rest is plumbing around these: DutyTrackerService watches the phone,
 * Outbox keeps what is waiting, Uploader talks to the server. When a kilometre
 * goes missing or turns up twice, the reason is in here.
 */
final class TrackerRules {
    private TrackerRules() {}

    static final long MINUTE_MS = 60L * 1000L;
    static final long HOUR_MS = 60L * MINUTE_MS;

    /** Matches DutySession.MAX_DURATION_HOURS on the server. */
    static final long MAX_DURATION_MS = 16L * HOUR_MS;
    /** The server refuses a fix older than this (pings.MAX_BACKLOG_HOURS), so it is not kept either. */
    static final long MAX_AGE_MS = 48L * HOUR_MS;
    /** How far ahead of the phone's clock a fix's own time may be and still be believed. */
    static final long FUTURE_SLACK_MS = 2L * MINUTE_MS;
    /** An outage of the app shorter than this is not worth a line on the day board. */
    static final long STOPPED_WORTH_MS = 15L * MINUTE_MS;
    /** Longest that fixes wait behind a GPS change the server has not yet taken. */
    static final long HOLD_MAX_MS = 10L * MINUTE_MS;
    /** Least time between two uploads started by fixes: the web app's own 30-second cadence. */
    static final long UPLOAD_GAP_MS = 30L * 1000L;
    /** Most fixes, or events, in one request. The server's MAX_BATCH. */
    static final int MAX_BATCH = 500;
    /** Most fixes kept on the phone. A day of 30-second fixes is ~2900. */
    static final int MAX_FIXES = 6000;
    /** Most events kept on the phone. A whole day of GPS and signal changes is a few dozen. */
    static final int MAX_EVENTS = 1000;
    /** Most fixes drain() hands the web app at once: its own queue keeps no more (pingQueue.js MAX_QUEUED). */
    static final int HANDOVER_FIXES = 2000;
    /** Most events drain() hands over at once: the web app's event queue keeps no more (eventQueue.js MAX_QUEUED_EVENTS). */
    static final int HANDOVER_EVENTS = 500;

    /** A position waiting to go to the server, as the outbox holds it. */
    static final class Fix {
        /** The row it is stored in; breaks the tie between two fixes taken in the same millisecond. */
        final long id;
        /** client_key. The server keeps one row per key, so sending a fix twice stores it once. */
        final String key;
        /** Whose duty it was taken on (see ownerKey), or null for a fix held by a 1.4 APK. */
        final String owner;
        /** The same id exactly as the web app gave it, so drain() hands back what it was given. */
        final String ownerJson;
        final long time;
        final double latitude;
        final double longitude;
        final Double accuracy;
        final Double speed;
        final Double bearing;
        final boolean afterGap;
        final String status;
        final String caseJson;
        final Double battery;
        final Boolean charging;

        Fix(long id, String key, String owner, String ownerJson, long time, double latitude, double longitude,
                Double accuracy, Double speed, Double bearing, boolean afterGap, String status, String caseJson,
                Double battery, Boolean charging) {
            this.id = id;
            this.key = key;
            this.owner = owner;
            this.ownerJson = ownerJson;
            this.time = time;
            this.latitude = latitude;
            this.longitude = longitude;
            this.accuracy = accuracy;
            this.speed = speed;
            this.bearing = bearing;
            this.afterGap = afterGap;
            this.status = status;
            this.caseJson = caseJson;
            this.battery = battery;
            this.charging = charging;
        }
    }

    /** Something that happened to the phone rather than a position: GPS, signal, the app itself. */
    static final class Event {
        final long id;
        final String key;
        final String owner;
        final String ownerJson;
        /** gps_off, gps_on, net_off, net_on, tracker_stopped or tracker_started. */
        final String kind;
        final long at;
        final Double latitude;
        final Double longitude;
        final String detail;

        Event(long id, String key, String owner, String ownerJson, String kind, long at,
                Double latitude, Double longitude, String detail) {
            this.id = id;
            this.key = key;
            this.owner = owner;
            this.ownerJson = ownerJson;
            this.kind = kind;
            this.at = at;
            this.latitude = latitude;
            this.longitude = longitude;
            this.detail = detail;
        }
    }

    // ---------------------------------------------------------------- whose

    /**
     * One spelling for a user id, whichever way it arrived.
     *
     * The server's tokens carry user_id as text ("42"), and the web app may pass
     * it on as that or as the number 42. Compared as text, so that the same
     * person is always the same person.
     */
    static String ownerKey(Object raw) {
        if (raw instanceof String) {
            String text = ((String) raw).trim();
            return text.isEmpty() ? null : text;
        }
        if (raw instanceof Integer || raw instanceof Long || raw instanceof Short || raw instanceof Byte) {
            return String.valueOf(((Number) raw).longValue());
        }
        if (raw instanceof Double || raw instanceof Float) {
            double value = ((Number) raw).doubleValue();
            if (Double.isNaN(value) || Double.isInfinite(value)) {
                return null;
            }
            if (value == Math.rint(value) && Math.abs(value) < 9.0e15) {
                return String.valueOf((long) value);
            }
            return String.valueOf(value);
        }
        return null;
    }

    /**
     * Whether the user whose tokens we hold may send an entry.
     *
     * Their own, yes. An untagged one -- held by a 1.4 APK, before entries had
     * an owner -- belongs to whoever is signed in, which is what 1.4 did. Anyone
     * else's, never: a supervisor signing in on an engineer's phone must not post
     * the engineer's route as their own.
     */
    static boolean sendable(String owner, String user) {
        return owner == null || owner.equals(user);
    }

    /**
     * Whose tokens the phone holds: the user the uploader sends for.
     *
     * The user inside the access token, because that is who the server credits
     * with whatever the tokens carry, whatever the page says. The page's userId
     * counts only for a token that names nobody. If the two disagree, nobody:
     * the page has started the tracker again for one person while another is
     * signed in, and the duty owner's fixes must not go out as the other's.
     *
     * @param inToken user_id read from the access token (ownerKey), or null
     * @param named   the userId the page passed with it (ownerKey), or null
     */
    static String tokenHolder(String inToken, String named) {
        if (inToken == null) {
            return named;
        }
        return named == null || inToken.equals(named) ? inToken : null;
    }

    // ---------------------------------------------------------------- what goes next

    private static final Comparator<Fix> FIX_ORDER = new Comparator<Fix>() {
        @Override
        public int compare(Fix a, Fix b) {
            return a.time != b.time ? Long.compare(a.time, b.time) : Long.compare(a.id, b.id);
        }
    };

    private static final Comparator<Event> EVENT_ORDER = new Comparator<Event>() {
        @Override
        public int compare(Event a, Event b) {
            return a.at != b.at ? Long.compare(a.at, b.at) : Long.compare(a.id, b.id);
        }
    };

    /** The oldest events this user may send, at most `limit`, oldest first. */
    static List<Event> pickEvents(List<Event> waiting, String user, int limit) {
        List<Event> ordered = new ArrayList<>(waiting);
        Collections.sort(ordered, EVENT_ORDER);
        List<Event> picked = new ArrayList<>();
        for (Event event : ordered) {
            if (picked.size() >= limit) {
                break;
            }
            if (sendable(event.owner, user)) {
                picked.add(event);
            }
        }
        return picked;
    }

    /**
     * The oldest fixes this user may send, at most `limit`, in the order they
     * were taken -- so a backlog fills the route in behind the engineer instead
     * of after the newest position. Fixes taken at or after `holdFrom` wait
     * (see Hold); -1 holds nothing.
     */
    static List<Fix> pickFixes(List<Fix> waiting, String user, long holdFrom, int limit) {
        List<Fix> ordered = new ArrayList<>(waiting);
        Collections.sort(ordered, FIX_ORDER);
        List<Fix> picked = new ArrayList<>();
        for (Fix fix : ordered) {
            if (picked.size() >= limit) {
                break;
            }
            if (!sendable(fix.owner, user)) {
                continue;
            }
            if (holdFrom >= 0 && fix.time >= holdFrom) {
                continue;
            }
            picked.add(fix);
        }
        return picked;
    }

    /** What drain() hands the web app in one go. */
    static final class Handover {
        final List<Fix> fixes;
        final List<Event> events;

        Handover(List<Fix> fixes, List<Event> events) {
            this.fixes = fixes;
            this.events = events;
        }
    }

    /**
     * What drain() hands over: the oldest, and no more than the web app's own
     * queues keep. The page drops the oldest of anything beyond them, without a
     * word, and a fix dropped there is road the engineer drove that is never
     * counted. What stays here goes at the next drain(), or from the phone
     * itself.
     *
     * And no fix taken at or after the oldest event that stays here: the page
     * sends events before fixes, and a fix that reached the server ahead of the
     * switch-off before it would be counted after all.
     */
    static Handover handOver(List<Fix> fixes, List<Event> events, int maxFixes, int maxEvents) {
        List<Event> orderedEvents = new ArrayList<>(events);
        Collections.sort(orderedEvents, EVENT_ORDER);
        int eventCount = Math.max(0, Math.min(maxEvents, orderedEvents.size()));
        List<Event> givenEvents = new ArrayList<>(orderedEvents.subList(0, eventCount));
        long fixesBefore = eventCount < orderedEvents.size() ? orderedEvents.get(eventCount).at : Long.MAX_VALUE;

        List<Fix> orderedFixes = new ArrayList<>(fixes);
        Collections.sort(orderedFixes, FIX_ORDER);
        List<Fix> givenFixes = new ArrayList<>();
        for (Fix fix : orderedFixes) {
            if (givenFixes.size() >= maxFixes || fix.time >= fixesBefore) {
                break;
            }
            givenFixes.add(fix);
        }
        return new Handover(givenFixes, givenEvents);
    }

    static boolean isGps(String kind) {
        return "gps_off".equals(kind) || "gps_on".equals(kind);
    }

    /** When the oldest GPS change this user still has to send happened, or -1 if there is none. */
    static long oldestGpsAt(List<Event> waiting, String user) {
        long oldest = -1L;
        for (Event event : waiting) {
            if (isGps(event.kind) && sendable(event.owner, user) && (oldest < 0 || event.at < oldest)) {
                oldest = event.at;
            }
        }
        return oldest;
    }

    /**
     * Fixes wait while the GPS change before them has not reached the server.
     *
     * The server leaves a stretch out of the kilometres when Location was
     * switched off across it -- but only if it had the gps_off before the fix
     * on the far side of the stretch arrived. Sent the other way round, the
     * stretch is counted, and then un-counted the moment the event lands: the
     * engineer watches the figure go DOWN. So when events/ fails, the fixes
     * taken after the oldest unsent GPS change are held back. Not for ever: ten
     * minutes, and then they go anyway, and that stretch is simply counted.
     *
     * The ten minutes run only while the server can be reached. An hour with
     * no signal is not the server refusing the events, and if it used up the
     * ten minutes, the first pass after the signal returns -- the very moment
     * events/ is most likely to time out while a batch gets through -- would
     * send the fix first.
     *
     * Paused by a pass that reaches nobody, not started again. Started again,
     * one such pass every few minutes on a patchy network would keep the fixes
     * waiting for as long as events/ kept failing, far past the ten minutes.
     */
    static final class Hold {
        /** When the ten minutes began, moved on past every stretch the server could not be reached; -1 when nothing waits. */
        private long since = -1L;
        /** When the current pass asked. */
        private long askedAt = -1L;
        /** When a pass that reached nobody asked; until the next pass asks, that time does not count. -1: none. */
        private long downSince = -1L;

        /** Nothing reached the server on this pass: from when it asked until the next pass asks does not count. */
        void unreachable() {
            if (since >= 0 && downSince < 0) {
                downSince = askedAt;
            }
        }

        /**
         * The time from which fixes wait on this pass, or -1 to send them all.
         *
         * @param eventsFailed events/ was tried and failed with anything but 404
         *                     (a 404 is a server that has no events/ at all)
         * @param oldestGpsAt  oldestGpsAt() of what is still waiting
         * @param nowElapsed   elapsedRealtime, which a change of the phone's clock cannot move
         */
        long from(boolean eventsFailed, long oldestGpsAt, long nowElapsed) {
            askedAt = nowElapsed;
            if (!eventsFailed || oldestGpsAt < 0) {
                since = -1L;
                downSince = -1L;
                return -1L;
            }
            if (since < 0) {
                since = nowElapsed;
            } else if (downSince >= 0) {
                since += nowElapsed - downSince;
            }
            downSince = -1L;
            return nowElapsed - since < HOLD_MAX_MS ? oldestGpsAt : -1L;
        }
    }

    // ---------------------------------------------------------------- what the server said

    /** One entry the server would not take, by its place in the request. */
    static final class Rejection {
        final int index;
        final String reason;

        Rejection(int index, String reason) {
            this.index = index;
            this.reason = reason;
        }
    }

    /** What to do with each entry of a request the server answered with 201. */
    static final class Acks {
        /** Stored, already held, or refused for a reason that will never change: off the phone. */
        final List<String> remove = new ArrayList<>();
        /** Refused for a reason that time cures: kept and sent again. */
        final List<String> retry = new ArrayList<>();
        /** How many of `remove` were refused rather than taken. */
        int dropped;
    }

    /**
     * Sort a sent batch by the server's answer.
     *
     * The answer counts what was stored and what it already had, and lists by
     * index only what it refused -- so every entry not listed is acknowledged.
     */
    static Acks acks(List<String> sentKeys, List<Rejection> rejected) {
        Map<Integer, String> refused = new HashMap<>();
        for (Rejection rejection : rejected) {
            if (rejection != null && rejection.index >= 0 && rejection.index < sentKeys.size()) {
                refused.put(rejection.index, rejection.reason);
            }
        }
        Acks acks = new Acks();
        for (int index = 0; index < sentKeys.size(); index++) {
            String key = sentKeys.get(index);
            if (!refused.containsKey(index)) {
                acks.remove.add(key);
            } else if (retryable(refused.get(index))) {
                acks.retry.add(key);
            } else {
                acks.remove.add(key);
                acks.dropped++;
            }
        }
        return acks;
    }

    /**
     * "timestamp is in the future": the phone's clock is more than five minutes
     * fast. A minute later the same fix is accepted, and dropping it would throw
     * away that phone's whole day. Everything else -- no position, older than
     * two days, a kind the server does not know -- will be refused again.
     */
    static boolean retryable(String reason) {
        return reason != null && reason.toLowerCase(Locale.ROOT).contains("future");
    }

    // ---------------------------------------------------------------- one upload pass

    /** What the server said to one request, as a pass weighs it. */
    static final class Answer {
        /** The HTTP status, or -1 when nothing came back at all. */
        final int status;
        /**
         * For a 2xx, what became of each entry sent; null otherwise, or when the
         * answer could not be read as the server's -- then everything is kept
         * and sent again, which the client_keys make harmless.
         */
        final Acks acks;

        Answer(int status, Acks acks) {
            this.status = status;
            this.acks = acks;
        }

        boolean ok() {
            return status >= 200 && status < 300;
        }
    }

    /**
     * The outbox and the server, as one upload pass sees them.
     *
     * Uploader is the real one. The tests put a scripted server behind it, so
     * the order of a pass -- the part that decides whether a kilometre is
     * counted -- is checked on a computer, not on a phone in a pocket.
     */
    interface Link {
        /** Every event waiting, read afresh. */
        List<Event> events();

        /** Every fix waiting, read afresh. */
        List<Fix> fixes();

        /** Whether the tracker can say "still here" right now (see heartbeat()). */
        boolean heartbeatAllowed();

        /**
         * POST events/ -- an empty list is the heartbeat -- and take what the
         * server acknowledged off the phone. Null when the sign-in has been
         * refused: the pass stops, and nothing more is tried until new tokens.
         */
        Answer sendEvents(List<Event> events);

        /** POST ping/batch/ and take what the server acknowledged off the phone. Null as above. */
        Answer sendFixes(List<Fix> fixes);

        /** An empty ping/batch/: stores nothing, says whether the server is there. Null as above. */
        Answer probe();

        /** elapsedRealtime, which a change of the phone's clock cannot move. */
        long elapsed();

        /** Whether any request on this pass got an answer, of any status. */
        boolean anyAnswered();

        /** Whether the last request on this pass got an answer. */
        boolean lastAnswered();

        /** Whether net_off or net_on was recorded on the way. */
        boolean signalChanged();
    }

    /**
     * One upload pass: events first, then fixes, oldest first, five hundred at
     * a time.
     *
     * EVENTS FIRST. A GPS change has to be on the server before the fix that
     * follows it, or the stretch it explains is counted after all (see Hold).
     *
     * @param user  whose tokens the pass sends with; only their own entries and
     *              untagged ones go (see sendable)
     * @param owner whose duty the tracker is recording. "Still here" speaks for
     *              that duty's tracker, so only its owner says it: someone else
     *              signed in on the phone must not keep the owner's row green,
     *              nor their own.
     */
    static void upload(Link link, Hold hold, String user, String owner, boolean heartbeat) {
        boolean eventsFailed = false;
        List<Event> events = pickEvents(link.events(), user, MAX_BATCH);
        if (!events.isEmpty() || (heartbeat && sendable(owner, user) && link.heartbeatAllowed())) {
            Answer answer = link.sendEvents(events);
            if (answer == null) {
                return;
            }
            // 404 is a server from before events/ existed: nothing to wait for.
            eventsFailed = !answer.ok() && answer.status != 404;
        }

        // Then fixes, oldest first, five hundred at a time.
        long holdFrom = hold.from(eventsFailed, oldestGpsAt(link.events(), user), link.elapsed());
        List<Fix> waiting = link.fixes();
        while (true) {
            List<Fix> batch = pickFixes(waiting, user, holdFrom, MAX_BATCH);
            if (batch.isEmpty()) {
                break;
            }
            Answer answer = link.sendFixes(batch);
            if (answer == null) {
                return;
            }
            if (!answer.ok()) {
                break;
            }
            waiting = without(waiting, batch);
            if (answer.acks == null || !answer.acks.retry.isEmpty() || batch.size() < MAX_BATCH) {
                break;
            }
        }
        boolean holding = holdFrom >= 0 && !pickFixes(waiting, user, -1L, 1).isEmpty();
        if (holding && !link.anyAnswered()) {
            // Fixes are waiting behind a GPS change and nothing has got through
            // on this pass. An empty batch stores nothing (and so is no sign of
            // life on the board) but says whether the server is there at all.
            if (link.probe() == null) {
                return;
            }
        }
        if (!link.anyAnswered()) {
            hold.unreachable();
        }

        // A change of signal noted on the way goes now, while the line is up.
        if (link.signalChanged() && link.lastAnswered()) {
            List<Event> more = pickEvents(link.events(), user, MAX_BATCH);
            if (!more.isEmpty()) {
                link.sendEvents(more);
            }
        }
    }

    private static List<Fix> without(List<Fix> waiting, List<Fix> sent) {
        Set<String> gone = new HashSet<>();
        for (Fix fix : sent) {
            gone.add(fix.key);
        }
        List<Fix> rest = new ArrayList<>();
        for (Fix fix : waiting) {
            if (!gone.contains(fix.key)) {
                rest.add(fix);
            }
        }
        return rest;
    }

    // ---------------------------------------------------------------- signal

    static final int NET_UNKNOWN = 0;
    static final int NET_ANSWERED = 1;
    static final int NET_SILENT = 2;

    /**
     * No internet, told by the uploads themselves.
     *
     * Whether the phone has a network says nothing about whether the server can
     * be reached -- a prepaid pack runs out with the network still "connected".
     * So the only judge is a request: the first one that gets no answer at all,
     * after one that did, is net_off; the next one answered is net_on. An answer
     * with an error status still proves the line is up, so it is never net_off.
     */
    static final class Net {
        int last;
        boolean off;

        Net(int last, boolean off) {
            this.last = last;
            this.off = off;
        }

        /** "net_off", "net_on" or null, after an attempt that was answered or not. */
        String after(boolean answered) {
            if (answered) {
                last = NET_ANSWERED;
                if (off) {
                    off = false;
                    return "net_on";
                }
                return null;
            }
            boolean wasUp = last == NET_ANSWERED;
            last = NET_SILENT;
            if (wasUp && !off) {
                off = true;
                return "net_off";
            }
            return null;
        }
    }

    // ---------------------------------------------------------------- GPS

    /** A GPS event to record. */
    static final class GpsChange {
        final String kind;
        final String detail;

        GpsChange(String kind, String detail) {
            this.kind = kind;
            this.detail = detail;
        }
    }

    /**
     * What a reading of the Location switch means.
     *
     * Only the switch counts. "No location available" also happens with
     * Location ON -- indoors, in an underpass, a phone in a bike's seat box --
     * and the user waived only the kilometres of a GPS that was switched off.
     *
     * "switched": seen changing while the tracker was running, so the moment is
     * known. "found_off" / "found_on": found that way when tracking (re)started,
     * so it could have changed at any point before -- the board shows it, but
     * the server never leaves a stretch out because of it.
     *
     * @param last    "on", "off", or null when nothing is known for this duty
     * @param running the reading came from a change notification, not from a start
     */
    static GpsChange gpsChange(String last, boolean enabled, boolean running) {
        String now = enabled ? "on" : "off";
        if (now.equals(last)) {
            return null;
        }
        if (last == null) {
            // Nothing known yet: only an off is news.
            return enabled ? null : new GpsChange("gps_off", "found_off");
        }
        String detail = running ? "switched" : (enabled ? "found_on" : "found_off");
        return new GpsChange(enabled ? "gps_on" : "gps_off", detail);
    }

    /** Whether the next fix is the far side of a stretch with Location switched off. */
    static boolean gapAfter(GpsChange change) {
        return change != null && "gps_off".equals(change.kind) && "switched".equals(change.detail);
    }

    // ---------------------------------------------------------------- sixteen hours

    /** The tracker's sixteen-hour clock, and the duty session it runs for. */
    static final class Clock {
        final long startedAt;
        final String sessionId;

        Clock(long startedAt, String sessionId) {
            this.startedAt = startedAt;
            this.sessionId = sessionId;
        }
    }

    /**
     * The clock after the web app calls start().
     *
     * It is the SERVER's session that sixteen hours are counted from, and it
     * starts again only for a Login (fresh) or a session the phone has not seen.
     * 1.4 counted from whenever the service last began listening and reset only
     * on a clean stop -- so a duty that ended any other way left yesterday's
     * clock behind, and the next morning's duty stopped itself on its first fix.
     * And a restart by Android never starts the clock again: that would let a
     * duty nobody closed record the commute home and the next morning's ride in.
     *
     * A web app from before 1.5 names no session. Then the clock carries on for a
     * tracker that is already running (a page reload) and starts now for one
     * that is not -- which is what 1.4 meant, without its stale clock.
     */
    static Clock clockOnStart(boolean fresh, String sessionId, long sessionStartedAt,
            String storedId, long storedAt, boolean running, long now) {
        long named = sessionStartedAt > 0 ? sessionStartedAt : now;
        if (fresh || (sessionId != null && !sessionId.equals(storedId))) {
            return new Clock(named, sessionId);
        }
        if (sessionId != null) {
            return new Clock(storedAt > 0 ? storedAt : named, sessionId);
        }
        return new Clock(running && storedAt > 0 ? storedAt : now, storedId);
    }

    /** The clock after configure(), or null to leave it as it is. */
    static Clock clockOnConfigure(String sessionId, long sessionStartedAt, String storedId, long storedAt, long now) {
        if (sessionId == null) {
            return null;
        }
        long named = sessionStartedAt > 0 ? sessionStartedAt : now;
        if (!sessionId.equals(storedId) || storedAt <= 0) {
            return new Clock(named, sessionId);
        }
        return null;
    }

    static boolean expired(long startedAt, long now) {
        return startedAt > 0 && now - startedAt > MAX_DURATION_MS;
    }

    // ---------------------------------------------------------------- the app was stopped

    /**
     * When the tracker stopped, as best the phone can tell, or 0 if it cannot.
     *
     * Android's own record of the process exit (API 30+) is exact, but it is
     * the latest exit of ANY process of the app, so it is only believed if it
     * falls after the last moment the tracker is known to have been alive.
     * Otherwise that moment itself is the answer.
     *
     * @param exitAt    ApplicationExitInfo timestamp, or 0
     * @param aliveAt   the tracker's last "still here" stamp, or 0
     * @param startedAt the sixteen-hour clock (the duty's start), or 0
     */
    static long stoppedAt(long exitAt, long aliveAt, long startedAt, long now) {
        if (aliveAt > 0) {
            long known = Math.max(aliveAt, Math.min(startedAt, now));
            if (known > now) {
                return 0L;
            }
            return exitAt >= known && exitAt <= now ? exitAt : known;
        }
        if (exitAt > 0 && startedAt > 0 && exitAt >= startedAt && exitAt <= now) {
            return exitAt;
        }
        return 0L;
    }

    static boolean worthReporting(long stoppedAt, long now) {
        return stoppedAt > 0 && now - stoppedAt > STOPPED_WORTH_MS;
    }

    // ---------------------------------------------------------------- a fix's time

    /**
     * The time a fix was TAKEN, unless it is impossible.
     *
     * The time decides which day's kilometres a fix lands on, so it is the
     * fix's own -- not when it was handed over. But a GPS chip with a broken
     * clock reports years away, and the server would refuse such a fix outright;
     * then the moment we were given it is the better answer.
     *
     * Ahead of the phone's clock it is CAPPED, not swapped for the phone's
     * clock -- the same rule as the web app's fixTakenAt. On a phone a few
     * minutes slow every new fix is "ahead"; putting each one back to the
     * phone's time stamped it before the fixes already taken, and the route
     * zig-zagged. The smaller of two times that only go forward only goes
     * forward.
     */
    static long fixTime(long reported, long now) {
        if (reported <= 0 || reported < now - MAX_AGE_MS) {
            return now;
        }
        return Math.min(reported, now + FUTURE_SLACK_MS);
    }

    // ---------------------------------------------------------------- when to talk

    /** Whether a fix should start an upload: thirty seconds since the last attempt. */
    static boolean dueFromFix(long nowElapsed, long lastAttemptElapsed) {
        return lastAttemptElapsed < 0 || nowElapsed - lastAttemptElapsed >= UPLOAD_GAP_MS;
    }

    /**
     * Whether an empty events/ may be sent to say "still here".
     *
     * It keeps a parked engineer from reading "No signal" on the board, so it
     * must only ever mean that the tracker can record: listening, in the
     * foreground, with Location on, and either started by the app in front of
     * the engineer or proven by a fix since. A service Android restarted in the
     * background gets no location on Android 11 and later, and a heartbeat from
     * it would paint a dead tracker green.
     */
    static boolean heartbeat(boolean listening, boolean foreground, boolean requestFailed,
            boolean startedByApp, boolean fixSeen, boolean gpsOn) {
        return recording(listening, foreground, requestFailed, startedByApp, fixSeen) && gpsOn;
    }

    /**
     * Whether the tracker can be taken to be recording: listening, in the
     * foreground, its location request not refused, and either started by the
     * app in front of the engineer or proven by a fix since. Only then does it
     * stamp the alive time a later "phone stopped the app" is timed from: a
     * service Android restarted in the background records nothing on Android
     * 11 and later, and its stamps would put the stop hours too late.
     */
    static boolean recording(boolean listening, boolean foreground, boolean requestFailed,
            boolean startedByApp, boolean fixSeen) {
        return listening && foreground && !requestFailed && (startedByApp || fixSeen);
    }

    /**
     * Where the uploader may send: an absolute http(s) address, without the
     * trailing slash. Anything else -- including the nothing a web app from
     * before 1.5 passes -- means the page does its own sending, as in 1.4.
     */
    static String baseUrl(Object raw) {
        if (!(raw instanceof String)) {
            return null;
        }
        String url = ((String) raw).trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        String lower = url.toLowerCase(Locale.ROOT);
        boolean https = lower.startsWith("https://") && url.length() > "https://".length();
        boolean http = lower.startsWith("http://") && url.length() > "http://".length();
        return https || http ? url : null;
    }

    // ---------------------------------------------------------------- time as text

    /** UTC with milliseconds, the way the web app writes a timestamp. */
    static String iso(long ms) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(ms));
    }

    private static final Pattern ISO = Pattern.compile(
            "(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?\\s*(Z|z|[+-]\\d{2}(?::?\\d{2})?)?");

    /**
     * Milliseconds from a time the web app passed on: a number of milliseconds,
     * or the server's own text ("2026-10-17T09:30:02.123456+05:30"). -1 if it is
     * neither.
     *
     * By hand, because the server writes microseconds, which SimpleDateFormat
     * would read as a count of milliseconds -- two minutes off -- and java.time
     * is not there on Android 7.
     */
    static long parseTime(Object raw) {
        if (raw instanceof Number) {
            double ms = ((Number) raw).doubleValue();
            return ms > 0 && !Double.isNaN(ms) && !Double.isInfinite(ms) ? (long) ms : -1L;
        }
        if (!(raw instanceof String)) {
            return -1L;
        }
        Matcher m = ISO.matcher(((String) raw).trim());
        if (!m.matches()) {
            return -1L;
        }
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
        calendar.clear();
        calendar.set(
                Integer.parseInt(m.group(1)),
                Integer.parseInt(m.group(2)) - 1,
                Integer.parseInt(m.group(3)),
                Integer.parseInt(m.group(4)),
                Integer.parseInt(m.group(5)),
                m.group(6) == null ? 0 : Integer.parseInt(m.group(6)));
        long ms = calendar.getTimeInMillis();
        if (m.group(7) != null) {
            ms += Integer.parseInt((m.group(7) + "00").substring(0, 3));
        }
        String zone = m.group(8);
        if (zone == null) {
            // No zone: the phone's own, the way a browser reads it.
            ms -= TimeZone.getDefault().getOffset(ms);
        } else if (!"Z".equalsIgnoreCase(zone)) {
            int sign = zone.charAt(0) == '-' ? -1 : 1;
            String digits = zone.substring(1).replace(":", "");
            int hours = Integer.parseInt(digits.substring(0, 2));
            int minutes = digits.length() >= 4 ? Integer.parseInt(digits.substring(2, 4)) : 0;
            ms -= sign * (hours * HOUR_MS + minutes * MINUTE_MS);
        }
        return ms;
    }
}
