import { useEffect, useState } from "react";
import { caseService } from "../../services/caseService";
import { useDuty } from "../../context/DutyContext";

const STATUS_LABEL = {
  assigned: "Assigned",
  accepted: "Accepted",
  on_the_way: "On the way",
  reached: "Reached",
  working: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

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

  const onStartTravel = (c) => {
    // Heading to a job implies being on duty; start it if they haven't.
    if (!onDuty) startDuty();
    setContext(c.id, "on_the_way");
    runAction(() => caseService.startTravel(c.id), c, "on_the_way");
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
      {(err || trackErr) && <p className="text-sm text-red-600">{err || trackErr}</p>}

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
                <span className="text-xs font-medium text-blue-700">{STATUS_LABEL[c.status] || c.status}</span>
                {c.latitude != null && (
                  <button
                    onClick={() => openInMaps(c)}
                    className="inline-flex items-center min-h-10 px-3 rounded-lg border border-blue-200 text-sm text-blue-600"
                  >
                    Open in map
                  </button>
                )}
              </div>

              {/* Gloved thumbs outdoors: every control on this screen is a
                  44px target with real space between, not a 24px chip. */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                {c.status === "assigned" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.accept(c.id), c)}
                    className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                )}
                {(c.status === "assigned" || c.status === "accepted") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => onStartTravel(c)}
                    className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50"
                  >
                    Start Travel
                  </button>
                )}
                {c.status === "on_the_way" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.reached(c.id), c, "working")}
                    className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-teal-600 text-white disabled:opacity-50"
                  >
                    Reached
                  </button>
                )}
                {(c.status === "reached" || c.status === "on_the_way") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.startWork(c.id), c, "working")}
                    className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
                  >
                    Start Work
                  </button>
                )}
                {(c.status === "working" || c.status === "reached") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.complete(c.id), c, "")}
                    className="min-h-11 px-4 py-2.5 text-sm rounded-lg bg-green-600 text-white disabled:opacity-50"
                  >
                    Complete
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
