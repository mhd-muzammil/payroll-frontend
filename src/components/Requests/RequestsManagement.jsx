import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Banknote,
  Fuel,
  Receipt,
  CircleDollarSign,
  MessageSquareWarning,
  Plus,
  X,
  Send,
  Check,
  Ban,
  Clock,
} from "lucide-react";
import PageHeader from "../ui/PageHeader";
import StatsCard from "../ui/StatsCard";
import { requestService } from "../../services/requestService";
import { extractArray } from "../../Utility/apiUtils";
import { getUserRole, ROLES } from "../../auth/rbac";

const TYPES = [
  { value: "salary_advance", label: "Salary advance", icon: Banknote, needsAmount: true },
  { value: "petrol_advance", label: "Petrol advance", icon: Fuel, needsAmount: true },
  // Money already spent out of pocket and claimed back, as against an advance
  // asked for up front. Same conversation, same approval, different question.
  {
    value: "expense",
    label: "Expense claim",
    icon: Receipt,
    needsAmount: true,
    amountLabel: "Amount spent (₹)",
    reasonPlaceholder: "Bus fare to the Coimbatore site, ₹340 — bill attached below",
  },
  { value: "other_amount", label: "Other amount", icon: CircleDollarSign, needsAmount: true },
  { value: "report", label: "Report / message", icon: MessageSquareWarning, needsAmount: false },
];

// A type the backend knows but this list does not must not fall through to
// whichever entry happens to sit at an index, so name the fallback.
const REPORT_META = TYPES[TYPES.length - 1];
const typeMeta = (value) => TYPES.find((t) => t.value === value) || REPORT_META;

const STATUS_VARIANT = { Pending: "warning", Approved: "success", Rejected: "destructive" };

const money = (value) =>
  value == null ? "—" : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

