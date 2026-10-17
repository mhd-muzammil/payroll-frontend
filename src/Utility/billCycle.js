/**
 * The 25th-to-24th cycle an engineer's history is read in.
 *
 * Named by the month it ENDS in, the way Attendance and the office's KM Report
 * name it: "October 2026" is 25 Sep – 24 Oct. A cycle travels as { year, month }
 * of that last month (month 1-12), and a day as a plain "YYYY-MM-DD" string --
 * never a Date, because a Date carries a time zone and a calendar day does not.
 * A Date built from "2026-10-16" is the 15th west of Greenwich.
 *
 * Pure functions only, so they run under node --test as well as in the app.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3));
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CYCLE_START_DAY = 25;
export const CYCLE_END_DAY = 24;

/**
 * The oldest cycle History offers: August 2026, 25 Jul – 24 Aug.
 *
 * Day scores were backfilled from 25 Jul 2026 and nothing older exists, so a
 * cycle before this one could only ever show an empty screen.
 */
export const FIRST_HISTORY_CYCLE = Object.freeze({ year: 2026, month: 8 });

const pad2 = (n) => String(n).padStart(2, "0");

export const isoDate = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

/** "YYYY-MM-DD" -> { year, month, day }, or null when it is not a real day. */
export function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  // 2026-02-30 parses; Date.UTC quietly rolls it into March. Only a day that
  // comes back as itself is a day.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

// India Standard Time, UTC+5:30 the whole year round (no daylight saving).
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Today in India, whatever the phone's own clock zone is set to.
 *
 * The server's day is the IST one, so a phone left on another zone would put
 * the current cycle's last day, and the 25th itself, on the wrong side of
 * midnight. The offset is added and the UTC fields read, so no Intl support
 * is needed.
 */
export const todayIso = (now = new Date()) => {
  const india = new Date(now.getTime() + IST_OFFSET_MS);
  return isoDate(india.getUTCFullYear(), india.getUTCMonth() + 1, india.getUTCDate());
};

/** `n` cycles after `cycle` (before it, for a negative n). */
export function shiftCycle(cycle, n) {
  const index = cycle.year * 12 + (cycle.month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const previousCycle = (cycle) => shiftCycle(cycle, -1);
export const nextCycle = (cycle) => shiftCycle(cycle, 1);

/** Negative, zero or positive, the way a sort comparator answers. */
export const compareCycles = (a, b) => (a.year - b.year) * 12 + (a.month - b.month);

/** The cycle a day belongs to: from the 25th on, it is next month's. */
export function cycleOf(iso) {
  const d = parseIsoDate(iso);
  if (!d) return null;
  const sameMonth = { year: d.year, month: d.month };
  return d.day >= CYCLE_START_DAY ? nextCycle(sameMonth) : sameMonth;
}

/** First and last day of a cycle: the 25th of the month before, to the 24th. */
export function cycleRange(cycle) {
  const before = previousCycle(cycle);
  return {
    from: isoDate(before.year, before.month, CYCLE_START_DAY),
    to: isoDate(cycle.year, cycle.month, CYCLE_END_DAY),
  };
}

/** "October 2026". */
export const cycleLabel = (cycle) => `${MONTH_NAMES[cycle.month - 1]} ${cycle.year}`;

/** "25 Sep – 24 Oct". */
export function cycleRangeLabel(cycle) {
  const before = previousCycle(cycle);
  return (
    `${CYCLE_START_DAY} ${MONTH_SHORT[before.month - 1]} – ` +
    `${CYCLE_END_DAY} ${MONTH_SHORT[cycle.month - 1]}`
  );
}

/** "Fri 16 Oct". The weekday comes from the date alone, so no time zone can move it. */
export function dayLabel(iso) {
  const d = parseIsoDate(iso);
  if (!d) return "";
  const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return `${WEEKDAY_SHORT[weekday]} ${d.day} ${MONTH_SHORT[d.month - 1]}`;
}

/** The stepper's two limits: never before the first cycle, never past the current one. */
export const canGoBack = (cycle, first = FIRST_HISTORY_CYCLE) =>
  compareCycles(cycle, first) > 0;
export const canGoForward = (cycle, current) => compareCycles(cycle, current) < 0;

/** `cycle`, pulled back inside [first, current]. */
export function clampCycle(cycle, current, first = FIRST_HISTORY_CYCLE) {
  if (compareCycles(cycle, current) > 0) return current;
  if (compareCycles(cycle, first) < 0) return first;
  return cycle;
}

/**
 * The days of `cycle` that can be picked: its first day up to its last, or up to
 * today while the cycle is still running -- a day that has not happened has
 * nothing to show.
 */
export function pickableDays(cycle, today) {
  const { from, to } = cycleRange(cycle);
  return { min: from, max: today < to ? today : to };
}
