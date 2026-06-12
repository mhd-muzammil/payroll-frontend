import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import { Check, Copy, Pencil, Share2, Trash2, UserPlus, X } from "lucide-react";
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

const UserManagement = () => {
  const { records, loading, error, success, fetchAll, createUser, updateUser, deleteUser, toggleStatus, clearMessages } = useUsers();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  const rows = useMemo(() => records, [records]);

  return (
    <div>
      {success && <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"><Check className="h-4 w-4" />{success}</div>}
      {error && <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700"><X className="h-4 w-4" />{error}</div>}

      <PageHeader
        title="User Management"
        description="Manage users, roles, and account status."
        actions={<Button variant="brand" size="pill" icon={UserPlus} onClick={openCreate}>Create User</Button>}
      />

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
          <Button variant="outline" onClick={() => { setQuery(""); setRoleFilter(""); setStatusFilter(""); clearMessages(); fetchAll(); }}>Reset</Button>
        </div>
      </div>

      <DataTable
        data={rows}
        columns={[
          { key: "user", label: "User", render: (u) => <div className="flex items-center gap-2"><Avatar name={u.username} /><div><div className="text-sm font-medium">{u.username}</div><div className="text-xs text-muted-foreground">{u.email || "-"}</div></div></div> },
          { key: "name", label: "Name", render: (u) => <span className="text-sm">{`${u.first_name || ""} ${u.last_name || ""}`.trim() || "-"}</span> },
          { key: "role", label: "Role", render: (u) => <Badge variant="primary">{u.role}</Badge> },
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
