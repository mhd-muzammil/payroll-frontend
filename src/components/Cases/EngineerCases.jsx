import { useEffect, useState } from "react";
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
    return <span className="text-xs font-medium text-gray-500">Cancelled</span>;
  }
  if (!c.reached_at) {
    return <span className="text-xs font-medium text-gray-500">Not punched in</span>;
  }
  return (
    <span className="text-xs font-medium text-gray-700">
      <span className="text-indigo-700">In {clockTime(c.reached_at)}</span>
      {c.completed_at && (
        <span className="text-green-700"> · Out {clockTime(c.completed_at)}</span>
      )}
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

const PRIORITY_COLOR = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

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
  } = useDuty();

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

  const openInMaps = (c) => {
    if (c.latitude != null && c.longitude != null) {
      window.open(mapsUrl(`${c.latitude},${c.longitude}`), "_blank", "noopener");
    }
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
          {cases.map((c) => (
            <div key={c.id} className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-gray-400">{c.case_number}</p>
                  <p className="font-semibold">{c.title}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[c.priority] || ""}`}>
                  {c.priority}
                </span>
              </div>

              <div className="text-sm text-gray-600 space-y-1">
                <p className="font-medium text-gray-800">👤 {c.customer_name}</p>
                {/* Tappable, because the first thing an engineer does is ring
                    the customer and then navigate to them. */}
                {c.customer_phone && (
                  <a
                    href={`tel:${c.customer_phone}`}
                    className="inline-flex items-center min-h-9 text-blue-600"
                  >
                    📞 {c.customer_phone}
                  </a>
                )}
                {c.address && (
                  <a
                    href={mapsUrl(c.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-blue-600"
                  >
                    📍 {c.address}
                  </a>
                )}
                {c.description && <p className="text-gray-500">{c.description}</p>}
              </div>

              <CaseDetails details={c.details} />

              <div className="flex items-center justify-between">
                <PunchRecord c={c} />
                {c.latitude != null && (
                  <button
                    onClick={() => openInMaps(c)}
                    className="inline-flex items-center min-h-10 px-3 rounded-lg border border-blue-200 text-sm text-blue-600"
                  >
                    Open in map
                  </button>
                )}
              </div>

              {/* Two buttons, not five.
                  Accept, Start Travel, Reached and Start Work asked an engineer
                  in gloves outside a customer's premises to drive a four-step
                  workflow, and the office only ever needed two facts from it:
                  that they got there, and that they finished. Each punch also
                  records WHERE it was made, which is what turns "reached 2:40pm"
                  from a claim into something that can be checked.

                  Gloved thumbs outdoors: every control here is a 44px target
                  with real space between, not a 24px chip. */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                {!c.reached_at && c.status !== "completed" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => onPunchIn(c)}
                    className="min-h-11 px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                  >
                    Punch In
                  </button>
                )}
                {c.reached_at && c.status !== "completed" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.punchOut(c.id, lastFix), c, "")}
                    className="min-h-11 px-5 py-2.5 text-sm font-semibold rounded-lg bg-green-600 text-white disabled:opacity-50"
                  >
                    Punch Out
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
