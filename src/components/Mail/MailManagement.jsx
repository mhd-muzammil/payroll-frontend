import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Download, Inbox, Loader2, Mail, Paperclip, PenSquare, RefreshCw, Search, Send,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { mailService } from "../../services/mailService";
import ComposeDialog from "./ComposeDialog";
import MailBody from "./MailBody";

const MAIL_TABS = [
  { key: "NEW", label: "Inbox" },
  { key: "REVIEWED", label: "Reviewed" },
  { key: "IGNORED", label: "Ignored" },
  { key: "ALL", label: "All mail" },
];
const SYNC_EVERY_MS = 60 * 1000;

const STATUS_CHIP = {
  NEW: ["Inbox", "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"],
  REVIEWED: ["Reviewed", "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"],
  IGNORED: ["Ignored", "bg-muted text-muted-foreground"],
  SENT: ["Sent", "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"],
  FAILED: ["Failed", "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"],
};

const when = (iso, withYear = false) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}),
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "";

function Chip({ status }) {
  const [label, tone] = STATUS_CHIP[status] || [status, "bg-muted text-muted-foreground"];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>;
}

function problem(e, fallback) {
  return e?.response?.data?.detail || fallback;
}

function initials(name, email) {
  const parts = String(name || email || "?").split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

/** One mail, open: who, what, its files, the replies sent from here, and the answer box. */
function Reader({ id, onChanged, onBack }) {
  const [mail, setMail] = useState(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setMail(await mailService.detail(id));
      setError("");
    } catch (e) {
      setError(problem(e, "Could not open this mail."));
    }
  }, [id]);

  // A Reader is keyed by the mail it shows, so a new mail starts it afresh.
  useEffect(() => {
    let alive = true;
    mailService.detail(id).then(
      (data) => alive && setMail(data),
      (e) => alive && setError(problem(e, "Could not open this mail.")),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const mark = async (status) => {
    setBusy(status);
    setError("");
    try {
      await mailService.setStatus(id, status);
      await load();
      onChanged();
    } catch (e) {
      setError(problem(e, "Could not change it."));
    } finally {
      setBusy("");
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    if (!window.confirm(`Send this reply to ${mail.from_email}?`)) return;
    setBusy("reply");
    setError("");
    try {
      await mailService.reply(id, reply);
      setReply("");
      setNotice(`Reply sent to ${mail.from_email}.`);
      await load();
      onChanged();
    } catch (e) {
      setError(problem(e, "The reply did not go. Please try again."));
    } finally {
      setBusy("");
    }
  };

  const download = async (attachment) => {
    setError("");
    try {
      await mailService.download(mail.id, attachment.id);
    } catch (e) {
      setError(problem(e, "Could not download the file."));
    }
  };

  if (!mail) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error || (
          <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Opening…</span>
        )}
      </div>
    );
  }

  const files = mail.attachments.filter((a) => !a.is_inline);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground lg:hidden">
        <ArrowLeft className="h-4 w-4" /> Back to the list
      </button>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-snug break-words">{mail.subject || "(No subject)"}</h2>
        <div className="text-sm">
          <span className="font-medium">{mail.from_name || mail.from_email}</span>
          {mail.from_name && <span className="text-muted-foreground"> &lt;{mail.from_email}&gt;</span>}
        </div>
        <div className="text-xs text-muted-foreground break-words">To: {mail.to_text || "—"}</div>
        {mail.cc_text && <div className="text-xs text-muted-foreground break-words">Cc: {mail.cc_text}</div>}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span>{when(mail.received_at, true)}</span>
          <Chip status={mail.status} />
          {mail.status_by && mail.status !== "NEW" && <span>by {mail.status_by}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {mail.status !== "REVIEWED" && (
          <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => mark("REVIEWED")} className="rounded-lg">
            Mark reviewed
          </Button>
        )}
        {mail.status !== "IGNORED" && (
          <Button size="sm" variant="outline" disabled={busy !== ""} onClick={() => mark("IGNORED")} className="rounded-lg">
            Ignore
          </Button>
        )}
        {mail.status !== "NEW" && (
          <Button size="sm" variant="ghost" disabled={busy !== ""} onClick={() => mark("NEW")} className="rounded-lg">
            Back to Inbox
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => download(file)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="max-w-[220px] truncate">{file.filename}</span>
              <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-white p-3 text-slate-900">
        <MailBody key={mail.id} mail={mail} />
      </div>

      {mail.replies.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Replies sent from here</div>
          {mail.replies.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{when(r.created_at, true)}</span>
                <span>by {r.sent_by || "—"}</span>
                <Chip status={r.status} />
              </div>
              <div className="whitespace-pre-wrap break-words">{r.body.split("\n\nOn ")[0]}</div>
              {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
            </div>
          ))}
        </div>
      )}

      {mail.can_reply ? (
        <div className="space-y-2">
          <label htmlFor="mail-reply" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Reply to {mail.from_email}
          </label>
          <textarea
            id="mail-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={5}
            placeholder="Write your reply. Their mail is quoted under it when it goes."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={sendReply} disabled={!reply.trim() || busy !== ""} className="gap-2 rounded-xl">
            {busy === "reply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send reply
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          This mail was sent by a machine (an auto-reply, a mailing list or a no-reply address), so it cannot be answered from here.
        </p>
      )}
    </div>
  );
}

