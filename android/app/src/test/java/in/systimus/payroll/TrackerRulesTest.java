package in.systimus.payroll;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The duty tracker's rules, checked without a phone: whose entries go, in what
 * order, what waits for what, and what the server's answer removes.
 */
public class TrackerRulesTest {
    private static final long MIN = TrackerRules.MINUTE_MS;
    private static final long HOUR = TrackerRules.HOUR_MS;
    /** 17 Oct 2026, 9:30:02.123 AM IST. */
    private static final long T0 = utc(2026, 10, 17, 4, 0, 2) + 123;

    private static long utc(int year, int month, int day, int hour, int minute, int second) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
        calendar.clear();
        calendar.set(year, month - 1, day, hour, minute, second);
        return calendar.getTimeInMillis();
    }

    private static TrackerRules.Fix fix(long id, String key, String owner, long time) {
        return new TrackerRules.Fix(id, key, owner, owner == null ? null : "\"" + owner + "\"", time,
                12.97, 77.59, 5.0, 0.0, null, false, "", null, null, null);
    }

    private static TrackerRules.Event event(long id, String key, String owner, String kind, long at) {
        return new TrackerRules.Event(id, key, owner, owner == null ? null : "\"" + owner + "\"", kind, at,
                null, null, "");
    }

    private static List<String> fixKeys(List<TrackerRules.Fix> fixes) {
        List<String> keys = new ArrayList<>();
        for (TrackerRules.Fix fix : fixes) {
            keys.add(fix.key);
        }
        return keys;
    }

    private static List<String> eventKeys(List<TrackerRules.Event> events) {
        List<String> keys = new ArrayList<>();
        for (TrackerRules.Event event : events) {
            keys.add(event.key);
        }
        return keys;
    }

    // ---------------------------------------------------------------- whose

    @Test
    public void anOwnerIsTheSamePersonWhicheverWayTheIdArrived() {
        assertEquals("42", TrackerRules.ownerKey("42"));
        assertEquals("42", TrackerRules.ownerKey(" 42 "));
        assertEquals("42", TrackerRules.ownerKey(42));
        assertEquals("42", TrackerRules.ownerKey(42L));
        assertEquals("42", TrackerRules.ownerKey(42.0));
        assertNull(TrackerRules.ownerKey(""));
        assertNull(TrackerRules.ownerKey("   "));
        assertNull(TrackerRules.ownerKey(null));
        assertNull(TrackerRules.ownerKey(Double.NaN));
        assertNull(TrackerRules.ownerKey(Boolean.TRUE));
    }

    @Test
    public void onlyTheirOwnAndUntaggedEntriesAreSentForAUser() {
        assertTrue(TrackerRules.sendable("42", "42"));
        assertTrue(TrackerRules.sendable(null, "42"));
        assertTrue(TrackerRules.sendable(null, null));
        assertFalse(TrackerRules.sendable("42", "7"));
        assertFalse(TrackerRules.sendable("42", null));
    }

    @Test
    public void theUploaderSendsAsWhoeverTheTokensBelongTo() {
        assertEquals("42", TrackerRules.tokenHolder("42", "42"));
        assertEquals("42", TrackerRules.tokenHolder("42", null));
        // A token that names nobody: the page's word is all there is.
        assertEquals("42", TrackerRules.tokenHolder(null, "42"));
        assertNull(TrackerRules.tokenHolder(null, null));
    }

    @Test
    public void tokensOfOneUserNeverCarryAnotherUsersDuty() {
        // Someone else signs in on the engineer's phone mid-duty, and the page
        // starts the stopped tracker again with the duty owner's id (42) and
        // the newcomer's tokens (7). Taken at the page's word, 42's fixes went
        // out on 7's tokens: 42 lost the kilometres, 7 gained them.
        String user = TrackerRules.tokenHolder("7", "42");
        assertNull(user);
        assertFalse(TrackerRules.sendable("42", user));
    }

    @Test
    public void anotherOwnersFixesAreNeverPicked() {
        List<TrackerRules.Fix> waiting = Arrays.asList(
                fix(1, "a", "42", T0),
                fix(2, "b", "7", T0 + 1000),
                fix(3, "c", null, T0 + 2000),
                fix(4, "d", "42", T0 + 3000));
        assertEquals(Arrays.asList("a", "c", "d"), fixKeys(TrackerRules.pickFixes(waiting, "42", -1L, 500)));
        assertEquals(Arrays.asList("b", "c"), fixKeys(TrackerRules.pickFixes(waiting, "7", -1L, 500)));
        // Tokens nobody can put a name to send only what has no owner.
        assertEquals(Collections.singletonList("c"), fixKeys(TrackerRules.pickFixes(waiting, null, -1L, 500)));
    }

    @Test
    public void anotherOwnersEventsAreNeverPicked() {
        List<TrackerRules.Event> waiting = Arrays.asList(
                event(1, "a", "42", "gps_off", T0),
                event(2, "b", "7", "net_off", T0 + 1000),
                event(3, "c", null, "tracker_stopped", T0 + 2000));
        assertEquals(Arrays.asList("a", "c"), eventKeys(TrackerRules.pickEvents(waiting, "42", 500)));
        assertEquals(Arrays.asList("b", "c"), eventKeys(TrackerRules.pickEvents(waiting, "7", 500)));
    }

    // ---------------------------------------------------------------- order

    @Test
    public void fixesGoOldestFirstAndTiesInTheOrderTheyWereKept() {
        List<TrackerRules.Fix> waiting = Arrays.asList(
                fix(5, "late", "42", T0 + 60000),
                fix(3, "tie-second", "42", T0),
                fix(2, "tie-first", "42", T0),
                fix(9, "first", "42", T0 - 1000));
        assertEquals(Arrays.asList("first", "tie-first", "tie-second", "late"),
                fixKeys(TrackerRules.pickFixes(waiting, "42", -1L, 500)));
    }

    @Test
    public void eventsGoOldestFirst() {
        List<TrackerRules.Event> waiting = Arrays.asList(
                event(4, "on", "42", "gps_on", T0 + 5000),
                event(1, "off", "42", "gps_off", T0));
        assertEquals(Arrays.asList("off", "on"), eventKeys(TrackerRules.pickEvents(waiting, "42", 500)));
    }

    @Test
    public void aBatchIsTheOldestFiveHundred() {
        List<TrackerRules.Fix> waiting = new ArrayList<>();
        for (int i = 1200; i > 0; i--) {
            waiting.add(fix(i, "k" + i, "42", T0 + i * 1000L));
        }
        List<TrackerRules.Fix> batch = TrackerRules.pickFixes(waiting, "42", -1L, TrackerRules.MAX_BATCH);
        assertEquals(500, batch.size());
        assertEquals("k1", batch.get(0).key);
        assertEquals("k500", batch.get(499).key);
    }

    // ---------------------------------------------------------------- drain()

    @Test
    public void drainHandsOverNoMoreThanTheWebAppKeepsOldestFirst() {
        // The page keeps 2000 fixes and drops the oldest beyond that, silently.
        List<TrackerRules.Fix> waiting = new ArrayList<>();
        for (int i = 2500; i >= 1; i--) {
            waiting.add(fix(i, "k" + i, "42", T0 + i * 1000L));
        }
        TrackerRules.Handover handed = TrackerRules.handOver(waiting, Collections.<TrackerRules.Event>emptyList(),
                TrackerRules.HANDOVER_FIXES, TrackerRules.HANDOVER_EVENTS);
        assertEquals(2000, handed.fixes.size());
        assertEquals("k1", handed.fixes.get(0).key);
        assertEquals("k2000", handed.fixes.get(1999).key);
        assertTrue(handed.events.isEmpty());
    }

    @Test
    public void drainHandsOverEverythingThatFits() {
        List<TrackerRules.Fix> waiting = Arrays.asList(fix(2, "b", "42", T0 + 1000), fix(1, "a", null, T0));
        List<TrackerRules.Event> events = Collections.singletonList(event(1, "off", "42", "gps_off", T0 + 500));
        TrackerRules.Handover handed = TrackerRules.handOver(waiting, events,
                TrackerRules.HANDOVER_FIXES, TrackerRules.HANDOVER_EVENTS);
        assertEquals(Arrays.asList("a", "b"), fixKeys(handed.fixes));
        assertEquals(Collections.singletonList("off"), eventKeys(handed.events));
    }

    @Test
    public void noFixIsHandedOverAheadOfAnEventLeftBehind() {
        // More events than the page keeps: the fixes after the first one left
        // behind wait with it, so the page cannot send them ahead of it.
        List<TrackerRules.Event> events = Arrays.asList(
                event(1, "e1", "42", "net_off", T0),
                event(2, "e2", "42", "net_on", T0 + MIN),
                event(3, "off", "42", "gps_off", T0 + 2 * MIN));
        List<TrackerRules.Fix> waiting = Arrays.asList(
                fix(1, "before", "42", T0 + MIN),
                fix(2, "at", "42", T0 + 2 * MIN),
                fix(3, "after", "42", T0 + 3 * MIN));
        TrackerRules.Handover handed = TrackerRules.handOver(waiting, events, 2000, 2);
        assertEquals(Arrays.asList("e1", "e2"), eventKeys(handed.events));
        assertEquals(Collections.singletonList("before"), fixKeys(handed.fixes));
    }

    // ---------------------------------------------------------------- hold

    @Test
    public void fixesTakenAfterAnUnsentGpsChangeWaitWhileEventsFail() {
        long gpsAt = T0 + MIN;
        List<TrackerRules.Fix> waiting = Arrays.asList(
                fix(1, "before", "42", T0),
                fix(2, "at", "42", gpsAt),
                fix(3, "after", "42", gpsAt + MIN));
        TrackerRules.Hold hold = new TrackerRules.Hold();
        long from = hold.from(true, gpsAt, 1000L);
        assertEquals(gpsAt, from);
        assertEquals(Collections.singletonList("before"), fixKeys(TrackerRules.pickFixes(waiting, "42", from, 500)));
    }

    @Test
    public void theHoldLastsTenMinutesAndThenEverythingGoes() {
        long gpsAt = T0;
        TrackerRules.Hold hold = new TrackerRules.Hold();
        assertEquals(gpsAt, hold.from(true, gpsAt, 0L));
        assertEquals(gpsAt, hold.from(true, gpsAt, 9 * MIN));
        assertEquals(-1L, hold.from(true, gpsAt, 10 * MIN));
        assertEquals(-1L, hold.from(true, gpsAt, 11 * MIN));
    }

    @Test
    public void noHoldOnceEventsLandOrWhenTheServerHasNoEventsEndpoint() {
        long gpsAt = T0;
        TrackerRules.Hold hold = new TrackerRules.Hold();
        assertEquals(gpsAt, hold.from(true, gpsAt, 0L));
        // events/ answered (or 404): nothing waits.
        assertEquals(-1L, hold.from(false, gpsAt, 1000L));
        // A later failure starts its own ten minutes.
        assertEquals(gpsAt, hold.from(true, gpsAt, 30 * MIN));
        assertEquals(gpsAt, hold.from(true, gpsAt, 39 * MIN));
    }

    @Test
    public void anOutageDoesNotUseUpTheTenMinutes() {
        // An hour without signal, then the signal returns with events/ timing
        // out while a batch would get through: the fix must still wait.
        long gpsAt = T0;
        TrackerRules.Hold hold = new TrackerRules.Hold();
        assertEquals(gpsAt, hold.from(true, gpsAt, 0L));
        hold.unreachable();
        assertEquals(gpsAt, hold.from(true, gpsAt, 30 * MIN));
        hold.unreachable();
        assertEquals(gpsAt, hold.from(true, gpsAt, 60 * MIN));
        assertEquals(gpsAt, hold.from(true, gpsAt, 69 * MIN));
        assertEquals(-1L, hold.from(true, gpsAt, 70 * MIN));
    }

    @Test
    public void aPassThatReachesNobodyPausesTheTenMinutesItDoesNotStartThemAgain() {
        // events/ answers 500 on every pass that gets through, and one pass in
        // a while reaches nobody. Started again by every such pass, the ten
        // minutes would never run out on a patchy network: the fixes would wait,
        // and the board read "No signal", for as long as events/ kept failing.
        long gpsAt = T0;
        TrackerRules.Hold hold = new TrackerRules.Hold();
        assertEquals(gpsAt, hold.from(true, gpsAt, 0L));
        assertEquals(gpsAt, hold.from(true, gpsAt, 2 * MIN));
        assertEquals(gpsAt, hold.from(true, gpsAt, 4 * MIN));
        assertEquals(gpsAt, hold.from(true, gpsAt, 6 * MIN));
        hold.unreachable();
        // 6 to 8 does not count: six minutes so far.
        assertEquals(gpsAt, hold.from(true, gpsAt, 8 * MIN));
        assertEquals(gpsAt, hold.from(true, gpsAt, 11 * MIN));
        assertEquals(-1L, hold.from(true, gpsAt, 12 * MIN));
    }

    @Test
    public void noHoldWithoutAGpsChangeWaiting() {
        assertEquals(-1L, new TrackerRules.Hold().from(true, -1L, 0L));
    }

    @Test
    public void onlyThisUsersGpsChangesHoldTheirFixes() {
        List<TrackerRules.Event> waiting = Arrays.asList(
                event(1, "net", "42", "net_off", T0),
                event(2, "theirs", "7", "gps_off", T0 + 1000),
                event(3, "on", "42", "gps_on", T0 + 5000),
                event(4, "off", "42", "gps_off", T0 + 3000));
        assertEquals(T0 + 3000, TrackerRules.oldestGpsAt(waiting, "42"));
        assertEquals(-1L, TrackerRules.oldestGpsAt(
                Collections.singletonList(event(1, "net", "42", "net_off", T0)), "42"));
    }

    // ---------------------------------------------------------------- the server's answer

    @Test
    public void everythingTheServerDidNotRefuseIsAcknowledged() {
        TrackerRules.Acks acks = TrackerRules.acks(Arrays.asList("a", "b", "c"),
                Collections.<TrackerRules.Rejection>emptyList());
        assertEquals(Arrays.asList("a", "b", "c"), acks.remove);
        assertTrue(acks.retry.isEmpty());
        assertEquals(0, acks.dropped);
    }

    @Test
    public void aFutureTimestampIsKeptAndOtherRefusalsAreDroppedAndCounted() {
        TrackerRules.Acks acks = TrackerRules.acks(Arrays.asList("a", "b", "c", "d"), Arrays.asList(
                new TrackerRules.Rejection(1, "timestamp is in the future."),
                new TrackerRules.Rejection(3, "latitude is required.")));
        assertEquals(Arrays.asList("a", "c", "d"), acks.remove);
        assertEquals(Collections.singletonList("b"), acks.retry);
        assertEquals(1, acks.dropped);
    }

    @Test
    public void aRefusalOutsideTheBatchChangesNothing() {
        TrackerRules.Acks acks = TrackerRules.acks(Arrays.asList("a", "b"), Arrays.asList(
                new TrackerRules.Rejection(7, "latitude is required."),
                new TrackerRules.Rejection(-1, "latitude is required.")));
        assertEquals(Arrays.asList("a", "b"), acks.remove);
        assertEquals(0, acks.dropped);
    }

    @Test
    public void onlyAClockAheadOfTheServerIsWorthTryingAgain() {
        assertTrue(TrackerRules.retryable("timestamp is in the future."));
        assertTrue(TrackerRules.retryable("Timestamp is in the FUTURE"));
        assertFalse(TrackerRules.retryable("timestamp is older than 48 hours."));
        assertFalse(TrackerRules.retryable("each fix must be an object."));
        assertFalse(TrackerRules.retryable(null));
    }

    // ---------------------------------------------------------------- signal

    @Test
    public void netOffIsTheFirstUnansweredAttemptAfterAnAnsweredOneAndNetOnTheNextAnswer() {
        TrackerRules.Net net = new TrackerRules.Net(TrackerRules.NET_UNKNOWN, false);
        assertNull(net.after(true));
        assertEquals("net_off", net.after(false));
        assertNull(net.after(false));
        assertNull(net.after(false));
        assertEquals("net_on", net.after(true));
        assertNull(net.after(true));
        assertEquals("net_off", net.after(false));
    }

    @Test
    public void noNetOffBeforeTheServerHasEverAnswered() {
        TrackerRules.Net net = new TrackerRules.Net(TrackerRules.NET_UNKNOWN, false);
        assertNull(net.after(false));
        assertNull(net.after(false));
        assertNull(net.after(true));
    }

    @Test
    public void anOpenNetOffOutlivesARestartAndClosesOnTheNextAnswer() {
        TrackerRules.Net net = new TrackerRules.Net(TrackerRules.NET_SILENT, true);
        assertNull(net.after(false));
        assertEquals("net_on", net.after(true));
        assertFalse(net.off);
    }

    // ---------------------------------------------------------------- GPS

    @Test
    public void locationFoundOffAsTrackingStartsIsFoundNotSwitched() {
        TrackerRules.GpsChange change = TrackerRules.gpsChange(null, false, false);
        assertEquals("gps_off", change.kind);
        assertEquals("found_off", change.detail);
        assertFalse(TrackerRules.gapAfter(change));
        assertNull(TrackerRules.gpsChange(null, true, false));
    }

    @Test
    public void locationSwitchedWhileTrackingIsSwitchedAndOnlyOffFlagsTheNextFix() {
        TrackerRules.GpsChange off = TrackerRules.gpsChange("on", false, true);
        assertEquals("gps_off", off.kind);
        assertEquals("switched", off.detail);
        assertTrue(TrackerRules.gapAfter(off));
        TrackerRules.GpsChange on = TrackerRules.gpsChange("off", true, true);
        assertEquals("gps_on", on.kind);
        assertEquals("switched", on.detail);
        assertFalse(TrackerRules.gapAfter(on));
    }

    @Test
    public void theSameReadingTwiceIsNotAChange() {
        assertNull(TrackerRules.gpsChange("on", true, true));
        assertNull(TrackerRules.gpsChange("off", false, true));
        assertNull(TrackerRules.gpsChange("off", false, false));
    }

    @Test
    public void locationFoundBackOnAfterARestartIsFoundOn() {
        TrackerRules.GpsChange change = TrackerRules.gpsChange("off", true, false);
        assertEquals("gps_on", change.kind);
        assertEquals("found_on", change.detail);
    }

    @Test
    public void aChangeWithNothingKnownBeforeItIsNeverTreatedAsSwitched() {
        TrackerRules.GpsChange change = TrackerRules.gpsChange(null, false, true);
        assertEquals("found_off", change.detail);
        assertFalse(TrackerRules.gapAfter(change));
    }

    // ---------------------------------------------------------------- sixteen hours

    @Test
    public void aLoginStartsTheClockAtTheServersSessionStart() {
        long session = T0 - 2 * MIN;
        TrackerRules.Clock clock = TrackerRules.clockOnStart(true, "9", session, "8", T0 - 20 * HOUR, false, T0);
        assertEquals(session, clock.startedAt);
        assertEquals("9", clock.sessionId);
    }

    @Test
    public void yesterdaysClockNeverStopsTodaysLogin() {
        // 1.4: a duty that did not end cleanly left its clock, and the next
        // morning's first fix found it sixteen hours old and stopped tracking.
        TrackerRules.Clock clock = TrackerRules.clockOnStart(true, "10", T0, "9", T0 - 20 * HOUR, false, T0 + MIN);
        assertFalse(TrackerRules.expired(clock.startedAt, T0 + MIN));
    }

    @Test
    public void aLoginWithNoSessionTimeStartsNow() {
        TrackerRules.Clock clock = TrackerRules.clockOnStart(true, null, -1L, "8", T0 - 5 * HOUR, true, T0);
        assertEquals(T0, clock.startedAt);
        assertNull(clock.sessionId);
    }

    @Test
    public void aSessionThePhoneHasNotSeenStartsTheClock() {
        long session = T0 - HOUR;
        TrackerRules.Clock clock = TrackerRules.clockOnStart(false, "9", session, "8", T0 - 20 * HOUR, true, T0);
        assertEquals(session, clock.startedAt);
        assertEquals("9", clock.sessionId);
    }

    @Test
    public void aReloadOfTheSameSessionKeepsTheClock() {
        TrackerRules.Clock clock = TrackerRules.clockOnStart(false, "9", T0 - HOUR, "9", T0 - 2 * HOUR, true, T0);
        assertEquals(T0 - 2 * HOUR, clock.startedAt);
        TrackerRules.Clock unset = TrackerRules.clockOnStart(false, "9", T0 - HOUR, "9", 0L, false, T0);
        assertEquals(T0 - HOUR, unset.startedAt);
    }

    @Test
    public void aDutyNobodyClosedIsNeverGivenMoreTime() {
        // Same session, seventeen hours in: no reload or restart buys more.
        TrackerRules.Clock clock = TrackerRules.clockOnStart(false, "9", T0 - 17 * HOUR, "9", T0 - 17 * HOUR, true, T0);
        assertTrue(TrackerRules.expired(clock.startedAt, T0));
    }

    @Test
    public void aWebAppThatNamesNoSessionKeepsARunningTrackersClockAndStartsANewOneNow() {
        TrackerRules.Clock running = TrackerRules.clockOnStart(false, null, -1L, "9", T0 - 2 * HOUR, true, T0);
        assertEquals(T0 - 2 * HOUR, running.startedAt);
        assertEquals("9", running.sessionId);
        TrackerRules.Clock stopped = TrackerRules.clockOnStart(false, null, -1L, "9", T0 - 15 * HOUR, false, T0);
        assertEquals(T0, stopped.startedAt);
    }

    @Test
    public void configureMovesTheClockOnlyForANewSession() {
        assertNull(TrackerRules.clockOnConfigure(null, T0 - HOUR, "9", T0 - 2 * HOUR, T0));
        assertNull(TrackerRules.clockOnConfigure("9", T0 - HOUR, "9", T0 - 2 * HOUR, T0));
        TrackerRules.Clock moved = TrackerRules.clockOnConfigure("10", T0 - HOUR, "9", T0 - 2 * HOUR, T0);
        assertEquals(T0 - HOUR, moved.startedAt);
        assertEquals("10", moved.sessionId);
        TrackerRules.Clock unset = TrackerRules.clockOnConfigure("9", T0 - HOUR, "9", 0L, T0);
        assertEquals(T0 - HOUR, unset.startedAt);
    }

    @Test
    public void sixteenHoursIsTheLimit() {
        assertFalse(TrackerRules.expired(0L, T0));
        assertFalse(TrackerRules.expired(T0 - 16 * HOUR, T0));
        assertTrue(TrackerRules.expired(T0 - 16 * HOUR - 1, T0));
    }

    // ---------------------------------------------------------------- the app was stopped

    @Test
    public void androidsExitRecordIsBelievedOnlyAfterTheLastSignOfLife() {
        long alive = T0 - 2 * HOUR;
        long exit = alive + 10 * MIN;
        assertEquals(exit, TrackerRules.stoppedAt(exit, alive, T0 - 8 * HOUR, T0));
        // An exit from before the tracker was last alive is some older process.
        assertEquals(alive, TrackerRules.stoppedAt(T0 - 5 * HOUR, alive, T0 - 8 * HOUR, T0));
        assertEquals(alive, TrackerRules.stoppedAt(0L, alive, T0 - 8 * HOUR, T0));
    }

    @Test
    public void aDutyStartedAfterTheLastSignOfLifeCannotHaveStoppedBeforeIt() {
        assertEquals(T0 - HOUR, TrackerRules.stoppedAt(0L, T0 - 20 * HOUR, T0 - HOUR, T0));
    }

    @Test
    public void withoutAnAliveStampOnlyAnExitDuringTheDutyCounts() {
        assertEquals(T0 - 30 * MIN, TrackerRules.stoppedAt(T0 - 30 * MIN, 0L, T0 - 2 * HOUR, T0));
        assertEquals(0L, TrackerRules.stoppedAt(T0 - 3 * HOUR, 0L, T0 - 2 * HOUR, T0));
        assertEquals(0L, TrackerRules.stoppedAt(0L, 0L, T0 - HOUR, T0));
    }

    @Test
    public void aShortOutageIsNotReported() {
        assertFalse(TrackerRules.worthReporting(T0 - 14 * MIN, T0));
        assertTrue(TrackerRules.worthReporting(T0 - 16 * MIN, T0));
        assertFalse(TrackerRules.worthReporting(0L, T0));
    }

    // ---------------------------------------------------------------- a fix's time

    @Test
    public void aFixKeepsTheTimeItWasTaken() {
        assertEquals(T0 - 5 * MIN, TrackerRules.fixTime(T0 - 5 * MIN, T0));
        assertEquals(T0 - 47 * HOUR, TrackerRules.fixTime(T0 - 47 * HOUR, T0));
        assertEquals(T0 + MIN, TrackerRules.fixTime(T0 + MIN, T0));
    }

    @Test
    public void anImpossibleFixTimeBecomesNow() {
        assertEquals(T0, TrackerRules.fixTime(T0 - 49 * HOUR, T0));
        assertEquals(T0, TrackerRules.fixTime(0L, T0));
    }

    @Test
    public void aFixAheadOfThePhonesClockIsCappedSoTheRouteKeepsItsOrder() {
        // A phone three minutes slow: every new fix is "ahead". Each is held to
        // the limit instead of being put back to the phone's time, so a later
        // fix is never stamped before an earlier one.
        assertEquals(T0 + 2 * MIN, TrackerRules.fixTime(T0 + 3 * MIN, T0));
        long first = TrackerRules.fixTime(T0 + 3 * MIN, T0);
        long second = TrackerRules.fixTime(T0 + 3 * MIN + 30_000L, T0 + 30_000L);
        assertTrue(second > first);
    }

    // ---------------------------------------------------------------- when to talk

    @Test
    public void aFixStartsAnUploadThirtySecondsAfterTheLastAttempt() {
        assertTrue(TrackerRules.dueFromFix(1000L, -1L));
        assertFalse(TrackerRules.dueFromFix(30999L, 1000L));
        assertTrue(TrackerRules.dueFromFix(31000L, 1000L));
    }

    @Test
    public void theHeartbeatOnlyEverMeansTheTrackerCanRecord() {
        assertTrue(TrackerRules.heartbeat(true, true, false, true, false, true));
        assertTrue(TrackerRules.heartbeat(true, true, false, false, true, true));
        // Restarted by Android in the background, nothing since: a dead tracker must not read green.
        assertFalse(TrackerRules.heartbeat(true, true, false, false, false, true));
        assertFalse(TrackerRules.heartbeat(true, true, false, true, true, false));
        assertFalse(TrackerRules.heartbeat(true, false, false, true, true, true));
        assertFalse(TrackerRules.heartbeat(true, true, true, true, true, true));
        assertFalse(TrackerRules.heartbeat(false, true, false, true, true, true));
    }

    @Test
    public void onlyATrackerThatCanRecordCountsAsAlive() {
        // Started by the app, or proven by a fix: alive, whatever the switch says.
        assertTrue(TrackerRules.recording(true, true, false, true, false));
        assertTrue(TrackerRules.recording(true, true, false, false, true));
        // Restarted by Android in the background, nothing since: its stamps
        // would time a later "phone stopped the app" hours too late.
        assertFalse(TrackerRules.recording(true, true, false, false, false));
        assertFalse(TrackerRules.recording(true, false, false, true, true));
        assertFalse(TrackerRules.recording(true, true, true, true, true));
        assertFalse(TrackerRules.recording(false, true, false, true, true));
    }

    @Test
    public void onlyAnAbsoluteAddressTurnsOnSendingFromThePhone() {
        assertEquals("https://payroll.systimus.in", TrackerRules.baseUrl("https://payroll.systimus.in/"));
        assertEquals("http://10.0.2.2:8000", TrackerRules.baseUrl(" http://10.0.2.2:8000 "));
        assertNull(TrackerRules.baseUrl(""));
        assertNull(TrackerRules.baseUrl("/api"));
        assertNull(TrackerRules.baseUrl("https://"));
        assertNull(TrackerRules.baseUrl(null));
        assertNull(TrackerRules.baseUrl(5));
    }

    // ---------------------------------------------------------------- time as text

    @Test
    public void timesAreWrittenTheWayTheWebAppWritesThem() {
        assertEquals("1970-01-01T00:00:00.000Z", TrackerRules.iso(0L));
        assertEquals("2026-10-17T04:00:02.123Z", TrackerRules.iso(T0));
    }

    @Test
    public void theServersSessionTimeIsReadWithItsZoneAndMicroseconds() {
        assertEquals(T0, TrackerRules.parseTime("2026-10-17T09:30:02.123456+05:30"));
        assertEquals(T0, TrackerRules.parseTime("2026-10-17T04:00:02.123Z"));
        assertEquals(T0, TrackerRules.parseTime("2026-10-17T04:00:02.123+00:00"));
        assertEquals(T0 - 123, TrackerRules.parseTime("2026-10-17T09:30:02+0530"));
        assertEquals(T0 - 2 * HOUR - 123, TrackerRules.parseTime("2026-10-17T00:00:02-02:00"));
        assertEquals(T0, TrackerRules.parseTime(TrackerRules.iso(T0)));
    }

    @Test
    public void aTimeGivenAsMillisecondsIsTakenAsItIs() {
        assertEquals(T0, TrackerRules.parseTime(T0));
        assertEquals(T0, TrackerRules.parseTime((double) T0));
    }

    @Test
    public void aTimeWithNoZoneIsThePhonesOwnLikeABrowserReadsIt() {
        TimeZone before = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
            assertEquals(T0, TrackerRules.parseTime("2026-10-17T09:30:02.123"));
        } finally {
            TimeZone.setDefault(before);
        }
    }

    @Test
    public void somethingThatIsNotATimeIsNotGuessedAt() {
        assertEquals(-1L, TrackerRules.parseTime("yesterday"));
        assertEquals(-1L, TrackerRules.parseTime(""));
        assertEquals(-1L, TrackerRules.parseTime(null));
        assertEquals(-1L, TrackerRules.parseTime(Boolean.TRUE));
        assertEquals(-1L, TrackerRules.parseTime(-5));
    }
}
