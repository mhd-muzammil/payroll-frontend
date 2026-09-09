import { useCallback, useEffect, useMemo, useState } from "react";
import { Smartphone, Globe, UserX, RefreshCw, Search } from "lucide-react";
import PageHeader from "../ui/PageHeader";
import { Button } from "@/components/ui/button";
import { employeeService } from "../../services/employeeService";

/**
 * Who has started using the phone app, and who has not.
 *
 * Not "who downloaded it" -- that is unknowable. The APK is passed around as a
 * file and never touches the server, so nothing on our side sees an install.
 * What is knowable is who has SIGNED IN from it, which is the better question
 * anyway: somebody who installed it and never opened it needs chasing exactly
 * as much as somebody who never installed it.
 *
 * The page is built around the chase list rather than the total. "49 not yet"
 * is a number; the names are the work.
 */

const TONE = {
  app: {
    label: "Using the app",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    icon: Smartphone,
  },
  browser: {
    label: "Browser only",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
    icon: Globe,
  },
  never: {
    label: "Never signed in",
    chip: "bg-muted-foreground/15 text-muted-foreground",
    icon: Globe,
  },
  no_account: {
    label: "No login account",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    icon: UserX,
  },
};

/** Which of the four states this person is in. They need different actions. */
function stateOf(row) {
  if (!row.has_login) return "no_account";
  if (row.uses_app) return "app";
  if (row.last_login) return "browser";
  return "never";
}

const WHAT_TO_DO = {
  no_account: "HR has to create a login before they can use it at all",
  never: "Has a login and has never used it - send them the app",
  browser: "Signs in on a browser, not the app - send them the app",
  app: null,
};

/**
 * Which build a phone is on, for somebody who uses the app.
 *
 * An empty version is not "unknown": every APK before 1.4 is silent, so a
 * phone using the app and saying nothing is a phone that has not been updated.
 * Said as "Older version" rather than a dash, because a dash reads like a
 * missing figure and this is an answer.
 */
