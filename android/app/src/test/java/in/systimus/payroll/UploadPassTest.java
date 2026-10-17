package in.systimus.payroll;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * One upload pass (TrackerRules.upload) against a scripted server: what goes
 * in what order, what waits for what, and what an answer -- or no answer at
 * all -- does to the passes after it. These are the paths that decide whether
 * a kilometre is counted, so each test says which mistake it keeps out.
 */
public class UploadPassTest {
    private static final long MIN = TrackerRules.MINUTE_MS;
    /** No answer at all: no signal, or a timeout. */
    private static final int SILENT = -1;
    /** The sign-in refused for good: the pass stops. */
    private static final int SIGNED_OUT = 0;
    /** 17 Oct 2026, 9:30 AM IST. */
    private static final long T0 = utc(2026, 10, 17, 4, 0, 0);

    private static long utc(int year, int month, int day, int hour, int minute, int second) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
        calendar.clear();
        calendar.set(year, month - 1, day, hour, minute, second);
        return calendar.getTimeInMillis();
    }

    private static long nextId = 1;

    private static TrackerRules.Fix fix(String key, String owner, long time) {
        return new TrackerRules.Fix(nextId++, key, owner, owner == null ? null : "\"" + owner + "\"", time,
                12.97, 77.59, 5.0, 0.0, null, false, "", null, null, null);
    }

    private static TrackerRules.Event event(String key, String owner, String kind, long at, String detail) {
        return new TrackerRules.Event(nextId++, key, owner, owner == null ? null : "\"" + owner + "\"", kind, at,
                null, null, detail);
    }

    /**
     * The phone's outbox, and a server answering from a script. Like the real
     * uploader, it takes what a 2xx acknowledged off the phone and, when asked
     * to, notes net_off / net_on from whether each request was answered.
     */
    private static final class Server implements TrackerRules.Link {
        final List<TrackerRules.Event> events = new ArrayList<>();
        final List<TrackerRules.Fix> fixes = new ArrayList<>();
        /** Every request, in order: "events off,on", "fixes a,b", "probe". */
        final List<String> log = new ArrayList<>();
        /** Refusals the next fix batch gets, by client_key. */
        final Map<String, String> refuse = new HashMap<>();
        boolean heartbeatAllowed = true;
        /** Note net_off / net_on into the outbox, keyed kind@request, as Uploader.note does. */
        boolean notesSignal;

        /** The status of each request, in order; 201 once the script runs out. */
        private final LinkedList<Integer> script = new LinkedList<>();
        private final TrackerRules.Net net = new TrackerRules.Net(TrackerRules.NET_ANSWERED, false);
        private long now;
        private boolean any;
        private boolean last;
        private boolean changed;

        Server answer(int... statuses) {
            for (int status : statuses) {
                script.add(status);
            }
            return this;
        }

        /** A pass `minutes` after the first, as user 42 on 42's duty. */
        void pass(TrackerRules.Hold hold, long minutes) {
            pass(hold, minutes, "42", "42", false);
        }

        void pass(TrackerRules.Hold hold, long minutes, String user, String owner, boolean heartbeat) {
            now = minutes * MIN;
            any = false;
            last = false;
            changed = false;
            TrackerRules.upload(this, hold, user, owner, heartbeat);
        }

        private int next(String request) {
            log.add(request);
            Integer scripted = script.poll();
            int status = scripted == null ? 201 : scripted;
            if (status == SIGNED_OUT) {
                return status;
            }
            boolean answered = status > 0;
            any |= answered;
            last = answered;
            String kind = notesSignal ? net.after(answered) : null;
            if (kind != null) {
                events.add(event(kind + "@" + log.size(), "42", kind, T0 + now, ""));
                changed = true;
            }
            return status;
        }

        @Override
        public List<TrackerRules.Event> events() {
            return new ArrayList<>(events);
        }

        @Override
        public List<TrackerRules.Fix> fixes() {
            return new ArrayList<>(fixes);
        }

        @Override
        public boolean heartbeatAllowed() {
            return heartbeatAllowed;
        }

        @Override
        public TrackerRules.Answer sendEvents(List<TrackerRules.Event> batch) {
            List<String> keys = new ArrayList<>();
            for (TrackerRules.Event event : batch) {
                keys.add(event.key);
            }
            int status = next("events " + String.join(",", keys));
            if (status == SIGNED_OUT) {
                return null;
            }
            if (status < 200 || status >= 300) {
                return new TrackerRules.Answer(status, null);
            }
            TrackerRules.Acks acks = TrackerRules.acks(keys, Collections.<TrackerRules.Rejection>emptyList());
            Set<String> gone = new HashSet<>(acks.remove);
            events.removeIf(event -> gone.contains(event.key));
            return new TrackerRules.Answer(status, acks);
        }

        @Override
        public TrackerRules.Answer sendFixes(List<TrackerRules.Fix> batch) {
            List<String> keys = new ArrayList<>();
            List<TrackerRules.Rejection> rejected = new ArrayList<>();
            for (TrackerRules.Fix fix : batch) {
                if (refuse.containsKey(fix.key)) {
                    rejected.add(new TrackerRules.Rejection(keys.size(), refuse.get(fix.key)));
                }
                keys.add(fix.key);
            }
            int status = next("fixes " + (keys.size() > 3 ? keys.size() + " from " + keys.get(0) : String.join(",", keys)));
            if (status == SIGNED_OUT) {
                return null;
            }
            if (status < 200 || status >= 300) {
                return new TrackerRules.Answer(status, null);
            }
            TrackerRules.Acks acks = TrackerRules.acks(keys, rejected);
            Set<String> gone = new HashSet<>(acks.remove);
            fixes.removeIf(fix -> gone.contains(fix.key));
            return new TrackerRules.Answer(status, acks);
        }

        @Override
        public TrackerRules.Answer probe() {
            int status = next("probe");
            return status == SIGNED_OUT ? null : new TrackerRules.Answer(status, null);
        }

        @Override
        public long elapsed() {
            return now;
        }

        @Override
        public boolean anyAnswered() {
            return any;
        }

        @Override
        public boolean lastAnswered() {
            return last;
        }

        @Override
        public boolean signalChanged() {
            return changed;
        }

        Set<String> waitingFixes() {
            Set<String> keys = new HashSet<>();
            for (TrackerRules.Fix fix : fixes) {
                keys.add(fix.key);
            }
            return keys;
        }
    }

    /** A fix, Location switched off a minute later, and two fixes after it. */
    private static Server switchedOffBetweenFixes() {
        Server server = new Server();
        server.fixes.add(fix("before", "42", T0));
        server.events.add(event("off", "42", "gps_off", T0 + MIN, "switched"));
        server.fixes.add(fix("after", "42", T0 + 2 * MIN));
        server.fixes.add(fix("later", "42", T0 + 3 * MIN));
        return server;
    }

    // ---------------------------------------------------------------- order

    @Test
    public void eventsGoBeforeTheFixes() {
        // Fixes first, and the fix after the switch-off lands before the
        // switch-off itself: the server counts the stretch the engineer was
        // promised would not be counted.
        Server server = switchedOffBetweenFixes();
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Arrays.asList("events off", "fixes before,after,later"), server.log);
        assertTrue(server.events.isEmpty());
        assertTrue(server.fixes.isEmpty());
    }

    @Test
    public void whileEventsAreRefusedNoFixAfterTheGpsChangeGoesAheadOfIt() {
        Server server = switchedOffBetweenFixes().answer(500, 201);
        TrackerRules.Hold hold = new TrackerRules.Hold();
        server.pass(hold, 0);
        // Only the fix from before the switch-off went.
        assertEquals(Arrays.asList("events off", "fixes before"), server.log);
        assertEquals(new HashSet<>(Arrays.asList("after", "later")), server.waitingFixes());

        server.pass(hold, 2);
        assertEquals(Arrays.asList("events off", "fixes before", "events off", "fixes after,later"), server.log);
        assertTrue(server.fixes.isEmpty());
    }

    @Test
    public void aServerWithoutEventsHoldsNothingBack() {
        // 404: a server from before events/ existed. Nothing will ever take the
        // event, so waiting for it would only hold the fixes for ten minutes.
        Server server = switchedOffBetweenFixes().answer(404);
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Arrays.asList("events off", "fixes before,after,later"), server.log);
        assertTrue(server.fixes.isEmpty());
        // The event is kept for a server that has events/.
        assertEquals(1, server.events.size());
    }

    // ---------------------------------------------------------------- the ten minutes

    @Test
    public void afterTenMinutesOfRefusalsTheFixesGoAnyway() {
        Server server = switchedOffBetweenFixes().answer(500, 201);
        TrackerRules.Hold hold = new TrackerRules.Hold();
        server.pass(hold, 0);
        for (int minute = 2; minute <= 8; minute += 2) {
            server.answer(500);
            server.pass(hold, minute);
        }
        assertEquals(new HashSet<>(Arrays.asList("after", "later")), server.waitingFixes());
        server.answer(500, 201);
        server.pass(hold, 10);
        assertTrue(server.fixes.isEmpty());
        assertEquals("fixes after,later", server.log.get(server.log.size() - 1));
    }

    @Test
    public void aPassThatGetsNoAnswerAtAllDoesNotCountTowardTheTenMinutes() {
        // An hour without signal is not the server refusing the events. Counted,
        // it would use up the ten minutes, and the first pass after the signal
        // returns -- events/ timing out while a batch gets through -- would send
        // the fix ahead of the switch-off.
        Server server = new Server();
        server.events.add(event("off", "42", "gps_off", T0 + MIN, "switched"));
        server.fixes.add(fix("after", "42", T0 + 2 * MIN));
        TrackerRules.Hold hold = new TrackerRules.Hold();

        server.answer(500);
        server.pass(hold, 0);
        server.answer(SILENT, SILENT);
        server.pass(hold, 5);
        // Nothing got through, so it asked whether the server is there at all.
        assertEquals(Arrays.asList("events off", "events off", "probe"), server.log);

        server.answer(500);
        server.pass(hold, 60);
        server.answer(500);
        server.pass(hold, 64);
        assertEquals(Collections.singleton("after"), server.waitingFixes());

        server.answer(500, 201);
        server.pass(hold, 65);
        assertTrue(server.fixes.isEmpty());
    }

    @Test
    public void onAPatchyNetworkTheTenMinutesStillRunOut() {
        // One pass in a while reaches nobody. Each one used to start the ten
        // minutes again, so the fixes waited -- and the board read "No signal"
        // -- for as long as events/ kept failing.
        Server server = new Server();
        server.events.add(event("off", "42", "gps_off", T0 + MIN, "switched"));
        server.fixes.add(fix("after", "42", T0 + 2 * MIN));
        TrackerRules.Hold hold = new TrackerRules.Hold();
        for (int minute : new int[] {0, 2, 4}) {
            server.answer(500);
            server.pass(hold, minute);
        }
        server.answer(SILENT, SILENT);
        server.pass(hold, 6);
        for (int minute : new int[] {8, 10, 11}) {
            server.answer(500);
            server.pass(hold, minute);
        }
        assertEquals(Collections.singleton("after"), server.waitingFixes());
        server.answer(500, 201);
        server.pass(hold, 12);
        assertTrue(server.fixes.isEmpty());
    }

    // ---------------------------------------------------------------- "still here"

    @Test
    public void theHeartbeatGoesOnlyForTheDutysOwnerAndOnlyWhenTheTrackerCanRecord() {
        Server server = new Server();
        server.pass(new TrackerRules.Hold(), 0, "42", "42", true);
        assertEquals(Collections.singletonList("events "), server.log);

        Server notAllowed = new Server();
        notAllowed.heartbeatAllowed = false;
        notAllowed.pass(new TrackerRules.Hold(), 0, "42", "42", true);
        assertTrue(notAllowed.log.isEmpty());

        // Someone else signed in on the engineer's phone: neither row is kept green.
        Server someoneElse = new Server();
        someoneElse.pass(new TrackerRules.Hold(), 0, "7", "42", true);
        assertTrue(someoneElse.log.isEmpty());

        Server notDue = new Server();
        notDue.pass(new TrackerRules.Hold(), 0, "42", "42", false);
        assertTrue(notDue.log.isEmpty());
    }

    // ---------------------------------------------------------------- whose

    @Test
    public void anotherUsersEntriesNeitherGoNorHoldTheseBack() {
        Server server = new Server();
        server.events.add(event("theirs-off", "7", "gps_off", T0, "switched"));
        server.events.add(event("mine-net", "42", "net_off", T0, ""));
        server.fixes.add(fix("theirs", "7", T0 + MIN));
        server.fixes.add(fix("mine", "42", T0 + 2 * MIN));
        // events/ refused: the other user's switch-off must not hold this user's fix.
        server.answer(500, 201);
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Arrays.asList("events mine-net", "fixes mine"), server.log);
        assertEquals(Collections.singleton("theirs"), server.waitingFixes());
        assertEquals(2, server.events.size());
    }

    // ---------------------------------------------------------------- what an answer does

    @Test
    public void aRefusedSignInStopsThePassWithEverythingKept() {
        Server server = switchedOffBetweenFixes().answer(SIGNED_OUT);
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Collections.singletonList("events off"), server.log);
        assertEquals(3, server.fixes.size());
        assertEquals(1, server.events.size());
    }

    @Test
    public void aBatchTheServerRefusesStaysForTheNextPass() {
        Server server = new Server();
        server.fixes.add(fix("a", "42", T0));
        server.fixes.add(fix("b", "42", T0 + MIN));
        server.answer(500);
        server.pass(new TrackerRules.Hold(), 0);
        // Answered, so no probe; nothing taken off the phone.
        assertEquals(Collections.singletonList("fixes a,b"), server.log);
        assertEquals(2, server.fixes.size());
    }

    @Test
    public void noSignalWithNothingHeldBackSendsNoProbe() {
        Server server = new Server();
        server.fixes.add(fix("a", "42", T0));
        server.answer(SILENT);
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Collections.singletonList("fixes a"), server.log);
        assertEquals(1, server.fixes.size());
    }

    @Test
    public void aBacklogGoesFiveHundredAtATimeOldestFirst() {
        Server server = new Server();
        for (int i = 1200; i >= 1; i--) {
            server.fixes.add(fix("k" + i, "42", T0 + i * 1000L));
        }
        server.pass(new TrackerRules.Hold(), 0);
        assertEquals(Arrays.asList("fixes 500 from k1", "fixes 500 from k501", "fixes 200 from k1001"), server.log);
        assertTrue(server.fixes.isEmpty());
    }

    @Test
    public void aFixFromAPhoneWhoseClockIsAheadIsKeptAndTheRestWait() {
        Server server = new Server();
        for (int i = 1; i <= 600; i++) {
            server.fixes.add(fix("k" + i, "42", T0 + i * 1000L));
        }
        server.refuse.put("k3", "timestamp is in the future.");
        server.refuse.put("k4", "latitude is required.");
        server.pass(new TrackerRules.Hold(), 0);
        // One batch: k3 kept to be tried again, k4 dropped for good, k501-k600 next time.
        assertEquals(Collections.singletonList("fixes 500 from k1"), server.log);
        assertEquals(101, server.fixes.size());
        assertTrue(server.waitingFixes().contains("k3"));
        assertTrue(server.waitingFixes().contains("k600"));
    }

    // ---------------------------------------------------------------- signal

    @Test
    public void netOffWaitsForTheSignalAndNetOnGoesInThePassThatSawItComeBack() {
        Server server = new Server();
        server.notesSignal = true;
        server.fixes.add(fix("a", "42", T0));
        TrackerRules.Hold hold = new TrackerRules.Hold();
        server.answer(SILENT);
        server.pass(hold, 0);
        // net_off noted, and nothing more tried with no line.
        assertEquals(Collections.singletonList("fixes a"), server.log);
        assertEquals(1, server.events.size());
        assertEquals("net_off", server.events.get(0).kind);

        server.pass(hold, 1);
        // net_off first; net_on, noted on that first answer, goes before the pass ends.
        assertEquals(Arrays.asList("fixes a", "events net_off@1", "fixes a", "events net_on@2"), server.log);
        assertTrue(server.events.isEmpty());
        assertTrue(server.fixes.isEmpty());
    }

    @Test
    public void aChangeOfSignalNotedOnTheWayWaitsIfTheLineHasGoneAgain() {
        Server server = new Server();
        server.notesSignal = true;
        server.fixes.add(fix("a", "42", T0));
        TrackerRules.Hold hold = new TrackerRules.Hold();
        server.answer(SILENT);
        server.pass(hold, 0);
        server.answer(201, SILENT);
        server.pass(hold, 1);
        assertEquals(Arrays.asList("fixes a", "events net_off@1", "fixes a"), server.log);
        // net_on and the second net_off wait for the next pass.
        assertEquals(2, server.events.size());
        assertEquals("net_on", server.events.get(0).kind);
        assertEquals("net_off", server.events.get(1).kind);
    }
}
