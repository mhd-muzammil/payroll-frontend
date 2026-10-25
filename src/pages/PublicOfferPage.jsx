import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Link2Off, Loader2, XCircle } from "lucide-react";

import { Button } from "../components/ui/button";
import { offerLetterService } from "../services/offerLetterService";

const day = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "";
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "";

/**
 * The candidate's answer to an offer, from the Accept / Decline buttons in the
 * offer mail. No login: the token in the link stands in for one. Opening the
 * page records nothing -- mail scanners open every link in a mail -- so the
 * answer is confirmed here, once.
 */
const PublicOfferPage = () => {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState("loading"); // loading | dead | open
  const [offer, setOffer] = useState(null);
  const [choice, setChoice] = useState(params.get("answer") === "decline" ? "decline" : "accept");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    offerLetterService.describeOffer(token).then(
      (data) => {
        if (cancelled) return;
        setOffer(data);
        setState("open");
      },
      () => {
        if (!cancelled) setState("dead");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      setOffer(await offerLetterService.answerOffer(token, choice));
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 409 && data?.response) setOffer(data);
      else setError(data?.detail || "Could not record your answer. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Opening your offer…
      </div>
    );
  }

  if (state === "dead") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          <Link2Off className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">This link is not open</h1>
          <p className="text-sm text-muted-foreground">Please reply to the offer mail instead, or contact the office.</p>
        </div>
      </div>
    );
  }

  if (offer.response) {
    const accepted = offer.response === "ACCEPTED";
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-3">
          {accepted ? (
            <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500" />
          ) : (
            <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          )}
          <h1 className="text-2xl font-semibold">{accepted ? "Thank you, your acceptance is recorded" : "Your answer is recorded"}</h1>
          <p className="text-sm text-muted-foreground">
            You {accepted ? "accepted" : "declined"} the offer of {offer.designation} on {when(offer.response_at)}.
            {accepted ? " We look forward to welcoming you on board." : " Thank you for letting us know."}
          </p>
          <p className="text-xs text-muted-foreground">To change it, please reply to the offer mail or contact the office.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-lg px-4 py-10 space-y-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-5 space-y-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Renderways Technology Private Limited</p>
          <h1 className="text-xl font-semibold">Your offer of employment</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{offer.name}</dd>
            <dt className="text-muted-foreground">Position</dt>
            <dd className="font-medium">{offer.designation}</dd>
            <dt className="text-muted-foreground">Joining date</dt>
            <dd className="font-medium">{day(offer.joining_date)}</dd>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Your answer">
            {[
              ["accept", "Accept the offer"],
              ["decline", "Decline the offer"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                onClick={() => setChoice(value)}
                className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                  choice === value
                    ? value === "accept"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-red-400 bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300"
                    : "border-border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          )}
          <Button onClick={confirm} disabled={busy} className="w-full rounded-xl py-5 text-base">
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {choice === "accept" ? "Confirm: I accept this offer" : "Confirm: I decline this offer"}
          </Button>
          <p className="text-xs text-muted-foreground">Your answer goes to the office straight away. You can also reply to the offer mail.</p>
        </div>
      </div>
    </div>
  );
};

export default PublicOfferPage;
