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

export const formatTime = (isoString) => {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const calculateHours = (intime, outtime) => {
  if (!intime || !outtime) return "0.0";

  const start = new Date(intime);
  const end = new Date(outtime);
  let diffInMs = end - start;

  if (diffInMs < 0) {
    diffInMs += 24 * MS_PER_HOUR;
  }

  return (diffInMs / MS_PER_HOUR).toFixed(1);
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

const employeeKey = (record) =>
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
  const totalWorked = safeRecords.reduce(
    (sum, r) => sum + parseFloat(calculateHours(r.intime, r.outtime)),
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
    regionBreakdown[region] = { present: 0, absent: 0, leave: 0, total: 0 };
  });
  snapshot.forEach((r) => {
    const region = resolveRegion(r.branch);
    const bucket = regionBreakdown[region];
    bucket.total += 1;
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
