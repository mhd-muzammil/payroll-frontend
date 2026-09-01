import { useEffect, useMemo, useState } from "react";
import {
  Route,
  ClipboardList,
  Phone,
  Navigation,
  Building2,
  MapPin,
  CheckCircle2,
  LogIn,
  LogOut,
} from "lucide-react";
import { caseService } from "../../services/caseService";
import { useDuty } from "../../context/DutyContext";

/** Time of day, the way somebody reads it back to you. */
function clockTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * When this call was punched in and out, in place of the status word.
 *
 * "Assigned" told the engineer something they already knew — they are looking at
 * their own case list. What is worth the space is what they have recorded
 * against this call so far, because that is the thing they might have forgotten
 * to do. A case with no punch says so plainly rather than showing nothing.
 */
function PunchRecord({ c }) {
  if (c.status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
        Cancelled
      </span>
    );
  }
  if (!c.reached_at) {
    return <span className="text-xs font-medium text-gray-400">Not punched in</span>;
  }
  if (c.completed_at) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {clockTime(c.reached_at)} – {clockTime(c.completed_at)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
      On site since {clockTime(c.reached_at)}
    </span>
  );
}


/**
 * Where an engineer is sent to navigate. A plain Google Maps link — no API key,
 * no billing, nothing to configure — which opens the Google Maps app on the
 * phone and gives turn-by-turn directions. Accepts "lat,lng" or a street
 * address; Maps resolves either.
 *
 * The live-tracking map that staff LOOK at still uses OpenStreetMap tiles,
 * because that is the only tile source that needs no key. This is the map an
 * engineer actually travels with, so it gets the better Indian coverage.
 */
const mapsUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

// The ticket's own fields, in the order an engineer reads them: which call,
// which machine, whose account. Anything the sync did not send is skipped, so a
// card never shows a label with a blank beside it.
const DETAIL_ROWS = [
  ["ticket_id", "Ticket ID"],
  ["case_id", "Case ID"],
  ["wip_aging", "WIP aging"],
  ["location", "Location"],
  ["work_location", "Work location"],
  ["product_name", "Product"],
  ["product_serial_no", "Product S.No"],
  ["product_line_name", "Product line"],
  ["account_name", "Account"],
  ["customer_mail", "Customer mail"],
  ["customer_pincode", "Pincode"],
  ["engineer", "Engineer"],
];

