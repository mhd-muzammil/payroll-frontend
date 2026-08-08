import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarCheck,
  Wallet,
  FileText,
  CalendarDays,
  BarChart3,
  LogOut,
  ChevronLeft,
  Sparkles,
  X,
  ClipboardList,
  TrendingUp,
  UserCheck,
  Laptop,
  PhoneCall,
  HandCoins
} from "lucide-react";
import { ROLES, clearAuth, getUserRole, normalizeRole, canAccessSection } from "@/auth/rbac";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users", icon: Users, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { to: "/hiring", label: "Hiring Portal", icon: UserCheck },
  { to: "/onboarding", label: "Onboarding", icon: UserPlus },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/tasks", label: "Tasks", icon: ClipboardList },
  { to: "/cases", label: "Cases", icon: PhoneCall, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/payroll", label: "Payroll", icon: Wallet },
  { to: "/payslips", label: "Payslips", icon: FileText },
  { to: "/leaves", label: "Leave & Permissions", icon: CalendarDays },
  { to: "/requests", label: "Requests", icon: HandCoins, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE] },
  { to: "/performance", label: "Performance", icon: TrendingUp },
  { to: "/assets", label: "Assets", icon: Laptop },
  // { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  // { to: "/compliance", label: "Tax & Compliance", icon: ShieldCheck },
];

const defaultRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR];

const navWithRoles = nav.map((item) => {
  if (
    item.to === "/attendance" ||
    item.to === "/payslips" ||
    item.to === "/leaves" ||
    item.to === "/tasks" ||
    item.to === "/performance" ||
    item.to === "/requests"
  ) {
    return { ...item, roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE] };
  }
  return { ...item, roles: item.roles || defaultRoles };
});


export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) {
  const { pathname: path } = useLocation();
  const role = normalizeRole(getUserRole());
  const visibleNav = navWithRoles.filter((item) => {
    const hasRole = item.roles.includes(role);
    if (!hasRole) return false;
    
    const section = item.to.replace(/^\//, "");
    // Sections gated by role above and by the API itself, not by the per-branch
    // allowed_sections map — which has no entry for them, so checking it would
    // hide them from everyone. /requests is every employee's own inbox; the
    // backend scopes what each role can see.
    const OPEN_SECTIONS = new Set(["cases", "requests"]);
    if (!section || section === "dashboard" || OPEN_SECTIONS.has(section)) return true;
    return canAccessSection(section);
  });

  const content = (mobile = false) => (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex shrink-0 items-center justify-between px-2 py-3">
        <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-brand shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          {(!collapsed || mobile) && (
            <div className="overflow-hidden">
              <div className="text-[15px] font-semibold leading-tight">Renderways</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Technology</div>
            </div>
          )}
        </Link>
        {mobile ? (
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:grid h-7 w-7 place-items-center rounded-lg hover:bg-muted text-muted-foreground"
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* min-h-0 is what makes this scroll: without it a flex child refuses to
          shrink below its content, so a long nav pushed Logout off the bottom
          of the sidebar entirely — worse on short screens and with every item
          added. Now the links scroll and the footer stays put. */}
      <nav className="flex-1 min-h-0 overflow-y-auto space-y-1 px-1">
        {visibleNav.map((item) => {
          const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "text-white shadow-glow"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded-xl gradient-brand"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
              {(!collapsed || mobile) && <span className="relative z-10 truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>


      {/* Pinned: always reachable no matter how long the nav gets. */}
      <Link
        to="/login"
        onClick={() => clearAuth()}
        title="Logout"
        className={`mt-1 flex shrink-0 items-center gap-3 rounded-xl border-t border-border/60 px-3 py-2.5 pt-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition ${
          collapsed && !mobile ? "justify-center" : ""
        }`}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
        {(!collapsed || mobile) && <span>Logout</span>}
      </Link>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col glass border-r transition-[width] duration-300 ${
          collapsed ? "w-[88px]" : "w-[260px]"
        }`}
      >
        {content(false)}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] glass border-r lg:hidden"
            >
              {content(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

