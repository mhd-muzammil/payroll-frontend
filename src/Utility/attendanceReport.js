/**
 * The attendance report: one row per employee, one column per date that has a
 * record, and the totals at the end.
 *
 * Export Report writes it into Excel and the Report View draws it on screen.
 * It is built here, once, for both, so the file and the screen can never say
 * different things -- the same rule the export already kept with the page
 * ("a sheet that disagrees with the screen it came from makes somebody stop and
 * work out which of the two is lying").
 *
 * Moved out of Attendance.jsx unchanged: every function and every line of the
 * workbook below is what handleExportExcel did in place.
 */
import {
  employeeKey,
  formatDuration,
  getDatePart,
  getStatusDisplay,
  hoursBetween,
  isPresentStatus,
  isSundayDate,
  statusShown,
} from "./attendanceUtils";

// Status -> export text color (ARGB). Falls back to black for anything unmapped.
// Looked up by the status a day is SHOWN with, so Leave arrives as Sunday
// (grey) or Holiday (amber).
export const STATUS_EXPORT_COLORS = {
  Present: "FF15803D",
  Overtime: "FF2563EB",
  overTime: "FF2563EB",
  Absent: "FFDC2626",
  Leave: "FFD97706",
  Sunday: "FF475569",
  Holiday: "FFD97706",
  Late: "FFD97706",
};

/**
 * "09:18 am" -- the same clock the attendance card shows.
 *
 * Not the 24-hour one. 19:04 is correct and nobody here says it; the office
 * writes 7:04 pm, and a sheet that disagrees with the screen it came from
 * makes somebody stop and work out which of the two is lying.
 */
export const exportClock = (value) => {
  if (!value) return "";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? ""
    : at
        .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
        .toLowerCase();
};

/**
 * A punch, or nothing at all when the row only carries a date.
 *
 * A day somebody did not come in is stored as midnight on that date -- the Add
 * Record form says so in as many words ("an absent day carries the date and
 * nothing else"), and the Excel import writes the same for an absence and for
 * a Sunday. It is not a time anybody arrived, and it must not be printed as
 * one or counted as one.
 *
 * Asked of the date itself, never of the printed clock: midnight reads "00:00"
 * in one format and "12:00 AM" in another, and a test written against the
 * printing would quietly stop matching the day the format changed -- putting
 * "In 12:00 AM" against every absence in the sheet.
 */
export const punchAt = (value) => {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.getHours() === 0 && at.getMinutes() === 0 ? null : value;
};

/**
 * What one day says in the export grid.
 *
 *     Present
 *     in 09:18 am
 *     out 06:28 pm
 *
 * The word on its own was the complaint -- it says somebody was there and
 * nothing about when. A line each, labelled, because "09:18 am - 06:28 pm"
 * runs the two together in a column that is scrolled past thirty times, and
 * because a day with only an arrival then looks like every other day instead
 * of needing a shape of its own. The colours still do the first pass.
 *
 * A Leave day reads "Sunday" or "Holiday", by the column's date.
 */
export const exportCellText = (entry, datePart) => {
  if (!entry) return "-";
  const lines = [getStatusDisplay(statusShown(entry.status, datePart)) || "-"];
  const inAt = exportClock(entry.intime);
  const outAt = exportClock(entry.outtime);
  if (inAt) lines.push(`in ${inAt}`);
  // The star is on the departure because that is the one nobody pressed.
  if (outAt) lines.push(`out ${outAt}${entry.autoClosed ? " *" : ""}`);
  return lines.join("\n");
};

// The count at the end of the row. Thirty-one columns of Present and
// Absent, and the question the sheet exists to answer -- how many days
// did this person work -- was left to somebody counting across the screen
// with a finger.
//
// Leave is Sunday + Holiday, so both come first and Leave is their sum: the
// office reads "Sunday 2 + Holiday 2 = Leave 4" along the row.
export const REPORT_TOTAL_HEADERS = [
  "Total Present",
  "Total Sunday",
  "Total Holiday",
  "Total Leave",
  "Total Absent",
  "Present + Leave",
  "Total Hours",
];

export const AUTO_CLOSED_NOTE =
  "* Logout nobody pressed - the day was closed automatically at 11.59 pm.";

