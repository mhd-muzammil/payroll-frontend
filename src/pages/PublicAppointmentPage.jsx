import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, CheckCircle2, Download, Link2Off, Loader2, Mail, MapPin, RotateCcw } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { appointmentOrderService } from "../services/appointmentOrderService";

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

// Why the camera did not open, by the browser's name for it.
const CAMERA_PROBLEMS = {
  NotAllowedError:
    "The camera is blocked for this page. Allow the camera for this site in your browser's settings, then tap Open camera again.",
  NotFoundError: "No camera was found. Open this link on your phone to sign.",
  NotReadableError: "The camera is busy. Close other apps that are using it, then tap Open camera again.",
  SecurityError: "This browser cannot open the camera here. Open the link in Chrome or Safari.",
};

// The box the signature goes in, as parts of the camera's picture. The photo
// is cut to it, so the table and the rest of the paper stay out.
const GUIDE = { left: 0.06, top: 0.24, width: 0.88, height: 0.52 };

/**
 * The signature: signed on paper and photographed with the back camera as
 * they sign. No drawing on the screen and no picture from the gallery. The
 * server takes the ink out of the photo and it is shown back here, so they see
 * what goes on the letter before signing, and can take it again.
 */
function SignatureCamera({ token, value, onChange, takeCamera, disabled }) {
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [live, setLive] = useState(false); // the camera has a picture to take
  const [opening, setOpening] = useState(false);
  const [checking, setChecking] = useState(false);
  const [trouble, setTrouble] = useState("");

  // As the selfie camera: on only while it is shown.
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setLive(false);
  }, []);

  const open = async () => {
    setTrouble("");
    setLive(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setTrouble("This browser cannot open the camera. Open this link in Chrome or Safari on your phone.");
      return;
    }
    const mine = takeCamera(stop);
    setOpening(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (!mine()) {
        // The other camera was opened while this one was starting.
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      onChange(null);
      streamRef.current = media;
      setStream(media);
    } catch (err) {
      setTrouble(CAMERA_PROBLEMS[err?.name] || "Could not open the camera. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  const take = async () => {
    const video = videoRef.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!video?.videoWidth || !frame?.width) return;
    // The picture fills the frame and is cut at its edges, so the box on the
    // screen goes through the same scale and offset to land on the camera's.
    const scale = Math.max(frame.width / video.videoWidth, frame.height / video.videoHeight);
    const x = Math.max(0, (GUIDE.left * frame.width - (frame.width - video.videoWidth * scale) / 2) / scale);
    const y = Math.max(0, (GUIDE.top * frame.height - (frame.height - video.videoHeight * scale) / 2) / scale);
    const w = Math.min((GUIDE.width * frame.width) / scale, video.videoWidth - x);
    const h = Math.min((GUIDE.height * frame.height) / scale, video.videoHeight - y);
    const shrink = Math.min(1, 1600 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * shrink);
    canvas.height = Math.round(h * shrink);
    canvas.getContext("2d").drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
    const photo = canvas.toDataURL("image/jpeg", 0.9);
    stop();
    setChecking(true);
    try {
      const ink = await appointmentOrderService.previewSignature(token, photo);
      if (!ink) throw new Error("no ink");
      onChange({ photo, ink });
    } catch (err) {
      setTrouble(problem(err, "Could not read the signature from the photo. Please check your connection and try again."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Your signature</h3>
        <p className="text-xs text-muted-foreground">
          Sign on plain white paper (no lines) with a blue or black pen, in even light. Then open the camera, fit the
          signature inside the box and take a photo. The signature from the photo goes on the letter.
        </p>
      </div>

      {stream ? (
        <div className="space-y-2">
          <div ref={frameRef} className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              onLoadedData={() => setLive(true)}
              aria-label="Camera"
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-lg border-2 border-white"
              style={{
                left: `${GUIDE.left * 100}%`,
                top: `${GUIDE.top * 100}%`,
                width: `${GUIDE.width * 100}%`,
                height: `${GUIDE.height * 100}%`,
                // The picture round the box, dimmed. An outline, not a shadow:
                // index.css turns every shadow off.
                outline: "9999px solid rgba(0, 0, 0, 0.45)",
              }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">Fit your signature inside the white box.</p>
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={take} disabled={!live || disabled} className="gap-2 rounded-xl">
              <Camera className="h-4 w-4" /> Take photo
            </Button>
            <Button type="button" variant="ghost" onClick={stop} disabled={disabled} className="rounded-xl">
              Cancel
            </Button>
          </div>
        </div>
      ) : checking ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the signature from the photo…
        </p>
      ) : value ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-white p-3">
            <img src={value.ink} alt="Your signature, as it goes on the letter" className="mx-auto max-h-32" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              This is exactly what goes on the letter. If it shows lines, a shadow or anything but your signature, tap
              Retake.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={open} disabled={opening || disabled} className="gap-1 rounded-lg">
              {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retake
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={open} disabled={opening || disabled} className="gap-2 rounded-xl">
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Open camera
        </Button>
      )}

      {trouble && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {trouble}
        </div>
      )}
    </div>
  );
}

/**
 * The signer's photo, from the front camera as they sign. There is no way to
 * pick a picture from the gallery. It goes on the signed copy so the office
 * can see who signed.
 */
function SelfieCamera({ photo, onChange, takeCamera, disabled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [live, setLive] = useState(false); // the camera has a picture to take
  const [opening, setOpening] = useState(false);
  const [trouble, setTrouble] = useState("");

  // The camera stays on only while it is shown; it goes off when the photo is
  // taken, on Cancel, and when the page goes away.
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setLive(false);
  }, []);

  const open = async () => {
    setTrouble("");
    setLive(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setTrouble("This browser cannot open the camera. Open this link in Chrome or Safari on your phone.");
      return;
    }
    const mine = takeCamera(stop);
    setOpening(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!mine()) {
        // The other camera was opened while this one was starting.
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      onChange("");
      streamRef.current = media;
      setStream(media);
    } catch (err) {
      setTrouble(CAMERA_PROBLEMS[err?.name] || "Could not open the camera. Please try again.");
    } finally {
      setOpening(false);
    }
  };

  const take = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
    stop();
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Your photo</h3>
        <p className="text-xs text-muted-foreground">
          Take a photo of yourself with the camera. It goes on the signed copy so the office can see who signed;
          only you and the office get that copy.
        </p>
      </div>

      {stream ? (
        <div className="space-y-2">
          {/* Shown as a mirror, as a front camera usually is; the photo itself is not flipped. */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedData={() => setLive(true)}
            aria-label="Camera"
            className="mx-auto max-h-80 w-full max-w-sm rounded-xl bg-black object-contain -scale-x-100"
          />
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={take} disabled={!live || disabled} className="gap-2 rounded-xl">
              <Camera className="h-4 w-4" /> Take photo
            </Button>
            <Button type="button" variant="ghost" onClick={stop} disabled={disabled} className="rounded-xl">
              Cancel
            </Button>
          </div>
        </div>
      ) : photo ? (
        <div className="flex items-end gap-3">
          <img src={photo} alt="Your photo" className="h-40 rounded-xl border border-border object-cover" />
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Photo taken
            </p>
            <Button type="button" variant="outline" size="sm" onClick={open} disabled={opening || disabled} className="gap-1 rounded-lg">
              {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retake
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={open} disabled={opening || disabled} className="gap-2 rounded-xl">
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Open camera
        </Button>
      )}

      {trouble && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {trouble}
        </div>
      )}
    </div>
  );
}

// Why the location did not come, by the browser's code for it.
const LOCATION_PROBLEMS = {
  1: "Location is off or not allowed. Turn on Location on your phone, and allow it for this site: in Chrome, tap the padlock next to the web address, then Permissions, then Location; on an iPhone, tap aA in the address bar, then Website Settings, then Location. Then tap Share my location again.",
  2: "Your phone could not tell where you are. Turn on Location (GPS) in your phone's settings, then tap Share my location again.",
  3: "Finding your location took too long. Move near a window or outside, then tap Share my location again.",
};

// A location shared longer ago than this is shared again before signing.
const PLACE_LIFETIME = 10 * 60 * 1000;

// The browser inside WhatsApp, Instagram and the like cannot open the camera or
// ask for the location at all, so the fix there is another browser. The same
// test as DutyContext's browserSurface; our own app is a WebView too but can ask.
const inAppBrowser = () => {
  if (window.Capacitor?.isNativePlatform?.()) return false;
  const ua = navigator.userAgent || "";
  return /;\s*wv\)/i.test(ua) || /\b(FBAN|FBAV|Instagram|Line\/|Snapchat|MicroMessenger)\b/i.test(ua);
};

/**
 * Where the employee is when signing, as their phone says. Compulsory: it goes
 * on the signed copy, with a link to the map, for the office.
 */
function LocationStep({ place, onChange, disabled }) {
  const [finding, setFinding] = useState(false);
  const [trouble, setTrouble] = useState("");

  const find = () => {
    setTrouble("");
    if (!navigator.geolocation) {
      setTrouble("This browser cannot share your location. Open this link in Chrome or Safari on your phone.");
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, at: Date.now() });
        setFinding(false);
      },
      (err) => {
        setTrouble(
          err?.code === 1 && inAppBrowser()
            ? "This page is open inside another app (like WhatsApp), which cannot share your location. Open the link in Chrome or Safari: tap ⋮ at the top and choose Open in Chrome, or copy the link into Chrome."
            : LOCATION_PROBLEMS[err?.code] || "Could not find your location. Please try again.",
        );
        setFinding(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Your location</h3>
        <p className="text-xs text-muted-foreground">
          Where you are as you sign, from your phone. It goes on the signed copy for the office.
        </p>
      </div>

      {place ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Location shared: {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)} (within{" "}
            {Math.round(place.accuracy).toLocaleString("en-IN")} m)
          </p>
          <Button type="button" variant="outline" size="sm" onClick={find} disabled={finding || disabled} className="gap-1 rounded-lg">
            {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Share again
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={find} disabled={finding || disabled} className="gap-2 rounded-xl">
          {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {finding ? "Finding your location…" : "Share my location"}
        </Button>
      )}

      {trouble && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {trouble}
        </div>
      )}
    </div>
  );
}

