export const WORKING_HOURS_PER_DAY = 9.5;
export const MS_PER_HOUR = 1000 * 60 * 60;

export const STATUS_VARIANTS = {
  Present: "success",
  Absent: "error",
  Late: "warning",
  Leave: "warning",
  overTime: "info",
};

export const STATUS_DISPLAY = {
  overTime: "Overtime",
};

/**
 * A stored timestamp as a `datetime-local` input wants it: YYYY-MM-DDTHH:mm in
 * the READER'S OWN time.
 *
 * Not toISOString().slice(0, 16), which is what this used to be. That is UTC,
 * and a datetime-local input means local — so an 11:38 AM punch opened the edit
 * dialog reading 06:08 AM, exactly IST behind. Worse than a wrong label:
 * pressing Update without touching a field saved that shifted time back, moving
 * the punch five and a half hours earlier every time somebody opened the form.
 */
export const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

/**
 * What a day's clock times should read as.
 *
 * A day nobody came in has no punch, so it is stored as midnight on that date
 * -- the date is what every list groups by and it has to come from somewhere.
 * Printing that back as "12:00 AM" would read as somebody who clocked in at
 * midnight, so an absent or leave day shows a dash for both times instead.
 */
const NO_PUNCH_STATUSES = new Set(["Absent", "Leave"]);

export const punchTime = (record, field) =>
  NO_PUNCH_STATUSES.has(record?.status) ? "—" : formatTime(record?.[field]);

