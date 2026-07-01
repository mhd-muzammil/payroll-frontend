import React, { useState, useEffect, useMemo } from "react";
import { assetService } from "@/services/assetService";
import { employeeService } from "@/services/employeeService";
import PageHeader from "../ui/PageHeader";
import StatsCard from "../ui/StatsCard";
import DataTable from "../ui/DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Loader2,
  Laptop,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wrench,
  DollarSign,
  Calendar,
  AlertCircle,
  User,
} from "lucide-react";

const ASSET_TYPES = [
  "Laptop",
  "Desktop",
  "Monitor",
  "Mobile",
  "Tablet",
  "Keyboard",
  "Mouse",
  "Chair",
  "Desk",
  "Software License",
  "Other",
];

const STATUS_CHOICES = [
  { value: "available", label: "Available", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  { value: "assigned", label: "Assigned", color: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  { value: "repair", label: "Under Repair", color: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  { value: "retired", label: "Retired", color: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
];

export default function AssetManagement() {
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Form Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentAsset, setCurrentAsset] = useState(null); // null for create, object for edit
  const [formData, setFormData] = useState({
    asset_name: "",
    asset_type: "Laptop",
    serial_number: "",
    status: "available",
    assigned_to: "",
    purchase_date: "",
    cost: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog state
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const assetData = await assetService.getAll();
      const employeeData = await employeeService.getAll();
      setAssets(assetData);
      setEmployees(employeeData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch assets and employees. Please check back later.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setCurrentAsset(null);
    setFormError("");
    setFormData({
      asset_name: "",
      asset_type: "Laptop",
      serial_number: "",
      status: "available",
      assigned_to: "",
      purchase_date: "",
      cost: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (asset) => {
    setCurrentAsset(asset);
    setFormError("");
    setFormData({
      asset_name: asset.asset_name || "",
      asset_type: asset.asset_type || "Laptop",
      serial_number: asset.serial_number || "",
      status: asset.status || "available",
      assigned_to: asset.assigned_to || "",
      purchase_date: asset.purchase_date || "",
      cost: asset.cost ? parseFloat(asset.cost).toString() : "",
      notes: asset.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Auto status update: if an employee is assigned, force 'assigned' status.
      // If employee is cleared and status was 'assigned', default back to 'available'.
      if (name === "assigned_to") {
        if (value) {
          updated.status = "assigned";
        } else if (prev.status === "assigned") {
          updated.status = "available";
        }
      }
      // If status is changed manually away from 'assigned', clear assigned_to
      if (name === "status" && value !== "assigned") {
        updated.assigned_to = "";
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.asset_name.trim()) {
      setFormError("Asset Name is required.");
      return;
    }
    if (!formData.asset_type) {
      setFormError("Asset Type is required.");
      return;
    }

    try {
      setSubmitting(true);
      setFormError("");
      const payload = {
        ...formData,
        assigned_to: formData.assigned_to ? parseInt(formData.assigned_to) : null,
        cost: formData.cost ? parseFloat(formData.cost) : null,
        purchase_date: formData.purchase_date || null,
      };

      if (currentAsset) {
        const updated = await assetService.update(currentAsset.id, payload);
        setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const created = await assetService.create(payload);
        setAssets((prev) => [created, ...prev]);
      }
      setIsDialogOpen(false);
    } catch (err) {
      console.error("Form submit error:", err);
      const msg = err.response?.data?.serial_number?.[0] || 
                  err.response?.data?.detail || 
                  "Failed to save asset. Please verify input.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (asset, newStatus) => {
    try {
      const payload = {
        ...asset,
        status: newStatus,
        assigned_to: newStatus === "assigned" ? asset.assigned_to : null,
      };
      const updated = await assetService.patch(asset.id, payload);
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      console.error("Quick status update error:", err);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmAsset) return;
    try {
      setLoading(true);
      await assetService.delete(deleteConfirmAsset.id);
      setAssets((prev) => prev.filter((a) => a.id !== deleteConfirmAsset.id));
      setDeleteConfirmAsset(null);
    } catch (err) {
      console.error("Delete error:", err);
      setError("Failed to delete asset. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchSearch =
        asset.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.serial_number && asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (asset.employee_name && asset.employee_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType = typeFilter === "all" || asset.asset_type === typeFilter;
      const matchStatus = statusFilter === "all" || asset.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [assets, searchTerm, typeFilter, statusFilter]);

  // Calculations for Stats Card
  const stats = useMemo(() => {
    const total = assets.length;
    const assigned = assets.filter((a) => a.status === "assigned").length;
    const available = assets.filter((a) => a.status === "available").length;
    const repairOrRetired = assets.filter((a) => a.status === "repair" || a.status === "retired").length;
    return { total, assigned, available, repairOrRetired };
  }, [assets]);

  // Define Columns for DataTable
  const columns = [
    {
      key: "asset_name",
      label: "Asset Info",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{row.asset_name}</span>
          <span className="text-xs text-muted-foreground">{row.asset_type}</span>
        </div>
      ),
    },
    {
      key: "serial_number",
      label: "Serial Number",
      render: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.serial_number || "—"}</span>
      ),
    },
    {
      key: "assigned_to",
      label: "Assignment",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.status === "assigned" && row.employee_name ? (
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">{row.employee_name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground font-light">Unassigned</span>
          )}
        </div>
      ),
    },
    {
      key: "purchase_info",
      label: "Purchase Cost / Date",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">
            {row.cost ? `₹${parseFloat(row.cost).toLocaleString("en-IN")}` : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.purchase_date || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const choice = STATUS_CHOICES.find((c) => c.value === row.status);
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${choice ? choice.color : "bg-muted text-muted-foreground"}`}>
            {choice ? choice.label : row.status}
          </span>
        );
      },
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleOpenEdit(row)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Edit Asset"
          >
            <Edit2 className="h-4 w-4" />
          </Button>

          {row.status === "assigned" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleQuickStatusChange(row, "available")}
              className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
              title="Return to Pool"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
          )}

          {row.status !== "repair" && row.status !== "retired" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleQuickStatusChange(row, "repair")}
              className="h-8 w-8 text-muted-foreground hover:text-amber-500"
              title="Mark Under Repair"
            >
              <Wrench className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteConfirmAsset(row)}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="Delete Asset"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Management"
        description="Register, allocate, and audit company physical equipment and software licenses."
        actions={
          <Button variant="brand" size="pill" icon={Plus} onClick={handleOpenCreate}>
            Register Asset
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Stats Cards Section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Assets"
          value={loading ? "..." : stats.total}
          icon={Laptop}
          accent="primary"
        />
        <StatsCard
          label="Allocated Assets"
          value={loading ? "..." : stats.assigned}
          icon={User}
          accent="info"
        />
        <StatsCard
          label="Available in Pool"
          value={loading ? "..." : stats.available}
          icon={CheckCircle}
          accent="success"
        />
        <StatsCard
          label="Repair / Retired"
          value={loading ? "..." : stats.repairOrRetired}
          icon={AlertTriangle}
          accent="warning"
        />
      </div>

      {/* Filter and Table area */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search asset, serial, or employee..."
              className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>

          {/* Filters Dropdown */}
          <div className="flex flex-wrap gap-2">
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Type:</Label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All Types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Status:</Label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All Statuses</option>
                {STATUS_CHOICES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border border-border bg-card/50">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredAssets}
            emptyMessage="No assets match your search parameters."
          />
        )}
      </div>

      {/* Form Dialog for Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{currentAsset ? "Edit Asset" : "Register New Asset"}</DialogTitle>
            <DialogDescription>
              Provide asset details below. Automatically assigned assets will set status to "Assigned".
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {formError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Asset Name */}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="asset_name">Asset Name *</Label>
                <Input
                  id="asset_name"
                  name="asset_name"
                  value={formData.asset_name}
                  onChange={handleFormChange}
                  placeholder="e.g. MacBook Pro M3"
                  required
                />
              </div>

              {/* Asset Type */}
              <div className="space-y-1.5">
                <Label htmlFor="asset_type">Asset Type *</Label>
                <select
                  id="asset_type"
                  name="asset_type"
                  value={formData.asset_type}
                  onChange={handleFormChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Serial Number */}
              <div className="space-y-1.5">
                <Label htmlFor="serial_number">Serial / License Number</Label>
                <Input
                  id="serial_number"
                  name="serial_number"
                  value={formData.serial_number}
                  onChange={handleFormChange}
                  placeholder="e.g. C02XG5XMJGH6"
                />
              </div>

              {/* Purchase Date */}
              <div className="space-y-1.5">
                <Label htmlFor="purchase_date">Purchase Date</Label>
                <Input
                  id="purchase_date"
                  name="purchase_date"
                  type="date"
                  value={formData.purchase_date}
                  onChange={handleFormChange}
                />
              </div>

              {/* Cost */}
              <div className="space-y-1.5">
                <Label htmlFor="cost">Purchase Cost (INR)</Label>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  value={formData.cost}
                  onChange={handleFormChange}
                  placeholder="e.g. 120000"
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleFormChange}
                  disabled={!!formData.assigned_to}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {STATUS_CHOICES.map((sc) => (
                    <option key={sc.value} value={sc.value}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assigned To */}
              <div className="space-y-1.5">
                <Label htmlFor="assigned_to">Assign to Employee</Label>
                <select
                  id="assigned_to"
                  name="assigned_to"
                  value={formData.assigned_to}
                  onChange={handleFormChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Unassigned (Available)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_name} ({emp.branch})
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="notes">Notes / Details</Label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Add details, repair history, configuration, spec sheet, etc."
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Asset"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmAsset}
        onOpenChange={(open) => !open && setDeleteConfirmAsset(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Confirm Delete Asset
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmAsset?.asset_name}</strong>? 
              This will permanently remove it from the records and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmAsset(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
