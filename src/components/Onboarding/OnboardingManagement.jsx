import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { UserPlus, FileCheck, Clock, CheckCircle2, Eye, X, Calendar, Briefcase, MapPin, Mail, Phone, CreditCard, Building2, ExternalLink, FileText, Trash2, UserCheck, UserMinus, Pencil } from "lucide-react";
import PageHeader from "../ui/PageHeader";
import DataTable from "../ui/DataTable";
import StatsCard from "../ui/StatsCard";
import OnboardingForm from "./OnboardingForm";
import { onboardingService } from "../../services/onboardingService";
import { employeeService } from "../../services/employeeService";
import { api } from "../../api/Api";
import { extractArray } from "../../Utility/apiUtils";

const regionStyles = {
  Chennai: {
    bg: "from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10",
    border: "border-indigo-100 dark:border-indigo-950/50",
    iconBg: "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400",
    bar: "from-indigo-500 to-purple-500",
    text: "text-indigo-700 dark:text-indigo-300"
  },
  Vellore: {
    bg: "from-blue-50/50 to-sky-50/30 dark:from-blue-950/20 dark:to-sky-950/10",
    border: "border-blue-100 dark:border-blue-950/50",
    iconBg: "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400",
    bar: "from-blue-500 to-sky-500",
    text: "text-blue-700 dark:text-blue-300"
  },
  Salem: {
    bg: "from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10",
    border: "border-emerald-100 dark:border-emerald-950/50",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400",
    bar: "from-emerald-500 to-teal-500",
    text: "text-emerald-700 dark:text-emerald-300"
  },
  Kanchipuram: {
    bg: "from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10",
    border: "border-amber-100 dark:border-amber-950/50",
    iconBg: "bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400",
    bar: "from-amber-500 to-orange-500",
    text: "text-amber-700 dark:text-amber-300"
  },
  Hosur: {
    bg: "from-rose-50/50 to-pink-50/30 dark:from-rose-950/20 dark:to-rose-950/10",
    border: "border-rose-100 dark:border-rose-950/50",
    iconBg: "bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400",
    bar: "from-rose-500 to-pink-500",
    text: "text-rose-700 dark:text-rose-300"
  }
};

const defaultStyle = {
  bg: "from-gray-50/50 to-slate-50/30 dark:from-gray-950/20 dark:to-slate-950/10",
  border: "border-gray-100 dark:border-gray-950/50",
  iconBg: "bg-gray-100 dark:bg-gray-950/80 text-gray-600 dark:text-gray-400",
  bar: "from-gray-500 to-slate-500",
  text: "text-gray-700 dark:text-gray-300"
};

