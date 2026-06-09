import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { 
  Plus, CheckCircle2, XCircle, Clock, AlertCircle, CalendarDays, Check, X
} from "lucide-react";
import PageHeader from "../ui/PageHeader";
import DataTable from "../ui/DataTable";
import StatsCard from "../ui/StatsCard";
import { ROLES, getUserRole, normalizeRole } from "@/auth/rbac";
import { leaveService } from "../../services/leaveService";
import { extractArray } from "../../Utility/apiUtils";

const LeaveManagement = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForm, setShowForm] = useState(false);

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
         <StatsCard label="Total Requests" value={stats.total} icon={CalendarDays} accent="info" />
         <StatsCard label="Pending" value={stats.pending} icon={Clock} accent="warning" />
         <StatsCard label="Approved" value={stats.approved} icon={CheckCircle2} accent="success" />
         <StatsCard label="Rejected" value={stats.rejected} icon={XCircle} accent="danger" />
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

      <DataTable data={safeRequests} columns={columns} loading={loading} />
      
      {!loading && safeRequests.length === 0 && (
         <div className="mt-4 p-8 border border-dashed rounded-2xl text-center text-muted-foreground">
            No leave requests found.
         </div>
      )}
    </div>
  );
};

export default LeaveManagement;