function VersionChip({ row, current }) {
  const version = (row.app_version || "").trim();
  const updated = row.state === "app" && current && version.startsWith(current);
  // Only the phones that HAVE the new build are marked. Everybody else gets a
  // dash: the office asked for the update to be a list of who has it, not a
  // wall of amber against everybody who has not got round to it yet.
  if (!updated) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      title={`The app reported this build${row.app_version_at ? ` on ${new Date(row.app_version_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}`}
      className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
    >
      {version}
    </span>
  );
}

function when(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
}

function Stat({ value, label, tone }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className={`text-2xl font-semibold tabular-nums ${tone || "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StateChip({ state }) {
  const tone = TONE[state];
  const Icon = tone.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tone.chip}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {tone.label}
    </span>
  );
}

export default function AppUsage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState("waiting");

  // Split from `refresh` on purpose: nothing here touches state before the
  // first await, so the mount effect below sets no state synchronously. The
  // spinner does not need switching on at mount either -- `loading` starts true.
  const fetchUsage = useCallback(async () => {
    try {
      setData(await employeeService.appUsage());
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load app usage");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = () => {
    setLoading(true);
    void fetchUsage();
  };

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const text = query.trim().toLowerCase();
    return all
      .map((row) => ({ ...row, state: stateOf(row) }))
      .filter((row) => {
        // "Waiting" is the default because it is the list somebody acts on.
        // Everyone is one click away, and the counts above never change.
        if (only === "waiting" && row.state === "app") return false;
        if (only === "app" && row.state !== "app") return false;
        // Using the app, and not on the build being rolled out. A phone that
        // never reported a version is on an old one -- every build before 1.4
        // is silent -- so an empty version counts as behind, not as unknown.
        if (only === "updated") {
          const current = data?.current_app_version || "";
          if (row.state !== "app") return false;
          if (!current || !String(row.app_version || "").startsWith(current)) return false;
        }
        if (!text) return true;
        return (
          String(row.employee_name || "").toLowerCase().includes(text) ||
          String(row.branch || "").toLowerCase().includes(text) ||
          String(row.username || "").toLowerCase().includes(text)
        );
      })
      .sort((a, b) => {
        // No account first: nobody can fix the others until that is fixed.
        const rank = { no_account: 0, never: 1, browser: 2, app: 3 };
        return (
          rank[a.state] - rank[b.state] ||
          String(a.employee_name || "").localeCompare(String(b.employee_name || ""))
        );
      });
  }, [data, query, only]);

  return (
    <div>
      <PageHeader
        title="App Usage"
        description="Who has started using the phone app, and who still has to be set up."
        actions={
          <Button variant="outline" onClick={refresh} disabled={loading} icon={RefreshCw}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* An install cannot be measured, and saying so is better than letting
          somebody read these numbers as install counts. */}
      <p className="mb-4 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Downloads cannot be counted &mdash; the app file is shared by hand and never reaches
        the server. What is counted here is who has <strong className="text-foreground">signed in from the app</strong>,
        which is what actually tells you they are using it.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={data?.total ?? "—"} label="Employees" />
        <Stat
          value={data?.using_app ?? "—"}
          label="Using the app"
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          value={data?.not_using_app ?? "—"}
          label="Not yet"
          tone="text-amber-600 dark:text-amber-500"
        />
        <Stat
          value={data?.no_login_account ?? "—"}
          label="No login account"
          tone="text-red-600 dark:text-red-400"
        />
      </div>

      {/* Of the people actually using the app, who is on the build being rolled
          out.
          Shown from zero, not from one. It was hidden until somebody had
          updated, on the theory that "0 of 18" reads as alarming -- but a
          rollout starts at zero and that IS the number the office is watching,
          so hiding it only hid the progress. It appears as soon as the server
          knows which version is being rolled out. */}
      {data?.current_app_version && (
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            App version {data.current_app_version}
          </div>
          {/* One box, and it counts the people who HAVE updated. Clickable,
              because the number is not the work -- the names are. */}
          <button
            type="button"
            onClick={() => setOnly("updated")}
            className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-left transition hover:bg-emerald-500/10 sm:w-1/2"
          >
            <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {data.on_current_version}
            </div>
            <div className="text-xs text-muted-foreground">
              Updated to {data.current_app_version}
              {data.using_app ? ` · of ${data.using_app} using the app` : ""}
              {data.on_current_version > 0 ? " · tap to see who" : ""}
            </div>
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-2 sm:flex sm:w-auto">
          {[
            ["waiting", "Still to set up"],
            ["app", "Using the app"],
            // The reason the version is here at all: the APK goes out by hand,
            // so somebody has to be able to see who has picked it up.
            ["updated", "Updated"],
            ["all", "Everyone"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOnly(key)}
              className={`h-10 rounded-xl border px-3 text-sm font-medium transition-colors ${
                only === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Search name, branch or username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {only === "waiting"
            ? "Everybody is on the app."
            : only === "updated"
              ? "Nobody has installed the new version yet."
              : "Nobody matches that search."}
        </div>
      ) : (
        <div className="glass-card rounded-3xl overflow-hidden border border-border/70">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {["Employee", "Branch", "Login", "Status", "App version", "Last used the app", "What to do"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.employee_id} className="border-t border-border/60">
                    <td className="px-5 py-3 font-medium">{row.employee_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.branch || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {row.username || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StateChip state={row.state} />
                    </td>
                    <td className="px-5 py-3">
                      <VersionChip row={row} current={data?.current_app_version} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {when(row.last_app_login_at)}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {WHAT_TO_DO[row.state] || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone */}
          <div className="md:hidden divide-y divide-border/60">
            {rows.map((row) => (
              <div key={row.employee_id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.employee_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {row.branch || "—"}
                      {row.username ? ` · ${row.username}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StateChip state={row.state} />
                    {row.state === "app" && (
                      <VersionChip row={row} current={data?.current_app_version} />
                    )}
                  </div>
                </div>
                {WHAT_TO_DO[row.state] ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {WHAT_TO_DO[row.state]}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Last used {when(row.last_app_login_at)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
