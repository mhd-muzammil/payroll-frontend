import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "../ui/PageHeader";
import StatsCard from "../ui/StatsCard";
import Toolbar from "../ui/Toolbar";
import DataTable from "../ui/DataTable";
import { Users, UserPlus, UserCheck, UserMinus, Pencil, Trash2, X, Check, Clock } from "lucide-react";
import { useEmployee } from "../../customHook/useEmployee";
import EmployeeForm from "./EmployeeForm";

const EmployeesPage = () => {
  const {
    records,
    loading,
    error,
    success,
    fetchAll,
    createRecord,
    updateRecord,
    deleteRecord,
    clearMessages,
  } = useEmployee();
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("working"); // working | separated
  const [selectedRegion, setSelectedRegion] = useState("");

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleCreate = async (formData) => {
    await createRecord(formData);
    setShowForm(false);
  };

  const handleUpdate = async (formData) => {
    if (!editingRecord?.id) return;
    await updateRecord(editingRecord.id, formData);
    setEditingRecord(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm?.id) return;
    await deleteRecord(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const safeRecords = Array.isArray(records) ? records : [];

  const employeeRows = useMemo(
    () =>
      safeRecords.map((employee) => ({
        ...employee,
        employee_name: employee.employee_name || "Unnamed Employee",
        branch: employee.branch || "Chennai",
        email: employee.email || "",
        phone: employee.phone || "",
        role: employee.role || "",
        department: employee.department || "",
        salary: employee.salary || "",
        status: employee.status || "active",
        joining_date: employee.joining_date || "",
      })),
    [safeRecords]
  );

  const filteredEmployees = useMemo(() => {
    let list = employeeRows;
    if (activeTab === "working") {
      list = list.filter((e) => e.status === "active" || e.status === "onleave");
    } else {
      list = list.filter((e) => e.status === "inactive");
    }
    if (selectedRegion) {
      list = list.filter((e) => (e.branch || "Chennai").toLowerCase() === selectedRegion.toLowerCase());
    }
    return list;
  }, [employeeRows, activeTab, selectedRegion]);

  const employeeStats = useMemo(() => {
    let list = employeeRows;
    if (selectedRegion) {
      list = list.filter((e) => (e.branch || "Chennai").toLowerCase() === selectedRegion.toLowerCase());
    }
    const total = list.length;
    const active = list.filter((employee) => employee.status === "active").length;
    const onLeave = list.filter((employee) => employee.status === "onleave").length;
    const inactive = list.filter((employee) => employee.status === "inactive").length;

    return { total, active, onLeave, inactive };
  }, [employeeRows, selectedRegion]);

  if (loading && safeRecords.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">Loading employees...</div>;
  }

  return (
    <div>
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          {success}
          <button onClick={clearMessages} className="ml-auto text-emerald-600/80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <X className="h-4 w-4" />
          {error}
          <button onClick={clearMessages} className="ml-auto text-red-600/80">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <PageHeader
        title="Employees"
        description="Manage your workforce, roles and compensation."
        actions={
          <Button
            variant="brand"
            size="pill"
            icon={UserPlus}
            onClick={() => {
              setEditingRecord(null);
              setShowForm(true);
            }}
          >
            Add employee
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-6">
        <StatsCard label="Total Employees" value={employeeStats.total.toString()} delta="3.2%" icon={Users} accent="primary" />
        <StatsCard label="Active" value={employeeStats.active.toString()} delta="2.1%" icon={UserCheck} accent="success" />
        <StatsCard label="On Leave" value={employeeStats.onLeave.toString()} delta="0.8%" icon={Clock} accent="warning" />
        <StatsCard label="Inactive" value={employeeStats.inactive.toString()} delta="14%" icon={UserMinus} accent="muted" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex rounded-2xl overflow-hidden bg-muted/40 p-1.5 max-w-md border border-border flex-1 min-w-[280px]">
          <button
            onClick={() => setActiveTab("working")}
            className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === "working"
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Working ({employeeStats.active + employeeStats.onLeave})
          </button>
          <button
            onClick={() => setActiveTab("separated")}
            className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === "separated"
                ? "bg-card text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Separated ({employeeStats.inactive})
          </button>
        </div>

        <select
          value={selectedRegion}
          onChange={(e) => setSelectedRegion(e.target.value)}
          className="h-9 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
        >
          <option value="">All Regions</option>
          <option value="Chennai">Chennai</option>
          <option value="Vellore">Vellore</option>
          <option value="Salem">Salem</option>
          <option value="Kanchipuram">Kanchipuram</option>
          <option value="Hosur">Hosur</option>
        </select>
      </div>

      <Toolbar
        onAdd={() => {
          setEditingRecord(null);
          setShowForm(true);
        }}
        addLabel="Add employee"
      />

      <DataTable
        data={filteredEmployees}
        columns={[
          {
            key: "name", label: "Employee",
            render: (e) => (
              <div className="flex items-center gap-3">
                <Avatar name={e.employee_name} />
                <div>
                  <div className="font-medium text-sm">{e.employee_name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{e.branch}</div>
                </div>
              </div>
            ),
          },
          {
            key: "email",
            label: "Email",
            render: (e) => (
              <span className="text-sm text-muted-foreground">
                {e.email || "-"}
              </span>
            ),
          },
          { key: "role", label: "Role", render: (e) => <span className="text-sm">{e.role}</span> },
          { key: "department", label: "Department", render: (e) => <Badge variant="primary">{e.department}</Badge> },
          { key: "branch", label: "Branch", render: (e) => <span className="text-sm font-medium">{e.branch}</span> },
          { key: "phone", label: "Phone", render: (e) => <span className="text-sm">{e.phone || "-"}</span> },
          { key: "salary", label: "Salary", render: (e) => <span className="font-medium text-sm">{e.salary}</span> },
          {
            key: "joining_date",
            label: "Joined",
            render: (e) => (
              <span className="text-sm text-muted-foreground">
                {e.joining_date ? new Date(e.joining_date).toLocaleDateString("en-US") : "-"}
              </span>
            ),
          },
          {
            key: "status", label: "Status",
            render: (e) => (
              <Badge
                variant={
                  e.status === "active"
                    ? "success"
                    : e.status === "onleave"
                      ? "warning"
                      : "muted"
                }
              >
                {e.status === "onleave"
                  ? "On Leave"
                  : e.status === "inactive"
                    ? "Inactive"
                    : "Active"}
              </Badge>
            ),
          },
          {
            key: "act", label: "", className: "w-12",
            render: (e) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingRecord(e);
                    setShowForm(false);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted"
                  title="Edit employee"
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(e)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-red-50 hover:text-red-500"
                  title="Delete employee"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]}
      />

      {(showForm || editingRecord) && (
        <EmployeeForm
          initialData={editingRecord}
          onSubmit={editingRecord ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingRecord(null);
          }}
          loading={loading}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-3xl bg-card p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">Delete Employee</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete {deleteConfirm.employee_name}? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
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

export default EmployeesPage;