function SentPanel({ reloadKey }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    mailService.sent().then(
      (data) => alive && setRows(data),
      (e) => alive && setError(problem(e, "Could not load what was sent.")),
    );
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!rows) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="p-6 text-sm text-muted-foreground">Nothing has been sent from here yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full px-4 py-3 text-left hover:bg-muted/40">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{when(r.created_at, true)}</span>
              <span>{{ REPLY: "Reply", COMPOSE: "New mail", OFFER: "Offer letter" }[r.kind] || r.kind}</span>
              <span>by {r.sent_by || "—"}</span>
              <Chip status={r.status} />
              {r.attachment_names.length > 0 && (
                <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{r.attachment_names.length}</span>
              )}
            </div>
            <div className="mt-0.5 truncate text-sm font-medium">{r.subject}</div>
            <div className="truncate text-xs text-muted-foreground">To: {r.to_text}{r.cc_text ? ` · Cc: ${r.cc_text}` : ""}</div>
          </button>
          {open === r.id && (
            <div className="space-y-2 bg-muted/20 px-4 pb-4 text-sm">
              {r.error && <div className="text-xs text-destructive">{r.error}</div>}
              {r.attachment_names.length > 0 && <div className="text-xs text-muted-foreground">Files: {r.attachment_names.join(", ")}</div>}
              <div className="whitespace-pre-wrap break-words">{r.body}</div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PayrollMailsPanel({ reloadKey }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    mailService.system().then(
      (data) => alive && setRows(data),
      (e) => alive && setError(problem(e, "Could not load Payroll's mails.")),
    );
    return () => {
      alive = false;
    };
  }, [reloadKey]);
  if (error) return <p className="p-6 text-sm text-destructive">{error}</p>;
  if (!rows) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="p-6 text-sm text-muted-foreground">Payroll has not sent any mail yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {["When", "What", "To", "About", "Status"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60 align-top">
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{when(r.created_at, true)}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.kind_label}</div>
                <div className="text-xs text-muted-foreground">{r.subject}</div>
              </td>
              <td className="px-3 py-2 break-all">{r.to_text}</td>
              <td className="px-3 py-2">{r.about || "—"}</td>
              <td className="px-3 py-2">
                <Chip status={r.status} />
                {r.error && <div className="mt-1 max-w-[260px] text-xs text-destructive">{r.error}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Mail section: the HR mailbox inside Payroll, laid out like the customer
 * mail in OpenCall -- the list on the left, the open mail on the right. New
 * mail is copied in when the page opens and every minute while it is open,
 * newest first, and a backlog is fetched straight through; Sent is what HR
 * sent from here, and Payroll mails is what Payroll sent by itself.
 */
export default function MailManagement() {
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("NEW");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  // The page checks for new mail as it opens, so it starts out checking.
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped whenever the open list should be read again.
  const [listVersion, setListVersion] = useState(0);
  // How many mails the server held at the last check. The list is read again
  // whenever that moves -- not only when this page's own check stored some,
  // since another check (another person, an earlier one) may have.
  const seenTotal = useRef(null);

  // The page's one way to check for mail, set up by the effect below.
  const checkFor = useRef(null);

  const isMailTab = MAIL_TABS.some((t) => t.key === tab);

  useEffect(() => {
    let alive = true;
    let busy = false;
    const timers = new Set();
    const later = (job, ms) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        job();
      }, ms);
      timers.add(id);
    };
    const apply = (result) => {
      setSummary(result);
      const total = result.counts?.ALL ?? null;
      if (result.stored > 0 || total !== seenTotal.current) setListVersion((n) => n + 1);
      seenTotal.current = total;
    };
    // Callers have already shown "checking"; this settles it.
    const run = (force) => {
      busy = true;
      mailService.sync(force).then(
        (result) => {
          if (!alive) return;
          apply(result);
          if (result.pending > 0 && !result.error) {
            // More mail is waiting (newest came first): keep going until it is all in.
            later(() => run(true), 1500);
            return;
          }
          busy = false;
          setSyncing(false);
          // Another check was already reading the mailbox (another tab, another
          // person). Look again once it will have stored what it found.
          if (result.skipped) {
            later(() => mailService.summary().then((s) => alive && apply({ ...s, stored: 0 }), () => {}), 6000);
          }
        },
        (e) => {
          if (!alive) return;
          busy = false;
          setError(problem(e, "Could not check for new mail."));
          setSyncing(false);
        },
      );
    };
    checkFor.current = () => {
      if (busy) return;
      setSyncing(true);
      run(true);
    };
    run(false);
    const timer = window.setInterval(() => {
      if (busy || document.visibilityState !== "visible") return;
      setSyncing(true);
      run(false);
    }, SYNC_EVERY_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!isMailTab) return undefined;
    let alive = true;
    mailService.list(tab, search, 0).then(
      (data) => {
        if (!alive) return;
        setRows(data.rows);
        setHasMore(data.has_more);
        setError("");
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(problem(e, "Could not load the mail."));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [tab, search, isMailTab, listVersion]);

  const loadOlder = async () => {
    try {
      const data = await mailService.list(tab, search, rows.length);
      setRows((current) => [...current, ...data.rows]);
      setHasMore(data.has_more);
    } catch (e) {
      setError(problem(e, "Could not load older mail."));
    }
  };

  const checkNow = () => checkFor.current?.();

  const chooseTab = (key) => {
    if (key === tab) return;
    setSelected(null);
    setLoading(true);
    setTab(key);
  };

  const changed = () => {
    mailService.summary().then(setSummary, () => {});
    setListVersion((n) => n + 1);
  };

  const counts = summary?.counts || {};
  const tabs = [
    ...MAIL_TABS.map((t) => ({ ...t, count: counts[t.key] })),
    { key: "SENT", label: "Sent" },
    { key: "SYSTEM", label: "Payroll mails" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 rounded-3xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl">
            <Mail className="h-7 w-7 text-indigo-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mail</h1>
            <p className="text-sm text-slate-300 mt-0.5">
              {summary?.mailbox || "HR mailbox"}
              {summary?.last_polled_at ? ` · checked ${when(summary.last_polled_at)}` : ""}
              {summary?.pending > 0 ? ` · getting ${summary.pending} more…` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={checkNow}
            disabled={syncing}
            className="bg-white/10 border-white/25 text-white hover:bg-white/20 rounded-xl gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Check for new mail
          </Button>
          <Button variant="brand" onClick={() => setComposeOpen(true)} disabled={!summary?.set_up} className="rounded-xl gap-2">
            <PenSquare className="h-4 w-4" />
            New mail
          </Button>
        </div>
      </div>

      {summary && !summary.set_up && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          The HR mailbox is not set up on the server yet: EMAIL_HOST_USER and EMAIL_HOST_PASSWORD are needed in the backend&apos;s settings.
        </div>
      )}
      {summary?.set_up && summary.last_error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {summary.last_error}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => chooseTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1.5 tabular-nums opacity-80">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {tab === "SENT" ? (
          <SentPanel reloadKey={reloadKey} />
        ) : tab === "SYSTEM" ? (
          <PayrollMailsPanel reloadKey={reloadKey} />
        ) : (
          <div className="grid lg:grid-cols-[380px_1fr] min-h-[560px]">
            <div className={`border-b lg:border-b-0 lg:border-r border-border ${selected ? "hidden lg:block" : ""}`}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim() === search) return;
                  setSelected(null);
                  setLoading(true);
                  setSearch(query.trim());
                }}
                className="flex items-center gap-2 border-b border-border p-3"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sender, subject or text" className="h-8" />
              </form>
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
                  <Inbox className="h-8 w-8" />
                  {search ? "Nothing matches that search." : "No mail here."}
                </div>
              ) : (
                <ul className="max-h-[70vh] overflow-y-auto divide-y divide-border">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r.id)}
                        className={`flex w-full gap-3 px-3 py-3 text-left hover:bg-muted/50 ${selected === r.id ? "bg-muted" : ""}`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                          {initials(r.from_name, r.from_email)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`truncate text-sm ${r.status === "NEW" ? "font-semibold" : "font-medium"}`}>
                              {r.from_name || r.from_email}
                            </span>
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{when(r.received_at)}</span>
                          </span>
                          <span className="flex items-center gap-1 truncate text-sm">
                            {r.attachments > 0 && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className="truncate">{r.subject || "(No subject)"}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{r.preview}</span>
                          {tab === "ALL" && r.status !== "NEW" && <Chip status={r.status} />}
                        </span>
                      </button>
                    </li>
                  ))}
                  {hasMore && (
                    <li className="p-3 text-center">
                      <Button variant="outline" size="sm" onClick={loadOlder} className="rounded-lg">
                        Load older
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className={selected ? "" : "hidden lg:block"}>
              {selected ? (
                <Reader key={selected} id={selected} onChanged={changed} onBack={() => setSelected(null)} />
              ) : (
                <div className="flex h-full min-h-[300px] items-center justify-center p-6 text-sm text-muted-foreground">
                  Choose a mail to read it.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {composeOpen && (
        <ComposeDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          mailbox={summary?.mailbox}
          onSent={() => setReloadKey((n) => n + 1)}
        />
      )}
    </div>
  );
}
