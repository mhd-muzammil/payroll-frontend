import { useEffect, useState } from "react";
import { caseService } from "../../services/caseService";
import { employeeService } from "../../services/employeeService";

const STATUS_BADGE = {
  open: "bg-gray-100 text-gray-700",
  assigned: "bg-indigo-100 text-indigo-700",
  accepted: "bg-blue-100 text-blue-700",
  on_the_way: "bg-cyan-100 text-cyan-700",
  reached: "bg-teal-100 text-teal-700",
  working: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const EMPTY_CASE = {
  customer_name: "",
  customer_phone: "",
  title: "",
  description: "",
  address: "",
  latitude: "",
  longitude: "",
  priority: "medium",
};

/**
 * Admin/HR dispatch board: create a case, see all cases with their live status,
 * and assign each case to a field engineer.
 */
export default function CasesDispatch() {
  const [cases, setCases] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [form, setForm] = useState(EMPTY_CASE);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [caseData, empData] = await Promise.all([caseService.getAll(), employeeService.getAll()]);
      setCases(Array.isArray(caseData) ? caseData : caseData.results || []);
      setEngineers(Array.isArray(empData) ? empData : empData.results || []);
      setErr(null);
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: form.latitude === "" ? null : parseFloat(form.latitude),
        longitude: form.longitude === "" ? null : parseFloat(form.longitude),
      };
      const created = await caseService.create(payload);
      setCases((prev) => [created, ...prev]);
      setForm(EMPTY_CASE);
      setShowForm(false);
      setErr(null);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || "Failed to create case");
    } finally {
      setSaving(false);
    }
  };

  const onAssign = async (caseId, engineerId) => {
    if (!engineerId) return;
    try {
      const updated = await caseService.assign(caseId, engineerId);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to assign");
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cases</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm"
        >
          {showForm ? "Close" : "+ New Case"}
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2 rounded-xl border bg-white p-4">
          <input required placeholder="Customer name" value={form.customer_name} onChange={set("customer_name")} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Customer phone" value={form.customer_phone} onChange={set("customer_phone")} className="border rounded-md px-3 py-2 text-sm" />
          <input required placeholder="Problem title" value={form.title} onChange={set("title")} className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />
          <textarea placeholder="Description" value={form.description} onChange={set("description")} className="border rounded-md px-3 py-2 text-sm sm:col-span-2" rows={2} />
          <input placeholder="Address" value={form.address} onChange={set("address")} className="border rounded-md px-3 py-2 text-sm sm:col-span-2" />
          <input placeholder="Latitude (optional)" value={form.latitude} onChange={set("latitude")} className="border rounded-md px-3 py-2 text-sm" />
          <input placeholder="Longitude (optional)" value={form.longitude} onChange={set("longitude")} className="border rounded-md px-3 py-2 text-sm" />
          <select value={form.priority} onChange={set("priority")} className="border rounded-md px-3 py-2 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <div className="sm:col-span-2">
            <button disabled={saving} className="px-4 py-2 rounded-md bg-green-600 text-white text-sm disabled:opacity-50">
              {saving ? "Saving…" : "Create Case"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Case</th>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-left px-3 py-2">Problem</th>
              <th className="text-left px-3 py-2">Priority</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Engineer</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{c.case_number}</td>
                <td className="px-3 py-2">
                  {c.customer_name}
                  {c.customer_phone && <div className="text-xs text-gray-400">{c.customer_phone}</div>}
                </td>
                <td className="px-3 py-2 max-w-[220px]">
                  <div className="font-medium">{c.title}</div>
                  {c.address && <div className="text-xs text-gray-400 truncate">{c.address}</div>}
                </td>
                <td className="px-3 py-2 capitalize">{c.priority}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] || ""}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={c.assigned_to || ""}
                    onChange={(e) => onAssign(c.id, e.target.value)}
                    className="border rounded-md px-2 py-1 text-xs"
                  >
                    <option value="">— assign —</option>
                    {engineers.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employee_name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  No cases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
