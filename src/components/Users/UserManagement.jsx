import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatsCard from "@/components/ui/StatsCard";
import { Check, Copy, Pencil, Share2, Trash2, UserPlus, X, MapPin, Users } from "lucide-react";
import { useUsers } from "@/customHook/useUsers";

const emptyForm = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  role: "employee",
  is_active: true,
  password: "",
};

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

const UserManagement = () => {
  const { records, loading, error, success, fetchAll, createUser, updateUser, deleteUser, toggleStatus, clearMessages } = useUsers();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [copiedId, setCopiedId] = useState(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(!!(navigator.share && navigator.canShare));
  }, []);

  const handleCopy = async (u) => {
    const text = `Username: ${u.username}\nPassword: ${u.plain_password || ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(u.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy credentials: ", err);
    }
  };

  const handleShare = async (u) => {
    const shareData = {
      title: "PayrollX Credentials",
      text: `Username: ${u.username}\nPassword: ${u.plain_password || ""}`,
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Share failed:", err);
      }
    } else {
      handleCopy(u);
    }
  };

  const load = async () => {
    await fetchAll({
      ...(query ? { q: query } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(statusFilter ? { is_active: statusFilter } : {}),
    });
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ ...emptyForm, ...u, password: "" });
    setShowForm(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    if (editing) {
      await updateUser(editing.id, payload);
    } else {
      await createUser(payload);
    }
    setShowForm(false);
    setEditing(null);
  };

  const rows = useMemo(() => {
    if (!selectedRegion) return records;
    return records.filter((u) => {
      const branch = u.branch || "Not Assigned";
      return branch.toLowerCase() === selectedRegion.toLowerCase();
    });
  }, [records, selectedRegion]);

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
    records.forEach((u) => {
      const branch = u.branch;
      if (branch) {
        const matched = regions.find((reg) => reg.toLowerCase() === branch.toLowerCase());
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
  }, [records]);

  return (
    <div>
      {success && <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"><Check className="h-4 w-4" />{success}</div>}
      {error && <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700"><X className="h-4 w-4" />{error}</div>}

      <PageHeader
        title="User Management"
        description="Manage users, roles, and account status."
        actions={<Button variant="brand" size="pill" icon={UserPlus} onClick={openCreate}>Create User</Button>}
      />

      {/* Users Overview & Region Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Users Card */}
        <button
          onClick={() => setSelectedRegion("")}
          className={`lg:col-span-1 text-left w-full transition-all duration-300 ${
            selectedRegion !== "" 
              ? "opacity-60 hover:opacity-100 scale-[0.98]" 
              : "ring-2 ring-primary ring-offset-2 dark:ring-offset-background rounded-3xl shadow-lg scale-[1.02]"
          }`}
        >
          <StatsCard
            label="Total Users"
            value={records.length}
            icon={Users}
            accent="primary"
          />
        </button>
        {/* Region Breakdown Cards */}
        <div className="lg:col-span-3 bg-card border border-border/60 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold tracking-tight text-foreground">Region Distribution</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {Object.entries(regionStats).map(([region, count]) => {
              const style = regionStyles[region] || defaultStyle;
              const isSelected = selectedRegion.toLowerCase() === region.toLowerCase();
              const hasActiveFilter = selectedRegion !== "";

              return (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(prev => prev.toLowerCase() === region.toLowerCase() ? "" : region)}
                  className={`bg-gradient-to-br ${style.bg} border ${style.border} rounded-2xl p-3 flex flex-col justify-between text-left transition-all duration-300 ${
                    isSelected 
                      ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                      : hasActiveFilter 
                        ? "opacity-50 hover:opacity-100 scale-[0.95]" 
                        : "hover:shadow-sm hover:scale-[1.02]"
                  }`}
                >
                  <span className={`font-bold text-[11px] tracking-tight ${style.text}`}>{region}</span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className="text-lg font-extrabold tracking-tight text-foreground">{count}</span>
                    <span className="text-[9px] font-semibold text-muted-foreground">users</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input className="h-10 rounded-xl border border-border bg-card px-3 text-sm" placeholder="Search username/email/name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="h-10 rounded-xl border border-border bg-card px-3 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="superadmin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="employee">Employee</option>
        </select>
        <select className="h-10 rounded-xl border border-border bg-card px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>{loading ? "Loading..." : "Apply"}</Button>
          <Button variant="outline" onClick={() => { setQuery(""); setRoleFilter(""); setStatusFilter(""); setSelectedRegion(""); clearMessages(); fetchAll(); }}>Reset</Button>
        </div>
      </div>

      <DataTable
        data={rows}
        columns={[
          { key: "user", label: "User", render: (u) => <div className="flex items-center gap-2"><Avatar name={u.username} /><div><div className="text-sm font-medium">{u.username}</div><div className="text-xs text-muted-foreground">{u.email || "-"}</div></div></div> },
          { key: "name", label: "Name", render: (u) => <span className="text-sm">{`${u.first_name || ""} ${u.last_name || ""}`.trim() || "-"}</span> },
          { key: "role", label: "Role", render: (u) => <Badge variant="primary">{u.role}</Badge> },
          { key: "region", label: "Region", render: (u) => <span className="text-sm font-medium text-foreground">{u.branch || "Not Assigned"}</span> },
          { key: "phone", label: "Phone", render: (u) => <span className="text-sm">{u.phone_number || "-"}</span> },
          {
            key: "password",
            label: "Password",
            render: (u) => (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-900/30">
                  {u.plain_password || "-"}
                </span>
                {u.plain_password && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(u)}
                      className="p-1 hover:bg-muted rounded-md transition text-muted-foreground hover:text-indigo-600"
                      title="Copy credentials"
                    >
                      {copiedId === u.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {canShare && (
                      <button
                        onClick={() => handleShare(u)}
                        className="p-1 hover:bg-muted rounded-md transition text-muted-foreground hover:text-indigo-600"
                        title="Share credentials"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ),
          },
          { key: "status", label: "Status", render: (u) => <button onClick={() => toggleStatus(u.id, !u.is_active)} className="text-sm">{u.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}</button> },
          { key: "joined", label: "Joined", render: (u) => <span className="text-sm text-muted-foreground">{new Date(u.date_joined).toLocaleDateString()}</span> },
          { key: "actions", label: "", render: (u) => <div className="flex gap-1"><button className="grid h-8 w-8 place-items-center rounded-lg border border-border" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></button><button className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:text-red-600" onClick={() => deleteUser(u.id)}><Trash2 className="h-4 w-4" /></button></div> },
        ]}
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <form onSubmit={onSubmit} className="w-full max-w-xl rounded-2xl bg-card p-6 space-y-3">
            <h3 className="text-lg font-semibold">{editing ? "Edit User" : "Create User"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Username" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
              <input type="email" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Email" value={form.email || ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              <input className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="First Name" value={form.first_name || ""} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
              <input className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Last Name" value={form.last_name || ""} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
              <input className="h-10 rounded-xl border border-border bg-background px-3 text-sm" placeholder="Phone" value={form.phone_number || ""} onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))} />
              <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
                <option value="superadmin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
              </select>
            </div>
            <input type="password" className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder={editing ? "New password (optional)" : "Password"} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required={!editing} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />Active</label>
            <div className="flex gap-2 pt-2">
              <Button variant="brand" type="submit" disabled={loading}>{loading ? "Saving..." : editing ? "Update" : "Create"}</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
