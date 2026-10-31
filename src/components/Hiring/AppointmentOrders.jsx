import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, Copy, Download, Edit, FileSignature, Loader2, MapPin, PenLine, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { appointmentOrderService } from "../../services/appointmentOrderService";
import { offerLetterService } from "../../services/offerLetterService";

// Per month, in rupees, except professional tax: that is for the year (2,500
// on the printed order), and the Annexure shows a twelfth of it a month.
const AMOUNTS = [
  ["basic", "Basic"],
  ["hra", "HRA"],
  ["conveyance", "Conveyance"],
  ["cea", "CEA"],
  ["personal_allowance", "Personal Allowances"],
  ["professional_tax", "Professional Tax (per year)"],
];

const EMPTY = {
  offer_letter: "",
  salutation: "MR.",
  name: "",
  address: "",
  designation: "Service Engineer",
  order_date: "",
  joining_date: "",
  email: "",
  basic: "",
  hra: "",
  conveyance: "1600",
  cea: "200",
  personal_allowance: "",
  professional_tax: "2500",
};

// What an offer letter already says about the same person.
const FROM_OFFER = ["name", "designation", "joining_date", "basic", "hra", "conveyance", "cea", "personal_allowance"];

const STATUS = {
  draft: ["Draft", "bg-muted text-muted-foreground"],
  sent: ["Sent", "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"],
  opened: ["Opened", "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"],
  signed: ["Signed", "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"],
};

const rupees = (n) => Number(n || 0).toLocaleString("en-IN");
const num = (v) => Number(v) || 0;
const day = (iso) => (iso ? iso.split("-").reverse().join(".") : "—");
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "";

/** Annexure-I's sums, as the server works them out. */
function sums(form) {
  const gross =
    num(form.basic) + num(form.hra) + num(form.conveyance) + num(form.cea) + num(form.personal_allowance);
  return { gross, net: Math.round(gross - num(form.professional_tax) / 12), ctc: gross };
}

function firstError(data) {
  if (!data || typeof data !== "object") return "";
  if (data.detail) return String(data.detail);
  const [field, value] = Object.entries(data)[0] || [];
  const text = Array.isArray(value) ? value[0] : value;
  return field ? `${field.replace(/_/g, " ")}: ${text}` : "";
}

/**
 * The Hiring Portal's appointment orders: the order that follows the offer
 * letter, in the company's printed format, emailed to the employee to read and
 * sign on their phone. Once signed it is a record and cannot be changed.
 */
