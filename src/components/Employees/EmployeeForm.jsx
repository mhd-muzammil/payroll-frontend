import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronDown, ChevronUp, MapPin, Search, Eye } from "lucide-react";
import { useUsers } from "@/customHook/useUsers";

const initialFormState = {
  user: "",
  employee_name: "",
  branch: "Chennai",
  email: "",
  phone: "",
  role: "",
  department: "",
  salary: "",
  status: "active",
  date_of_joining: "",
  work_lat: "",
  work_lon: "",
  flexible_location: false,
  // Detailed breakdown defaults
  basic: "",
  hra: "",
  conveyance: "",
  child_edu: "",
  personal_allowance: "",
  incentive: "",
  other_earnings: "",
  epf: "",
  esi: "",
  prof_tax: "",
  lwf: "",
  staff_advance: "",
  tds: "",
  other_deduction: "",
  deduction_insurance: "",
  employer_epf: "",
  employer_esi: "",
  employer_insurance: "",
  petrol_allowance: "",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "onleave", label: "On Leave" },
];

const BRANCH_OPTIONS = [
  { value: "Chennai", label: "Chennai" },
  { value: "Vellore", label: "Vellore" },
  { value: "Salem", label: "Salem" },
  { value: "Kanchipuram", label: "Kanchipuram" },
  { value: "Hosur", label: "Hosur" },
];

const formatForInput = (val) => {
  if (val === null || val === undefined || parseFloat(val) === 0) return "";
  return val.toString();
};

const parseVal = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