const OnboardingManagement = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [employeeStats, setEmployeeStats] = useState({ current: 0, separated: 0 });
  const [selectedRegion, setSelectedRegion] = useState("");

  const handleViewDocument = async (documentUrl) => {
    const popup = window.open("", "_blank");
    try {
      const response = await api.get(documentUrl, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(response.data);

      if (popup) {
        popup.opener = null;
        popup.location = blobUrl;
      } else {
        window.open(blobUrl, "_blank", "noopener,noreferrer");
      }

      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      popup?.close();
      console.error("Failed to open protected document:", error);
      alert("Unable to open this document. Please sign in again and retry.");
    }
  };

  const fetchOnboardings = async () => {
    setLoading(true);
    try {
      const [onboardingData, employeeData] = await Promise.all([
        onboardingService.getAll(),
        employeeService.getAll()
      ]);
      
      const safeOnboardingData = extractArray(onboardingData);
      const safeEmployeeData = extractArray(employeeData);
      
      setRecords(safeOnboardingData);

      // Calculate counts of current employees (active, onleave) and separated employees (inactive) ONLY IF they were onboarded
      const onboardedEmails = new Set(safeOnboardingData.map(o => o.email_id?.toLowerCase()));
      const onboardedNames = new Set(safeOnboardingData.map(o => o.employee_name?.toLowerCase()));

      const onboardedEmployees = safeEmployeeData.filter(e => 
        (e.email && onboardedEmails.has(e.email.toLowerCase())) || 
        (e.employee_name && onboardedNames.has(e.employee_name.toLowerCase()))
      );

      const current = onboardedEmployees.filter(e => e.status === "active" || e.status === "onleave").length;
      const separated = onboardedEmployees.filter(e => e.status === "inactive").length;
      setEmployeeStats({ current, separated });
    } catch (error) {
      console.error("Failed fetching onboarding or employee data", error);
    }
    setLoading(false);
  };


  const handleDelete = async () => {
    if (!deleteConfirm?.id) return;
    try {
      await onboardingService.delete(deleteConfirm.id);
      // Remove record locally
      setRecords(prev => prev.filter(r => r.id !== deleteConfirm.id));
    } catch (error) {
      console.error("Failed to delete onboarding record", error);
    } finally {
      setDeleteConfirm(null);
    }
  };


  useEffect(() => {
    fetchOnboardings();
  }, []);

  const buildFormData = (formData) => {
    const data = new FormData();

    // Basic details
    data.append("employee_name", formData.employeeName);
    data.append("employee_id", formData.employeeId || "");
    data.append("department", formData.department);
    data.append("designation", formData.designation);
    data.append("work_location", formData.workLocation);
    data.append("date_of_joining", formData.dateOfJoining);
    data.append("mobile_number", formData.mobileNumber);
    data.append("email_id", formData.emailId);

    // Personal and emergency details
    if (formData.dob) data.append("dob", formData.dob);
    data.append("gender", formData.gender || "");
    data.append("blood_group", formData.bloodGroup || "");
    data.append("address", formData.address || "");
    data.append("tshirt_size", formData.tShirtSize || "");
    data.append("emergency_contact_name", formData.emergencyName || "");
    data.append("emergency_relationship", formData.relationship || "");
    data.append("emergency_number", formData.emergencyNumber || "");

    // Bank details
    data.append("bank_name", formData.bankName || "");
    data.append("account_holder_name", formData.accountHolderName || "");
    data.append("account_number", formData.accountNumber || "");
    data.append("ifsc_code", formData.ifscCode || "");
    data.append("bank_branch", formData.bankBranch || "");
    if (formData.cancelledCheque) {
      data.append("cancelled_cheque", formData.cancelledCheque);
    }

    // ID card details
    data.append("photo_submitted", formData.photoSubmitted || "");
    data.append("id_card_blood_group", formData.idCardBloodGroup || "");

    // Documents files (only appended when a new file is selected)
    if (formData.docs.aadhaar) data.append("doc_aadhaar", formData.docs.aadhaar);
    if (formData.docs.pan) data.append("doc_pan", formData.docs.pan);
    if (formData.docs.bankProof) data.append("doc_bank_proof", formData.docs.bankProof);
    if (formData.docs.passportPhoto) data.append("doc_passport_photo", formData.docs.passportPhoto);
    if (formData.docs.educationCert) data.append("doc_education_cert", formData.docs.educationCert);
    if (formData.docs.resume) data.append("doc_resume", formData.docs.resume);
    if (formData.docs.drivingLicense) data.append("doc_driving_license", formData.docs.drivingLicense);

    // Extra info
    data.append("total_experience", formData.totalExperience || "");
    data.append("hp_experience", formData.hpExperience || "");
    data.append("skills", formData.skills || "");

    return data;
  };

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    try {
      const data = buildFormData(formData);

      if (editingRecord) {
        // Editing keeps the existing status untouched (partial update).
        await onboardingService.update(editingRecord.id, data);
        await fetchOnboardings();
        setEditingRecord(null);
        setShowForm(false);
        alert("Onboarding details updated for " + formData.employeeName + ".");
      } else {
        data.append("status", "Completed");
        await onboardingService.create(data);
        await fetchOnboardings();
        setShowForm(false);
        alert("Successfully onboarded " + formData.employeeName + "! Profile connected to Employee and Payslips.");
      }
    } catch (error) {
      console.error("Failed submitting onboarding:", error);
      alert("Submission failed. Check if all required fields are filled.");
    } finally {
      setSubmitting(false);
    }
  };

  const safeRecords = Array.isArray(records) ? records : [];

  const stats = useMemo(() => {
    const total = safeRecords.length;
    const completed = safeRecords.filter(r => r.status === "Completed").length;
    const progress = safeRecords.filter(r => r.status === "In Progress").length;
    return { total, completed, progress };
  }, [safeRecords]);

  const regionStats = useMemo(() => {
    const regions = ["Chennai", "Vellore", "Salem", "Kanchipuram", "Hosur"];
    const stats = {
      Chennai: 0,
      Vellore: 0,
      Salem: 0,
      Kanchipuram: 0,
      Hosur: 0,
      "Not Assigned": 0,
    };
    safeRecords.forEach((r) => {
      const loc = r.work_location;
      if (loc) {
        const matched = regions.find((reg) => reg.toLowerCase() === loc.trim().toLowerCase());
        if (matched) {
          stats[matched] += 1;
        } else {
          stats["Not Assigned"] += 1;
        }
      } else {
        stats["Not Assigned"] += 1;
      }
    });
    return stats;
  }, [safeRecords]);

  const filteredRecords = useMemo(() => {
    if (!selectedRegion) return safeRecords;
    return safeRecords.filter((r) => {
      const loc = r.work_location || "Not Assigned";
      return loc.toLowerCase() === selectedRegion.toLowerCase();
    });
  }, [safeRecords, selectedRegion]);

  if (showForm || editingRecord) {
    return (
      <OnboardingForm
        onCancel={() => { setShowForm(false); setEditingRecord(null); }}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
        initialData={editingRecord}
      />
    );
  }

  if (loading && safeRecords.length === 0 && !showForm) {
    return <div className="p-6 text-center text-muted-foreground">Loading Onboarding Data...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        description="Manage internal employee onboarding information."
        actions={
          <Button
            variant="brand"
            size="pill"
            icon={UserPlus}
            onClick={() => setShowForm(true)}
          >
            New Onboarding
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6 mb-6">
        <button
          onClick={() => setSelectedRegion("")}
          className={`text-left w-full transition-all duration-300 ${
            selectedRegion !== "" 
              ? "opacity-60 hover:opacity-100 scale-[0.98]" 
              : "ring-2 ring-primary ring-offset-2 dark:ring-offset-background rounded-3xl shadow-lg scale-[1.02]"
          }`}
        >
          <StatsCard label="Total Onboarded" value={stats.total.toString()} icon={FileCheck} accent="primary" />
        </button>
        <StatsCard label="Completed" value={stats.completed.toString()} icon={CheckCircle2} accent="success" />
        <StatsCard label="In Progress" value={stats.progress.toString()} icon={Clock} accent="warning" />
        <StatsCard label="Current Employee" value={employeeStats.current.toString()} icon={UserCheck} accent="info" />
        <StatsCard label="Ex-employee" value={employeeStats.separated.toString()} icon={UserMinus} accent="muted" />
      </div>

      {/* Region-Wise Onboarding Distribution */}
      <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xs mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-base font-bold tracking-tight text-foreground">Region-Wise Onboarding Distribution</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {Object.entries(regionStats).map(([region, count]) => {
            const style = regionStyles[region] || defaultStyle;
            const isSelected = selectedRegion.toLowerCase() === region.toLowerCase();
            const hasActiveFilter = selectedRegion !== "";

            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(prev => prev.toLowerCase() === region.toLowerCase() ? "" : region)}
                className={`bg-gradient-to-br ${style.bg} border ${style.border} rounded-2xl p-4 md:p-5 flex flex-col justify-between text-left transition-all duration-300 ${
                  isSelected 
                    ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                    : hasActiveFilter 
                      ? "opacity-50 hover:opacity-100 scale-[0.95]" 
                      : "hover:shadow-sm hover:scale-[1.02]"
                }`}
              >
                <span className={`font-bold text-xs md:text-sm tracking-tight ${style.text}`}>{region}</span>
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{count}</span>
                  <span className="text-xs font-semibold text-muted-foreground">onboarded</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        data={filteredRecords}
        columns={[
          {
            key: "name",
            label: "Employee",
            render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.employee_name} />
                <div>
                  <div className="font-medium text-sm">{r.employee_name}</div>
                  <div className="text-xs text-muted-foreground">{r.email_id}</div>
                </div>
              </div>
            ),
          },
          { key: "department", label: "Department", render: (r) => <Badge variant="outline">{r.department}</Badge> },
          { key: "designation", label: "Designation", render: (r) => <span className="text-sm">{r.designation}</span> },
          { key: "work_location", label: "Work Location", render: (r) => <span className="text-sm font-medium">{r.work_location || "Not Assigned"}</span> },
          { key: "joining", label: "Joining Date", render: (r) => <span className="text-sm text-muted-foreground">{r.date_of_joining}</span> },
          { key: "contact", label: "Contact", render: (r) => <span className="text-sm font-mono">{r.mobile_number}</span> },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <Badge variant={r.status === "Completed" ? "success" : "warning"}>
                {r.status}
              </Badge>
            ),
          },
          {
            key: "act",
            label: "",
            className: "w-20",
            render: (r) => (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setViewingRecord(r)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-primary/10 hover:text-primary transition-colors"
                  title="View Detailed Form & Documents"
                  type="button"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setEditingRecord(r)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-amber-50 hover:text-amber-600 transition-colors"
                  title="Edit Onboarding Record"
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(r)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-red-50 hover:text-red-500 transition-colors"
                  title="Delete Onboarding Record"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
      />

      {viewingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl bg-card rounded-3xl shadow-2xl border border-border flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
              <div className="flex items-center gap-3">
                <Avatar name={viewingRecord.employee_name} className="h-10 w-10" />
                <div>
                  <h3 className="text-lg font-semibold leading-none text-foreground">{viewingRecord.employee_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">Onboarded Information Profile</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={viewingRecord.status === "Completed" ? "success" : "warning"}>
                  {viewingRecord.status}
                </Badge>
                <button onClick={() => setViewingRecord(null)} className="rounded-full p-1.5 hover:bg-muted transition-colors ml-2">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Content Grid */}
            <div className="overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              
              {/* 1. Basic Information */}
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-2xl">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-primary" /> Basic Details
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">Employee ID</span>
                      <span className="font-semibold font-mono">{viewingRecord.employee_id || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Designation & Dept</span>
                      <span className="font-medium">{viewingRecord.designation}</span>
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-2 inline-block font-medium">{viewingRecord.department}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Joining Date & Location</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{viewingRecord.date_of_joining}</span>
                        <span className="text-muted-foreground mx-1">•</span>
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{viewingRecord.work_location}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Info */}
                <div className="bg-muted/30 p-4 rounded-2xl">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-3">Personal Details</h4>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-muted-foreground block">DOB</span>
                        <span className="font-medium">{viewingRecord.dob || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Gender</span>
                        <span className="font-medium">{viewingRecord.gender || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Blood Group</span>
                        <span className="font-medium text-red-500">{viewingRecord.blood_group || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">T-Shirt Size</span>
                        <span className="font-medium">{viewingRecord.tshirt_size || "N/A"}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Current Address</span>
                      <span className="text-xs text-foreground font-medium">{viewingRecord.address || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Contact & Bank */}
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-2xl">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-emerald-600" /> Contact & Emergency
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">Mobile Number</span>
                      <span className="font-medium font-mono">{viewingRecord.mobile_number}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Email Address</span>
                      <span className="font-medium text-primary break-all">{viewingRecord.email_id}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2.5 mt-2">
                      <span className="text-xs font-bold block text-foreground/70">Emergency Contact</span>
                      <div className="mt-1 text-xs bg-card border border-border/50 p-2 rounded-xl flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">{viewingRecord.emergency_contact_name || "N/A"}</span>
                        <span className="text-muted-foreground capitalize">{viewingRecord.emergency_relationship}</span>
                        <span className="font-mono font-medium text-primary mt-0.5">{viewingRecord.emergency_number || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank Info */}
                <div className="bg-muted/30 p-4 rounded-2xl border border-emerald-500/10">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" /> Bank Credentials
                  </h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between bg-card p-2 rounded-xl border border-border/50">
                      <div>
                        <span className="text-xs font-bold">{viewingRecord.bank_name || "N/A"}</span>
                        <span className="text-[10px] text-muted-foreground block">Holder: {viewingRecord.account_holder_name || "-"}</span>
                      </div>
                      <Building2 className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-xs text-muted-foreground block">Account Number</span>
                        <span className="font-medium font-mono tracking-wide">{viewingRecord.account_number || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">IFSC Code</span>
                        <span className="font-medium font-mono uppercase">{viewingRecord.ifsc_code || "N/A"}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Bank Branch</span>
                      <span className="font-medium text-xs">{viewingRecord.bank_branch || "N/A"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Uploaded Documents & ID */}
              <div className="space-y-4 md:col-span-2 xl:col-span-1">
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                  <h4 className="text-xs uppercase font-bold tracking-wider text-primary mb-3 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> Uploaded Documents
                  </h4>
                  <div className="space-y-2">
                    {[
                      { label: "Aadhaar Card", field: "doc_aadhaar" },
                      { label: "PAN Card", field: "doc_pan" },
                      { label: "Bank Proof", field: "doc_bank_proof" },
                      { label: "Passport Size Photo", field: "doc_passport_photo" },
                      { label: "Education Certificate", field: "doc_education_cert" },
                      { label: "Resume / CV", field: "doc_resume" },
                      { label: "Driving License", field: "doc_driving_license" },
                      { label: "Cancelled Cheque", field: "cancelled_cheque" },
                    ].map((doc) => {
                      const filePath = viewingRecord[doc.field];
                      const hasFile = filePath && typeof filePath === 'string' && filePath.trim() !== "";
                      
                      return (
                        <div key={doc.field} className="flex items-center justify-between p-2 bg-card rounded-xl border border-border/60 hover:border-border transition-colors group">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-2 w-2 rounded-full ${hasFile ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="text-xs font-medium truncate text-foreground">{doc.label}</span>
                          </div>
                          {hasFile ? (
                            <button
                              type="button"
                              onClick={() => handleViewDocument(filePath)}
                              className="text-[10px] flex items-center gap-1 font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg hover:bg-primary hover:text-white transition-colors"
                            >
                              View <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-[9px] font-bold text-muted-foreground bg-muted px-2 py-1 rounded-lg">Not Uploaded</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Info */}
                <div className="bg-muted/30 p-4 rounded-2xl text-xs text-muted-foreground flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Total Experience:</span>
                    <span className="font-bold text-foreground">{viewingRecord.total_experience || "0"} Yrs</span>
                  </div>
                  <div className="flex justify-between">
                    <span>HP Experience:</span>
                    <span className="font-bold text-foreground">{viewingRecord.hp_experience || "0"} Yrs</span>
                  </div>
                  <div className="border-t border-border/50 my-1.5 pt-1.5 flex flex-col gap-1">
                    <span>Skills Set:</span>
                    <p className="font-medium text-foreground whitespace-normal break-words">{viewingRecord.skills || "N/A"}</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/10 border-t border-border flex justify-end gap-3 items-center">
              <span className="text-xs text-muted-foreground italic">Submitted at: {viewingRecord.created_at ? new Date(viewingRecord.created_at).toLocaleString() : "Unknown"}</span>
              <div className="flex-grow" />
              <Button variant="outline" size="pill" onClick={() => setViewingRecord(null)}>
                Close Details
              </Button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-3xl bg-card p-6 shadow-2xl border border-border animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-foreground">Delete Onboarding Record</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete the onboarding record for <strong className="text-foreground font-medium">{deleteConfirm.employee_name}</strong>? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="destructive"
                className="flex-1 rounded-xl"
                onClick={handleDelete}
              >
                Delete
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingManagement;
