import { useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AUTO_CLOSED_NOTE,
  REPORT_TOTAL_HEADERS,
  buildAttendanceReport,
  exportClock,
} from "../../Utility/attendanceReport";
import { REGIONS, employeeKey, getStatusDisplay, statusShown } from "../../Utility/attendanceUtils";

/**
 * The Export Report spreadsheet, on screen.
 *
 * Its own full-screen view rather than a change to the page under it: the
 * office asked to SEE the report without downloading it, and nothing about the
 * attendance page was to move. It is built from exactly the rows the export
 * uses -- the page's filtered records, through the same buildAttendanceReport
 * -- so what is on screen is what the Excel would say, cell for cell.
 *
 * Laid out the way the sheet is read: the header row and the first columns
 * stay put while the dates scroll, as Excel's frozen panes do.
 *
 * A Radix dialog, like the rest of the app's sheets, because the page is still
 * there underneath: without a focus trap, Tab walked into the hidden attendance
 * cards and Enter on a status toggle turned somebody's Present into Absent.
 *
 * Over the table, a box per region and one for all of them: picking Chennai
 * narrows the table to Chennai's people -- the rows the page's own region
 * filter would give the report -- and All Regions opens it back up.
 */

// Where a row is counted: the place the sheet's Location column prints.
const placeOf = (record) => String(record?.branch || "Chennai").toLowerCase();

// The sheet's colours, legible on the dark theme as well. Looked up by the
// status a day is shown with, so Leave arrives as Sunday or Holiday.
const STATUS_TEXT = {
  Present: "text-green-700 dark:text-green-400",
  Overtime: "text-blue-700 dark:text-blue-400",
  overTime: "text-blue-700 dark:text-blue-400",
  Absent: "text-red-600 dark:text-red-400",
  Leave: "text-amber-700 dark:text-amber-400",
  Sunday: "text-slate-600 dark:text-slate-300",
  Holiday: "text-amber-700 dark:text-amber-400",
  Late: "text-amber-700 dark:text-amber-400",
};

// One per REPORT_TOTAL_HEADERS entry, in its order.
const TOTAL_TEXT = [
  "text-green-700 dark:text-green-400",
  "text-slate-600 dark:text-slate-300",
  "text-amber-700 dark:text-amber-400",
  "text-amber-700 dark:text-amber-400",
  "text-red-600 dark:text-red-400",
  "text-foreground",
  "text-blue-700 dark:text-blue-400",
];

const dayLabel = (iso) => {
  const [year, month, day] = String(iso || "").split("-");
  return year && month && day ? `${day}-${month}-${year}` : iso;
};

// Frozen columns: their widths are fixed so each knows where the next begins.
// The name may wrap anywhere, even inside one long word: a name wider than its
// column would widen it, and Location, frozen at a fixed offset, would then
// cover the end of it.
const SNO = "w-12 min-w-12 left-0";
const NAME = "w-44 min-w-44 left-12 wrap-anywhere";
const PLACE = "w-28 min-w-28 sm:left-56";

/** One day: the status, then the punches -- the lines the sheet's cell holds. */
function DayCell({ entry, datePart }) {
  if (!entry) return <span className="text-muted-foreground">-</span>;
  const shown = statusShown(entry.status, datePart);
  const inAt = exportClock(entry.intime);
  const outAt = exportClock(entry.outtime);
  return (
    <div className="leading-5">
      <div className={`font-semibold ${STATUS_TEXT[shown] || "text-foreground"}`}>
        {getStatusDisplay(shown) || "-"}
      </div>
      {inAt && <div className="text-xs text-muted-foreground">in {inAt}</div>}
      {outAt && (
        <div className="text-xs text-muted-foreground">
          out {outAt}
          {entry.autoClosed ? " *" : ""}
        </div>
      )}
    </div>
  );
}

