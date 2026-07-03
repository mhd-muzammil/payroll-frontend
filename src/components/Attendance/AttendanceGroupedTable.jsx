import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import {
  formatTime,
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
}) => {
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const key = employeeKey(r);
      if (!map.has(key)) {
        map.set(key, {
          key,
          employee_name: r.employee_name,
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
            {/* Employee summary header */}
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="w-full flex flex-wrap items-center gap-4 px-4 md:px-5 py-4 text-left hover:bg-muted/40 transition"
            >
              {!singleGroup && (
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    open ? "rotate-0" : "-rotate-90"
                  }`}
                />
              )}
              <div className="flex items-center gap-3 min-w-[200px] flex-1">
                <Avatar name={g.employee_name} />
                <div>
                  <div className="text-sm font-semibold">{g.employee_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.role || "—"}
                    {g.department ? ` · ${g.department}` : ""}
                  </div>
                </div>
              </div>

              <Badge
                variant="outline"
                className="capitalize border-border/80 text-foreground"
              >
                {g.branch}
              </Badge>

              {/* Cycle summary pills */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
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

            {/* Daily breakdown */}
            {open && (
              <div className="overflow-x-auto scrollbar-thin border-t border-border">
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
                              {formatTime(r.intime)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {formatTime(r.outtime)}
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
          </div>
        );
      })}
    </div>
  );
};

export default AttendanceGroupedTable;
