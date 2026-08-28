import React, { useState, useEffect } from "react";
import { api } from "@/api/Api";
import DataTable from "../ui/DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { 
  UserCheck, 
  Plus, 
  Search, 
  Upload, 
  FileText, 
  Trash2, 
  Edit, 
  Phone, 
  MapPin, 
  Briefcase, 
  IndianRupee, 
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink
} from "lucide-react";

const SEGMENT_CHOICES = ["Combo", "PC", "Print", "CCTV", "Networking"];

const ACTION_CHOICES = [
  "RNR", 
  "In Progress", 
  "Offer Shared", 
  "Waiting For Acceptance", 
  "Waiting For Joining Date", 
  "Salary Discussion", 
  "Rejected", 
  "Decline"
];

const actionBadgeStyles = {
  "RNR": "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/50",
  "In Progress": "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200/50",
  "Offer Shared": "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50",
  "Waiting For Acceptance": "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50",
  "Waiting For Joining Date": "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-200/50",
  "Salary Discussion": "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 border border-purple-200/50",
  "Rejected": "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200/50",
  "Decline": "bg-slate-50 dark:bg-slate-950/30 text-slate-700 dark:text-slate-400 border border-slate-200/50"
};

export default function HiringManagement() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  // Dialog State
  const [isOpen, setIsOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: "",
    phone_number: "",
    qualification: "",
    permanent_address: "",
    present_address: "",
    years_of_experience: 0,
    segment: "Combo",
    previous_company: "",
    last_salary: 0,
    expecting_salary: 0,
    remarks: "",
    action: "In Progress"
  });

  // File uploads state
  const [files, setFiles] = useState({
    salary_slip: null,
    offer_letter: null,
    bank_statement: null,
    resume: null
  });

  const [saving, setSaving] = useState(false);

  // Spreadsheet import. Two steps on purpose: the first upload only reports what
  // WOULD happen, because several hundred rows landing in the wrong columns is a
  // day of work to undo by hand.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importSource, setImportSource] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importDone, setImportDone] = useState(null);
  // Off by default. Filling blanks touches records already being worked in, so
  // it is asked for rather than assumed.
  const [importFillBlanks, setImportFillBlanks] = useState(false);

  // The candidate being read. Imported rows carry a lot that the table has no
  // column for — a resume link, a gender, a college year — and it all lands in
  // Remarks. Without somewhere to read it, it may as well not have been imported.
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/candidates/");
      setCandidates(res.data || []);
    } catch (err) {
      console.error("Failed to fetch candidates", err);
      setError("Could not retrieve candidates. Please refresh details.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setIsEdit(false);
    setCurrentId(null);
    setFormData({
      name: "",
      phone_number: "",
      qualification: "",
      permanent_address: "",
      present_address: "",
      years_of_experience: 0,
      segment: "Combo",
      previous_company: "",
      last_salary: 0,
      expecting_salary: 0,
      remarks: "",
      action: "In Progress"
    });
    setFiles({
      salary_slip: null,
      offer_letter: null,
      bank_statement: null,
      resume: null
    });
    setIsOpen(true);
  };

  const handleOpenEdit = (cand) => {
    setIsEdit(true);
    setCurrentId(cand.id);
    setFormData({
      name: cand.name || "",
      phone_number: cand.phone_number || "",
      qualification: cand.qualification || "",
      permanent_address: cand.permanent_address || "",
      present_address: cand.present_address || "",
      years_of_experience: cand.years_of_experience || 0,
      segment: cand.segment || "Combo",
      previous_company: cand.previous_company || "",
      last_salary: cand.last_salary || 0,
      expecting_salary: cand.expecting_salary || 0,
      remarks: cand.remarks || "",
      action: cand.action || "In Progress"
    });
    setFiles({
      salary_slip: null,
      offer_letter: null,
      bank_statement: null,
      resume: null
    });
    setIsOpen(true);
  };

  const handleFileChange = (e, field) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => ({
        ...prev,
        [field]: e.target.files[0]
      }));
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone_number) {
      alert("Name and Phone Number are required fields.");
      return;
    }

    setSaving(true);
    try {
      // Build Multipart Form Data to support file uploads
      const data = new FormData();
      Object.entries(formData).forEach(([key, val]) => {
        data.append(key, val);
      });
      
      // Append files if they were chosen
      Object.entries(files).forEach(([key, file]) => {
        if (file) {
          data.append(key, file);
        }
      });

      if (isEdit) {
        await api.put(`/api/candidates/${currentId}/`, data, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      } else {
        await api.post("/api/candidates/", data, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      }

      setIsOpen(false);
      fetchCandidates();
    } catch (err) {
      console.error("Failed to save candidate", err);
      alert("Failed to submit candidate info. Please check file formats.");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatusChange = async (candidateId, newStatus) => {
    try {
      await api.patch(`/api/candidates/${candidateId}/`, { action: newStatus });
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, action: newStatus } : c));
    } catch (err) {
      console.error("Failed to update status", err);
      alert("Could not update status. Please try again.");
    }
  };

  const handleDelete = async (candId) => {
    if (!window.confirm("Are you sure you want to delete this candidate record?")) return;
    try {
      await api.delete(`/api/candidates/${candId}/`);
      fetchCandidates();
    } catch (err) {
      console.error("Failed to delete candidate", err);
      alert("Failed to delete candidate.");
    }
  };

  // Filter candidates based on search query
  const filteredCandidates = candidates.filter(cand => {
    const q = searchQuery.toLowerCase();
    return (
      (cand.name || "").toLowerCase().includes(q) ||
      (cand.phone_number || "").includes(q) ||
      (cand.segment || "").toLowerCase().includes(q) ||
      (cand.qualification || "").toLowerCase().includes(q)
    );
  });

  // Calculate statistics
  const stats = {
    total: candidates.length,
    inProgress: candidates.filter(c => c.action === "In Progress").length,
    offers: candidates.filter(c => c.action === "Offer Shared" || c.action === "Waiting For Joining Date").length,
    rejected: candidates.filter(c => c.action === "Rejected" || c.action === "Decline").length
  };

  const runImport = async (commit) => {
    if (!importFile) return;
    setImportBusy(true);
    setImportError("");
    try {
      const body = new FormData();
      body.append("file", importFile);
      if (importSource.trim()) body.append("source", importSource.trim());
      if (importFillBlanks) body.append("update_existing", "true");
      if (commit) body.append("commit", "true");
      const res = await api.post("/api/candidates/import-file/", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (commit) {
        setImportDone(res.data);
        setImportPreview(null);
        await fetchCandidates();
      } else {
        setImportPreview(res.data);
      }
    } catch (err) {
      setImportError(
        err?.response?.data?.detail || "Could not read that file. Try an .xlsx or .csv export."
      );
    } finally {
      setImportBusy(false);
    }
  };

  const toggleFillBlanks = (checked) => {
    setImportFillBlanks(checked);
    // The preview was computed under the other setting, so it no longer
    // describes what Import would do. Make them check again.
    setImportPreview(null);
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportFile(null);
    setImportSource("");
    setImportPreview(null);
    setImportError("");
    setImportDone(null);
    setImportFillBlanks(false);
  };

  const pickImportFile = (file) => {
    setImportFile(file || null);
    setImportPreview(null);
    setImportDone(null);
    setImportError("");
    // The file name is how HR already labels these lists, so it is the sensible
    // default for "where did this person come from".
    if (file && !importSource.trim()) {
      setImportSource(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 rounded-3xl p-6 md:p-8 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl">
            <UserCheck className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Hiring Portal</h1>
            <p className="text-sm text-slate-300 mt-1">Track candidate profiles, salary structures, interviews, and verification documents.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="bg-white/10 border-white/25 text-white hover:bg-white/20 font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Excel
          </Button>
          <Button
            variant="brand"
            onClick={handleOpenCreate}
            className="bg-white text-indigo-950 hover:bg-slate-100 font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
          >
            <Plus className="h-4 w-4 text-indigo-950" />
            Add Candidate
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Candidates</span>
            <h3 className="text-2xl font-bold text-foreground mt-1">{stats.total}</h3>
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <UserCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">In Progress</span>
            <h3 className="text-2xl font-bold text-foreground mt-1">{stats.inProgress}</h3>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-xl">
            <Loader2 className="h-5 w-5 animate-pulse" />
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offers / Joining</span>
            <h3 className="text-2xl font-bold text-foreground mt-1">{stats.offers}</h3>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <CheckCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rejected / Declined</span>
            <h3 className="text-2xl font-bold text-foreground mt-1">{stats.rejected}</h3>
          </div>
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters & Actions bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-border/60 rounded-3xl p-5 shadow-xs">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate by name, phone, segment..."
            className="pl-9 h-10 rounded-xl border border-border focus:ring-1 focus:ring-primary focus:outline-none w-full"
          />
        </div>
        <div className="text-xs text-muted-foreground font-semibold">
          Showing {filteredCandidates.length} candidate profiles
        </div>
      </div>

      {/* Main Candidates Data Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground space-y-3 bg-card border border-border rounded-3xl shadow-xs">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading candidate records...</p>
        </div>
      ) : (
        <DataTable
          data={filteredCandidates}
          emptyMessage="No candidate profiles found. Click 'Add Candidate' to record onboarding details."
          columns={[
            {
              key: "sno",
              label: "S.no",
              render: (_, index) => <span className="font-semibold text-xs text-muted-foreground">{index + 1}</span>
            },
            {
              key: "name",
              label: "Name / Contact",
              render: (c) => (
                <div>
                  <div className="font-bold text-sm text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {c.phone_number}
                  </div>
                  {c.email && (
                    <div className="text-xs text-muted-foreground truncate max-w-[190px] mt-0.5" title={c.email}>
                      {c.email}
                    </div>
                  )}
                  {c.source && (
                    <div className="mt-1">
                      {/* Where this person came from. With hundreds of imported
                          leads sitting next to a campus list, an unlabelled
                          portal is one undifferentiated pile. */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50">
                        {c.source}
                      </span>
                    </div>
                  )}
                </div>
              )
            },
            {
              key: "details",
              label: "Qualifications & Exp",
              render: (c) => (
                <div>
                  <div className="text-xs font-semibold text-foreground uppercase">{c.qualification || "N/A"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Briefcase className="h-3 w-3" />
                    {c.years_of_experience} years exp
                  </div>
                </div>
              )
            },
            {
              key: "segment",
              label: "Segment",
              render: (c) => (
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-muted text-foreground border border-border">
                  {c.segment}
                </span>
              )
            },
            {
              key: "addresses",
              label: "Locations",
              render: (c) => (
                <div className="max-w-[200px] text-xs">
                  <div className="truncate text-foreground" title={`Present: ${c.present_address}`}>
                    <span className="font-semibold text-muted-foreground">Present:</span> {c.present_address || "N/A"}
                  </div>
                  <div className="truncate text-muted-foreground mt-0.5" title={`Perm: ${c.permanent_address}`}>
                    <span className="font-semibold">Perm:</span> {c.permanent_address || "N/A"}
                  </div>
                </div>
              )
            },
            {
              key: "salary",
              label: "Salary (Last / Expect)",
              render: (c) => (
                <div className="text-xs">
                  <div className="font-mono text-muted-foreground">
                    Last: ₹{parseFloat(c.last_salary).toLocaleString("en-IN")}
                  </div>
                  <div className="font-mono font-bold text-foreground mt-0.5">
                    Exp: ₹{parseFloat(c.expecting_salary).toLocaleString("en-IN")}
                  </div>
                </div>
              )
            },
            {
              key: "proofs",
              label: "Uploaded Proofs",
              render: (c) => (
                <div className="flex flex-wrap gap-1 max-w-[150px]">
                  {c.salary_slip && (
                    <a href={c.salary_slip} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 hover:scale-105 transition-transform" title="Salary Slip">
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {c.offer_letter && (
                    <a href={c.offer_letter} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-teal-50 dark:bg-teal-950/20 text-teal-600 dark:text-teal-400 border border-teal-100 hover:scale-105 transition-transform" title="Offer Letter">
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {c.bank_statement && (
                    <a href={c.bank_statement} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-100 hover:scale-105 transition-transform" title="Bank Statement">
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {c.resume && (
                    <a href={c.resume} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100 hover:scale-105 transition-transform" title="Resume">
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {!c.salary_slip && !c.offer_letter && !c.bank_statement && !c.resume && (
                    <span className="text-[10px] text-muted-foreground font-semibold">No Documents</span>
                  )}
                </div>
              )
            },
            {
              key: "action",
              label: "Status / Action",
              render: (c) => (
                <div className="flex flex-col gap-1.5 min-w-[140px]">
                  <select
                    value={c.action}
                    onChange={(e) => handleQuickStatusChange(c.id, e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer w-full"
                  >
                    {ACTION_CHOICES.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <Badge className={`text-[10px] font-bold text-center justify-center uppercase py-0.5 px-2 rounded-md ${actionBadgeStyles[c.action] || ""}`}>
                    {c.action}
                  </Badge>
                </div>
              )
            },
            {
              key: "act",
              label: "",
              render: (c) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setViewing(c)}
                    className="h-8 px-2.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="View all details"
                  >
                    Details
                  </button>
                  <button 
                    onClick={() => handleOpenEdit(c)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Edit Candidate"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(c.id)}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-red-50 hover:border-red-100 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                    title="Delete Record"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            }
          ]}
        />
      )}

      {/* Add / Edit Candidate Dialog Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[90vw] md:max-w-[700px] w-full p-6 max-h-[92vh] overflow-y-auto bg-background border-border shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              {isEdit ? "Edit Candidate Profile" : "Add Candidate Profile"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Complete the details below based on the hiring requirements sheet. All details map directly to Candidate Profiles.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-bold">Candidate Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="e.g. Test Candidate"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-bold">Phone Number *</Label>
                <Input
                  id="phone"
                  value={formData.phone_number}
                  onChange={(e) => handleInputChange("phone_number", e.target.value)}
                  placeholder="e.g. 9846414514"
                  required
                />
              </div>

              {/* Qualification */}
              <div className="space-y-1.5">
                <Label htmlFor="qual" className="text-xs font-bold">Qualification</Label>
                <Input
                  id="qual"
                  value={formData.qualification}
                  onChange={(e) => handleInputChange("qualification", e.target.value)}
                  placeholder="e.g. BE Computer Science"
                />
              </div>

              {/* Experience */}
              <div className="space-y-1.5">
                <Label htmlFor="exp" className="text-xs font-bold">Years Of Experience</Label>
                <Input
                  id="exp"
                  type="number"
                  step="0.1"
                  value={formData.years_of_experience}
                  onChange={(e) => handleInputChange("years_of_experience", e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>

              {/* Segment Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Segment / Business Area</Label>
                <select
                  value={formData.segment}
                  onChange={(e) => handleInputChange("segment", e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full"
                >
                  {SEGMENT_CHOICES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Previous Company */}
              <div className="space-y-1.5">
                <Label htmlFor="prev_comp" className="text-xs font-bold">Previous Company</Label>
                <Input
                  id="prev_comp"
                  value={formData.previous_company}
                  onChange={(e) => handleInputChange("previous_company", e.target.value)}
                  placeholder="e.g. AAA Technologies"
                />
              </div>

              {/* Last Salary */}
              <div className="space-y-1.5">
                <Label htmlFor="last_sal" className="text-xs font-bold">Last Salary (Monthly ₹)</Label>
                <Input
                  id="last_sal"
                  type="number"
                  value={formData.last_salary}
                  onChange={(e) => handleInputChange("last_salary", e.target.value)}
                  placeholder="e.g. 15000"
                />
              </div>

              {/* Expecting Salary */}
              <div className="space-y-1.5">
                <Label htmlFor="exp_sal" className="text-xs font-bold">Expecting Salary (Monthly ₹)</Label>
                <Input
                  id="exp_sal"
                  type="number"
                  value={formData.expecting_salary}
                  onChange={(e) => handleInputChange("expecting_salary", e.target.value)}
                  placeholder="e.g. 22000"
                />
              </div>
            </div>

            {/* Address Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pres_addr" className="text-xs font-bold">Present Address</Label>
                <Input
                  id="pres_addr"
                  value={formData.present_address}
                  onChange={(e) => handleInputChange("present_address", e.target.value)}
                  placeholder="Present stay address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perm_addr" className="text-xs font-bold">Permanent Address</Label>
                <Input
                  id="perm_addr"
                  value={formData.permanent_address}
                  onChange={(e) => handleInputChange("permanent_address", e.target.value)}
                  placeholder="Permanent home address"
                />
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="rem" className="text-xs font-bold">Remarks / Notes</Label>
              <textarea
                id="rem"
                value={formData.remarks}
                onChange={(e) => handleInputChange("remarks", e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
                placeholder="e.g. Location Preference, Stay Required..."
              />
            </div>

            {/* Status Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Portal Hiring Action Status</Label>
              <select
                value={formData.action}
                onChange={(e) => handleInputChange("action", e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary w-full"
              >
                {ACTION_CHOICES.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* File Uploads (Proof Section) */}
            <div className="border-t border-border/60 pt-4">
              <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <Upload className="h-3.5 w-3.5 text-primary" />
                Proof Documents Submission
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/30 border border-border/80 rounded-xl p-3">
                  <Label className="text-xs font-bold block mb-1">Salary Slip</Label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(e, "salary_slip")}
                    className="text-xs w-full cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/95"
                  />
                </div>
                <div className="bg-muted/30 border border-border/80 rounded-xl p-3">
                  <Label className="text-xs font-bold block mb-1">Offer Letter</Label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(e, "offer_letter")}
                    className="text-xs w-full cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/95"
                  />
                </div>
                <div className="bg-muted/30 border border-border/80 rounded-xl p-3">
                  <Label className="text-xs font-bold block mb-1">Bank Statement</Label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(e, "bank_statement")}
                    className="text-xs w-full cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/95"
                  />
                </div>
                <div className="bg-muted/30 border border-border/80 rounded-xl p-3">
                  <Label className="text-xs font-bold block mb-1">Resume</Label>
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(e, "resume")}
                    className="text-xs w-full cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/95"
                  />
                </div>
              </div>
            </div>

            {/* Dialog Action Buttons */}
            <DialogFooter className="border-t border-border/60 pt-4 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={saving}>
                {saving ? "Saving Profile..." : "Save Candidate Info"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Everything on one candidate, read-only. */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {viewing?.name}
              {viewing?.source && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50">
                  {viewing.source}
                </span>
              )}
              <Badge className={`text-[10px] font-bold uppercase py-0.5 px-2 rounded-md ${actionBadgeStyles[viewing?.action] || ""}`}>
                {viewing?.action}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Everything recorded for this candidate, including whatever the imported sheet carried
              that has no column of its own.
            </DialogDescription>
          </DialogHeader>

          {viewing && (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ["Phone", viewing.phone_number],
                  ["Email", viewing.email],
                  ["Qualification", viewing.qualification],
                  ["Experience", (viewing.years_of_experience ?? 0) + " years"],
                  ["Segment", viewing.segment],
                  ["Present address", viewing.present_address],
                  ["Permanent address", viewing.permanent_address],
                  ["Previous company", viewing.previous_company],
                  ["Last salary", "\u20b9" + (viewing.last_salary ?? 0)],
                  ["Expecting", "\u20b9" + (viewing.expecting_salary ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 break-words">{value || "\u2014"}</dd>
                  </div>
                ))}
              </dl>

              {/* Remarks arrive as "Heading: value" lines from the import, so they
                  are laid out as such and links are made clickable — a WorkIndia
                  row carries the candidate's actual resume URL in here. */}
              {viewing.remarks && (
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    From the sheet / notes
                  </h4>
                  <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border/60">
                    {String(viewing.remarks)
                      .split("\n")
                      .filter((line) => line.trim())
                      .map((line, i) => {
                        const at = line.indexOf(": ");
                        const hasLabel = at > 0 && at < 40;
                        const label = hasLabel ? line.slice(0, at) : "";
                        const value = hasLabel ? line.slice(at + 2) : line;
                        const isLink = /^https?:\/\//i.test(value.trim());
                        return (
                          <div key={i} className="px-3 py-2 text-sm flex flex-col sm:flex-row sm:gap-3">
                            {label && (
                              <span className="text-xs font-semibold text-muted-foreground sm:w-44 shrink-0">
                                {label}
                              </span>
                            )}
                            {isLink ? (
                              <a
                                href={value.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline break-all inline-flex items-center gap-1"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="break-words">{value}</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Uploaded proofs
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Resume", viewing.resume],
                    ["Salary slip", viewing.salary_slip],
                    ["Offer letter", viewing.offer_letter],
                    ["Bank statement", viewing.bank_statement],
                  ].filter(([, url]) => url).length === 0 ? (
                    <span className="text-sm text-muted-foreground">None uploaded.</span>
                  ) : (
                    [
                      ["Resume", viewing.resume],
                      ["Salary slip", viewing.salary_slip],
                      ["Offer letter", viewing.offer_letter],
                      ["Bank statement", viewing.bank_statement],
                    ]
                      .filter(([, url]) => url)
                      .map(([label, url]) => (
                        <a
                          key={label}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {label}
                        </a>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border/60 pt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={() => {
                const candidate = viewing;
                setViewing(null);
                handleOpenEdit(candidate);
              }}
            >
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spreadsheet import. Preview first, then commit — several hundred rows in
          the wrong columns is a day of work to undo by hand, so nothing is
          written until the numbers below have been read. */}
      <Dialog open={importOpen} onOpenChange={(open) => (open ? setImportOpen(true) : closeImport())}>
        <DialogContent className="max-w-2xl max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import candidates from a spreadsheet
            </DialogTitle>
            <DialogDescription>
              Any .xlsx or .csv list of candidates — a college list, a Facebook lead export, a
              WorkIndia download. Columns are matched by their heading, so the file needs no
              particular layout, and anything without a column of its own is kept in Remarks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 min-h-0 overflow-y-auto -mx-1 px-1">
            <div>
              <Label className="mb-1.5 block">File</Label>
              {/* No accept filter: the WorkIndia download arrives with no
                  extension at all, and a filter hides such a file from the
                  picker entirely. The server reads the bytes and says plainly
                  when it cannot. */}
              <input
                type="file"
                onChange={(e) => pickImportFile(e.target.files?.[0])}
                className="block w-full text-sm rounded-xl border border-border bg-background px-3 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700"
              />
            </div>

            <div>
              <Label className="mb-1.5 block">Where these came from</Label>
              <Input
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
                placeholder="Prince College / FB Leads Aug 2026 / WorkIndia"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Saved on every candidate from this file, so a paid lead and a campus walk-in stay
                possible to tell apart later.
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={importFillBlanks}
                onChange={(e) => toggleFillBlanks(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span className="text-sm">
                <span className="font-medium">Fill in blanks for people already in the portal</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  For when a column was missing the first time — add the locations to the sheet and
                  send it again. Only EMPTY fields are filled: anything already in the portal, and
                  anyone’s status, is left exactly as it is.
                </span>
              </span>
            </label>

            {importError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importDone && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle className="h-4 w-4" />
                  Imported {importDone.created} candidate(s)
                </div>
                {importDone.updated > 0 && (
                  <p className="mt-1">Filled in {importDone.updated} blank field(s) on existing candidates.</p>
                )}
                {importDone.already_in_portal > 0 && (
                  <p className="mt-1">
                    {importDone.already_in_portal} were already in the portal
                    {importDone.updated > 0 ? "." : " and were left alone."}
                  </p>
                )}
              </div>
            )}

            {importPreview && (
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="text-2xl font-bold text-emerald-600">{importPreview.new}</div>
                    <div className="text-xs text-muted-foreground">will be added</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-muted-foreground">
                      {importPreview.already_in_portal}
                    </div>
                    <div className="text-xs text-muted-foreground">already here</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">
                      {importPreview.duplicate_in_file_count}
                    </div>
                    <div className="text-xs text-muted-foreground">repeated in file</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-rose-600">
                      {importPreview.rejected_count}
                    </div>
                    <div className="text-xs text-muted-foreground">no usable number</div>
                  </div>
                </div>

                {importFillBlanks && (
                  <p className="text-xs text-indigo-700">
                    {importPreview.will_fill > 0
                      ? importPreview.will_fill +
                        " blank field(s) will be filled on people already here" +
                        (importPreview.fill_fields?.length
                          ? " (" + importPreview.fill_fields.join(", ") + ")"
                          : "")
                      : "No blanks to fill \u2014 the portal already has everything this sheet does."}
                  </p>
                )}

                {importPreview.sheets_read?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Read: {importPreview.sheets_read.join(", ")}
                    {importPreview.sheets_skipped?.length > 0 &&
                      " — skipped " +
                        importPreview.sheets_skipped.length +
                        " sheet(s) with no name/phone column"}
                  </p>
                )}

                {importPreview.suspicious_salaries > 0 && (
                  <p className="text-xs text-amber-700">
                    {importPreview.suspicious_salaries} row(s) have a salary under 1,000 — likely
                    written in thousands. Kept exactly as the sheet had it rather than guessed at;
                    worth checking after importing.
                  </p>
                )}

                {importPreview.unmapped_columns?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Kept in Remarks: {importPreview.unmapped_columns.slice(0, 8).join(", ")}
                    {importPreview.unmapped_columns.length > 8 && " …"}
                  </p>
                )}

                {importPreview.sample?.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-background overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">Name</th>
                          <th className="text-left px-3 py-2">Phone</th>
                          <th className="text-left px-3 py-2">Qualification</th>
                          <th className="text-left px-3 py-2">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.sample.map((c) => (
                          <tr key={c.phone_number} className="border-t border-border/50">
                            <td className="px-3 py-2 font-medium">{c.name}</td>
                            <td className="px-3 py-2">{c.phone_number}</td>
                            <td className="px-3 py-2">{c.qualification || "—"}</td>
                            <td className="px-3 py-2">{c.present_address || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/50">
                      First few of {importPreview.new}. Nothing has been saved yet.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 pt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={closeImport}>
              {importDone ? "Close" : "Cancel"}
            </Button>
            {!importDone && !importPreview && (
              <Button
                type="button"
                variant="brand"
                disabled={!importFile || importBusy}
                onClick={() => runImport(false)}
              >
                {importBusy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking the file…
                  </span>
                ) : (
                  "Check the file"
                )}
              </Button>
            )}
            {!importDone && importPreview && (
              <Button
                type="button"
                variant="brand"
                disabled={importBusy || (importPreview.new === 0 && !(importPreview.will_fill > 0))}
                onClick={() => runImport(true)}
              >
                {importBusy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                  </span>
                ) : (
                  importPreview.new > 0
                    ? "Import " + importPreview.new + " candidate(s)"
                    : "Fill " + importPreview.will_fill + " blank field(s)"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