/**
 * The appointment order as the employee sees it, from the link emailed to them.
 *
 * No login and no app around it, like the onboarding form: the token in the
 * URL stands in for a session. They read the letter, tick that they agree,
 * sign on paper and photograph it, take their photo, share their location and
 * type the code emailed to them. The words on this page come from the same
 * source as the PDF, so they read what they sign.
 */
const PublicAppointmentPage = () => {
  const { token } = useParams();
  const [state, setState] = useState("loading"); // loading | dead | open | signed
  const [order, setOrder] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null); // {photo, ink}: the paper signature's photo and the ink from it
  const [photo, setPhoto] = useState("");
  const [place, setPlace] = useState(null); // {latitude, longitude, accuracy, at}
  const [inApp] = useState(inAppBrowser);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [signedAt, setSignedAt] = useState("");

  // A phone cannot run its back and front cameras together: opening one turns
  // the other off first. What comes back says whether the camera is still the
  // one that may run, for when the other was opened while it was starting.
  const cameraOff = useRef(null);
  const takeCamera = useCallback((off) => {
    if (cameraOff.current && cameraOff.current !== off) cameraOff.current();
    cameraOff.current = off;
    return () => cameraOff.current === off;
  }, []);

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
    setError("");
    // Where they are as they sign, not where they were long before.
    if (Date.now() - place.at > PLACE_LIFETIME) {
      setPlace(null);
      setError("Your location was shared more than 10 minutes ago. Share it again, then sign.");
      return;
    }
    setBusy("sign");
    try {
      const data = await appointmentOrderService.sign(token, {
        code,
        signature_photo: signature.photo,
        photo,
        location: { latitude: place.latitude, longitude: place.longitude, accuracy: place.accuracy },
        agree: agreed,
      });
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

  const ready = agreed && signature && photo && place && /^\d{6}$/.test(code);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 space-y-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Renderways Technology Private Limited</p>
          <h1 className="mt-1 text-lg font-semibold">Your Appointment Order</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Please read it fully. To sign, tick that you agree, sign on paper and take a photo of it, take your
            photo, share your location and type the code we email to you.
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

          {inApp && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              This page is open inside another app (like WhatsApp), which cannot use the camera or share your
              location. Open the link in Chrome or Safari: tap ⋮ (or ⋯) at the top and choose Open in Chrome or Open
              in browser, or copy the link into Chrome.
            </div>
          )}

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

          <SignatureCamera
            token={token}
            value={signature}
            onChange={setSignature}
            takeCamera={takeCamera}
            disabled={busy === "sign"}
          />

          <SelfieCamera photo={photo} onChange={setPhoto} takeCamera={takeCamera} disabled={busy === "sign"} />

          <LocationStep place={place} onChange={setPlace} disabled={busy === "sign"} />

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
