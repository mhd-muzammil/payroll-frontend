import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askBattery, askLocation, readPhoneReadiness } from "../../Utility/phoneReadiness";

/**
 * What Login found wrong with the phone, and how to put each thing right
 * ("1 a": phone sariyilla-na Login aagaadhu).
 *
 * Full screen and opaque, with its own Close: hardware Back leaves the app, and
 * a see-through overlay does not draw in the WebView. Looks again by itself
 * when the engineer comes back from the phone's Settings, and after each
 * button; Login waits for an explicit tap, so nothing is punched by surprise.
 */

const APP_SETTINGS = "Phone Settings → Apps → Renderways Technology";

function Row({ ok, title, children }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-card p-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-label="OK" />
      ) : (
        <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-label="Needs fixing" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold text-foreground">{title}</p>
        {!ok && <div className="space-y-2 text-sm text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function deviceLine(phone) {
  const yesNo = (value, yes, no) => (value === true ? yes : value === false ? no : "unknown");
  return [
    phone.version ? `app ${phone.version}${phone.build != null ? ` (${phone.build})` : ""}` : "app old",
    phone.android ? `Android ${phone.android}` : null,
    phone.location !== undefined ? `location ${phone.location ?? "unknown"}` : null,
    phone.gpsOn !== undefined ? `GPS ${yesNo(phone.gpsOn, "on", "off")}` : null,
    phone.batteryExempt !== undefined
      ? `battery ${yesNo(phone.batteryExempt, "allowed", "not allowed")}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function PhoneCheckDialog({ check, onClose, onReady }) {
  const [phone, setPhone] = useState(check);
  const [checking, setChecking] = useState(false);
  const [asking, setAsking] = useState(null);
  const inFlight = useRef(false);

  // `quiet` for the looks nobody asked for: the button keeps its label.
  const recheck = useCallback(async ({ quiet = false } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!quiet) setChecking(true);
    try {
      setPhone(await readPhoneReadiness());
    } finally {
      inFlight.current = false;
      if (!quiet) setChecking(false);
    }
  }, []);

  // Back from the phone's Settings: look again without a tap.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void recheck({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [recheck]);

  const problems = new Set(phone?.problems ?? []);
  const appOk = !problems.has("app");
  const ready = Boolean(phone?.ready);

  // And every two seconds while something can still be put right on this
  // phone: Location switched on from the quick settings never takes the app
  // away, so there is no coming back to notice it by. An old app cannot be.
  useEffect(() => {
    if (ready || asking !== null || !appOk) return undefined;
    const timer = setInterval(() => void recheck({ quiet: true }), 2000);
    return () => clearInterval(timer);
  }, [ready, asking, appOk, recheck]);

  const fix = async (what, call) => {
    setAsking(what);
    try {
      await call();
    } finally {
      setAsking(null);
    }
    await recheck();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
          data-testid="phone-check"
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-bold text-foreground">
                Check your phone before Login
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                Login starts your duty and records your route. Put right what is marked with a
                cross, then tap Login.
              </DialogPrimitive.Description>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>

          <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <Row ok={appOk} title={appOk && phone?.version ? `App ${phone.version}` : "App 1.5.0"}>
              <p>
                This phone has {phone?.version ? `app ${phone.version}` : "an old version of the app"}.
                Install the new RTPL app 1.5.0 (ask the office for it), open it, and tap Login again.
              </p>
            </Row>
            {appOk && (
              <>
                <Row ok={!problems.has("location")} title="Location permission">
                  {phone?.location === "denied" ? (
                    <p>
                      Android will not ask again. Open {APP_SETTINGS} → Permissions → Location →
                      Allow, and turn Use precise location ON. Then come back here.
                    </p>
                  ) : (
                    <>
                      <p>Allow Location for this app, with Use precise location ON.</p>
                      <Button
                        size="sm"
                        onClick={() => fix("location", askLocation)}
                        disabled={asking !== null}
                      >
                        {asking === "location" ? "Asking…" : "Allow location"}
                      </Button>
                    </>
                  )}
                </Row>
                <Row ok={!problems.has("gps")} title="Location (GPS) switched on">
                  <p>
                    Location is switched off. Swipe down from the top of the screen and tap Location
                    to turn it on. Then come back here.
                  </p>
                </Row>
                <Row ok={!problems.has("battery")} title="Battery: app allowed to run">
                  <p>Battery saving stops your duty recording while the phone is in your pocket.</p>
                  <Button
                    size="sm"
                    onClick={() => fix("battery", askBattery)}
                    disabled={asking !== null}
                  >
                    {asking === "battery" ? "Asking…" : "Allow"}
                  </Button>
                  <p>If it still shows a cross: {APP_SETTINGS} → Battery → Unrestricted.</p>
                </Row>
              </>
            )}
          </ul>

          <div className="space-y-3 border-t border-border px-4 py-3">
            {phone?.noAnswer && (
              <p className="text-sm text-red-600">The phone did not answer in time. Tap Check again.</p>
            )}
            {phone && <p className="text-xs text-muted-foreground">Device said: {deviceLine(phone)}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => void recheck()}
                disabled={checking || asking !== null}
              >
                {checking ? "Checking…" : "Check again"}
              </Button>
              <Button className="flex-1" onClick={onReady} disabled={!ready || checking}>
                Login
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
