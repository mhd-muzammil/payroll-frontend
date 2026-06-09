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

export const calculateStats = (records) => {
  const safeRecords = Array.isArray(records) ? records : [];
  const present = safeRecords.filter(
    (r) => r.status === "Present" || r.status === "overTime"
  ).length;
  const leave = safeRecords.filter((r) => r.status === "Leave").length;
  const absent = safeRecords.filter((r) => r.status === "Absent").length;

  const totalOvertime = safeRecords.reduce((sum, r) => {
    const overtime = calculateOvertime(r.intime, r.outtime);
    return sum + parseFloat(overtime);
  }, 0);

  const totalWorkedHours = safeRecords.reduce((sum, r) => {
    return sum + parseFloat(calculateHours(r.intime, r.outtime));
  }, 0);

  const remainingWorkingHours = Math.max(
    0,
    WORKING_HOURS_PER_DAY - totalWorkedHours
  );

  return {
    presentToday: present,
    onLeave: leave,
    absent,
    overtimeHours: totalOvertime.toFixed(1),
    remainingWorkingHours: remainingWorkingHours.toFixed(1),
  };
};