export default function RequestsManagement() {
  const isEmployee = getUserRole() === ROLES.EMPLOYEE;

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(isEmployee ? "" : "Pending");
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ request_type: "salary_advance", amount: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);

  const [openThread, setOpenThread] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, counts] = await Promise.all([
        requestService.getAll(),
        requestService.summary(),
      ]);
      setRecords(extractArray(list));
      setSummary(counts);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load requests");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (statusFilter ? records.filter((r) => r.status === statusFilter) : records),
    [records, statusFilter]
  );

  const activeType = typeMeta(form.request_type);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await requestService.create({
        request_type: form.request_type,
        // A report carries no amount; the server drops one anyway, but there is
        // no reason to send a figure the form never showed.
        amount: activeType.needsAmount ? form.amount : null,
        reason: form.reason,
      });
      setForm({ request_type: "salary_advance", amount: "", reason: "" });
      setShowForm(false);
      await load();
    } catch (e) {
      const data = e?.response?.data;
      setError(data?.amount?.[0] || data?.reason?.[0] || data?.detail || "Could not send the request");
    } finally {
      setSubmitting(false);
    }
  };

  const openConversation = async (record) => {
    setOpenThread(record);
    setDraft("");
    try {
      setThread(await requestService.messages(record.id));
      // Opening clears this side's unread flag, so refresh the badge counts.
      const counts = await requestService.summary();
      setSummary(counts);
      setRecords((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, unread_count: 0 } : r))
      );
    } catch {
      setThread([]);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !openThread) return;
    setDraft("");
    try {
      const message = await requestService.sendMessage(openThread.id, body);
      setThread((prev) => [...prev, message]);
    } catch {
      setDraft(body); // put it back rather than losing what they typed
      setError("Message could not be sent");
    }
  };

  const decide = async (record, approve) => {
    const note = window.prompt(
      `${approve ? "Approve" : "Reject"} ${record.employee_name}'s ${typeMeta(record.request_type).label.toLowerCase()}.\n\nAdd a note (optional) — the employee will see it:`,
      ""
    );
    if (note === null) return; // cancelled

    setBusyId(record.id);
    try {
      const updated = approve
        ? await requestService.approve(record.id, note)
        : await requestService.reject(record.id, note);
      setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, ...updated } : r)));
      setSummary(await requestService.summary());
      if (openThread?.id === record.id) {
        setOpenThread(updated);
        setThread(await requestService.messages(record.id));
      }
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not record the decision");
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (record) => {
    if (!window.confirm("Withdraw this request?")) return;
    setBusyId(record.id);
    try {
      await requestService.withdraw(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      setSummary(await requestService.summary());
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not withdraw the request");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title={isEmployee ? "My Requests" : "Employee Requests"}
        description={
          isEmployee
            ? "Ask for an advance, claim an expense you paid for, or report something to the office."
            : "Advance and report requests raised by employees. Approving records the decision — the payroll deduction is still entered on the employee record."
        }
        actions={
          isEmployee && (
            <Button onClick={() => setShowForm((v) => !v)}>
              {showForm ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> New Request</>}
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "All", value: summary.total, status: "", icon: CircleDollarSign, accent: "primary" },
          { label: "Pending", value: summary.pending, status: "Pending", icon: Clock, accent: "warning" },
          { label: "Approved", value: summary.approved, status: "Approved", icon: Check, accent: "success" },
          { label: "Rejected", value: summary.rejected, status: "Rejected", icon: Ban, accent: "muted" },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => setStatusFilter(card.status)}
            className={`text-left w-full transition-all duration-300 ${
              statusFilter === card.status
                ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-background rounded-3xl scale-[1.02]"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            <StatsCard label={card.label} value={String(card.value)} icon={card.icon} accent={card.accent} />
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-6 rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setForm((f) => ({ ...f, request_type: t.value }))}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-left transition ${
                  form.request_type === t.value
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            ))}
          </div>

          {activeType.needsAmount && (
            <div>
              <label className="text-sm font-medium">{activeType.amountLabel || "Amount (₹)"}</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="mt-1 h-10 w-full max-w-xs rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="5000"
              />
            </div>
          )}

          <div>
            <label className="text-sm font-medium">
              {activeType.needsAmount ? "What is it for?" : "What would you like to report?"}
            </label>
            <textarea
              required
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={
                activeType.reasonPlaceholder ||
                (activeType.needsAmount ? "Medical expense at home" : "Describe what happened")
              }
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send Request"}
          </Button>
        </form>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading requests…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">
          {statusFilter ? `No ${statusFilter.toLowerCase()} requests.` : "No requests yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const meta = typeMeta(r.request_type);
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {!isEmployee && <Avatar name={r.employee_name} />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <meta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{r.request_type_label}</span>
                        {r.amount != null && (
                          <span className="font-semibold text-foreground">{money(r.amount)}</span>
                        )}
                        <Badge variant={STATUS_VARIANT[r.status] || "muted"}>{r.status}</Badge>
                        {r.unread_count > 0 && (
                          <Badge variant="destructive">{r.unread_count} new</Badge>
                        )}
                      </div>
                      {!isEmployee && (
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {r.employee_name}{r.branch ? ` · ${r.branch}` : ""}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-1 break-words">{r.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Raised {when(r.created_at)}
                        {r.reviewed_at && ` · ${r.status.toLowerCase()} ${when(r.reviewed_at)}`}
                        {r.reviewed_by_name && ` by ${r.reviewed_by_name}`}
                      </p>
                    </div>
                  </div>

                  {/* Below sm the cluster takes its own full-width line and
                      wraps: shrink-0 plus the button's inherited nowrap meant
                      three buttons (~293px) spilled a 264px card at 360px, and
                      Reject was only reachable by panning the page sideways. */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openConversation(r)}>
                      Conversation
                    </Button>
                    {!isEmployee && r.status === "Pending" && (
                      <>
                        <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r, true)}>
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === r.id}
                          onClick={() => decide(r, false)}
                        >
                          <Ban className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {isEmployee && r.status === "Pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() => withdraw(r)}
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openThread && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="font-semibold">{typeMeta(openThread.request_type).label}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {isEmployee ? openThread.reason : `${openThread.employee_name} · ${openThread.reason}`}
                </p>
              </div>
              <button
                onClick={() => setOpenThread(null)}
                className="rounded-full p-1.5 hover:bg-muted shrink-0"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {thread.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No messages yet. Ask a question here.
                </p>
              )}
              {thread.map((m) => {
                // "Mine" is whichever side the viewer is on.
                const mine = m.from_employee === isEmployee;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.is_decision
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-300/50"
                          : mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                      }`}
                    >
                      {!mine && (
                        <div className="text-xs font-medium opacity-70 mb-0.5">{m.sender_name}</div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className="text-[10px] opacity-60 mt-1">{when(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-border flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Write a message…"
                className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button size="sm" onClick={send} disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
