import { useMemo, useRef, useState } from "react";
import { Eye, Loader2, Lock, Search } from "lucide-react";
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
 * from month to month (incentive, other earnings, staff advance, TDS,
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

const EmployeePayReport = ({ slips, loading, selectedRegion, onOpenSlip, onSlipUpdated }) => {
  // Which month the sheet shows. Defaults to the newest month that has slips,
  // because that is the one being checked; "all" puts every month on one sheet.
  const periods = useMemo(() => {
    const seen = new Map();
    (slips || []).forEach((s) => {
      const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
      if (!seen.has(key)) seen.set(key, { key, label: periodOf(s) });
    });
    return [...seen.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [slips]);

  const [period, setPeriod] = useState("");
  const activePeriod = period || periods[0]?.key || "all";
  const [query, setQuery] = useState("");

  const [editing, setEditing] = useState(null); // { id, key }
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  // Slips already sent to their employee, where the office has said yes to
  // changing what that employee can already see. Asked once per slip.
  const confirmedSent = useRef(new Set());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (slips || [])
      .filter((s) => {
        if (activePeriod === "all") return true;
        return `${s.year}-${String(s.month).padStart(2, "0")}` === activePeriod;
      })
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
  }, [slips, activePeriod, selectedRegion, query]);

  // Summed from the rows on screen, never from a server summary: the totals
  // have to be the sum of exactly what the sheet shows.
  const totals = useMemo(() => {
    const sums = {};
    ALL_NUMERIC.forEach((c) => {
      sums[c.key] = rows.reduce((acc, s) => acc + toNumber(s[c.key]), 0);
    });
    return sums;
  }, [rows]);

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
    if (value === before) {
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
          onChange={(e) => setDraft(e.target.value)}
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
          value={activePeriod}
          onChange={(e) => setPeriod(e.target.value)}
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
