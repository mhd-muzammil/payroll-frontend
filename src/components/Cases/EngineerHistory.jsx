import { useEffect, useId, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Route,
  Target,
  CalendarX2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { caseService } from "../../services/caseService";
import {
  canGoBack,
  canGoForward,
  clampCycle,
  cycleLabel,
  cycleOf,
  cycleRangeLabel,
  dayLabel,
  nextCycle,
  parseIsoDate,
  pickableDays,
  previousCycle,
  todayIso,
} from "../../Utility/billCycle";

/** Two decimals, as the office's KM Report prints them. */
const km2 = (km) => (Number(km) || 0).toFixed(2);

/**
 * A day the engineer has nothing for: no km, and no call counted either way.
 *
 * has_score false means OpenCall sent no figures for the day, which is not the
 * same as sending zeros, so those cells read "—" rather than a confident 0.
 */
const hasCalls = (d) => Boolean(d.has_score && (d.assigned || d.attended || d.closed));
const isEmptyDay = (d) => !(Number(d.km) > 0) && !hasCalls(d);

function loadError(e) {
  if (!e?.response) return "No connection. Check the internet and try again.";
  const { status, data } = e.response;
  // The app reaches phones the moment it builds, possibly ahead of the server
  // that answers this; "Not found." would read as "you have no history".
  if (status === 404) return "History is not on the server yet. Try again later.";
  if (status < 500 && typeof data?.detail === "string" && data.detail) return data.detail;
  return "The server could not answer just now. Try again in a moment.";
}

const SCORE_COLUMNS = [
  ["assigned", "Assigned", "text-gray-900"],
  ["attended", "Attended", "text-indigo-700"],
  ["closed", "Closed", "text-emerald-700"],
];

/** The day list's closed / target, in the colours of the close-target bar. */
function MiniBar({ value, target }) {
  const pct = Math.min(100, (value / target) * 100);
  const met = value >= target;
  return (
    <div className="w-14">
      <div className="text-right text-[11px] leading-none text-gray-500">
        <span className={`font-semibold ${met ? "text-emerald-700" : "text-gray-900"}`}>{value}</span>/
        {target}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${met ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The whole cycle, or the one picked day: km, the three counts, and the close
 * target -- the Today screen's three cards in one, so a past day reads the same
 * way as today does.
 */
function SummaryCard({ km, kmNote, score, target, TargetBar }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Route className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold leading-none text-gray-900 tabular-nums">
              {km2(km)}
            </span>
            <span className="text-base font-medium text-gray-500">km</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{kmNote}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3 text-center">
        {SCORE_COLUMNS.map(([field, label, tone]) => (
          <div key={field}>
            <div className={`text-lg font-semibold tabular-nums ${score ? tone : "text-gray-400"}`}>
              {score ? score[field] : "—"}
            </div>
            <div className="text-[11px] text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {score && target.target > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-600" strokeWidth={2} />
            <p className="text-sm font-semibold text-gray-900">Close target</p>
          </div>
          <TargetBar label={target.label} value={target.value} target={target.target} />
        </div>
      )}
    </div>
  );
}

function DayRow({ d, picked }) {
  const empty = isEmptyDay(d);
  const cell = "px-1 py-2.5";
  return (
    <tr className={picked ? "bg-indigo-50" : undefined}>
      <th
        scope="row"
        className={`whitespace-nowrap py-2.5 pl-3 pr-1 text-left font-medium ${
          empty ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {dayLabel(d.day)}
      </th>
      {empty ? (
        <>
          <td className={`${cell} text-right text-gray-400`}>—</td>
          <td colSpan={4} />
        </>
      ) : (
        <>
          <td className={`${cell} text-right ${Number(d.km) > 0 ? "text-gray-900" : "text-gray-400"}`}>
            {Number(d.km) > 0 ? km2(d.km) : "—"}
          </td>
          {SCORE_COLUMNS.map(([field, , tone]) => (
            <td
              key={field}
              className={`${cell} text-center ${d.has_score ? tone : "text-gray-400"}`}
            >
              {d.has_score ? d[field] : "—"}
            </td>
          ))}
          <td className="py-2.5 pl-1 pr-3">
            {d.has_score && d.daily_target > 0 && (
              <MiniBar value={d.closed} target={d.daily_target} />
            )}
          </td>
        </>
      )}
    </tr>
  );
}

function DayList({ days, picked }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm tabular-nums">
        <thead className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500">
          <tr>
            <th scope="col" className="py-2 pl-3 pr-1 text-left font-medium">
              Day
            </th>
            <th scope="col" className="px-1 py-2 text-right font-medium">
              km
            </th>
            <th scope="col" className="px-1 py-2 text-center font-medium">
              <abbr title="Assigned" className="no-underline">A</abbr>
            </th>
            <th scope="col" className="px-1 py-2 text-center font-medium">
              <abbr title="Attended" className="no-underline">At</abbr>
            </th>
            <th scope="col" className="px-1 py-2 text-center font-medium">
              <abbr title="Closed" className="no-underline">C</abbr>
            </th>
            <th scope="col" className="py-2 pl-1 pr-3 text-right font-medium">
              Target
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {days.map((d) => (
            <DayRow key={d.day} d={d} picked={d.day === picked} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The engineer's own past days, a 25th-to-24th cycle at a time: km as the
 * office's KM Report counts it, and Assigned / Attended / Closed against the
 * close target as OpenCall counted them that day.
 *
 * TargetBar comes from the Today screen, so the close target is drawn by the
 * one component on both; it is handed in rather than imported, because that
 * file is the one that imports this.
 */
export default function EngineerHistory({ TargetBar }) {
  // Fixed for as long as History is open. It is re-read every time the
  // engineer comes back to it, which is when a new day could have begun.
  const [today] = useState(todayIso);
  const current = cycleOf(today);

  const [cycle, setCycle] = useState(current);
  // "" is All days, which is also what an emptied date input hands back.
  const [picked, setPicked] = useState("");
  const [attempt, setAttempt] = useState(0);
  // The answer, tagged with the question it answers. A slow reply for a cycle
  // the engineer has already stepped away from can never be shown under the
  // new one's name, and "loading" is simply "no answer for this question yet".
  const [result, setResult] = useState(null);
  const dayInputId = useId();

  // Up to today while the cycle is still running: no row is asked for a day
  // that has not happened, and the picker offers exactly the days the list has.
  const { min: from, max: to } = pickableDays(cycle, today);
  const requestKey = `${from}|${to}|${attempt}`;
  const loading = result?.key !== requestKey;

  useEffect(() => {
    let live = true;
    const key = `${from}|${to}|${attempt}`;
    caseService.myHistory(from, to).then(
      (data) => {
        if (live) setResult({ key, data, error: null });
      },
      (e) => {
        if (live) setResult({ key, data: null, error: loadError(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [from, to, attempt]);

  const step = (move) => {
    setCycle((c) => clampCycle(move(c), current));
    setPicked("");
  };

  const pickDay = (value) => {
    // A typed day outside the cycle (a desktop browser allows it) is not one
    // of its days; keeping the old value puts the field back as it was.
    if (!value) setPicked("");
    else if (parseIsoDate(value) && value >= from && value <= to) setPicked(value);
  };

  const data = loading ? null : result.data;
  // Newest first, the order an engineer looks back in.
  const days = Array.isArray(data?.days)
    ? [...data.days].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    : [];
  const totals = data?.totals ?? {};
  const emptyCycle = days.every(isEmptyDay);

  let summary = null;
  if (data && !emptyCycle) {
    if (picked) {
      const row = days.find((d) => d.day === picked) ?? { day: picked, km: 0, has_score: false };
      summary = {
        km: row.km,
        kmNote: `Travelled on ${dayLabel(picked)}`,
        score: row.has_score ? row : null,
        target: { label: dayLabel(picked), value: row.closed, target: row.daily_target },
      };
    } else {
      const tracked = Number(totals.days_tracked) || 0;
      summary = {
        km: totals.km,
        kmNote: `${tracked} ${tracked === 1 ? "day" : "days"} tracked`,
        score: days.some((d) => d.has_score) ? totals : null,
        // Named by its dates: the Today screen's "Month to date" counts the
        // target cycle (24th to 25th), so the two bars can differ, and the
        // label says which days this one adds up.
        target: {
          label: `Closed ${cycleRangeLabel(cycle)}`,
          value: totals.closed,
          target: totals.monthly_target,
        },
      };
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="sr-only">My history</h1>

      {/* Which cycle, and optionally which day of it. The same stepper as
          Attendance's, so ◀ ▶ mean the same thing on both screens. */}
      <div className="rounded-xl border bg-white p-3 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(previousCycle)}
            disabled={!canGoBack(cycle)}
            aria-label="Previous cycle"
            title="Previous cycle"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center" aria-live="polite">
            <p className="text-base font-semibold text-gray-900">{cycleLabel(cycle)}</p>
            <p className="text-xs text-gray-500">{cycleRangeLabel(cycle)}</p>
          </div>
          <button
            type="button"
            onClick={() => step(nextCycle)}
            disabled={!canGoForward(cycle, current)}
            aria-label="Next cycle"
            title="Next cycle"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <label htmlFor={dayInputId} className="text-sm font-medium text-gray-700">
            Day
          </label>
          <input
            id={dayInputId}
            type="date"
            min={from}
            max={to}
            value={picked}
            onChange={(e) => pickDay(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
          <button
            type="button"
            onClick={() => setPicked("")}
            aria-pressed={!picked}
            className={`h-10 shrink-0 rounded-lg px-3 text-sm font-semibold ${
              picked
                ? "border border-gray-200 text-gray-700 active:bg-gray-100"
                : "bg-indigo-600 text-white"
            }`}
          >
            All days
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {cycleLabel(cycle)}…
        </div>
      ) : result.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-start gap-2 text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Could not load {cycleLabel(cycle)}</p>
              <p className="mt-1 text-sm text-red-700">{result.error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 active:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : emptyCycle ? (
        <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gray-100 text-gray-500">
            <CalendarX2 className="h-6 w-6" strokeWidth={2} />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-900">
            Nothing recorded in {cycleLabel(cycle)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {cycleRangeLabel(cycle)}: no km travelled and no calls counted.
          </p>
        </div>
      ) : (
        <>
          <SummaryCard {...summary} TargetBar={TargetBar} />
          <DayList days={days} picked={picked} />
        </>
      )}
    </div>
  );
}
