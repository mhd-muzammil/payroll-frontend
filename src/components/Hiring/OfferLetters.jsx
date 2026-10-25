import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Edit, FileText, Loader2, Mail, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { offerLetterService } from "../../services/offerLetterService";

// Every amount is per month, in rupees. The defaults are the sample letter's.
const AMOUNTS = [
  ["basic", "Basic"],
  ["hra", "HRA"],
  ["conveyance", "Conveyance"],
  ["cea", "CEA"],
  ["personal_allowance", "Personal Allowances"],
  ["professional_tax", "Professional Tax"],
  ["insurance", "Insurance"],
  ["petrol_allowance", "Petrol allowance"],
];

const EMPTY = {
  ref_no: "",
  name: "",
  designation: "Service engineer",
  joining_date: "",
  basic: "",
  hra: "",
  conveyance: "1600",
  cea: "200",
  personal_allowance: "",
  professional_tax: "208",
  insurance: "207",
  petrol_allowance: "3000",
};

const rupees = (n) => Number(n || 0).toLocaleString("en-IN");
const num = (v) => Number(v) || 0;

/** Annexure-I's sums, as the server works them out. */
function sums(form) {
  const gross =
    num(form.basic) + num(form.hra) + num(form.conveyance) + num(form.cea) + num(form.personal_allowance);
  const benefits = num(form.insurance) + num(form.petrol_allowance);
  return { gross, net: gross - num(form.professional_tax), ctc: gross + benefits };
}

/**
 * Mail one letter: HR's own offer mail with the PDF attached, sent from the
 * HR mailbox. The preview is the server's, so what is shown is what goes.
 */