function CaseDetails({ details }) {
  const rows = DETAIL_ROWS.filter(([key]) => details?.[key]);
  if (rows.length === 0) return null;

  return (
    // Collapsed by default: the card stays scannable on a phone, and the full
    // ticket is one tap away when the engineer is standing in front of the machine.
    <details className="rounded-lg bg-gray-50 border border-gray-100">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-700">
        Ticket details
      </summary>
      <dl className="px-3 pb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([key, label]) => (
          <div key={key} className="contents">
            <dt className="text-gray-500 whitespace-nowrap">{label}</dt>
            <dd className="text-gray-800 break-words">{details[key]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// Solid, uppercase, and on a coloured rail down the side of the card, because
// "urgent" whispered in a pale chip is the same as not saying it.
const PRIORITY = {
  urgent: { chip: "bg-red-600 text-white", rail: "bg-red-500" },
  high: { chip: "bg-orange-500 text-white", rail: "bg-orange-400" },
  medium: { chip: "bg-amber-400 text-amber-950", rail: "bg-amber-300" },
  low: { chip: "bg-emerald-600 text-white", rail: "bg-emerald-400" },
};

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * The order an engineer needs, which is not the order the API returns.
 *
 * Anything still to do comes first, most urgent at the top; within a priority
 * the one already punched into goes above the ones not started, because that is
 * the job in hand. Finished calls sink to the bottom -- they are a record, not
 * work. The screenshot that prompted this had a completed PM visit above an
 * urgent ATM outage with a branch manager standing over it.
 */
function orderForEngineer(list) {
  return [...list].sort((a, b) => {
    const doneA = a.status === "completed" || a.status === "cancelled";
    const doneB = b.status === "completed" || b.status === "cancelled";
    if (doneA !== doneB) return doneA ? 1 : -1;

    if (!doneA) {
      const rank =
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (rank !== 0) return rank;
      const startedA = a.reached_at ? 0 : 1;
      const startedB = b.reached_at ? 0 : 1;
      if (startedA !== startedB) return startedA - startedB;
    }

    // Newest first among equals, so a fresh call does not hide under an old one.
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

/**
 * Engineer's field view. Shows cases assigned to the logged-in engineer, lets
 * them drive each case forward, and streams their live location (app-open only)
 * while they are travelling to / working on the active case.
 */
export default function EngineerCases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Duty lives at app level, so it keeps running when the engineer opens
  // another page — this screen only reads and drives it.
  const {
    onDuty,
    startedAt,
    busy: dutyBusy,
    streaming,
    lastFix,
    error: trackErr,
    locationBlocked,
    locationDiagnostic,
    locationSteps,
    startDuty,
    endDuty,
    setContext,
    todayKm,
  } = useDuty();

  // What the day looks like, in three numbers that always add up to the
  // total. The buckets are exhaustive by construction rather than by three
  // separate filters, because a breakdown that does not sum to the figure
  // above it is worse than no breakdown.
  //
  // "Cases today" is literal: the API gives an engineer exactly their assigned
  // calls for today, one per ticket, cancelled ones already dropped -- so a
  // cancelled case cannot reach the Done bucket in practice.
  const counts = useMemo(() => {
    let toDo = 0;
    let onSite = 0;
    let done = 0;
    for (const c of cases) {
      if (c.status === "completed" || c.status === "cancelled") done += 1;
      else if (c.reached_at) onSite += 1;
      else toDo += 1;
    }
    return { toDo, onSite, done };
  }, [cases]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await caseService.getAll();
      setCases(Array.isArray(data) ? data : data.results || []);
      setErr(null);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runAction = async (fn, c, statusForTracking) => {
    setBusyId(c.id);
    try {
      const updated = await fn();
      setCases((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      // Keep the live tracker tagged with the case currently being worked.
      if (statusForTracking) setContext(c.id, statusForTracking);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const onPunchIn = (c) => {
    // Punching in at a customer implies being on duty, so start it if they have
    // not. This carried over from Start Travel, and it matters more here: with
    // duty off there is no GPS running, so the punch would record a time and no
    // place — which is the one thing these buttons exist to capture.
    if (!onDuty) startDuty();
    setContext(c.id, "working");
    runAction(() => caseService.punchIn(c.id, lastFix), c, "working");
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">My Cases</h1>
        <div className="flex items-center gap-3 text-sm">
          {/* Three states, not two: off duty; on duty and sending; on duty but
              the phone has no fix yet (office wants to know the difference). */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
              !onDuty
                ? "bg-gray-100 text-gray-600"
                : streaming && lastFix
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
            title={startedAt ? `On duty since ${new Date(startedAt).toLocaleTimeString()}` : undefined}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                !onDuty ? "bg-gray-400" : streaming && lastFix ? "bg-green-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            {!onDuty ? "Off duty" : streaming && lastFix ? "On duty" : "On duty · waiting for GPS"}
          </span>
          {onDuty ? (
            <button
              onClick={endDuty}
              disabled={dutyBusy}
              className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-60"
            >
              {dutyBusy ? "…" : "Stop Duty"}
            </button>
          ) : (
            // Never disabled by the cached permission state. The browser does not
            // reliably announce a permission changed in its own settings, so a
            // stale "denied" would lock the engineer out of duty entirely — and
            // the tap itself asks the device, which is the only real answer.
            <button
              onClick={startDuty}
              disabled={dutyBusy}
              className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-green-600 text-white disabled:opacity-60"
            >
              {/* Named, because getting a first fix outdoors can take a while and
                  a bare spinner reads as the app having hung. */}
              {dutyBusy ? "Getting location…" : "Start Duty"}
            </button>
          )}
        </div>
      </div>

      {/* How many calls they have been given today, and where each one stands.
          The count is the first thing an engineer wants off this screen -- is
          it a two-call day or a seven-call day -- and it was only obtainable by
          scrolling the list and counting. */}
      {!loading && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <ClipboardList className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="text-3xl font-semibold leading-none text-gray-900 tabular-nums">
                {cases.length}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {cases.length === 1 ? "Case today" : "Cases today"}
              </p>
            </div>
          </div>

          {cases.length > 0 && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 pt-3 text-center">
              <div>
                <div className="text-lg font-semibold tabular-nums text-gray-900">{counts.toDo}</div>
                <div className="text-[11px] text-gray-500">To do</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums text-indigo-700">{counts.onSite}</div>
                <div className="text-[11px] text-gray-500">On site</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums text-emerald-700">{counts.done}</div>
                <div className="text-[11px] text-gray-500">Done</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How far they have gone today, on a card of its own. The engineer's
          own figure, computed by the same helper that produces the one on the
          office's board — an engineer and their manager reading two different
          numbers for the same day is worse than neither of them having one.
          Absent from an older backend, in which case the card does not appear
          rather than claiming a confident zero. */}
      {todayKm != null && (
        <div className="rounded-xl border bg-white p-4 shadow-sm flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Route className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold leading-none text-gray-900 tabular-nums">
                {todayKm.toFixed(1)}
              </span>
              <span className="text-base font-medium text-gray-500">km</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Travelled today</p>
          </div>
        </div>
      )}
      {lastFix && (
        <p className="text-xs text-gray-500">
          Last location: {lastFix.latitude.toFixed(5)}, {lastFix.longitude.toFixed(5)}
          {lastFix.accuracy != null && ` (±${Math.round(lastFix.accuracy)}m)`}
        </p>
      )}
      {/* A blocked location is a standing condition, not a failed action, so it
          gets a banner the engineer can act on rather than a line of red text
          they scroll past. It clears itself the moment they allow it. */}
      {locationBlocked ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Location looks blocked for this site.</p>
          <p className="mt-1">
            Tap the padlock next to the web address and set <strong>Location</strong> to{" "}
            <strong>Allow</strong> — a one-time setting.{" "}
            <strong>Already allowed it? Just tap Start Duty</strong> — this notice can lag behind
            the browser until the page is reloaded.
          </p>
          {locationDiagnostic && (
            <p className="mt-2 text-xs text-amber-800">Device said: {locationDiagnostic}</p>
          )}
        </div>
      ) : (
        (err || trackErr) && (
          <div>
            <p className="text-sm text-red-600">{err || trackErr}</p>
            {/* Numbered, because "allow location" is three settings in three
                places on Android and only one of them is the padlock. A wall of
                red prose gets scrolled past; a short list gets followed. */}
            {locationSteps?.length > 0 && (
              <ol className="mt-2 space-y-1.5 pl-5 text-sm text-gray-700 list-decimal">
                {locationSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
            {/* What the device actually answered. An instant refusal is otherwise
                invisible — the tap looks like nothing happened — and this line is
                what tells apart a blocked site from a blocked browser app. */}
            {locationDiagnostic && (
              <p className="mt-2 text-xs text-gray-500">Device said: {locationDiagnostic}</p>
            )}
          </div>
        )
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : cases.length === 0 ? (
        <p className="text-gray-500">No cases assigned to you.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orderForEngineer(cases).map((c) => {
            const done = c.status === "completed" || c.status === "cancelled";
            const priority = PRIORITY[c.priority] || {
              chip: "bg-gray-200 text-gray-700",
              rail: "bg-gray-300",
            };
            const navTarget =
              c.latitude != null && c.longitude != null
                ? `${c.latitude},${c.longitude}`
                : c.address;

            return (
              <div
                key={c.id}
                className={`relative overflow-hidden rounded-xl border bg-white pl-5 pr-4 py-4 shadow-sm space-y-3 ${
                  done ? "opacity-70" : ""
                }`}
              >
                {/* A rail down the side, so priority is visible before a single
                    word is read and stays visible while scrolling past. */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${done ? "bg-gray-300" : priority.rail}`}
                />

                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      done ? "bg-gray-200 text-gray-600" : priority.chip
                    }`}
                  >
                    {done ? (c.status === "cancelled" ? "Cancelled" : "Done") : c.priority}
                  </span>
                  <span className="font-mono text-[11px] text-gray-400">{c.case_number}</span>
                </div>

                <p className="font-semibold leading-snug text-gray-900">{c.title}</p>

                <div className="space-y-1.5 text-sm">
                  <p className="flex items-start gap-2 font-medium text-gray-800">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span className="min-w-0">{c.customer_name}</span>
                  </p>
                  {c.address && (
                    <p className="flex items-start gap-2 text-gray-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span className="min-w-0">{c.address}</span>
                    </p>
                  )}
                  {c.description && (
                    <p className="text-gray-500">{c.description}</p>
                  )}
                </div>

                {/* Ring them, then drive to them. These were a phone number in
                    small blue text and an address in small blue text, while
                    "Open in map" -- which opens the same map the address did --
                    got the only button on the card. */}
                {(c.customer_phone || navTarget) && (
                  <div className="grid grid-cols-2 gap-2">
                    {c.customer_phone && (
                      <a
                        href={`tel:${c.customer_phone}`}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-800 active:bg-gray-100"
                      >
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    )}
                    {navTarget && (
                      <a
                        href={mapsUrl(navTarget)}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 active:bg-blue-100 ${
                          c.customer_phone ? "" : "col-span-2"
                        }`}
                      >
                        <Navigation className="h-4 w-4" />
                        Navigate
                      </a>
                    )}
                  </div>
                )}

                <CaseDetails details={c.details} />

                <PunchRecord c={c} />

                {/* Two buttons, not five.
                    Accept, Start Travel, Reached and Start Work asked an
                    engineer in gloves outside a customer's premises to drive a
                    four-step workflow, and the office only ever needed two
                    facts from it: that they got there, and that they finished.
                    Each punch also records WHERE it was made, which is what
                    turns "reached 2:40pm" from a claim into something that can
                    be checked.

                    Full width now rather than a button floated at the bottom
                    left: this is the one thing the card exists to do, and it is
                    pressed by a gloved thumb outdoors. */}
                {!c.reached_at && c.status !== "completed" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => onPunchIn(c)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <LogIn className="h-4 w-4" />
                    {busyId === c.id ? "Punching in\u2026" : "Punch In"}
                  </button>
                )}
                {c.reached_at && c.status !== "completed" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.punchOut(c.id, lastFix), c, "")}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-green-600 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                    {busyId === c.id ? "Punching out\u2026" : "Punch Out"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