// Its own page (/hiring/appointment-orders), opened from the Hiring Portal.
export default function AppointmentOrders() {
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null); // null: the list; {}: a new order; an order: editing it
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(""); // "<id>:<what>"
  const [photo, setPhoto] = useState(null); // {id, kind, src}: a signing photo open under its row

  useEffect(() => {
    let alive = true;
    appointmentOrderService.list().then(
      (rows) => {
        if (!alive) return;
        setOrders(rows);
        setLoading(false);
      },
      (e) => {
        if (!alive) return;
        setError(firstError(e?.response?.data) || "Could not load the appointment orders.");
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

  const loadOffers = async () => {
    try {
      setOffers(await offerLetterService.list());
    } catch {
      // Without them the order is typed by hand.
    }
  };

  const startNew = () => {
    setError("");
    setNotice("");
    setForm({ ...EMPTY });
    setEditing({});
    loadOffers();
  };

  const startEdit = (order) => {
    setError("");
    setNotice("");
    const values = { ...EMPTY };
    Object.keys(EMPTY).forEach((key) => {
      values[key] = order[key] == null ? "" : String(order[key]);
    });
    setForm(values);
    setEditing(order);
    loadOffers();
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const pickOffer = (id) => {
    const offer = offers.find((o) => String(o.id) === String(id));
    setForm((f) => {
      const next = { ...f, offer_letter: id };
      if (offer) {
        FROM_OFFER.forEach((key) => {
          next[key] = offer[key] == null ? "" : String(offer[key]);
        });
        if (!f.order_date) next.order_date = offer.joining_date || "";
      }
      return next;
    });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = { ...form, offer_letter: form.offer_letter ? Number(form.offer_letter) : null };
    AMOUNTS.forEach(([key]) => {
      body[key] = num(form[key]);
    });
    try {
      if (editing?.id) await appointmentOrderService.update(editing.id, body);
      else await appointmentOrderService.create(body);
      setEditing(null);
      load();
    } catch (e) {
      setError(firstError(e?.response?.data) || "Could not save the appointment order.");
    } finally {
      setSaving(false);
    }
  };

  const run = async (order, what, job) => {
    setBusy(`${order.id}:${what}`);
    setError("");
    setNotice("");
    try {
      await job();
    } catch (e) {
      setError(firstError(e?.response?.data) || e?.message || "That did not work. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const send = (order) => {
    const again = order.status !== "draft";
    const question = again
      ? `Send ${order.name}'s order again? The link sent before will stop working.`
      : `Email ${order.name} a link to sign at ${order.email}?`;
    if (!window.confirm(question)) return;
    run(order, "send", async () => {
      await appointmentOrderService.send(order.id);
      setNotice(`Link emailed to ${order.email}.`);
      load();
    });
  };

  const copyLink = (order) =>
    run(order, "link", async () => {
      const link = await appointmentOrderService.link(order.id);
      try {
        await navigator.clipboard.writeText(link);
        setNotice(`Link copied. It opens ${order.name}'s order; signing still needs the code emailed to them.`);
      } catch {
        window.prompt("Copy this link:", link);
      }
    });

  // kind: "photo", the employee; "signature", their signature on paper.
  const showPhoto = (order, kind) => {
    if (photo?.id === order.id && photo.kind === kind) {
      setPhoto(null);
      return;
    }
    run(order, kind, async () => {
      const src =
        kind === "signature"
          ? await appointmentOrderService.signaturePhoto(order.id)
          : await appointmentOrderService.photo(order.id);
      setPhoto({ id: order.id, kind, src });
    });
  };
  const showing = (order, kind) => photo?.id === order.id && photo.kind === kind;

  const remove = (order) => {
    if (!window.confirm(`Delete the appointment order for ${order.name}?`)) return;
    run(order, "delete", async () => {
      await appointmentOrderService.remove(order.id);
      load();
    });
  };

  const total = sums(form);
  const isBusy = (order, what) => busy === `${order.id}:${what}`;

  return (
    <div className="space-y-4">
      <Link to="/hiring" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Hiring Portal
      </Link>
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            {editing === null ? "Appointment Orders" : editing.id ? "Edit Appointment Order" : "New Appointment Order"}
          </h1>
          <p className="text-xs text-muted-foreground">
            The company&apos;s appointment order, after the offer letter. Send it and the employee gets a link by
            email to read and sign it on their phone, with a code emailed to them.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {editing === null ? (
          <div className="space-y-4 mt-2">
            <div className="flex justify-end">
              <Button onClick={startNew} className="rounded-xl flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New appointment order
              </Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : orders.length === 0 ? (
              <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No appointment orders yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {["Name", "Role", "Joining", "Net / month", "Status", ""].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const [label, tone] = STATUS[o.status] || STATUS.draft;
                      const stamp = o.status === "signed" ? o.signed_at : o.status === "opened" ? o.viewed_at : o.sent_at;
                      return (
                        <Fragment key={o.id}>
                        <tr className="border-t border-border/60">
                          <td className="px-3 py-2">
                            <div className="font-medium">{o.salutation} {o.name}</div>
                            <div className="text-xs text-muted-foreground">{o.email || "No email"}</div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{o.designation}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">{day(o.joining_date)}</td>
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">Rs. {rupees(o.net)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                            {stamp && <div className="mt-0.5 text-xs text-muted-foreground">{when(stamp)}</div>}
                            {o.location && (
                              <a
                                href={o.location.map}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Where the phone was when signing. Opens Google Maps."
                                className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <MapPin className="h-3 w-3 shrink-0" />
                                {o.location.text}
                              </a>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => run(o, "pdf", () => appointmentOrderService.download(o.id))}
                                disabled={isBusy(o, "pdf")}
                                className="rounded-lg flex items-center gap-1"
                              >
                                {isBusy(o, "pdf") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                {o.status === "signed" ? "Signed PDF" : "PDF"}
                              </Button>
                              {o.has_photo && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => showPhoto(o, "photo")}
                                  disabled={isBusy(o, "photo")}
                                  aria-expanded={showing(o, "photo")}
                                  className="rounded-lg flex items-center gap-1"
                                >
                                  {isBusy(o, "photo") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                                  {showing(o, "photo") ? "Hide photo" : "Photo"}
                                </Button>
                              )}
                              {o.has_signature_photo && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => showPhoto(o, "signature")}
                                  disabled={isBusy(o, "signature")}
                                  aria-expanded={showing(o, "signature")}
                                  className="rounded-lg flex items-center gap-1"
                                >
                                  {isBusy(o, "signature") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                                  {showing(o, "signature") ? "Hide sign photo" : "Sign photo"}
                                </Button>
                              )}
                              {o.status !== "signed" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => send(o)}
                                    disabled={isBusy(o, "send") || !o.email}
                                    title={o.email ? "" : "Add the employee's email first"}
                                    className="rounded-lg flex items-center gap-1"
                                  >
                                    {isBusy(o, "send") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    {o.status === "draft" ? "Send for sign" : "Send again"}
                                  </Button>
                                  {o.status !== "draft" && (
                                    <Button variant="ghost" size="icon" onClick={() => copyLink(o)} disabled={isBusy(o, "link")} aria-label={`Copy ${o.name}'s link`} title="Copy link">
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" onClick={() => startEdit(o)} aria-label={`Edit ${o.name}`}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => remove(o)} disabled={isBusy(o, "delete")} aria-label={`Delete ${o.name}`}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {photo?.id === o.id && (
                          <tr className="bg-muted/20">
                            <td colSpan={6} className="px-3 py-3">
                              <div className="flex items-end gap-3">
                                <img
                                  src={photo.src}
                                  alt={photo.kind === "signature" ? `${o.name}'s signature on paper` : `${o.name} when signing`}
                                  className="h-56 rounded-xl border border-border object-cover"
                                />
                                {photo.kind === "signature" ? (
                                  <p className="text-xs text-muted-foreground">
                                    {o.name} signed on paper and took this photo with the camera on the signing page,
                                    {" "}{when(o.signed_at)}. The signature on the order is the ink from it. It is also on
                                    the last page of the signed PDF.
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Taken with the camera on the signing page when {o.name} signed, {when(o.signed_at)}.
                                    It is also on the last page of the signed PDF.
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={save} className="space-y-6 mt-2">
            {editing.id && editing.status !== "draft" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                This order has been sent. Saving a change stops the link that was sent; send it again afterwards.
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ao-offer" className="text-xs font-bold">From offer letter</Label>
              <select
                id="ao-offer"
                value={form.offer_letter}
                onChange={(e) => pickOffer(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— None, type the details —</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>{o.ref_no} · {o.name} · joining {day(o.joining_date)}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ao-name" className="text-xs font-bold">Name *</Label>
                <div className="flex gap-2">
                  <select
                    aria-label="Mr or Ms"
                    value={form.salutation}
                    onChange={(e) => set("salutation", e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="MR.">MR.</option>
                    <option value="MS.">MS.</option>
                  </select>
                  <Input id="ao-name" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Tharun R" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-role" className="text-xs font-bold">Designation *</Label>
                <Input id="ao-role" value={form.designation} maxLength={40} onChange={(e) => set("designation", e.target.value)} required />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="ao-address" className="text-xs font-bold">Address *</Label>
                <Input id="ao-address" value={form.address} maxLength={140} onChange={(e) => set("address", e.target.value)} placeholder="e.g. No: 1/1A 4th cross street Venkateshwara Nagar ramapuram 600089" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-date" className="text-xs font-bold">Order date *</Label>
                <Input id="ao-date" type="date" value={form.order_date} onChange={(e) => set("order_date", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ao-join" className="text-xs font-bold">With effect from (joining) *</Label>
                <Input id="ao-join" type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} required />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="ao-email" className="text-xs font-bold">Employee&apos;s email (the link and the signing code go here)</Label>
                <Input id="ao-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="e.g. tharun@gmail.com" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {AMOUNTS.map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`ao-${key}`} className="text-xs font-bold">{label} *</Label>
                  <Input id={`ao-${key}`} type="number" min="0" value={form[key]} onChange={(e) => set(key, e.target.value)} required />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              {[
                ["Gross Salary (A)", total.gross, total.gross * 12],
                ["Net Salary (A-B)", total.net, total.gross * 12 - num(form.professional_tax)],
                ["CTC (A+C)", total.ctc, total.ctc * 12],
              ].map(([label, month, year]) => (
                <div key={label}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-semibold tabular-nums">Rs. {rupees(month)} / month</div>
                  <div className="text-xs text-muted-foreground tabular-nums">Rs. {rupees(year)} / year</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} className="rounded-xl flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={saving} className="rounded-xl">
                {saving ? "Saving..." : editing.id ? "Save changes" : "Create appointment order"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