/**
 * The cycle/range as a grid: one row per employee, one column per date that
 * has a record (not every calendar day -- sparse work days, matching how the
 * branches' own attendance sheets read).
 *
 * Returns { dates: ["2026-10-03", ...], dateLabels: ["03-10-2026", ...],
 * rows: [{ sno, name, branch, days, present, sunday, holiday, leave, absent,
 * presentPlusLeave, hours, hoursText }], anyAutoClosed }.
 */
export function buildAttendanceReport(records) {
  const list = Array.isArray(records) ? records : [];

  const dateSet = new Set();
  list.forEach((record) => {
    const datePart = getDatePart(record.intime || record.outtime);
    if (datePart) dateSet.add(datePart);
  });
  const sortedDates = [...dateSet].sort();

  const employeesMap = new Map();
  list.forEach((record) => {
    const key = employeeKey(record);
    if (!employeesMap.has(key)) {
      employeesMap.set(key, {
        name: record.employee_name || "",
        branch: record.branch || "Chennai",
        days: {},
        hours: 0,
      });
    }
    // Per record, which is how the attendance page adds it up. Not off the
    // merged day the grid draws: a day the office marked AND the engineer
    // punched is two records, and merging them first would stretch the day
    // from the office's placeholder to the engineer's real Logout -- the
    // file would then disagree with the screen it came from.
    employeesMap.get(key).hours += hoursBetween(record.intime, record.outtime) ?? 0;
    const datePart = getDatePart(record.intime || record.outtime);
    if (!datePart) return;
    // The date came off the raw value; from here only real punches count,
    // so a date marker can neither be printed as a time nor win the
    // comparisons below for being the earliest thing on the day.
    const days = employeesMap.get(key).days;
    const intime = punchAt(record.intime);
    const outtime = punchAt(record.outtime);
    const existing = days[datePart];
    if (!existing) {
      days[datePart] = {
        status: record.status,
        intime,
        outtime,
        autoClosed: Boolean(record.auto_closed_out) && Boolean(outtime),
      };
      return;
    }
    // TWO ROWS FOR ONE DAY -- the office marks somebody who then punches,
    // or a day is corrected rather than edited. Read as one day: the
    // earliest arrival, the latest departure, and a status that says they
    // were here if either row does.
    if (intime && (!existing.intime || intime < existing.intime)) existing.intime = intime;
    if (outtime && (!existing.outtime || outtime > existing.outtime)) {
      existing.outtime = outtime;
      existing.autoClosed = Boolean(record.auto_closed_out);
    }
    if (record.status && (!existing.status || isPresentStatus(record.status))) {
      existing.status = record.status;
    }
  });

  const employeesList = [...employeesMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const rows = employeesList.map((emp, idx) => {
    // Counted the way the page's own cards count, so the sheet and the
    // screen cannot disagree: present is Present or Overtime, leave is
    // Leave, absent is Absent. A Late day is in none of the three, exactly
    // as on the page -- and under-counting is the safe direction for a
    // figure the office pays from.
    const marked = sortedDates.map((datePart) => emp.days[datePart]).filter(Boolean);
    const present = marked.filter((entry) => isPresentStatus(entry.status)).length;
    const leave = marked.filter((entry) => entry.status === "Leave").length;
    // Leave is Sunday + Holiday; the column's date says which.
    const sunday = sortedDates.filter(
      (datePart) => emp.days[datePart]?.status === "Leave" && isSundayDate(datePart),
    ).length;
    const absent = marked.filter((entry) => entry.status === "Absent").length;
    return {
      sno: idx + 1,
      name: emp.name,
      branch: emp.branch,
      days: emp.days,
      present,
      sunday,
      holiday: leave - sunday,
      leave,
      absent,
      presentPlusLeave: present + leave,
      hours: emp.hours,
      // Words rather than a number, the same "243h 30m" the page shows.
      hoursText: formatDuration(emp.hours),
    };
  });

  return {
    dates: sortedDates,
    dateLabels: sortedDates.map((datePart) => {
      const [year, month, day] = datePart.split("-");
      return `${day}-${month}-${year}`;
    }),
    rows,
    anyAutoClosed: rows.some((row) => sortedDates.some((datePart) => row.days[datePart]?.autoClosed)),
  };
}

/**
 * The report as an Excel workbook -- the sheet Export Report has always made.
 * `ExcelJS` is passed in because the page loads it only when it is needed.
 */
export function buildAttendanceWorkbook(ExcelJS, report) {
  const { dates: sortedDates, dateLabels: dateHeaderLabels, rows } = report;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance Report");

  // WHO AND WHEN STAY ON SCREEN.
  //
  // A cycle is thirty-odd columns wide. Scroll to the end of the month and
  // the names have gone off the left, so every cell in view belongs to
  // nobody; scroll down past twenty-five people and the dates have gone off
  // the top. Freezing the header row and the first three columns means the
  // only thing that moves is the part being read.
  sheet.views = [
    { state: "frozen", xSplit: 3, ySplit: 1, topLeftCell: "D2", activeCell: "D2" },
  ];

  const TOTAL_HEADERS = REPORT_TOTAL_HEADERS;
  const firstTotalColumn = 4 + sortedDates.length;

  sheet.addRow(["S.no", "Name", "Location", ...dateHeaderLabels, ...TOTAL_HEADERS]);
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const isDate = colNumber > 3 && colNumber < firstTotalColumn;
    cell.font = { bold: true, color: { argb: isDate ? "FFB45309" : "FF1D4ED8" } };
    // NOT WRAPPED, and the row given a height of its own.
    //
    // Wrapping was put here for "Present + Leave" and it blanked the dates
    // instead: a file that does not state a row height leaves Excel with
    // the default single line, and wrapped text laid out over two lines
    // inside one line's worth of space is simply not drawn. The cells had
    // their dates the whole time -- nobody could see them. The headers are
    // all short enough for one line, so the column is widened for the long
    // ones rather than the text folded.
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  sheet.getRow(1).height = 22;

  let anyAutoClosed = false;
  rows.forEach((emp) => {
    const row = sheet.addRow([
      emp.sno,
      emp.name,
      emp.branch,
      ...sortedDates.map((datePart) => exportCellText(emp.days[datePart], datePart)),
      // Numbers, not text, so a column of them can be summed.
      emp.present,
      emp.sunday,
      emp.holiday,
      emp.leave,
      emp.absent,
      emp.presentPlusLeave,
      // Words rather than a number, the same "243h 30m" the page shows.
      // A decimal would sum in Excel and is the form the office said it
      // could not read.
      emp.hoursText,
    ]);

    [
      STATUS_EXPORT_COLORS.Present,
      STATUS_EXPORT_COLORS.Sunday,
      STATUS_EXPORT_COLORS.Holiday,
      STATUS_EXPORT_COLORS.Leave,
      STATUS_EXPORT_COLORS.Absent,
      "FF1F2937",
      "FF1D4ED8",
    ].forEach((argb, i) => {
      const cell = row.getCell(firstTotalColumn + i);
      cell.font = { bold: true, color: { argb } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    row.getCell(1).alignment = { horizontal: "center" };

    sortedDates.forEach((datePart, i) => {
      const cell = row.getCell(4 + i);
      const entry = emp.days[datePart];
      if (entry?.autoClosed) anyAutoClosed = true;
      // Wrapped, or the second line of the cell is simply not shown.
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (entry?.status) {
        cell.font = {
          color: { argb: STATUS_EXPORT_COLORS[statusShown(entry.status, datePart)] || "FF000000" },
        };
      }
    });
  });

  // A LOGOUT NOBODY PRESSED, SAID OUT LOUD.
  //
  // The 11.59pm rule closes the day for somebody who forgot, and that time
  // is the register having an answer, not the hour they went home. Printed
  // like a real one it would be read as one.
  if (anyAutoClosed) {
    sheet.addRow([]);
    const note = sheet.addRow([AUTO_CLOSED_NOTE]);
    note.getCell(1).font = { color: { argb: "FF808080" }, size: 10 };
  }

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 14;
  sortedDates.forEach((_, i) => {
    sheet.getColumn(4 + i).width = 14;
  });
  TOTAL_HEADERS.forEach((header, i) => {
    // Wide enough for the longest of them on one line -- "Present + Leave"
    // is fifteen characters, and a header that has to fold is a header
    // that can go missing.
    sheet.getColumn(firstTotalColumn + i).width = Math.max(13, header.length + 3);
  });

  return workbook;
}
