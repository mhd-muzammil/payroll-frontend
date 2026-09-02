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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...formData, ...forceValues });
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
