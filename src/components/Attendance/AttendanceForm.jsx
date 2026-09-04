// components/AttendanceForm.jsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { toLocalDateTimeInput } from "../../Utility/attendanceUtils";

const initialFormState = {
  employee_name: "",
  role: "",
  department: "",
  salary: "",
  intime: "",
  outtime: "",
  status: "Present",
};

const STATUS_OPTIONS = ["Present", "Absent", "Leave", "Late", "overTime"];

// Nobody punches in on a day they did not come in, so these ask for the date
// instead of a clock time -- and they have to ask for something, because a
// record with no date is filtered out of every list on the page and can never
// be seen again.
const NO_PUNCH = new Set(["Absent", "Leave"]);

/** "2026-09-04T00:00" from "2026-09-04", the way the Excel import stores it. */
const dayStart = (date) => (date ? `${date}T00:00` : "");

/** The date half of a datetime-local value, for moving between the two. */
const dayOf = (value) => (value ? String(value).slice(0, 10) : "");

const AttendanceForm = ({ 
  initialData = null, 
  onSubmit, 
  onCancel, 
  loading = false,
  lockedFields = {},
  forceValues = {}
}) => {
  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (initialData) {
      setFormData({
        employee_name: initialData.employee_name || "",
        role: initialData.role || "",
        department: initialData.department || "",
        salary: initialData.salary || "",
        intime: toLocalDateTimeInput(initialData.intime),
        outtime: toLocalDateTimeInput(initialData.outtime),
        status: initialData.status || "Present",
      });
      return;
    }
    setFormData((prev) => ({ ...prev, ...forceValues }));
  }, [initialData, forceValues]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const noPunch = NO_PUNCH.has(formData.status);

  const handleSubmit = (e) => {
    e.preventDefault();
    // An emptied time means "there was no such punch", and the API says that
    // with null. Sent as "" it comes back 400 -- "Datetime has wrong format" --
    // so a wrong Clock Out could not be cleared at all. That is exactly what
    // somebody needs cleared when an engineer taps Logout by mistake a minute
    // after logging in: the day reads as finished and their app offers them
    // nothing for the rest of it.
    const payload = { ...formData, ...forceValues };
    // An absent day carries the date and nothing else: midnight on that date,
    // which is where the page reads the date from and what the import writes.
    if (NO_PUNCH.has(payload.status)) {
      payload.intime = dayStart(dayOf(payload.intime));
      payload.outtime = null;
    }
    for (const field of ["intime", "outtime"]) {
      if (payload[field] === "") payload[field] = null;
    }
    onSubmit(payload);
  };

  return (
    // Same cap as the other overlays: without it a short viewport puts the
    // save button out of reach, since a fixed layer never scrolls the document.
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm py-4">
      <div className="bg-card rounded-3xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">
            {initialData ? "Edit Attendance" : "Add Attendance"}
          </h2>
          <button
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Employee Name
            </label>
            <input
              type="text"
              name="employee_name"
              value={formData.employee_name}
              onChange={handleChange}
              disabled={lockedFields.employee_name}
              required
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Role</label>
              <input
                type="text"
                name="role"
                value={formData.role}
                onChange={handleChange}
                disabled={lockedFields.role}
                required
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Department
              </label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                disabled={lockedFields.department}
                required
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Salary</label>
            <input
              type="number"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              disabled={lockedFields.salary}
              required
              step="0.01"
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
          </div>

          {noPunch ? (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Date</label>
              <input
                type="date"
                name="intime"
                value={dayOf(formData.intime)}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, intime: dayStart(e.target.value) }))
                }
                disabled={lockedFields.intime}
                required
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Which day they were {String(formData.status).toLowerCase()}. There is no
                clock in or out on it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Clock In
                </label>
                <input
                  type="datetime-local"
                  name="intime"
                  value={formData.intime}
                  onChange={handleChange}
                  disabled={lockedFields.intime}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Clock Out
                </label>
                <input
                  type="datetime-local"
                  name="outtime"
                  value={formData.outtime}
                  onChange={handleChange}
                  disabled={lockedFields.outtime}
                  className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "overTime" ? "Overtime" : status}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
            variant="brand"
              size="pill"
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Saving..." : initialData ? "Update" : "Create"}
            </Button>
            <Button
            size="pill"
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceForm;
