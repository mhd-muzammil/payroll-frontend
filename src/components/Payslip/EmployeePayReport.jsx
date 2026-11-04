import { useMemo, useRef, useState } from "react";
import { Eye, FileSpreadsheet, Loader2, Lock, Search } from "lucide-react";
import { api } from "@/api/Api";

/**
 * Every payslip generated, as one sheet the office can read across and correct.
 *
 * Laid out the way payroll is checked on paper: a row per slip, a column per
 * figure, the names held on the left and the headings held at the top while
 * the month scrolls, and the totals underneath. Every field on a payslip is a
 * column -- the office asked for all of them, not a summary.
 *
 * The yellow cells are the ones that can be changed, and they are exactly the
 * inputs the payroll engine takes: the day counts, and the amounts that move
 * from month to month (incentive, other earnings, EPF, staff advance, TDS,
 * insurance, other deduction). A change goes to the server, which re-runs the
 * whole slip, and the row comes back with every derived figure -- earned
 * amounts, deductions, net -- recomputed. Nothing derived is typed by hand, so
 * nothing on the sheet can disagree with the payslip the employee opens.
 *
 * A Paid slip is locked, as it is everywhere else: the server refuses it too.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What each editable cell sends. Day edits carry the counts they depend on, the
 * way the payslip dialog always has; an amount is sent on its own, because the
 * server reads the days off the slip and keeps every amount already set.
 */
const EDITS = {
  total_days: (v, s) => ({ total_days: v, lop_days: s.lop_days }),
  paid_days: (v, s) => ({ total_days: s.total_days, paid_days: v }),
  lop_days: (v, s) => ({ total_days: s.total_days, lop_days: v }),
  special_work_days: (v, s) => ({ total_days: s.total_days, lop_days: s.lop_days, special_work_days: v }),
  earned_incentive: (v) => ({ incentive: v }),
  earned_other_earnings: (v) => ({ other_earnings: v }),
  deduction_epf: (v) => ({ epf: v }),
  deduction_staff_advance: (v) => ({ staff_advance: v }),
  deduction_tds: (v) => ({ tds: v }),
  deduction_insurance: (v) => ({ insurance: v }),
  deduction_other: (v) => ({ other_deduction: v }),
};

/** Day counts are bounded by the cycle; amounts only by zero. */
const DAY_FIELDS = new Set(["total_days", "paid_days", "lop_days", "special_work_days"]);

const money = (key, label) => ({ key, label, kind: "money" });
const days = (key, label) => ({ key, label, kind: "days" });

/** The sheet's columns, in the groups a payslip is read in. */
const GROUPS = [
  {
    label: "Days",
    tone: "days",
    columns: [
      days("total_days", "Total"),
      days("paid_days", "Paid"),
      days("lop_days", "LOP"),
      days("off_days", "Off"),
      days("casual_leave_used", "CL Used"),
      money("casual_leave_pay", "CL Pay"),
      days("special_work_days", "Special Work"),
      money("special_work_pay", "Special Pay"),
    ],
  },
  {
    label: "Gross (salary structure)",
    tone: "gross",
    columns: [
      money("gross_basic", "Basic"),
      money("gross_hra", "HRA"),
      money("gross_conveyance", "Conveyance"),
      money("gross_child_edu", "Child Edu"),
      money("gross_personal_allowance", "Personal"),
      money("gross_incentive", "Incentive"),
      money("gross_other_earnings", "Other"),
      money("gross_salary", "Gross Salary"),
    ],
  },
  {
    label: "Earned this month",
    tone: "earned",
    columns: [
      money("earned_basic", "Basic"),
      money("earned_hra", "HRA"),
      money("earned_conveyance", "Conveyance"),
      money("earned_child_edu", "Child Edu"),
      money("earned_personal_allowance", "Personal"),
      money("earned_incentive", "Incentive"),
      money("earned_other_earnings", "Other"),
      money("gross_earnings", "Gross Earnings"),
    ],
  },
  {
    label: "Deductions",
    tone: "deductions",
    columns: [
      money("deduction_epf", "EPF"),
      money("deduction_esi", "ESI"),
      money("deduction_prof_tax", "Prof. Tax"),
      money("deduction_lwf", "LWF"),
      money("deduction_staff_advance", "Staff Adv."),
      money("deduction_tds", "TDS"),
      money("deduction_other", "Other"),
      money("deduction_insurance", "Insurance"),
      money("gross_deductions", "Total"),
    ],
  },
  {
    label: "Employer",
    tone: "employer",
    columns: [
      money("employer_epf", "EPF"),
      money("employer_esi", "ESI"),
      money("employer_insurance", "Insurance"),
      money("petrol_allowance", "Petrol"),
    ],
  },
];