const EmployeeForm = ({ initialData = null, onSubmit, onCancel, loading = false }) => {
  const [formData, setFormData] = useState(initialFormState);
  const [showPayslipSettings, setShowPayslipSettings] = useState(false);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [searchingLocation, setSearchingLocation] = useState(false);
  const { records: users, fetchAll: fetchUsers } = useUsers();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        user: initialData.user || "",
        employee_name: initialData.employee_name || "",
        branch: initialData.branch || "Chennai",
        email: initialData.email || "",
        phone: initialData.phone || "",
        role: initialData.role || "",
        department: initialData.department || "",
        salary: initialData.salary || "",
        status: initialData.status || "active",
        date_of_joining: initialData.date_of_joining || "",
        work_lat: initialData.work_lat || "",
        work_lon: initialData.work_lon || "",
        flexible_location: Boolean(initialData.flexible_location),
        basic: formatForInput(initialData.basic),
        hra: formatForInput(initialData.hra),
        conveyance: formatForInput(initialData.conveyance),
        child_edu: formatForInput(initialData.child_edu),
        personal_allowance: formatForInput(initialData.personal_allowance),
        incentive: formatForInput(initialData.incentive),
        other_earnings: formatForInput(initialData.other_earnings),
        epf: formatForInput(initialData.epf),
        esi: formatForInput(initialData.esi),
        prof_tax: formatForInput(initialData.prof_tax),
        lwf: formatForInput(initialData.lwf),
        staff_advance: formatForInput(initialData.staff_advance),
        tds: formatForInput(initialData.tds),
        other_deduction: formatForInput(initialData.other_deduction),
        deduction_insurance: formatForInput(initialData.deduction_insurance),
        employer_epf: formatForInput(initialData.employer_epf),
        employer_esi: formatForInput(initialData.employer_esi),
        employer_insurance: formatForInput(initialData.employer_insurance),
        petrol_allowance: formatForInput(initialData.petrol_allowance),
      });
    } else {
      setFormData(initialFormState);
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    // A checkbox carries its answer in `checked`; its `value` is the constant
    // string "on" whether it is ticked or not, so reading value would save the
    // same thing either way.
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...formData };

    const numericalFields = [
      "basic", "hra", "conveyance", "child_edu", "personal_allowance",
      "incentive", "other_earnings", "epf", "esi", "prof_tax", "lwf",
      "staff_advance", "tds", "other_deduction", "deduction_insurance",
      "employer_epf", "employer_esi", "employer_insurance", "petrol_allowance"
    ];

    numericalFields.forEach(field => {
      if (payload[field] === "" || payload[field] === null || payload[field] === undefined) {
        payload[field] = "0";
      }
    });

    if (payload.user === "") {
      payload.user = null;
    }
    if (payload.work_lat === "") {
      payload.work_lat = null;
    }
    if (payload.work_lon === "") {
      payload.work_lon = null;
    }
    // A blank date has to travel as null; the API rejects "" for a DateField.
    if (payload.date_of_joining === "") {
      payload.date_of_joining = null;
    }
    onSubmit(payload);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          work_lat: position.coords.latitude.toFixed(6),
          work_lon: position.coords.longitude.toFixed(6),
        }));
      },
      (error) => {
        console.error("Error fetching location", error);
        alert("Failed to fetch location: " + error.message);
      }
    );
  };

  const handleSearchAddress = async () => {
    if (!addressQuery.trim()) return;
    setSearchingLocation(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressQuery)}`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setFormData((prev) => ({
          ...prev,
          work_lat: parseFloat(lat).toFixed(6),
          work_lon: parseFloat(lon).toFixed(6),
        }));
      } else {
        alert("Location not found. Check spelling or add city/country.");
      }
    } catch (error) {
      console.error("Error searching location", error);
      alert("Search currently unavailable. Please check internet connection.");
    } finally {
      setSearchingLocation(false);
    }
  };

  const handleVerifyOnMap = () => {
    if (formData.work_lat && formData.work_lon) {
      window.open(`https://www.google.com/maps?q=${formData.work_lat},${formData.work_lon}`, "_blank");
    }
  };

  // Spreadsheet Image Calculations (Base Data)
  const grossSumA = (
    parseVal(formData.basic) +
    parseVal(formData.hra) +
    parseVal(formData.conveyance) +
    parseVal(formData.child_edu) +
    parseVal(formData.personal_allowance) +
    parseVal(formData.incentive) +
    parseVal(formData.other_earnings)
  ).toFixed(2);

  const totalDeductionB = (
    parseVal(formData.epf) +
    parseVal(formData.esi) +
    parseVal(formData.deduction_insurance) +
    parseVal(formData.prof_tax) +
    parseVal(formData.lwf) +
    parseVal(formData.staff_advance) +
    parseVal(formData.tds) +
    parseVal(formData.other_deduction)
  ).toFixed(2);

  const netSalary = (parseVal(grossSumA) - parseVal(totalDeductionB)).toFixed(2);

  const totalBenefitsC = (
    parseVal(formData.employer_epf) +
    parseVal(formData.employer_esi) +
    parseVal(formData.employer_insurance) +
    parseVal(formData.petrol_allowance)
  ).toFixed(2);

  const totalCTC = (parseVal(grossSumA) + parseVal(totalBenefitsC)).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 rounded-3xl bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {initialData ? "Edit Employee" : "Add Employee"}
          </h2>
          <button
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Employee Name</label>
              <input
                type="text"
                name="employee_name"
                value={formData.employee_name}
                onChange={handleChange}
                required
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Branch</label>
              <select
                name="branch"
                value={formData.branch}
                onChange={handleChange}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              >
                {BRANCH_OPTIONS.map((branch) => (
                  <option key={branch.value} value={branch.value}>
                    {branch.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">User Account</label>
            <select
              name="user"
              value={formData.user || ""}
              onChange={handleChange}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            >
              <option value="">-- Not Linked (Select User Account) --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Optional"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Phone</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Optional"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Role</label>
              <input
                type="text"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Department</label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                required
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
              />
            </div>
          </div>

          <div>
            {/* The Employees list flags "No DOJ" and tells HR to fix it by
                editing the employee — and there was no field here to do it in.
                This is the real hire date (date_of_joining), the one casual-leave
                accrual and the payslip read; the separate joining_date column is
                auto-stamped at row creation and cannot be set by anyone. */}
            <label className="mb-1.5 block text-sm font-medium">Date of Joining</label>
            <input
              type="date"
              name="date_of_joining"
              value={formData.date_of_joining}
              onChange={handleChange}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Filled automatically from Onboarding. Used for casual-leave accrual and the payslip.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Salary (Gross Total)</label>
            <input
              type="number"
              name="salary"
              value={formData.salary}
              onChange={handleChange}
              required
              step="0.01"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            />
          </div>

          <div className="border border-border/60 rounded-2xl bg-muted/10 p-4 transition-all">
            <button
              type="button"
              onClick={() => setShowPayslipSettings(!showPayslipSettings)}
              className="flex items-center justify-between w-full text-left font-semibold text-sm text-primary hover:text-primary-dark transition-colors"
            >
              <span>Detailed Salary & Payslip Structure (Base)</span>
              <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                {showPayslipSettings ? "Hide settings" : "Customize breakdown"}
                {showPayslipSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {showPayslipSettings && (
              <div className="mt-4 space-y-5 border-t border-border/50 pt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                
                {/* 1. Monthly Earnings (Gross Salary A) */}
                <div className="bg-indigo-50/30 dark:bg-indigo-950/10 p-3.5 rounded-xl border border-indigo-100/50">
                  <h4 className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span> Particulars (Monthly Earnings)
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Basic</span>
                      <input type="number" name="basic" value={formData.basic} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-indigo-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">HRA</span>
                      <input type="number" name="hra" value={formData.hra} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-indigo-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Conveyance</span>
                      <input type="number" name="conveyance" value={formData.conveyance} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-indigo-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">CEA (Child Edu Allowance)</span>
                      <input type="number" name="child_edu" value={formData.child_edu} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-indigo-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Personal Allowances</span>
                      <input type="number" name="personal_allowance" value={formData.personal_allowance} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-indigo-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-indigo-500 focus:outline-none" />
                    </div>
                    
                    <div className="mt-3 pt-2 border-t border-dashed border-indigo-200/50 flex items-center justify-between bg-amber-50/40 dark:bg-amber-950/10 p-2 rounded-md border border-amber-100/50">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-400">Gross Salary(A)</span>
                      <span className="text-xs font-black text-amber-800 dark:text-amber-400">₹{grossSumA}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Monthly Deductions (Total B) */}
                <div className="bg-rose-50/30 dark:bg-rose-950/10 p-3.5 rounded-xl border border-rose-100/50">
                  <h4 className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> Deduction:
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">EPF</span>
                      <input type="number" name="epf" value={formData.epf} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-rose-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-rose-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">ESI</span>
                      <input type="number" name="esi" value={formData.esi} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-rose-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-rose-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Insurance</span>
                      <input type="number" name="deduction_insurance" value={formData.deduction_insurance} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-rose-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-rose-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Professional Tax</span>
                      <input type="number" name="prof_tax" value={formData.prof_tax} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-rose-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-rose-500 focus:outline-none" />
                    </div>
                    
                    <div className="mt-3 pt-2 border-t border-dashed border-rose-200/50 flex items-center justify-between bg-zinc-100/50 dark:bg-zinc-800/40 p-2 rounded-md">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Total(B)</span>
                      <span className="text-xs font-black text-zinc-700 dark:text-zinc-300">₹{totalDeductionB}</span>
                    </div>
                  </div>
                </div>

                {/* Standalone Net Take-Home Card */}
                <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 p-3 rounded-xl flex items-center justify-between shadow-sm">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold tracking-wide text-emerald-600">Take-Home Pay</span>
                    <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">Net Salary(A-B)</span>
                  </div>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">₹{netSalary}</span>
                </div>

                {/* 3. Benefits (Total C) */}
                <div className="bg-sky-50/30 dark:bg-sky-950/10 p-3.5 rounded-xl border border-sky-100/50">
                  <h4 className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500"></span> Benefits (Cost to Company):
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Employer EPF Contribution</span>
                      <input type="number" name="employer_epf" value={formData.employer_epf} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-sky-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-sky-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Employer ESI Contribution</span>
                      <input type="number" name="employer_esi" value={formData.employer_esi} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-sky-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-sky-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Insurance (Employer Contribution)</span>
                      <input type="number" name="employer_insurance" value={formData.employer_insurance} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-sky-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-sky-500 focus:outline-none" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground font-medium">Petrol allowance</span>
                      <input type="number" name="petrol_allowance" value={formData.petrol_allowance} onChange={handleChange} step="0.01"
                        className="h-8 w-32 rounded-lg border border-sky-200/60 bg-background px-2.5 text-xs text-right focus:ring-1 focus:ring-sky-500 focus:outline-none" />
                    </div>
                    
                    <div className="mt-3 pt-2 border-t border-dashed border-sky-200/50 flex items-center justify-between bg-sky-100/30 dark:bg-sky-900/20 p-2 rounded-md">
                      <span className="text-xs font-bold text-sky-800 dark:text-sky-300">Total(C)</span>
                      <span className="text-xs font-black text-sky-800 dark:text-sky-300">₹{totalBenefitsC}</span>
                    </div>
                  </div>
                </div>

                {/* Miscellaneous / Other Adjustments Group */}
                <div className="rounded-2xl border border-violet-100 bg-violet-50/30 p-3 dark:border-violet-950/50 dark:bg-violet-950/10 shadow-sm">
                  <div className="mb-2 flex items-center gap-2 border-b border-violet-100 pb-1.5 dark:border-violet-950/50">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Other Adjustments (Optional)
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">Incentive</label>
                      <input
                        type="number"
                        name="incentive"
                        value={formData.incentive}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">Other Earnings</label>
                      <input
                        type="number"
                        name="other_earnings"
                        value={formData.other_earnings}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">LWF Deduction</label>
                      <input
                        type="number"
                        name="lwf"
                        value={formData.lwf}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">Staff Advance</label>
                      <input
                        type="number"
                        name="staff_advance"
                        value={formData.staff_advance}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">TDS (Income Tax)</label>
                      <input
                        type="number"
                        name="tds"
                        value={formData.tds}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-0.5 font-medium">Other Deduction</label>
                      <input
                        type="number"
                        name="other_deduction"
                        value={formData.other_deduction}
                        onChange={handleChange}
                        step="0.01"
                        className="h-8 w-full rounded-lg border border-border bg-background px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-violet-500/30 transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Total Cost-to-Company Standout Card */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-md ring-2 ring-amber-500/20">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-black tracking-wider text-amber-100">Total Compensation Package</span>
                    <span className="text-sm font-black">CTC(A+C)</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-black leading-none">₹{totalCTC}</span>
                    <span className="text-[9px] opacity-80">Per Month</span>
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="border border-border/60 rounded-2xl bg-muted/10 p-4 transition-all">
            <button
              type="button"
              onClick={() => setShowLocationSettings(!showLocationSettings)}
              className="flex items-center justify-between w-full text-left font-semibold text-sm text-primary hover:text-primary-dark transition-colors"
            >
              <span>Work Location (GPS Tracking)</span>
              <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                {showLocationSettings ? "Hide settings" : "Customize location"}
                {showLocationSettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {/* Outside the fold, directly under the heading: this is the switch
                that decides whether the coordinates behind "Customize location"
                mean anything at all, so burying it inside them would hide the
                answer behind the question. */}
            <label
              className={`mt-3 flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                formData.flexible_location
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/60 bg-background hover:bg-muted/30"
              }`}
            >
              <input
                type="checkbox"
                name="flexible_location"
                checked={Boolean(formData.flexible_location)}
                onChange={handleChange}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Flexible location</span>
                <span className="block text-xs text-muted-foreground">
                  This employee can mark attendance from anywhere. The work location below is
                  ignored — for field engineers and anyone not tied to one office.
                </span>
              </span>
            </label>

            {showLocationSettings && (
              <div className="mt-4 space-y-4 border-t border-border/50 pt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Kept editable rather than disabled: HR may well be setting an
                    office for someone whose flexible flag comes off later, and
                    a field that silently refuses to type in is worse than one
                    that says plainly it is not being used. */}
                {formData.flexible_location && (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                    Flexible location is on, so nothing below is enforced. Attendance will be
                    accepted from anywhere.
                  </p>
                )}
                
                {/* Address Search Component */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-foreground">Dynamic Place / Address Search</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                      <input
                        type="text"
                        placeholder="Search landmark, city or area..."
                        value={addressQuery}
                        onChange={(e) => setAddressQuery(e.target.value)}
                        className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary-glow"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSearchAddress();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchAddress}
                      disabled={searchingLocation || !addressQuery.trim()}
                      className="h-10 px-4 bg-secondary/10 hover:bg-secondary/20 text-secondary-foreground border border-secondary/20 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {searchingLocation ? "Searching..." : "Search"}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 italic">Automatically computes GPS coordinates using dynamic address lookup.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Work Latitude</label>
                    <input
                      type="number"
                      name="work_lat"
                      value={formData.work_lat}
                      onChange={handleChange}
                      step="0.000001"
                      placeholder="e.g., 13.0827"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Work Longitude</label>
                    <input
                      type="number"
                      name="work_lon"
                      value={formData.work_lon}
                      onChange={handleChange}
                      step="0.000001"
                      placeholder="e.g., 80.2707"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                {/* Multi-Action Widget */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary/5 text-primary hover:bg-primary/10 border border-primary/10 font-semibold text-xs transition-all"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Detect Live GPS
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyOnMap}
                    disabled={!formData.work_lat || !formData.work_lon}
                    className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-transparent font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Verify on Map
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-glow"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="brand" size='pill' type="submit" disabled={loading} className="flex-1">
              {loading ? "Saving..." : initialData ? "Update" : "Create"}
            </Button>
            <Button type="button" variant="outline" size='pill' onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeForm;
