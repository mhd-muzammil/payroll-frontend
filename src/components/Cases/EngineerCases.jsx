import { useEffect, useState } from "react";
import { caseService } from "../../services/caseService";
import { useLiveTracking } from "../../customHook/useLiveTracking";

const STATUS_LABEL = {
  assigned: "Assigned",
  accepted: "Accepted",
  on_the_way: "On the way",
  reached: "Reached",
  working: "Working",
  completed: "Completed",
  cancelled: "Cancelled",
};

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

  const { tracking, lastFix, error: trackErr, start, stop, setContext } = useLiveTracking();

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
    if (!tracking) start(c.id, "on_the_way");
    else setContext(c.id, "on_the_way");
    runAction(() => caseService.startTravel(c.id), c, "on_the_way");
  };

  const openInMaps = (c) => {
    if (c.latitude != null && c.longitude != null) {
      window.open(`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=17/${c.latitude}/${c.longitude}`, "_blank");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">My Cases</h1>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
              tracking ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${tracking ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            {tracking ? "Tracking ON" : "Tracking OFF"}
          </span>
          {tracking ? (
            <button onClick={stop} className="px-3 py-1 rounded-md bg-red-600 text-white">
              Stop Duty
            </button>
          ) : (
            <button onClick={() => start(null, "on_duty")} className="px-3 py-1 rounded-md bg-green-600 text-white">
              Start Duty
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

              <div className="text-sm text-gray-600 space-y-0.5">
                <p>👤 {c.customer_name} {c.customer_phone && `· ${c.customer_phone}`}</p>
                {c.address && <p>📍 {c.address}</p>}
                {c.description && <p className="text-gray-500">{c.description}</p>}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-700">{STATUS_LABEL[c.status] || c.status}</span>
                {c.latitude != null && (
                  <button onClick={() => openInMaps(c)} className="text-xs text-blue-600 underline">
                    Open in map
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {c.status === "assigned" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.accept(c.id), c)}
                    className="px-2.5 py-1 text-xs rounded-md bg-indigo-600 text-white disabled:opacity-50"
                  >
                    Accept
                  </button>
                )}
                {(c.status === "assigned" || c.status === "accepted") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => onStartTravel(c)}
                    className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white disabled:opacity-50"
                  >
                    Start Travel
                  </button>
                )}
                {c.status === "on_the_way" && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.reached(c.id), c, "working")}
                    className="px-2.5 py-1 text-xs rounded-md bg-teal-600 text-white disabled:opacity-50"
                  >
                    Reached
                  </button>
                )}
                {(c.status === "reached" || c.status === "on_the_way") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.startWork(c.id), c, "working")}
                    className="px-2.5 py-1 text-xs rounded-md bg-amber-600 text-white disabled:opacity-50"
                  >
                    Start Work
                  </button>
                )}
                {(c.status === "working" || c.status === "reached") && (
                  <button
                    disabled={busyId === c.id}
                    onClick={() => runAction(() => caseService.complete(c.id), c, "")}
                    className="px-2.5 py-1 text-xs rounded-md bg-green-600 text-white disabled:opacity-50"
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