const NET = money("net_salary", "Net Salary");
const ALL_NUMERIC = [...GROUPS.flatMap((g) => g.columns), NET];

const toNumber = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * What was typed, as a number -- or NaN when it is not one.
 *
 * Accepts it the way the sheet shows it: "1,500" and "₹1,500.50" are both
 * 1500.5. A number input silently empties itself on a comma, and an empty box
 * used to be read as "never mind" -- so typing an amount the way it is written
 * on the slip did nothing at all, without a word.
 */
const parseTyped = (text) => {
  const cleaned = String(text).replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$|^-?\d+\.?$/.test(cleaned)) return Number.NaN;
  return Number.parseFloat(cleaned);
};

/** Two places, the way the server stores a day count -- so what is sent is what is kept. */
const twoPlaces = (n) => Math.round(n * 100) / 100;

const formatMoney = (value) =>
  toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDays = (value) => {
  const n = toNumber(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

const formatCell = (column, value) =>
  column.kind === "money" ? formatMoney(value) : formatDays(value);

const periodOf = (slip) => `${MONTHS[(slip.month || 1) - 1]} ${slip.year}`;

const STATUS_STYLE = {
  Paid: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  Generated: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
};

const GROUP_STYLE = {
  days: "bg-slate-100 dark:bg-slate-900",
  gross: "bg-indigo-50 dark:bg-indigo-950/50",
  earned: "bg-emerald-50 dark:bg-emerald-950/40",
  deductions: "bg-rose-50 dark:bg-rose-950/40",
  employer: "bg-amber-50 dark:bg-amber-950/40",
};

// The three columns that stay put while the sheet scrolls sideways. Widths are
// fixed so the second and third can be pinned at a known offset.
const FROZEN = [
  { key: "sno", label: "S.no", width: 52 },
  { key: "code", label: "Code", width: 76 },
  { key: "name", label: "Employee", width: 200 },
];
const frozenLeft = (index) => FROZEN.slice(0, index).reduce((sum, c) => sum + c.width, 0);

/*
 * THE SHEET AS AN EXCEL FILE.
 *
 * Exactly the table on screen -- the rows the month, region and search leave,
 * in the same order, with the same columns and totals -- coloured the way the
 * screen colours it. Excel has no dark mode, so these are the light sheet's
 * colours, as ARGB: the theme's neutrals (index.css) and the Tailwind tints
 * the table is drawn in, each as the browser paints it over white.
 */
const XL = {
  text: "FF0A0A0A", // text-foreground
  mutedText: "FF737373", // text-muted-foreground
  muted: "FFF5F5F5", // bg-muted: the plain headings and the totals row
  border: "FFE5E5E5", // border-border
  input: "FFFEFCE8", // bg-yellow-50: a cell that can be changed
  locked: "FFFBFBFB", // bg-muted/40: the same cell on a Paid slip
  pencil: "FFD08700", // text-yellow-600: the ✎ over a column that can be changed
  net: "FFF3F3F3", // bg-primary/5
  netHead: "FFE7E7E7", // bg-primary/10
  netTotal: "FFDCDCDC", // bg-primary/15
  relieved: "FFC70036", // text-rose-700
};
const XL_GROUP = {
  days: "FFF1F5F9", // slate-100
  gross: "FFEEF2FF", // indigo-50
  earned: "FFECFDF5", // emerald-50
  deductions: "FFFFF1F2", // rose-50
  employer: "FFFFFBEB", // amber-50
};
// The status pill's two colours: the cell takes its tint, the word its ink.
const XL_STATUS = {
  Paid: { fill: "FFDFF2FE", text: "FF00598A" }, // sky-100 / sky-800
  Generated: { fill: "FFD0FAE5", text: "FF006045" }, // emerald-100 / emerald-800
  Pending: { fill: "FFFEF3C6", text: "FF973C00" }, // amber-100 / amber-800
};

/**
 * Amounts in lakhs and crores, as the sheet shows them: 4,94,838.06. Excel
 * groups in threes on its own, so the commas are placed by the size of the
 * number. A format holds only two conditions, so a negative amount gets a
 * format of its own, written the way the screen writes it: ₹-500.00.
 */
const xlDigits = (abs) =>
  abs >= 10000000 ? "##\\,##\\,##\\,##0.00" : abs >= 100000 ? "##\\,##\\,##0.00" : "#,##0.00";
const xlMoney = (n, rupee = false) => {
  const r = rupee ? '"₹"' : "";
  if (n < 0) return `${r}#,##0.00;${rupee ? '"₹-"' : '"-"'}${xlDigits(-n)}`;
  return `[>=10000000]${r}${xlDigits(1e7)};[>=100000]${r}${xlDigits(1e5)};${r}${xlDigits(0)}`;
};

const statusWords = (slip) => ({
  status: String(slip.status ?? ""),
  sent: slip.sent_at ? " · Sent" : " · Not sent",
  relieved: slip.employee_details?.status === "relieved" ? "  Relieved" : "",
});

/** The workbook for `rows` and their `totals`. `ExcelJS` is loaded by the caller, only when asked for. */
function buildPayReportWorkbook(ExcelJS, rows, totals) {
  const numeric = GROUPS.flatMap((g) => g.columns.map((c) => ({ ...c, tone: g.tone })));
  const lead = [...FROZEN.map((c) => c.label), "Branch", "Month", "Status"];
  const first = lead.length + 1; // the first figure's column
  const netCol = first + numeric.length;
  const totalRow = 3 + rows.length;

  const workbook = new ExcelJS.Workbook();
  // The headings and the three who-columns stay put, as on screen.
  const sheet = workbook.addWorksheet("Employee Pay Report", {
    views: [{ state: "frozen", xSplit: FROZEN.length, ySplit: 2, topLeftCell: "D3" }],
  });
  const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const ink = (argb, bold = false) => ({ bold, color: { argb } });

  // Headings: the lead heads and Net span both heading rows; each group's
  // name spans its columns, with the column names under it in its tint.
  lead.forEach((label, i) => {
    sheet.mergeCells(1, i + 1, 2, i + 1);
    const cell = sheet.getCell(1, i + 1);
    cell.value = label.toUpperCase();
    cell.font = ink(XL.mutedText, true);
    cell.fill = solid(XL.muted);
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });
  let col = first;
  GROUPS.forEach((g) => {
    const end = col + g.columns.length - 1;
    sheet.mergeCells(1, col, 1, end);
    const top = sheet.getCell(1, col);
    top.value = g.label.toUpperCase();
    top.font = ink(XL.text, true);
    top.fill = solid(XL_GROUP[g.tone]);
    top.alignment = { horizontal: "center", vertical: "middle" };
    g.columns.forEach((c, j) => {
      const cell = sheet.getCell(2, col + j);
      cell.value = EDITS[c.key]
        ? { richText: [{ text: c.label, font: ink(XL.mutedText, true) }, { text: " ✎", font: ink(XL.pencil) }] }
        : c.label;
      cell.font = ink(XL.mutedText, true);
      cell.fill = solid(XL_GROUP[g.tone]);
      cell.alignment = { horizontal: "right", vertical: "middle" };
    });
    col = end + 1;
  });
  sheet.mergeCells(1, netCol, 2, netCol);
  const netHead = sheet.getCell(1, netCol);
  netHead.value = NET.label.toUpperCase();
  netHead.font = ink(XL.text, true);
  netHead.fill = solid(XL.netHead);
  netHead.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 20;

  // A row per slip.
  rows.forEach((slip, index) => {
    const row = sheet.getRow(3 + index);
    const emp = slip.employee_details || {};
    const code = String(emp.emp_code ?? "").trim();
    row.getCell(1).value = index + 1;
    row.getCell(1).font = ink(XL.mutedText);
    row.getCell(1).alignment = { horizontal: "center" };
    // A plain number goes in as one, or Excel flags every code "number stored
    // as text" -- up to 11 digits: from 12, Excel shows a number as 1.2E+11.
    row.getCell(2).value = /^[1-9]\d{0,10}$/.test(code) ? Number(code) : code || "—";
    row.getCell(2).font = ink(XL.mutedText);
    row.getCell(2).alignment = { horizontal: "left" };
    row.getCell(3).value = emp.employee_name || "—";
    row.getCell(4).value = emp.branch || "Not Assigned";
    row.getCell(5).value = periodOf(slip);

    const words = statusWords(slip);
    const pill = XL_STATUS[slip.status] || XL_STATUS.Pending;
    const status = row.getCell(6);
    status.value = {
      richText: [
        { text: words.status, font: ink(pill.text, true) },
        { text: words.sent, font: ink(XL.mutedText) },
        ...(words.relieved ? [{ text: words.relieved, font: ink(XL.relieved, true) }] : []),
      ],
    };
    status.fill = solid(pill.fill);

    numeric.forEach((c, j) => {
      const cell = row.getCell(first + j);
      const n = toNumber(slip[c.key]);
      cell.value = n;
      if (c.kind === "money") cell.numFmt = xlMoney(n);
      cell.alignment = { horizontal: "right" };
      if (EDITS[c.key] && slip.status === "Paid") {
        cell.fill = solid(XL.locked);
        cell.font = ink(XL.mutedText);
      } else if (EDITS[c.key]) {
        cell.fill = solid(XL.input);
      }
    });

    const net = row.getCell(netCol);
    const n = toNumber(slip.net_salary);
    net.value = n;
    net.numFmt = xlMoney(n, true);
    net.font = ink(XL.text, true);
    net.fill = solid(XL.net);
    net.alignment = { horizontal: "right" };
  });

  // The totals: a SUM over the rows above, with the screen's figure already
  // in it -- so the file shows it on opening, and still adds up after an edit.
  const total = sheet.getRow(totalRow);
  for (let c = 1; c <= netCol; c += 1) {
    total.getCell(c).fill = solid(XL.muted);
    total.getCell(c).font = ink(XL.text, true);
  }
  total.getCell(3).value = `Total · ${rows.length}`;
  sheet.mergeCells(totalRow, 4, totalRow, 6);
  const sum = (c, result) => {
    const letter = sheet.getColumn(c).letter;
    return { formula: `SUM(${letter}3:${letter}${totalRow - 1})`, result };
  };
  numeric.forEach((c, j) => {
    const cell = total.getCell(first + j);
    cell.value = sum(first + j, totals[c.key]);
    if (c.kind === "money") cell.numFmt = xlMoney(totals[c.key]);
    cell.alignment = { horizontal: "right" };
  });
  const netTotal = total.getCell(netCol);
  netTotal.value = sum(netCol, totals.net_salary);
  netTotal.numFmt = xlMoney(totals.net_salary, true);
  netTotal.fill = solid(XL.netTotal);
  netTotal.alignment = { horizontal: "right" };

  // The grid, as on screen, with the heavier line over the totals.
  const thin = { style: "thin", color: { argb: XL.border } };
  for (let r = 1; r <= totalRow; r += 1) {
    for (let c = 1; c <= netCol; c += 1) {
      sheet.getCell(r, c).border = {
        top: r === totalRow ? { style: "medium", color: { argb: XL.border } } : thin,
        left: thin,
        bottom: thin,
        right: thin,
      };
    }
  }

  // Wide enough for the longest thing in each column -- a number that does
  // not fit shows as ##### in Excel. Headings are capitals, and wider.
  const fit = (heading, texts, capitals = true) =>
    Math.min(
      40,
      Math.max(Math.ceil(heading.length * (capitals ? 1.3 : 1.1)), ...texts.map((t) => String(t).length)) + 3,
    );
  const leadTexts = [
    rows.map((_, i) => i + 1),
    rows.map((s) => s.employee_details?.emp_code || "—"),
    [...rows.map((s) => s.employee_details?.employee_name || "—"), `Total · ${rows.length}`],
    rows.map((s) => s.employee_details?.branch || "Not Assigned"),
    rows.map(periodOf),
    rows.map((s) => Object.values(statusWords(s)).join("")),
  ];
  lead.forEach((label, i) => {
    sheet.getColumn(i + 1).width = fit(label, leadTexts[i]);
  });
  numeric.forEach((c, j) => {
    const texts = [...rows.map((s) => formatCell(c, s[c.key])), formatCell(c, totals[c.key])];
    sheet.getColumn(first + j).width = fit(c.label + (EDITS[c.key] ? " ✎" : ""), texts, false);
  });
  sheet.getColumn(netCol).width = fit(NET.label, [
    ...rows.map((s) => `₹${formatMoney(s.net_salary)}`),
    `₹${formatMoney(totals.net_salary)}`,
  ]);

  return workbook;
}

/**
 * `slips` arrive already narrowed to the chosen month. The month itself is held
 * by the page, not here, because the region cards above the sheet have to count
 * the same month the sheet shows -- see Payslip.jsx.
 */
const EmployeePayReport = ({
  slips,
  loading,
  selectedRegion,
  periods,
  period,
  onPeriodChange,
  onOpenSlip,
  onSlipUpdated,
}) => {
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState(null); // { id, key }
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Whether anything was typed in the open cell (see commitEdit).
  const typedIn = useRef(false);
  // Slips already sent to their employee, where the office has said yes to
  // changing what that employee can already see. Asked once per slip.
  const confirmedSent = useRef(new Set());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (slips || [])
      .filter((s) => {
        if (!selectedRegion) return true;
        const branch = (s.employee_details?.branch || "Not Assigned").trim().toLowerCase();
        return branch === selectedRegion.toLowerCase();
      })
      .filter((s) => {
        if (!q) return true;
        const name = (s.employee_details?.employee_name || "").toLowerCase();
        const code = String(s.employee_details?.emp_code || "").toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .sort(
        (a, b) =>
          b.year - a.year ||
          b.month - a.month ||
          String(a.employee_details?.employee_name || "").localeCompare(
            String(b.employee_details?.employee_name || ""),
          ),
      );
  }, [slips, selectedRegion, query]);

  // Summed from the rows on screen, never from a server summary: the totals
  // have to be the sum of exactly what the sheet shows.
  const totals = useMemo(() => {
    const sums = {};
    ALL_NUMERIC.forEach((c) => {
      sums[c.key] = rows.reduce((acc, s) => acc + toNumber(s[c.key]), 0);
    });
    return sums;
  }, [rows]);

  // The table as an Excel file: exactly the rows on screen, in its colours.
  // Not while a changed cell is saving: the rows would still hold the figures
  // from before it, and the file would disagree with the payslip.
  const downloadExcel = async () => {
    if (exporting || savingId !== null || rows.length === 0) return;
    setExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const buffer = await buildPayReportWorkbook(ExcelJS, rows, totals).xlsx.writeBuffer();
      const month = periods.find((p) => p.key === period)?.label || "All months";
      const name = ["Employee Pay Report", month, selectedRegion]
        .filter(Boolean)
        .join(" ")
        .replace(/[^\w-]+/g, "_");
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel download failed", err);
      alert("Could not make the Excel file. Reload the page and try again.");
    } finally {
      setExporting(false);
    }
  };

  const startEdit = (slip, key) => {
    if (!EDITS[key] || slip.status === "Paid" || savingId) return;
    if (slip.sent_at && !confirmedSent.current.has(slip.id)) {
      const name = slip.employee_details?.employee_name || "this employee";
      if (
        !window.confirm(
          `This payslip was already sent to ${name}. They will see the change straight away.\n\nChange it anyway?`,
        )
      ) {
        return;
      }
      confirmedSent.current.add(slip.id);
    }
    typedIn.current = false;
    setEditing({ id: slip.id, key });
    setDraft(String(toNumber(slip[key])));
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const commitEdit = async (slip) => {
    if (!editing) return;
    const { key } = editing;
    const before = toNumber(slip[key]);

    // Nothing typed is "leave it as it was".
    if (draft.trim() === "") {
      cancelEdit();
      return;
    }
    let value = parseTyped(draft);
    if (!Number.isFinite(value)) {
      alert(`"${draft}" is not a number. Type it as digits, for example 1500 or 1,500.50.`);
      return;
    }
    if (value < 0) {
      alert("It cannot be negative.");
      return;
    }
    if (DAY_FIELDS.has(key)) {
      if (key === "total_days") {
        // A cycle is a whole number of days; the server refuses anything else.
        if (!Number.isInteger(value) || value <= 0) {
          alert("Total days has to be a whole number, more than 0.");
          return;
        }
      } else {
        value = twoPlaces(value);
        const cycle = toNumber(slip.total_days);
        if (value > cycle) {
          alert(`That is more days than the ${cycle}-day cycle.`);
          return;
        }
      }
    } else {
      value = twoPlaces(value);
    }
    // EPF typed in -- even the figure already showing -- is set for the
    // month. Until it is, the structure's EPF follows the days, so skipping
    // it as "unchanged" would leave the next LOP edit to cut it.
    const setsEpf = key === "deduction_epf" && typedIn.current && !slip.manual_overrides?.epf;
    if (value === before && !setsEpf) {
      cancelEdit();
      return;
    }

    setSavingId(slip.id);
    setEditing(null);
    try {
      const { data } = await api.post(`/api/payslips/${slip.id}/recalculate/`, EDITS[key](value, slip));
      onSlipUpdated(data);
      setFlashId(slip.id);
      setTimeout(() => setFlashId((current) => (current === slip.id ? null : current)), 1600);
    } catch (err) {
      const detail = err?.response?.data;
      alert(
        detail?.error ||
          detail?.detail ||
          "Could not save that change. Nothing on the payslip was altered — try again.",
      );
    } finally {
      setSavingId(null);
      setDraft("");
    }
  };

  const renderValue = (slip, column) => {
    const isEditing = editing?.id === slip.id && editing?.key === column.key;
    const editable = Boolean(EDITS[column.key]);
    const locked = editable && slip.status === "Paid";

    if (isEditing) {
      return (
        <input
          autoFocus
          // Text, not number: a number input empties itself on "1,500", and
          // the sheet shows every amount with commas.
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            typedIn.current = true;
            setDraft(e.target.value);
          }}
          onBlur={() => commitEdit(slip)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") cancelEdit();
          }}
          className="w-full rounded-sm border-2 border-primary bg-background px-1.5 py-0.5 text-right text-[13px] tabular-nums outline-none"
          aria-label={`New ${column.label}`}
        />
      );
    }

    return (
      <span className="inline-flex w-full items-center justify-end gap-1">
        {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
        {formatCell(column, slip[column.key])}
      </span>
    );
  };

  const cellClass = (slip, column) => {
    const editable = Boolean(EDITS[column.key]);
    const locked = editable && slip.status === "Paid";
    const base = "border-b border-r border-border/60 px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
    if (editable && !locked) {
      // The Excel convention for an input cell: tinted, and the cursor says so.
      return `${base} cursor-cell bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/30 dark:hover:bg-yellow-900/40`;
    }
    if (locked) return `${base} bg-muted/40 text-muted-foreground`;
    return base;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-border/60 bg-card p-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading every generated payslip…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* The controls: which month, and whom. */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-xs">
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium"
          aria-label="Month"
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
          <option value="all">All months</option>
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or employee code…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length}</span> payslip{rows.length === 1 ? "" : "s"} ·
          net <span className="font-semibold text-foreground">₹{formatMoney(totals.net_salary)}</span>
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          disabled={exporting || savingId !== null || rows.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title="Download this table as an Excel file, in the same colours"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          {exporting ? "Preparing…" : "Download Excel"}
        </button>
        <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-sm border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/40" />
          Yellow cells can be changed — click, type, press Enter. Totals and net are worked out again on the payslip.
          <Lock className="ml-2 h-3 w-3" /> Paid payslips are locked.
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
          No payslips for this selection. Generate them on the Generate Payslips tab and they appear here.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-border bg-card shadow-xs">
          <table className="border-separate border-spacing-0 text-[13px]">
            <thead>
              {/* The group row: what each block of columns is. */}
              <tr>
                {FROZEN.map((c, i) => (
                  <th
                    key={c.key}
                    rowSpan={2}
                    style={{ left: frozenLeft(i), minWidth: c.width, width: c.width }}
                    className="sticky top-0 z-30 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {c.label}
                  </th>
                ))}
                <th rowSpan={2} className="sticky top-0 z-20 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Branch</th>
                <th rowSpan={2} className="sticky top-0 z-20 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Month</th>
                <th rowSpan={2} className="sticky top-0 z-20 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                {GROUPS.map((g) => (
                  <th
                    key={g.label}
                    colSpan={g.columns.length}
                    className={`sticky top-0 z-20 h-8 border-b border-r border-border px-2 text-center text-xs font-semibold uppercase tracking-wide text-foreground ${GROUP_STYLE[g.tone]}`}
                  >
                    {g.label}
                  </th>
                ))}
                <th rowSpan={2} className="sticky top-0 z-20 border-b border-r border-border bg-primary/10 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-foreground">{NET.label}</th>
                <th rowSpan={2} className="sticky top-0 z-20 border-b border-border bg-muted px-2 py-2" aria-label="Open" />
              </tr>
              {/* The column row, held just under the groups. */}
              <tr>
                {GROUPS.flatMap((g) =>
                  g.columns.map((c) => (
                    <th
                      key={c.key}
                      className={`sticky top-8 z-20 border-b border-r border-border px-2 py-1.5 text-right text-[11px] font-semibold text-muted-foreground whitespace-nowrap ${GROUP_STYLE[g.tone]}`}
                    >
                      {c.label}
                      {EDITS[c.key] && <span className="ml-1 text-yellow-600 dark:text-yellow-400" title="Can be changed">✎</span>}
                    </th>
                  )),
                )}
              </tr>
            </thead>

            <tbody>
              {rows.map((slip, index) => {
                const saving = savingId === slip.id;
                const flash = flashId === slip.id;
                const rowTone = flash ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-card";
                return (
                  <tr key={slip.id} className={`${saving ? "opacity-60" : ""} transition-colors`}>
                    {/* The frozen three: who this row is. */}
                    <td style={{ left: frozenLeft(0), minWidth: FROZEN[0].width }} className={`sticky z-10 border-b border-r border-border/60 px-2 py-1.5 text-center text-muted-foreground tabular-nums ${rowTone}`}>
                      {saving ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : index + 1}
                    </td>
                    <td style={{ left: frozenLeft(1), minWidth: FROZEN[1].width }} className={`sticky z-10 border-b border-r border-border/60 px-2 py-1.5 text-muted-foreground tabular-nums ${rowTone}`}>
                      {slip.employee_details?.emp_code || "—"}
                    </td>
                    <td style={{ left: frozenLeft(2), minWidth: FROZEN[2].width }} className={`sticky z-10 border-b border-r border-border px-2 py-1.5 font-medium ${rowTone}`}>
                      <div className="truncate" style={{ maxWidth: FROZEN[2].width - 16 }}>
                        {slip.employee_details?.employee_name || "—"}
                      </div>
                    </td>
                    <td className="border-b border-r border-border/60 px-2 py-1.5 whitespace-nowrap">{slip.employee_details?.branch || "Not Assigned"}</td>
                    <td className="border-b border-r border-border/60 px-2 py-1.5 whitespace-nowrap">{periodOf(slip)}</td>
                    <td className="border-b border-r border-border/60 px-2 py-1.5 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[slip.status] || STATUS_STYLE.Pending}`}>
                        {slip.status}
                      </span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {slip.sent_at ? "· Sent" : "· Not sent"}
                      </span>
                      {/* Left since: the month they worked is still a month paid. */}
                      {slip.employee_details?.status === "relieved" && (
                        <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          Relieved
                        </span>
                      )}
                    </td>
                    {GROUPS.flatMap((g) =>
                      g.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cellClass(slip, c)}
                          onClick={() => !(editing?.id === slip.id && editing?.key === c.key) && startEdit(slip, c.key)}
                          title={
                            EDITS[c.key]
                              ? slip.status === "Paid"
                                ? "Paid — locked"
                                : "Click to change"
                              : undefined
                          }
                        >
                          {renderValue(slip, c)}
                        </td>
                      )),
                    )}
                    <td className="border-b border-r border-border/60 bg-primary/5 px-2 py-1.5 text-right font-semibold tabular-nums whitespace-nowrap">
                      ₹{formatMoney(slip.net_salary)}
                    </td>
                    <td className="border-b border-border/60 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => onOpenSlip(slip)}
                        className="grid h-7 w-7 place-items-center rounded-lg border border-border hover:bg-primary/10 hover:text-primary"
                        title="Open the payslip — view, download, email, undo edits"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* The totals, held at the bottom: the sum of exactly the rows above. */}
            <tfoot>
              <tr>
                {FROZEN.map((c, i) => (
                  <td
                    key={c.key}
                    style={{ left: frozenLeft(i), minWidth: c.width }}
                    className="sticky bottom-0 z-30 border-t-2 border-r border-border bg-muted px-2 py-2 font-semibold"
                  >
                    {i === 2 ? `Total · ${rows.length}` : ""}
                  </td>
                ))}
                <td colSpan={3} className="sticky bottom-0 z-20 border-t-2 border-r border-border bg-muted" />
                {GROUPS.flatMap((g) =>
                  g.columns.map((c) => (
                    <td key={c.key} className="sticky bottom-0 z-20 border-t-2 border-r border-border bg-muted px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                      {formatCell(c, totals[c.key])}
                    </td>
                  )),
                )}
                <td className="sticky bottom-0 z-20 border-t-2 border-r border-border bg-primary/15 px-2 py-2 text-right font-bold tabular-nums whitespace-nowrap">
                  ₹{formatMoney(totals.net_salary)}
                </td>
                <td className="sticky bottom-0 z-20 border-t-2 border-border bg-muted" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmployeePayReport;