// Mounted per letter (key), so every opening starts from that letter.
function MailLetter({ letter, onBack, onSent }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [dear, setDear] = useState(letter.name);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // The preview follows the name, a moment after typing stops.
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      offerLetterService.mailPreview(letter.id, dear).then(
        (data) => alive && setPreview(data),
        (e) => alive && setError(firstError(e?.response?.data) || "Could not show the mail."),
      );
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [letter.id, dear]);

  const send = async (event) => {
    event.preventDefault();
    const people = [to, cc].filter((v) => v.trim()).join(", ");
    if (!window.confirm(`Mail ${letter.name}'s offer letter to ${people}?`)) return;
    setSending(true);
    setError("");
    try {
      const data = await offerLetterService.sendMail(letter.id, { to, cc, dear });
      onSent(`Offer letter mailed to ${data.sent_to.join(", ")}${data.cc.length ? ` (cc ${data.cc.join(", ")})` : ""}.`);
    } catch (e) {
      setError(firstError(e?.response?.data) || "The mail did not go. Please try again.");
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-4 mt-2">
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ol-mail-to" className="text-xs font-bold">To *</Label>
          <Input id="ol-mail-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="candidate@gmail.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ol-mail-cc" className="text-xs font-bold">Cc</Label>
          <Input id="ol-mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@renderways.in, …" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="ol-mail-dear" className="text-xs font-bold">Name after &ldquo;Dear&rdquo; *</Label>
          <Input id="ol-mail-dear" value={dear} maxLength={60} onChange={(e) => setDear(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Subject: {preview?.subject || "Offer Letter"}</span>
          {preview?.attachment && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs">
              <Paperclip className="h-3 w-3" /> {preview.attachment}
            </span>
          )}
        </div>
        <div className="rounded-xl border border-border bg-white p-3">
          {preview ? (
            <iframe
              title="Offer mail"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;background:#fff}</style></head><body>${preview.html}</body></html>`}
              sandbox="allow-popups"
              className="block h-[420px] w-full border-0"
            />
          ) : (
            <p className="p-6 text-sm text-slate-500">Loading the mail…</p>
          )}
        </div>
      </div>
      <div className="flex justify-between gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" onClick={onBack} disabled={sending} className="rounded-xl flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button type="submit" disabled={sending || !preview} className="rounded-xl flex items-center gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send mail
        </Button>
      </div>
    </form>
  );
}

function firstError(data) {
  if (!data || typeof data !== "object") return "";
  if (data.detail) return String(data.detail);
  const [field, value] = Object.entries(data)[0] || [];
  const text = Array.isArray(value) ? value[0] : value;
  return field ? `${field.replace(/_/g, " ")}: ${text}` : "";
}

/**
 * The Hiring Portal's offer letters: HR's own six-page letter, with only the
 * reference, name, role, joining date and pay filled in. Made here, downloaded
 * as the same PDF HR used to make in Word.
 */
// Mounted only while open (see HiringManagement), so every opening starts on
// the list with fresh state.
export default function OfferLetters({ open, onOpenChange }) {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null: the list; {}: a new letter; a letter: editing it
  const [form, setForm] = useState(EMPTY);
  const [netSalary, setNetSalary] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [mailing, setMailing] = useState(null); // the letter being mailed
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    offerLetterService.list().then(
      (rows) => {
        if (!alive) return;
        setLetters(rows);
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(firstError(e?.response?.data) || "Could not load the offer letters.");
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [reloads]);

  const load = useCallback(() => {
    setLoading(true);
    setReloads((n) => n + 1);
  }, []);

  const startNew = async () => {
    setError("");
    setNetSalary("");
    setForm({ ...EMPTY });
    setEditing({});
    try {
      const ref = await offerLetterService.nextRef();
      setForm((f) => (f.ref_no ? f : { ...f, ref_no: ref }));
    } catch {
      // The reference can be typed by hand.
    }
  };

  const startEdit = (letter) => {
    setError("");
    setNetSalary("");
    const values = { ...EMPTY };
    Object.keys(EMPTY).forEach((key) => {
      values[key] = letter[key] == null ? "" : String(letter[key]);
    });
    setForm(values);
    setEditing(letter);
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // The sample letter's split, from the take-home pay: gross is net plus
  // professional tax, Basic half of gross, HRA half of Basic, Conveyance and
  // CEA as they are, the rest Personal Allowances. Every line stays editable.
  const fillFromNet = () => {
    const net = num(netSalary);
    if (net <= 0) {
      setError("Type the net (take-home) salary first.");
      return;
    }
    const gross = net + num(form.professional_tax);
    const basic = Math.round(gross / 2);
    const hra = Math.round(basic / 2);
    const personal = gross - basic - hra - num(form.conveyance) - num(form.cea);
    if (personal < 0) {
      setError("That net salary is too small for this split. Type the lines by hand.");
      return;
    }
    setError("");
    setForm((f) => ({ ...f, basic: String(basic), hra: String(hra), personal_allowance: String(personal) }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = { ...form };
    AMOUNTS.forEach(([key]) => {
      body[key] = num(form[key]);
    });
    try {
      if (editing?.id) await offerLetterService.update(editing.id, body);
      else await offerLetterService.create(body);
      setEditing(null);
      load();
    } catch (e) {
      setError(firstError(e?.response?.data) || "Could not save the offer letter.");
    } finally {
      setSaving(false);
    }
  };

  const download = async (letter) => {
    setBusyId(letter.id);
    setError("");
    try {
      await offerLetterService.download(letter.id);
    } catch (e) {
      setError(firstError(e?.response?.data) || "Could not prepare the PDF. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (letter) => {
    if (!window.confirm(`Delete the offer letter ${letter.ref_no} for ${letter.name}?`)) return;
    setBusyId(letter.id);
    setError("");
    try {
      await offerLetterService.remove(letter.id);
      load();
    } catch (e) {
      setError(firstError(e?.response?.data) || "Could not delete the offer letter.");
    } finally {
      setBusyId(null);
    }
  };

  const total = sums(form);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[94vw] md:max-w-[860px] w-full p-6 max-h-[92vh] overflow-y-auto bg-background border-border shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {mailing ? "Mail Offer Letter" : editing === null ? "Offer Letters" : editing.id ? "Edit Offer Letter" : "New Offer Letter"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mailing
              ? "HR's own offer mail, from the HR mailbox, with the letter attached. Only the name and the role change."
              : "The company's own offer letter. Only the reference, name, role, joining date and pay change; every other line is the same as before."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {notice && !mailing && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {mailing ? (
          <MailLetter
            key={mailing.id}
            letter={mailing}
            onBack={() => setMailing(null)}
            onSent={(message) => {
              setMailing(null);
              setNotice(message);
            }}
          />
        ) : editing === null ? (
          <div className="space-y-4 mt-2">
            <div className="flex justify-end">
              <Button onClick={startNew} className="rounded-xl flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New offer letter
              </Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : letters.length === 0 ? (
              <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No offer letters yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {["Ref", "Name", "Role", "Joining", "Package / month", "Made", ""].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {letters.map((l) => (
                      <tr key={l.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{l.ref_no}</td>
                        <td className="px-3 py-2 font-medium">{l.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.designation}</td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                          {l.joining_date ? l.joining_date.split("-").reverse().join(".") : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">Rs. {rupees(l.ctc)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {l.created_by_name || "—"}
                          <br />
                          {l.created_at ? new Date(l.created_at).toLocaleDateString("en-IN") : ""}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setError("");
                                setNotice("");
                                setMailing(l);
                              }}
                              className="rounded-lg flex items-center gap-1"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Mail
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => download(l)}
                              disabled={busyId === l.id}
                              className="rounded-lg flex items-center gap-1"
                            >
                              {busyId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              PDF
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => startEdit(l)} aria-label={`Edit ${l.ref_no}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(l)} aria-label={`Delete ${l.ref_no}`}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={save} className="space-y-6 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ol-ref" className="text-xs font-bold">Ref No *</Label>
                <Input id="ol-ref" value={form.ref_no} onChange={(e) => set("ref_no", e.target.value)} placeholder="RTPL/NJ/2026/141" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ol-name" className="text-xs font-bold">Name *</Label>
                <Input id="ol-name" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Kumar V" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ol-role" className="text-xs font-bold">Designation *</Label>
                <Input id="ol-role" value={form.designation} maxLength={40} onChange={(e) => set("designation", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ol-join" className="text-xs font-bold">Joining date *</Label>
                <Input id="ol-join" type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} required />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <div className="space-y-1.5 sm:w-56">
                  <Label htmlFor="ol-net" className="text-xs font-bold">Net (take-home) salary</Label>
                  <Input id="ol-net" type="number" min="0" value={netSalary} onChange={(e) => setNetSalary(e.target.value)} placeholder="e.g. 24000" />
                </div>
                <Button type="button" variant="outline" onClick={fillFromNet} className="rounded-xl">
                  Fill Annexure from net salary
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {AMOUNTS.map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`ol-${key}`} className="text-xs font-bold">{label} *</Label>
                    <Input id={`ol-${key}`} type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} required />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              {[
                ["Gross Salary (A)", total.gross],
                ["Net Salary (A-B)", total.net],
                ["CTC (A+C) = Package", total.ctc],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-semibold tabular-nums">Rs. {rupees(value)} / month</div>
                  <div className="text-xs text-muted-foreground tabular-nums">Rs. {rupees(value * 12)} / year</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="rounded-xl flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={saving} className="rounded-xl">
                {saving ? "Saving..." : editing.id ? "Save changes" : "Create offer letter"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
