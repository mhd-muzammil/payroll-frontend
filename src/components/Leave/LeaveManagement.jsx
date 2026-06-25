import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { 
  Plus, CheckCircle2, XCircle, Clock, AlertCircle, CalendarDays, Check, X, MapPin, Users
} from "lucide-react";
import PageHeader from "../ui/PageHeader";
import DataTable from "../ui/DataTable";
import StatsCard from "../ui/StatsCard";

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
import { ROLES, getUserRole, normalizeRole } from "@/auth/rbac";
import { leaveService } from "../../services/leaveService";
import { extractArray } from "../../Utility/apiUtils";

const LeaveManagement = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("");

  // Form fields for Employee
  const [leaveType, setLeaveType] = useState("Leave");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const role = normalizeRole(getUserRole());
  const isAdmin = role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const data = await leaveService.getAll();
      setRequests(extractArray(data));
      setError(null);
    } catch (err) {
      setError("Failed to fetch leave requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        leave_type: leaveType,
        reason,
        start_date: startDate,
      };
      if (leaveType === "Leave") {
        payload.end_date = endDate;
      } else {
        payload.start_time = startTime;
        payload.end_time = endTime;
      }
      await leaveService.create(payload);
      setSuccess("Request submitted successfully!");
      setShowForm(false);
      // Reset form
      setReason("");
      setStartDate("");
      setEndDate("");
      setStartTime("");
      setEndTime("");
      fetchLeaves();
    } catch (err) {
      setError("Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await leaveService.approve(id);
      setSuccess("Request approved.");
      fetchLeaves();
    } catch (err) {
      setError("Approval failed.");
    }
  };

  const handleReject = async (id) => {
    try {
      await leaveService.reject(id);
      setSuccess("Request rejected.");
      fetchLeaves();
    } catch (err) {
      setError("Rejection failed.");
    }
  };

  const safeRequests = Array.isArray(requests) ? requests : [];

  const stats = useMemo(() => {
    return {
      total: safeRequests.length,
      pending: safeRequests.filter(r => r.status === "Pending").length,
      approved: safeRequests.filter(r => r.status === "Approved").length,
      rejected: safeRequests.filter(r => r.status === "Rejected").length
    };
  }, [safeRequests]);

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
    safeRequests.forEach((r) => {
      const branch = r.branch;
      if (branch) {
        const matched = regions.find((reg) => reg.toLowerCase() === branch.trim().toLowerCase());
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
  }, [safeRequests]);

  const filteredRequests = useMemo(() => {
    if (!selectedRegion) return safeRequests;
    return safeRequests.filter((r) => {
      const branch = r.branch || "Not Assigned";
      return branch.toLowerCase() === selectedRegion.toLowerCase();
    });
  }, [safeRequests, selectedRegion]);

  const columns = [
    {
      key: "employee_name",
      label: "Employee",
      render: (record) => (
        <div className="flex items-center gap-3">
          <Avatar name={record.employee_name || "Unknown"} />
          <div>
             <div className="text-sm font-medium">{record.employee_name || "Unknown"}</div>
             <div className="text-xs text-muted-foreground">Applied: {new Date(record.applied_on).toLocaleDateString()}</div>
          </div>
        </div>
      )
    },
    {
      key: "type",
      label: "Type",
      render: (record) => (
         <Badge variant={record.leave_type === "Permission" ? "info" : "outline"}>
           {record.leave_type}
         </Badge>
      )
    },
    {
      key: "region",
      label: "Region",
      render: (record) => <span className="text-sm font-medium">{record.branch || "Not Assigned"}</span>
    },
    {
      key: "duration",
      label: "Duration / Timing",
      render: (record) => {
        if(record.leave_type === "Leave") {
          return (
            <div className="text-sm">
              {record.start_date} {record.end_date ? ` to ${record.end_date}` : ""}
            </div>
          )
        } else {
           return (
             <div className="text-sm">
               {record.start_date} ({record.start_time?.slice(0,5)} - {record.end_time?.slice(0,5)})
             </div>
           )
        }
      }
    },
    {
      key: "reason",
      label: "Reason",
      render: (record) => <span className="text-sm truncate max-w-[150px] block" title={record.reason}>{record.reason}</span>
    },
    {
      key: "status",
      label: "Status",
      render: (record) => {
        let variant = "secondary";
        if(record.status === "Approved") variant = "success";
        if(record.status === "Rejected") variant = "destructive";
        if(record.status === "Pending") variant = "warning";
        return <Badge variant={variant}>{record.status}</Badge>;
      }
    },
    isAdmin && {
      key: "actions",
      label: "Actions",
      render: (record) => record.status === "Pending" ? (
         <div className="flex gap-2">
           <Button size="xs" variant="success" onClick={() => handleApprove(record.id)} className="h-7 px-2 text-xs">Approve</Button>
           <Button size="xs" variant="destructive" onClick={() => handleReject(record.id)} className="h-7 px-2 text-xs">Reject</Button>
         </div>
      ) : "-"
    }
  ].filter(Boolean);

  return (
    <div className="p-1">
      {success && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-lg">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-3 rounded-2xl shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <PageHeader 
         title="Leave & Permission Request" 
         description={isAdmin ? "Review and manage employee absence requests." : "Apply for leaves and view approval status."}
         actions={!isAdmin && (
           <Button variant="brand" size="pill" icon={Plus} onClick={() => setShowForm(true)}>
             Apply Now
           </Button>
         )}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
         <button
           onClick={() => setSelectedRegion("")}
           className={`text-left w-full transition-all duration-300 ${
             selectedRegion !== "" 
               ? "opacity-60 hover:opacity-100 scale-[0.98]" 
               : "ring-2 ring-primary ring-offset-2 dark:ring-offset-background rounded-3xl shadow-lg scale-[1.02]"
           }`}
         >
           <StatsCard label="Total Requests" value={stats.total} icon={CalendarDays} accent="info" />
         </button>
         <StatsCard label="Pending" value={stats.pending} icon={Clock} accent="warning" />
         <StatsCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="success" />
         <StatsCard label="Rejected" value={stats.rejected} icon={XCircle} accent="danger" />
      </div>

      {/* Region-Wise Leave Distribution */}
      <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xs mb-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-base font-bold tracking-tight text-foreground">Region-Wise Leave Distribution</span>
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
                  <span className="text-xs font-semibold text-muted-foreground">requests</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showForm && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-card rounded-3xl shadow-2xl w-full max-w-md border p-6 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-semibold">Apply For Leave / Permission</h3>
                 <button onClick={() => setShowForm(false)} className="p-1 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleCreateRequest} className="space-y-4">
                 <div>
                   <label className="text-xs font-medium mb-1 block">Type</label>
                   <select 
                     className="w-full h-10 bg-background border border-border rounded-xl px-3 focus:ring-2 focus:ring-brand/30 text-sm outline-none"
                     value={leaveType} 
                     onChange={(e) => setLeaveType(e.target.value)}
                   >
                      <option value="Leave">Leave</option>
                      <option value="Permission">Permission</option>
                   </select>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="text-xs font-medium mb-1 block">Start Date</label>
                     <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm" />
                   </div>
                   {leaveType === "Leave" && (
                      <div>
                        <label className="text-xs font-medium mb-1 block">End Date</label>
                        <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm" />
                      </div>
                   )}
                 </div>

                 {leaveType === "Permission" && (
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <label className="text-xs font-medium mb-1 block">From Time</label>
                       <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm" />
                     </div>
                     <div>
                       <label className="text-xs font-medium mb-1 block">To Time</label>
                       <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full h-10 bg-background border border-border rounded-xl px-3 text-sm" />
                     </div>
                   </div>
                 )}

                 <div>
                   <label className="text-xs font-medium mb-1 block">Reason / Remarks</label>
                   <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full bg-background border border-border rounded-xl p-3 text-sm outline-none" placeholder="Explain why..." />
                 </div>

                 <div className="flex gap-2 pt-2">
                    <Button type="submit" variant="brand" className="flex-1" disabled={loading}>
                       {loading ? "Submitting..." : "Submit Request"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                 </div>
              </form>
           </div>
         </div>
      )}

      <DataTable data={filteredRequests} columns={columns} loading={loading} />
      
      {!loading && safeRequests.length === 0 && (
         <div className="mt-4 p-8 border border-dashed rounded-2xl text-center text-muted-foreground">
            No leave requests found.
         </div>
      )}
    </div>
  );
};

export default LeaveManagement;
