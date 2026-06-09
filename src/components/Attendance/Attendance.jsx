// pages/Attendance.jsx
import { useEffect, useState, useMemo, useCallback } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, CheckCircle2, AlertCircle, Timer, 
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check 
} from "lucide-react";
import PageHeader from "../ui/PageHeader";
import GreetingHeader from "../ui/GreetingHeader";
import StatsCard from "../ui/StatsCard";
import DataTable from "../ui/DataTable";
import { useAttendance } from "../../customHook/useAttendance";
import AttendanceForm from "./AttendanceForm";
import { ROLES, getTokenClaims, getUserRole, normalizeRole } from "@/auth/rbac";
import {
  formatTime, 
  calculateHours,
  calculateOvertime,
  calculateRemainingWorkingHours,
  getStatusDisplay,
  getStatusVariant,
  calculateStats,
} from "../../Utility/attendanceUtils";

const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDatePart = (dateTimeValue) => {
  if (!dateTimeValue) return "";
  return String(dateTimeValue).slice(0, 10);
};

const Attendance = () => {
  const {
    records,
    loading,
    error,
    success,
    fetchAll,
    createRecord,
    updateRecord,
    patchRecord,
    deleteRecord,
    checkInGeo,
    checkOutGeo,
    clearMessages,
  } = useAttendance();

  const [geoLocating, setGeoLocating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const handleGeoPunchIn = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          await checkInGeo({ latitude, longitude });
        } catch (err) {
          console.error("Geo check in error:", err);
        } finally {
          setGeoLocating(false);
        }
      },
      (error) => {
        setGeoLocating(false);
        alert("Unable to retrieve your location. Please enable location permissions.");
        console.error(error);
      },
      { enableHighAccuracy: true }
    );
  }, [checkInGeo]);

  const handleGeoPunchOut = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          await checkOutGeo({ latitude, longitude });
        } catch (err) {
          console.error("Geo check out error:", err);
        } finally {
          setGeoLocating(false);
        }
      },
      (error) => {
        setGeoLocating(false);
        alert("Unable to retrieve your location. Please enable location permissions.");
        console.error(error);
      },
      { enableHighAccuracy: true }
    );
  }, [checkOutGeo]);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    return formatLocalDate(new Date());
  });
  const [employeeIntime, setEmployeeIntime] = useState("");
  const [employeeOuttime, setEmployeeOuttime] = useState("");
  const role = normalizeRole(getUserRole());
  const isEmployee = role === ROLES.EMPLOYEE;
  const claims = getTokenClaims() || {};
  const username = claims.username || claims.user_name || claims.sub || "";
  const employeeId = claims.employee_id ? Number(claims.employee_id) : null;

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-clear success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(clearMessages, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, clearMessages]);

  const safeRecords = Array.isArray(records) ? records : [];

  const filteredRecords = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const selected = new Date(year, month - 1, day);

    return safeRecords.filter((record) => {
      if (isEmployee) {
        if (employeeId && Number(record.employee_id) !== employeeId) return false;
        if (!employeeId && username) {
          const recordName = String(record.employee_name || "").toLowerCase();
          if (recordName !== String(username).toLowerCase()) return false;
        }
      }
      const recordDate = record.intime || record.outtime;
      if (!recordDate) return false;
      const current = new Date(recordDate);
      return (
        current.getFullYear() === selected.getFullYear() &&
        current.getMonth() === selected.getMonth() &&
        current.getDate() === selected.getDate()
      );
    });
  }, [records, selectedDate, isEmployee, username, employeeId]);

  const employeeFixedValues = useMemo(() => {
    if (!isEmployee) return {};
    const lastRecord = safeRecords.find((r) => {
      if (employeeId) return Number(r.employee_id) === employeeId;
      return String(r.employee_name || "").toLowerCase() === String(username).toLowerCase();
    });
    return {
      employee_name: lastRecord?.employee_name || username || "Employee",
      role: "Employee",
      department: lastRecord?.department || "N/A",
      salary: lastRecord?.salary || "0",
      intime: lastRecord?.intime ? new Date(lastRecord.intime).toISOString().slice(0, 16) : "",
      outtime: lastRecord?.outtime ? new Date(lastRecord.outtime).toISOString().slice(0, 16) : "",
    };
  }, [isEmployee, records, username, employeeId]);

  const employeeSelectedDateRecord = useMemo(() => {
    if (!isEmployee) return null;
    return safeRecords.find((record) => {
      const matchesUser =
        employeeId
          ? Number(record.employee_id) === employeeId
          : String(record.employee_name || "").toLowerCase() === String(username).toLowerCase();
      const dateSource = record.intime || record.outtime;
      if (!matchesUser || !dateSource) return false;
      const d = new Date(dateSource);
      return formatLocalDate(d) === selectedDate;
    }) || null;
  }, [isEmployee, records, username, employeeId, selectedDate]);
  const hasInTimeToday = Boolean(employeeSelectedDateRecord?.intime);
  const hasOutTimeToday = Boolean(employeeSelectedDateRecord?.outtime);

  const toNowIso = () => new Date().toISOString();

  const handleEmployeeClockIn = async () => {
    const now = employeeIntime ? new Date(employeeIntime).toISOString() : toNowIso();
    if (employeeSelectedDateRecord) {
      await patchRecord(employeeSelectedDateRecord.id, { intime: now, status: "Present" });
      setEmployeeIntime("");
      return;
    }
    await createRecord({
      ...employeeFixedValues,
      intime: now,
      outtime: null,
      status: "Present",
    });
    setEmployeeIntime("");
  };

  const handleEmployeeClockOut = async () => {
    const now = employeeOuttime ? new Date(employeeOuttime).toISOString() : toNowIso();
    if (employeeSelectedDateRecord) {
      await patchRecord(employeeSelectedDateRecord.id, { outtime: now, status: "Present" });
      setEmployeeOuttime("");
      return;
    }
    await createRecord({
      ...employeeFixedValues,
      intime: null,
      outtime: now,
      status: "Present",
    });
    setEmployeeOuttime("");
  };

  const stats = useMemo(() => calculateStats(filteredRecords), [filteredRecords]);

  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [selectedDate]);

  const moveSelectedDate = useCallback((days) => {
    setSelectedDate((current) => {
      const [year, month, day] = current.split("-").map(Number);
      const next = new Date(year, month - 1, day);
      next.setDate(next.getDate() + days);
      return formatLocalDate(next);
    });
  }, []);

  const handleCreate = async (formData) => {
    await createRecord(formData);
    setShowForm(false);
  };

  const handleUpdate = async (formData) => {
    if (editingRecord) {
      await updateRecord(editingRecord.id, formData);
      setEditingRecord(null);
    }
  };

  const handleDelete = async (id) => {
    await deleteRecord(id);
    setDeleteConfirm(null);
  };

  const handleQuickStatusUpdate = async (id, currentStatus) => {
    const nextStatus = currentStatus === "Present" ? "Absent" : "Present";
    await patchRecord(id, { status: nextStatus });
  };

  const tableColumns = useMemo(() => {
    const baseColumns = [
      {
        key: "employee",
        label: "Employee",
        render: ({ employee_name, department }) => (
          <div className="flex items-center gap-3">
            <Avatar name={employee_name} />
            <div>
              <div className="text-sm font-medium">{employee_name}</div>
              <div className="text-xs text-muted-foreground">{department}</div>
            </div>
          </div>
        ),
      },
      {
        key: "role",
        label: "Role",
        render: ({ role }) => (
          <span className="text-sm text-muted-foreground">{role}</span>
        ),
      },
      {
        key: "clockIn",
        label: "Clock In",
        render: ({ intime }) => (
          <span className="text-sm">{formatTime(intime)}</span>
        ),
      },
      {
        key: "clockOut",
        label: "Clock Out",
        render: ({ outtime }) => (
          <span className="text-sm">{formatTime(outtime)}</span>
        ),
      },
      {
        key: "hours",
        label: "Total Hours",
        render: ({ intime, outtime }) => (
          <span className="text-sm font-medium">
            {calculateHours(intime, outtime)}h
          </span>
        ),
      },
      {
        key: "remaining",
        label: "Remaining",
        render: ({ intime, outtime }) => (
          <span className="text-sm font-medium text-primary">
            {calculateRemainingWorkingHours(intime, outtime)}h
          </span>
        ),
      },
      {
        key: "overtime",
        label: "Overtime",
        render: ({ intime, outtime }) => {
          const overtime = calculateOvertime(intime, outtime);
          return Number(overtime) > 0 ? (
            <Badge variant="info">+{overtime}h</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        render: (record) => (
          <button
            onClick={() => {
              if (!isEmployee) handleQuickStatusUpdate(record.id, record.status);
            }}
            className={isEmployee ? "cursor-not-allowed" : "cursor-pointer"}
            title={isEmployee ? "Status updates are disabled for employees" : "Click to toggle status"}
            disabled={isEmployee}
          >
            <Badge variant={getStatusVariant(record.status)}>
              {getStatusDisplay(record.status)}
            </Badge>
          </button>
        ),
      },
      !isEmployee && {
        key: "actions",
        label: "Actions",
        className: "w-[120px]",
        render: (record) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditingRecord(record)}
              disabled={isEmployee}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDeleteConfirm(record.id)}
              disabled={isEmployee}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-red-50 hover:text-red-500"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ];

    return baseColumns.filter(Boolean);
  }, [isEmployee]);

  if (loading && safeRecords.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <div className="text-muted-foreground">Loading attendance data...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Notification Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-lg">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">{success}</span>
            <button onClick={clearMessages} className="ml-2">
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
            <button onClick={clearMessages} className="ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <GreetingHeader subtitle="Track your daily check-ins, manage shifts, and view real-time attendance insights." />

      <PageHeader
        title="Attendance Summary"
        description="Track daily attendance, overtime and absences."
        actions={
          !isEmployee ? (
            <Button variant="brand" size="pill" icon={Plus} onClick={() => setShowForm(true)}>
              Add Record
            </Button>
          ) : null
        }
      />

      {isEmployee && (
        <div className="mb-6 rounded-3xl gradient-brand p-1 shadow-glow">
          <div className="bg-card dark:bg-[#1A1C23] rounded-[22px] p-6 md:p-8 relative overflow-hidden">
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-success">Live Location Mode</span>
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-2">Smart Attendance Gate</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Attendance submission controls automatically unlock only when physical validation parameters confirm on-premise entry.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {(!hasInTimeToday) && (
                  <Button
                    variant="brand"
                    size="lg"
                    icon={geoLocating ? null : Timer}
                    onClick={handleGeoPunchIn}
                    disabled={loading || geoLocating}
                    className="!h-14 px-8 shadow-glow-brand min-w-[180px]"
                  >
                    {geoLocating ? "Authorizing..." : "Secure Punch In"}
                  </Button>
                )}

                {(hasInTimeToday && !hasOutTimeToday) && (
                  <Button
                    variant="brand"
                    size="lg"
                    icon={geoLocating ? null : Timer}
                    onClick={handleGeoPunchOut}
                    disabled={loading || geoLocating}
                    className="!h-14 px-8 shadow-glow-brand min-w-[180px]"
                  >
                    {geoLocating ? "Authorizing..." : "Secure Punch Out"}
                  </Button>
                )}

                {(hasInTimeToday && hasOutTimeToday) && (
                  <div className="flex items-center gap-2 px-6 py-3 bg-success/10 text-success rounded-2xl font-medium border border-success/20">
                    <CheckCircle2 className="h-5 w-5" />
                    Schedule Completed for Today
                  </div>
                )}
              </div>
            </div>

            {employeeSelectedDateRecord && (
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/30 p-4 rounded-2xl border border-border/50 relative z-10">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Shift Entry</p>
                  <p className="font-semibold">{formatTime(employeeSelectedDateRecord.intime) || "-- : --"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Shift Exit</p>
                  <p className="font-semibold">{formatTime(employeeSelectedDateRecord.outtime) || "-- : --"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Status</p>
                  <Badge variant={getStatusVariant(employeeSelectedDateRecord.status)} className="mt-0.5">
                    {getStatusDisplay(employeeSelectedDateRecord.status)}
                  </Badge>
                </div>
                <div>
                   <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider mb-1">Location Verification</p>
                   <p className="text-xs text-emerald-500 font-medium flex items-center gap-1 mt-1"><Check className="h-3.5 w-3.5" /> Confirmed</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-6 mb-6">
        <StatsCard
          label="Present"
          value={stats.presentToday.toString()}
          icon={CheckCircle2}
          accent="success"
        />
        <StatsCard
          label="On Leave"
          value={stats.onLeave.toString()}
          icon={Timer}
          accent="warning"
        />
        <StatsCard
          label="Absent"
          value={stats.absent.toString()}
          icon={AlertCircle}
          accent="danger"
        />
        <StatsCard
          label="Overtime Hours"
          value={`${stats.overtimeHours}h`}
          icon={Clock}
          accent="info"
        />
        <StatsCard
          label="Remaining Hours"
          value={`${stats.remainingWorkingHours}h`}
          icon={Timer}
          accent="primary"
        />
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => moveSelectedDate(-1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="rounded-xl border border-border bg-card px-4 h-9 flex items-center text-sm font-medium">
            {selectedDateLabel}
          </div>
          <button
            onClick={() => moveSelectedDate(1)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted"
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setSelectedDate(formatLocalDate(new Date()))}
            type="button"
          >
            Today
          </Button>
          <Button variant="outline" onClick={fetchAll} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          {!isEmployee && <Button variant="outline">Export Report</Button>}
        </div>
      </div>

      {/* Data Table */}
      <DataTable data={filteredRecords} columns={tableColumns} />

      {filteredRecords.length === 0 && (
        <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          No attendance records found for {selectedDateLabel}.
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {(showForm || editingRecord) && (
        <AttendanceForm
          initialData={editingRecord}
          onSubmit={editingRecord ? handleUpdate : handleCreate}
          lockedFields={
            isEmployee
              ? {
                  employee_name: true,
                  role: true,
                  department: true,
                  salary: true,
                  intime: true,
                  outtime: true,
                }
              : {}
          }
          forceValues={employeeFixedValues}
          onCancel={() => {
            setShowForm(false);
            setEditingRecord(null);
          }}
          loading={loading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-3xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/15 text-red-500">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Delete Record</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="flex-1"
              >
                {loading ? "Deleting..." : "Delete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={loading}
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

export default Attendance;
