import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Download, Eraser, Link2Off, Loader2, Mail } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { appointmentOrderService } from "../services/appointmentOrderService";

const INK = "#1e2a78";

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "";

function problem(err, fallback) {
  const data = err?.response?.data;
  if (err?.response?.status === 429 && !data?.detail) return "Too many tries from this device. Please wait a while.";
  return (data && typeof data === "object" && data.detail) || fallback;
}

/** A run of the letter's words. Text only: nothing from the server is markup. */
function Runs({ runs }) {
  return runs.map((run, i) => {
    if (run.s) return <sup key={i} className={run.b ? "font-bold" : ""}>{run.t}</sup>;
    if (run.b) return <strong key={i}>{run.t}</strong>;
    return <span key={i}>{run.t}</span>;
  });
}

function Block({ block }) {
  switch (block.kind) {
    case "date":
      return <p className="text-right font-bold"><Runs runs={block.runs} /></p>;
    case "name":
    case "address":
      return <p className="font-bold"><Runs runs={block.runs} /></p>;
    case "title":
      return <p className="pt-2 text-center text-lg font-bold"><Runs runs={block.runs} /></p>;
    case "item":
      return (
        <div className="flex gap-3">
          <span className="w-6 shrink-0 text-right">{block.number}</span>
          <p><Runs runs={block.runs} /></p>
        </div>
      );
    case "agreement":
      return null; // it is the box ticked below
    default:
      return <p><Runs runs={block.runs} /></p>;
  }
}

function Annexure({ annexure }) {
  const fill = { header: "bg-[#e2efd9]", total: "bg-[#fff2cc]" };
  return (
    <div className="overflow-x-auto">
      <p className="mb-3 text-center text-sm font-bold tracking-wide">ANNEXURE-I</p>
      <table className="w-full border-collapse font-sans text-sm text-slate-900">
        <thead>
          <tr className={fill.header}>
            {[annexure.name, "Per Month", "Per Annum"].map((h, i) => (
              <th key={i} className="border border-slate-500 px-2 py-2 text-center font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {annexure.rows.map((row, i) => {
            const bold = ["total", "heading", "bold"].includes(row.style);
            if (row.style === "heading") {
              return (
                <tr key={i}>
                  <td colSpan={3} className="border border-slate-500 px-2 py-2 font-bold">{row.label}</td>
                </tr>
              );
            }
            return (
              <tr key={i} className={`${fill[row.style] || ""} ${bold ? "font-bold" : ""}`}>
                <td className="border border-slate-500 px-2 py-2">{row.label || " "}</td>
                <td className="border border-slate-500 px-2 py-2 text-right tabular-nums">{row.month}</td>
                <td className="border border-slate-500 px-2 py-2 text-right tabular-nums">{row.year}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A box to sign in with a finger or a mouse. */
function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const inked = useRef(false);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    inked.current = false;
    onChange("");
  }, [onChange]);

  useEffect(() => {
    fit();
  }, [fit]);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const down = (event) => {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  };

  const move = (event) => {
    if (!drawing.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    inked.current = true;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        aria-label="Signature box. Draw your signature here."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        className="h-44 w-full rounded-xl border-2 border-dashed border-slate-400 bg-white touch-none cursor-crosshair"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Sign inside the box with your finger.</span>
        <Button type="button" variant="ghost" size="sm" onClick={fit} disabled={disabled} className="gap-1">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
}

/**
 * The appointment order as the employee sees it, from the link emailed to them.
 *
 * No login and no app around it, like the onboarding form: the token in the
 * URL stands in for a session. They read the letter, tick that they agree,
 * sign in the box and type the code emailed to them. The words on this page
 * come from the same source as the PDF, so they read what they sign.
 */
const PublicAppointmentPage = () => {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | dead | open | signed
  const [order, setOrder] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [signedAt, setSignedAt] = useState("");

  useEffect(() => {
    let cancelled = false;
    appointmentOrderService
      .read(token)
      .then((data) => {
        if (cancelled) return;
        setOrder(data);
        setSignedAt(data.signed_at || "");
        setState(data.status === "signed" ? "signed" : "open");
      })
      .catch(() => {
        if (!cancelled) setState("dead");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const askCode = async () => {
    setBusy("code");
    setError("");
    try {
      const data = await appointmentOrderService.sendCode(token);
      setCodeSent(data.sent_to);
    } catch (err) {
      setError(problem(err, "Could not send the code. Please check your connection and try again."));
    } finally {
      setBusy("");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy("sign");
    setError("");
    try {
      const data = await appointmentOrderService.sign(token, { code, signature, agree: agreed });
      setSignedAt(data.signed_at);
      setState("signed");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(problem(err, "Could not sign. Please check your connection and try again."));
    } finally {
      setBusy("");
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Opening your appointment order…
      </div>
    );
  }

  if (state === "dead") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <Link2Off className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">This link is no longer open</h1>
          <p className="text-sm text-muted-foreground">
            It may have been replaced since it was sent to you. Ask the office to send your appointment order again.
          </p>
        </div>
      </div>
    );
  }

  const download = (
    <a
      href={appointmentOrderService.pdfUrl(token)}
      className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
    >
      <Download className="h-4 w-4" />
      {state === "signed" ? "Download your signed copy (PDF)" : "Download as PDF"}
    </a>
  );

  if (state === "signed") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
          <h1 className="text-2xl font-semibold">Your appointment order is signed</h1>
          <p className="text-sm text-muted-foreground">
            Signed on {when(signedAt)}. A copy has been emailed to you and to the office.
          </p>
          {download}
        </div>
      </div>
    );
  }

  const ready = agreed && signature && /^\d{6}$/.test(code);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Renderways Technology Private Limited</p>
          <h1 className="mt-1 text-lg font-semibold">Your Appointment Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please read it fully. To sign, tick that you agree, sign in the box at the bottom and type the code
            we email to you.
          </p>
          <div className="mt-3">{download}</div>
        </div>

        <article className="rounded-2xl border border-slate-300 bg-white px-5 py-6 sm:px-8 font-serif lining-nums text-[15px] leading-relaxed text-slate-900 space-y-4">
          {order.letter.pages.map((blocks, p) => (
            <div key={p} className="space-y-4">
              {blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          ))}
          <div className="pt-4">
            <Annexure annexure={order.letter.annexure} />
          </div>
        </article>

        <form onSubmit={submit} className="rounded-2xl border border-border bg-card px-5 py-5 space-y-5">
          <h2 className="text-base font-semibold">Sign</h2>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span>{order.agreement}</span>
          </label>

          <SignaturePad onChange={setSignature} disabled={busy === "sign"} />

          <div className="space-y-2">
            <p className="text-sm">
              We will email a 6-digit code to <span className="font-medium">{order.email_hint}</span>.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={askCode} disabled={busy !== ""} className="gap-2 rounded-xl">
                {busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {codeSent ? "Send the code again" : "Email me the code"}
              </Button>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                aria-label="6-digit code"
                className="sm:w-40 text-center tracking-[0.3em] tabular-nums"
              />
            </div>
            {codeSent && (
              <p className="text-xs text-muted-foreground">
                Code sent to {codeSent}. It works for 10 minutes. Check your spam folder if you cannot see it.
              </p>
            )}
          </div>

          <Button type="submit" disabled={!ready || busy !== ""} className="w-full rounded-xl py-5 text-base">
            {busy === "sign" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Sign the Appointment Order
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PublicAppointmentPage;