export default function AttendanceReportView({
  records,
  fromDate,
  toDate,
  region,
  scope,
  onClose,
  onDownload,
  downloading,
}) {
  const all = useMemo(() => (Array.isArray(records) ? records : []), [records]);
  // The region box picked; null is All Regions. Starts on the page's own
  // region filter, if there is one.
  const [place, setPlace] = useState(region || null);
  const shown = useMemo(
    () => (place ? all.filter((record) => placeOf(record) === place.toLowerCase()) : all),
    [all, place]
  );
  const report = useMemo(() => buildAttendanceReport(shown), [shown]);
  // How many people each box holds -- the rows it would show.
  const people = useMemo(() => {
    const count = (list) => new Set(list.map(employeeKey)).size;
    const byPlace = { all: count(all) };
    REGIONS.forEach((name) => {
      byPlace[name] = count(all.filter((record) => placeOf(record) === name.toLowerCase()));
    });
    return byPlace;
  }, [all]);
  const gridRef = useRef(null);
  // Whatever opened the view -- the Report View button -- gets the focus back
  // when it closes.
  const [opener] = useState(() => (typeof document === "undefined" ? null : document.activeElement));

  const empty = report.rows.length === 0;

  return (
    // Escape closes it too: Radix sends that through onOpenChange.
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
          onOpenAutoFocus={(event) => {
            // Into the table, so the arrow keys and Page Down scroll the report.
            if (!gridRef.current) return;
            event.preventDefault();
            gridRef.current.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener?.focus?.({ preventScroll: true });
          }}
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-bold text-foreground">
                Attendance Report
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {dayLabel(fromDate)} to {dayLabel(toDate)}
                {` · ${place || region || "All regions"}`}
                {scope ? ` · ${scope}` : ""}
                {!empty && ` · ${report.rows.length} ${report.rows.length === 1 ? "person" : "people"}`}
              </DialogPrimitive.Description>
            </div>
            {/* The Excel is the page's, as it always was -- every region the
                page's own filters let through. */}
            {all.length > 0 && (
              <Button variant="outline" onClick={onDownload} disabled={downloading}>
                {downloading ? "Exporting..." : "Download Excel"}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close the report">
              <X />
            </Button>
          </div>

          {/* The region boxes: everybody, then each branch. */}
          <div className="grid grid-cols-3 gap-2 border-b border-border px-4 py-3 sm:grid-cols-6 sm:px-6">
            {[["All Regions", null, people.all], ...REGIONS.map((name) => [name, name, people[name]])].map(
              ([label, value, count]) => {
                const active = place === value;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPlace(value)}
                    aria-pressed={active}
                    className={`min-w-0 rounded-2xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      active
                        ? "border-primary-glow/50 bg-primary-glow/[0.10]"
                        : "border-border/60 bg-muted/30 hover:bg-muted/60"
                    }`}
                  >
                    {/* text-xs on a phone, where three boxes share 390px and
                        "Kanchipuram" would otherwise be cut. */}
                    <div
                      className={`truncate text-xs font-bold sm:text-sm ${
                        active ? "text-primary-glow" : "text-foreground"
                      }`}
                    >
                      {label}
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {count} {count === 1 ? "person" : "people"}
                    </div>
                  </button>
                );
              }
            )}
          </div>

          {empty ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              No attendance records for this range and these filters.
            </div>
          ) : (
            // overscroll-contain: scrolling past the end must not move the
            // attendance page hidden underneath.
            <div
              ref={gridRef}
              tabIndex={0}
              role="region"
              aria-label="Attendance report table"
              className="flex-1 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              data-testid="attendance-report-grid"
            >
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className={`sticky top-0 z-30 ${SNO} border-b border-r border-border bg-muted px-2 py-2 text-center font-bold text-blue-700 dark:text-blue-400`}>
                      S.no
                    </th>
                    <th className={`sticky top-0 z-30 ${NAME} border-b border-r border-border bg-muted px-3 py-2 text-left font-bold text-blue-700 dark:text-blue-400`}>
                      Name
                    </th>
                    <th className={`sticky top-0 z-20 sm:z-30 ${PLACE} border-b border-r border-border bg-muted px-3 py-2 text-left font-bold text-blue-700 dark:text-blue-400`}>
                      Location
                    </th>
                    {report.dateLabels.map((label) => (
                      <th
                        key={label}
                        className="sticky top-0 z-20 min-w-32 border-b border-r border-border bg-muted px-2 py-2 text-center font-bold whitespace-nowrap text-amber-700 dark:text-amber-400"
                      >
                        {label}
                      </th>
                    ))}
                    {REPORT_TOTAL_HEADERS.map((header) => (
                      <th
                        key={header}
                        className="sticky top-0 z-20 border-b border-r border-border bg-muted px-3 py-2 text-center font-bold whitespace-nowrap text-blue-700 dark:text-blue-400"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={`${row.sno}-${row.name}`} data-testid="attendance-report-row">
                      <td className={`sticky z-10 ${SNO} border-b border-r border-border bg-card px-2 py-2 text-center text-foreground`}>
                        {row.sno}
                      </td>
                      <td className={`sticky z-10 ${NAME} border-b border-r border-border bg-card px-3 py-2 font-medium text-foreground`}>
                        {row.name || "-"}
                      </td>
                      <td className={`sm:sticky sm:z-10 ${PLACE} border-b border-r border-border bg-card px-3 py-2 text-foreground`}>
                        {row.branch}
                      </td>
                      {report.dates.map((datePart) => (
                        <td
                          key={datePart}
                          className="border-b border-r border-border bg-background px-2 py-2 text-center align-middle"
                        >
                          <DayCell entry={row.days[datePart]} datePart={datePart} />
                        </td>
                      ))}
                      {[
                        row.present,
                        row.sunday,
                        row.holiday,
                        row.leave,
                        row.absent,
                        row.presentPlusLeave,
                        row.hoursText,
                      ].map(
                        (value, i) => (
                          <td
                            key={REPORT_TOTAL_HEADERS[i]}
                            className={`border-b border-r border-border bg-background px-3 py-2 text-center font-bold whitespace-nowrap ${TOTAL_TEXT[i]}`}
                          >
                            {value}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.anyAutoClosed && (
                <p className="px-4 py-3 text-xs text-muted-foreground">{AUTO_CLOSED_NOTE}</p>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
