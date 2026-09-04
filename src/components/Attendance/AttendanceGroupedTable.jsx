import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, Pencil, Trash2, Plus } from "lucide-react";
import {
  punchTime,
  formatDayLabel,
  getDatePart,
  calculateHours,
  calculateOvertime,
  isPresentStatus,
  getStatusDisplay,
} from "../../Utility/attendanceUtils";

const STATUS_PILL = {
  Present: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Overtime: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  overTime: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Absent: "bg-red-500/10 text-red-600 dark:text-red-400",
  Leave: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Late: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

// Full-row tint by status: Absent = red, Leave / weekly-off (Sunday) = amber.
const ROW_TINT = {
  Absent: "bg-red-500/10 hover:bg-red-500/[0.16]",
  Leave: "bg-amber-500/10 hover:bg-amber-500/[0.16]",
  Late: "bg-amber-500/10 hover:bg-amber-500/[0.16]",
};

// The same tints for the phone list, minus the hover halves - there is no
// pointer to hover with, and on Android a :hover state sticks after a tap.
const ROW_TINT_TOUCH = {
  Absent: "bg-red-500/10",
  Leave: "bg-amber-500/10",
  Late: "bg-amber-500/10",
};

const StatusPill = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
      STATUS_PILL[status] || "bg-muted-foreground/15 text-muted-foreground"
    }`}
  >
    {getStatusDisplay(status)}
  </span>
);

const employeeKey = (record) =>
  record.employee_id != null
    ? `id:${record.employee_id}`
    : `name:${String(record.employee_name || "").toLowerCase()}`;

/**
 * Groups daily attendance records by employee. Each employee is a collapsible
 * card: the header shows a cycle summary (present/absent days, total & OT hours)
 * and expanding reveals the day-by-day breakdown, each row dated with weekday.
 */
const AttendanceGroupedTable = ({
  data = [],
  isEmployee = false,
  onEdit,
  onDelete,
  onToggleStatus,
  onAddForEmployee,
}) => {
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const key = employeeKey(r);
      if (!map.has(key)) {
        map.set(key, {
          key,
          employee_name: r.employee_name,
          email: r.email || null,
          department: r.department,
          role: r.role,
          branch: r.branch || "Chennai",
          records: [],
        });
      }
      map.get(key).records.push(r);
    }

    const arr = [...map.values()];
    arr.forEach((g) => {
      g.records.sort((a, b) =>
        getDatePart(a.intime || a.outtime).localeCompare(
          getDatePart(b.intime || b.outtime)
        )
      );
      g.presentDays = g.records.filter((r) => isPresentStatus(r.status)).length;
      g.absentDays = g.records.filter((r) => r.status === "Absent").length;
      g.leaveDays = g.records.filter((r) => r.status === "Leave").length;
      g.totalHours = g.records.reduce(
        (s, r) => s + parseFloat(calculateHours(r.intime, r.outtime)),
        0
      );
      g.otHours = g.records.reduce(
        (s, r) => s + parseFloat(calculateOvertime(r.intime, r.outtime)),
        0
      );
    });
    arr.sort((a, b) =>
      String(a.employee_name || "").localeCompare(String(b.employee_name || ""))
    );
    return arr;
  }, [data]);

  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const singleGroup = groups.length === 1;

  const isExpanded = (key) => singleGroup || expandedKeys.has(key);

  const toggle = (key) => {
    if (singleGroup) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (groups.length === 0) return null;

  const colSpan = isEmployee ? 6 : 7;

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const open = isExpanded(g.key);
        return (
          <div
            key={g.key}
            className="glass-card rounded-3xl overflow-hidden border border-border/70"
          >
            {/* Employee summary header. The toggle and the action are
                siblings, not nested buttons: Mark Attendance used to sit inside
                the <button> that expands the card, which is invalid nesting and
                survived only on stopPropagation. */}
            <div className="flex items-start gap-2 px-4 md:px-5 py-4">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="flex-1 min-w-0 text-left md:flex md:items-center md:gap-4"
              >
                <div className="flex items-center gap-3 min-w-0 md:flex-1 md:min-w-[200px]">
                  {!singleGroup && (
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        open ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  )}
                  <Avatar name={g.employee_name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {g.employee_name}
                      </span>
                      <Badge
                        variant="outline"
                        className="shrink-0 capitalize border-border/80 text-foreground text-[10px] px-1.5 py-0"
                      >
                        {g.branch}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {g.email || "no email"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {g.role || "—"}
                      {g.department ? ` · ${g.department}` : ""}
                    </div>
                  </div>
                </div>

                {/* Cycle summary pills */}
                <div className="mt-2.5 md:mt-0 flex flex-wrap items-center gap-1.5 md:gap-2 text-xs">
                  <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 font-medium">
                    Present {g.presentDays}
                  </span>
                  <span className="rounded-full bg-red-500/10 text-red-600 dark:text-red-400 px-2.5 py-1 font-medium">
                    Absent {g.absentDays}
                  </span>
                  {g.leaveDays > 0 && (
                    <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 font-medium">
                      Leave {g.leaveDays}
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                    {g.totalHours.toFixed(1)}h total
                  </span>
                  {g.otHours > 0 && (
                    <span className="rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-2.5 py-1 font-medium">
                      +{g.otHours.toFixed(1)}h OT
                    </span>
                  )}
                </div>
              </button>

              {!isEmployee && onAddForEmployee && (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() =>
                    onAddForEmployee({
                      employee_name: g.employee_name,
                      role: g.role,
                      department: g.department,
                      salary: g.records[0]?.salary || "0.00",
                    })
                  }
                  className="shrink-0 h-10 w-10 md:h-8 md:w-auto md:px-3 rounded-xl text-xs font-semibold shadow-glow-brand"
                  title={`Mark Attendance for ${g.employee_name}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Mark Attendance</span>
                </Button>
              )}
            </div>

            {/* Daily breakdown */}
            {open && (
              <div className="hidden md:block overflow-x-auto scrollbar-thin border-t border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left font-medium text-muted-foreground px-4 md:px-5 py-2.5 text-xs uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider">
                        Clock In
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider">
                        Clock Out
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider">
                        Total Hours
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider">
                        Overtime
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider">
                        Status
                      </th>
                      {!isEmployee && (
                        <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-xs uppercase tracking-wider w-[110px]">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {g.records.length === 0 ? (
                      <tr>
                        <td
                          colSpan={colSpan}
                          className="px-5 py-6 text-center text-sm text-muted-foreground"
                        >
                          No records in this range.
                        </td>
                      </tr>
                    ) : (
                      g.records.map((r) => {
                        const overtime = calculateOvertime(r.intime, r.outtime);
                        return (
                          <tr
                            key={r.id}
                            className={`border-t border-border/60 transition ${
                              ROW_TINT[r.status] || "hover:bg-muted/30"
                            }`}
                          >
                            <td className="px-4 md:px-5 py-3 font-medium whitespace-nowrap">
                              {formatDayLabel(r.intime || r.outtime)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {punchTime(r, "intime")}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {punchTime(r, "outtime")}
                            </td>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                              {calculateHours(r.intime, r.outtime)}h
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {Number(overtime) > 0 ? (
                                <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                                  +{overtime}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  !isEmployee &&
                                  onToggleStatus?.(r.id, r.status)
                                }
                                disabled={isEmployee}
                                className={isEmployee ? "cursor-default" : "cursor-pointer"}
                                title={
                                  isEmployee
                                    ? "Status updates are disabled for employees"
                                    : "Click to toggle status"
                                }
                              >
                                <StatusPill status={r.status} />
                              </button>
                            </td>
                            {!isEmployee && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onEdit?.(r)}
                                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDelete?.(r.id)}
                                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-red-50 hover:text-red-500"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Phone: one row per day. The table above measures 571px on a
                390px screen, which made reading your own week a sideways
                scroll inside a page that already scrolls down. */}
            {open && (
              <div className="md:hidden border-t border-border divide-y divide-border/60">
                {g.records.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No records in this range.
                  </div>
                ) : (
                  g.records.map((r) => {
                    const overtime = calculateOvertime(r.intime, r.outtime);
                    return (
                      <div
                        key={r.id}
                        className={`px-4 py-3 ${ROW_TINT_TOUCH[r.status] || ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium flex-1 min-w-0 truncate">
                            {formatDayLabel(r.intime || r.outtime)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              !isEmployee && onToggleStatus?.(r.id, r.status)
                            }
                            disabled={isEmployee}
                            className={`shrink-0 ${isEmployee ? "cursor-default" : "cursor-pointer"}`}
                          >
                            <StatusPill status={r.status} />
                          </button>
                          {!isEmployee && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit?.(r)}
                                className="shrink-0 grid h-10 w-10 place-items-center rounded-xl border border-border"
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete?.(r.id)}
                                className="shrink-0 grid h-10 w-10 place-items-center rounded-xl border border-border text-red-500"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            In{" "}
                            <span className="font-medium text-foreground">
                              {punchTime(r, "intime")}
                            </span>
                          </span>
                          <span>
                            Out{" "}
                            <span className="font-medium text-foreground">
                              {punchTime(r, "outtime")}
                            </span>
                          </span>
                          <span className="font-medium text-foreground">
                            {calculateHours(r.intime, r.outtime)}h
                          </span>
                          {Number(overtime) > 0 && (
                            <span className="font-medium text-cyan-600 dark:text-cyan-400">
                              +{overtime}h OT
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AttendanceGroupedTable;