export const formatTime = (isoString) => {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * A day's work cannot be longer than the day.
 *
 * The clock-out on one engineer's 15th of September landed three weeks later,
 * on the morning somebody finally pressed Logout, and the row printed
 * "551h 49m". Nothing is served by showing that: it is not a shift, it is a
 * timestamp in the wrong place, and the sum of a month of them is worse.
 */
const MAX_WORKDAY_HOURS = 24;

/**
 * How long the day was -- or null, when the day cannot be measured.
 *
 * Null, and not zero, for a day with a Login and no Logout. Those are not the
 * same thing and the register was printing them the same: an engineer who
 * worked nine hours and forgot to press Logout read as "0h", which says they
 * did nothing all day.
 *
 * Null as well when the clock-out is not after the clock-in. That used to be
 * pushed forward by a day on the theory that it was a night shift, and the
 * theory is wrong: both punches carry their own date, so a real night shift
 * already ends after it starts. What the rule actually did was dress up broken
 * records. One engineer's row reading a tidy 14h 55m was a clock-out stamped
 * the PREVIOUS evening, and the day after it -- the same wrong timestamp, now
 * a day and a half behind -- came out NEGATIVE and was quietly subtracted from
 * that person's total for the cycle.
 *
 * A number here is a day somebody can stand behind. Anything else is said as
 * what it is.
 *
 * HOW THE LENGTH ITSELF IS COUNTED is the office's own rule, and not the
 * clock difference. Whole hours between the two hour marks, plus the minutes
 * of BOTH punches added together:
 *
 *     9:20 am to 9:20 pm   ->  12h + (20 + 20)m  =  12h 40m
 *     9:07 am to 9:25 pm   ->  12h + (07 + 25)m  =  12h 32m
 *
 * The clock difference for those two days is 12h and 12h 18m. This was put to
 * the office with both columns side by side, including what it does to a short
 * stretch -- 9:59 am to 10:01 am counts as 2h where the clock says 2 minutes
 * -- and they chose this one. It is how they have always read a day and it is
 * what their figures are expected to match, so it is deliberate: anybody
 * tempted to "correct" it later is changing a decision, not fixing a bug.
 *
 * It reads up to 59 minutes longer per person per day than the clock, so it
 * never reads short.
 */
export const hoursBetween = (intime, outtime) => {
  if (!intime || !outtime) return null;

  const start = new Date(intime);
  const end = new Date(outtime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  // The record has to make sense first, whatever it is then counted as: the
  // clock-out after the clock-in, and the two of them inside one day.
  const elapsed = (end - start) / MS_PER_HOUR;
  if (!(elapsed > 0 && elapsed < MAX_WORKDAY_HOURS)) return null;

  // Whole hours between the hour marks -- read off the timestamps rather than
  // off the hour numbers, so a shift that ends after midnight still counts the
  // hours it crossed.
  const hourMark = (at) => new Date(at).setMinutes(0, 0, 0);
  const wholeHours = (hourMark(end) - hourMark(start)) / MS_PER_HOUR;

  return wholeHours + (start.getMinutes() + end.getMinutes()) / 60;
};

/** The same in decimal hours, for the payroll code that works in those. */
export const calculateHours = (intime, outtime) =>
  (hoursBetween(intime, outtime) ?? 0).toFixed(1);

/**
 * "4h 36m" -- a stretch of work in the words people say it in.
 *
 * 4.6h is correct and nobody reads it as four hours thirty-six minutes; the
 * office asked what the number meant. A part that is zero is left out, so a
 * full day is "9h" rather than "9h 0m", and a short one is "36m".
 */
export const formatDuration = (hours) => {
  const value = Number(hours);
  if (!Number.isFinite(value) || value <= 0) return "0h";

  const minutes = Math.round(value * 60);
  const wholeHours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (!wholeHours) return `${restMinutes}m`;
  if (!restMinutes) return `${wholeHours}h`;
  return `${wholeHours}h ${restMinutes}m`;
};

/**
 * One day's two punches, as "4h 36m" -- or a dash when there is no answer.
 *
 * Read off the punches rather than off calculateHours, so the minutes are the
 * real ones: rounding to a tenth of an hour first and converting after turns
 * 4h 38m into 4h 36m.
 *
 * A dash where the day cannot be measured, because "0h" is a claim -- that
 * they were here and did nothing -- and a day nobody closed is not that. It
 * reads beside the dash already in the Clock Out column: no Logout, no hours.
 */
export const workedSpan = (intime, outtime) => {
  const hours = hoursBetween(intime, outtime);
  return hours === null ? "—" : formatDuration(hours);
};

export const calculateOvertime = (intime, outtime) => {
  if (!intime || !outtime) return "0.0";

  const hours = parseFloat(calculateHours(intime, outtime));
  const overtime = hours - WORKING_HOURS_PER_DAY;

  return overtime > 0 ? overtime.toFixed(1) : "0.0";
};

export const calculateRemainingWorkingHours = (intime, outtime) => {
  if (!intime || !outtime) return WORKING_HOURS_PER_DAY.toFixed(1);

  const hoursWorked = parseFloat(calculateHours(intime, outtime));
  return Math.max(0, WORKING_HOURS_PER_DAY - hoursWorked).toFixed(1);
};

export const getStatusDisplay = (status) => STATUS_DISPLAY[status] || status;

export const getStatusVariant = (status) => STATUS_VARIANTS[status] || "muted";

export const REGIONS = ["Chennai", "Vellore", "Salem", "Kanchipuram", "Hosur"];

/**
 * Hand a hand-marked row back to the employee it is about.
 *
 * A row the office marks itself -- Mark Attendance, Add Record -- used to be
 * saved with no employee link at all, so it arrives with employee_id null, no
 * email, and a branch of "Chennai" whoever the person is. Every list here keys
 * a person by that id, so one employee came back as two: a card for the days
 * somebody punched and another for the day the office marked, with the second
 * one's absence counted against Chennai.
 *
 * So a row with no id is given the id, branch and email of the employee of
 * that name -- and only when exactly one employee has that name. Namesakes are
 * left alone: two cards for one name is a smaller lie than one person's
 * absence appearing on a colleague's record.
 *
 * The link belongs on the server and is written there now; this keeps the rows
 * saved before that readable, and stays as the answer for a row the server
 * could not attribute either.
 */
export const linkOrphanRows = (records) => {
  const list = Array.isArray(records) ? records : [];
  // name -> the id-bearing rows for that name, one entry per distinct id.
  const owners = new Map();
  for (const record of list) {
    if (record.employee_id == null) continue;
    const name = String(record.employee_name || "").trim().toLowerCase();
    if (!name) continue;
    let known = owners.get(name);
    if (!known) owners.set(name, (known = new Map()));
    if (!known.has(record.employee_id)) known.set(record.employee_id, record);
  }
  if (owners.size === 0) return list;

  let linked = false;
  const out = list.map((record) => {
    if (record.employee_id != null) return record;
    const name = String(record.employee_name || "").trim().toLowerCase();
    const known = owners.get(name);
    if (!known || known.size !== 1) return record;
    const owner = [...known.values()][0];
    linked = true;
    return {
      ...record,
      employee_id: owner.employee_id,
      // Their real branch, not the "Chennai" the API fills in for a row that
      // belongs to nobody -- this is what puts the day in the right region.
      branch: owner.branch || record.branch,
      email: record.email || owner.email || null,
    };
  });
  // Same array when there was nothing to link, so the memos downstream do not
  // see a new list on every render.
  return linked ? out : list;
};

// Normalized status buckets (handles both "Overtime" and "overTime" spellings)
export const isPresentStatus = (status) =>
  status === "Present" || status === "Overtime" || status === "overTime";

// Extract the "YYYY-MM-DD" portion from a datetime value (matches range-filter logic)
export const getDatePart = (dateTimeValue) => {
  if (!dateTimeValue) return "";
  return String(dateTimeValue).slice(0, 10);
};

// Human-readable "Wed, 25 Jun" label from a date part or datetime value.
// Parsed from the calendar part so it never drifts across timezones.
export const formatDayLabel = (dateTimeValue) => {
  const part = getDatePart(dateTimeValue);
  if (!part) return "—";
  const [year, month, day] = part.split("-").map(Number);
  if (!year || !month || !day) return "—";
  const d = new Date(year, month - 1, day);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const dd = String(day).padStart(2, "0");
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday}, ${dd} ${mon}`;
};

const resolveRegion = (branch) =>
  REGIONS.find((reg) => reg.toLowerCase() === String(branch || "").toLowerCase()) || "Chennai";

export const employeeKey = (record) =>
  record.employee_id != null
    ? `id:${record.employee_id}`
    : `name:${String(record.employee_name || "").toLowerCase()}`;

/**
 * Build attendance statistics for a filtered set of daily records.
 *
 * The Present / On Leave / Absent cards and the Region-Wise summary are a
 * LIVE headcount: each employee is counted exactly once based on their status
 * for a single snapshot day (today when it falls inside the records, otherwise
 * the latest day that has data). This prevents the cumulative-days inflation
 * where a 30-day cycle multiplied every headcount by ~30.
 *
 * Overtime / Total worked hours stay as cycle aggregates (payroll-relevant totals).
 */
export const calculateStats = (records, snapshotDate = null) => {
  const safeRecords = Array.isArray(records) ? records : [];

  // --- Cycle aggregates (summed across every record in range) ---
  const totalOvertime = safeRecords.reduce(
    (sum, r) => sum + parseFloat(calculateOvertime(r.intime, r.outtime)),
    0
  );
  // Total hours actually worked across the cycle. (We intentionally do NOT sum
  // a per-day "remaining/shortfall" here: counting 9.5h short for every Absent,
  // Leave, and missing-punch-out day snowballs into a meaningless five-digit
  // total. Worked hours is the number people actually want to see.)
  // Summed from the real lengths rather than from each day rounded to a tenth
  // of an hour first -- a cycle's worth of those roundings drifts by a good
  // few minutes, and now that this is shown as hours and minutes the drift
  // would be read as a number somebody could check.
  const totalWorked = safeRecords.reduce(
    // A day with no answer adds nothing. It used to be able to SUBTRACT: a
    // clock-out stamped before its clock-in came through as a negative number
    // of hours and came off the cycle's total.
    (sum, r) => sum + (hoursBetween(r.intime, r.outtime) ?? 0),
    0
  );

  // --- Resolve the snapshot day for the live headcount ---
  const datesPresent = safeRecords
    .map((r) => getDatePart(r.intime || r.outtime))
    .filter(Boolean);
  const latestDate = datesPresent.length
    ? datesPresent.reduce((a, b) => (a > b ? a : b))
    : null;
  const snapshotDay =
    snapshotDate && datesPresent.includes(snapshotDate) ? snapshotDate : latestDate;

  // One record per employee for the snapshot day
  const perEmployee = new Map();
  safeRecords.forEach((r) => {
    if (getDatePart(r.intime || r.outtime) !== snapshotDay) return;
    const key = employeeKey(r);
    if (!perEmployee.has(key)) perEmployee.set(key, r);
  });
  const snapshot = [...perEmployee.values()];

  const present = snapshot.filter((r) => isPresentStatus(r.status)).length;
  const leave = snapshot.filter((r) => r.status === "Leave").length;
  const absent = snapshot.filter((r) => r.status === "Absent").length;

  // Region-wise breakdown from the same one-per-employee snapshot
  const regionBreakdown = {};
  REGIONS.forEach((region) => {
    // people: the snapshot rows this bucket counted, in the order they were
    // counted. The region cards open onto them, so the list and the number on
    // the card can never disagree -- they are the same pass.
    regionBreakdown[region] = { present: 0, absent: 0, leave: 0, total: 0, people: [] };
  });
  snapshot.forEach((r) => {
    const region = resolveRegion(r.branch);
    const bucket = regionBreakdown[region];
    bucket.total += 1;
    bucket.people.push(r);
    if (isPresentStatus(r.status)) bucket.present += 1;
    else if (r.status === "Leave") bucket.leave += 1;
    else if (r.status === "Absent") bucket.absent += 1;
  });

  return {
    presentToday: present,
    onLeave: leave,
    absent,
    overtimeHours: totalOvertime.toFixed(1),
    totalWorkedHours: totalWorked.toFixed(1),
    regionBreakdown,
    snapshotDate: snapshotDay,
    headcount: snapshot.length,
  };
};
