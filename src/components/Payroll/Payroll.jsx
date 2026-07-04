import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PageHeader from "../ui/PageHeader";
import StatsCard from "../ui/StatsCard";
import Toolbar from "../ui/Toolbar";
import DataTable from "../ui/DataTable";
import { Wallet, TrendingUp, Clock, CheckCircle2, Play, MoreHorizontal, Loader2, MapPin, Users, Save, Calendar, FileText, Eye } from "lucide-react";
import { api } from "@/api/Api";
import { extractArray } from "../../Utility/apiUtils";

const regionStyles = {
  Chennai: {
    bg: "from-indigo-50/50 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/10",
    border: "border-indigo-100 dark:border-indigo-950/50",
    iconBg: "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400",
    bar: "from-indigo-500 to-purple-500",
    text: "text-indigo-700 dark:text-indigo-300"
  },
  Vellore: {
    bg: "from-blue-50/50 to-sky-50/30 dark:from-blue-950/20 dark:to-sky-950/10",
    border: "border-blue-100 dark:border-blue-950/50",
    iconBg: "bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400",
    bar: "from-blue-500 to-sky-500",
    text: "text-blue-700 dark:text-blue-300"
  },
  Salem: {
    bg: "from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/20 dark:to-teal-950/10",
    border: "border-emerald-100 dark:border-emerald-950/50",
    iconBg: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400",
    bar: "from-emerald-500 to-teal-500",
    text: "text-emerald-700 dark:text-emerald-300"
  },
  Kanchipuram: {
    bg: "from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10",
    border: "border-amber-100 dark:border-amber-950/50",
    iconBg: "bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400",
    bar: "from-amber-500 to-orange-500",
    text: "text-amber-700 dark:text-amber-300"
  },
  Hosur: {
    bg: "from-rose-50/50 to-pink-50/30 dark:from-rose-950/20 dark:to-rose-950/10",
    border: "border-rose-100 dark:border-rose-950/50",
    iconBg: "bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400",
    bar: "from-rose-500 to-pink-500",
    text: "text-rose-700 dark:text-rose-300"
  }
};

const defaultStyle = {
  bg: "from-gray-50/50 to-slate-50/30 dark:from-gray-950/20 dark:to-slate-950/10",
  border: "border-gray-100 dark:border-gray-950/50",
  iconBg: "bg-gray-100 dark:bg-gray-950/80 text-gray-600 dark:text-gray-400",
  bar: "from-gray-500 to-slate-500",
  text: "text-gray-700 dark:text-gray-300"
};

const PayrollPage = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState({ thisMonth: "₹0", ytdTotal: "₹0", pending: "₹0", processed: "0%" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState("");
  const [allEmployees, setAllEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cycleSubTab, setCycleSubTab] = useState("employees"); // employees | history
  const [employeeStats, setEmployeeStats] = useState({
    Chennai: 0,
    Vellore: 0,
    Salem: 0,
    Kanchipuram: 0,
    Hosur: 0,
    "Not Assigned": 0,
  });

  const [activeTab, setActiveTab] = useState("cycles"); // cycles | profitability
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [plData, setPlData] = useState([]);
  const [plLoading, setPlLoading] = useState(false);
  const [savingBranch, setSavingBranch] = useState(null);
  const [editedFinancials, setEditedFinancials] = useState({});

  const monthsList = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" }
  ];

  const yearsList = [2025, 2026, 2027, 2028];

  const fetchPLData = async (m = selectedMonth, y = selectedYear) => {
    setPlLoading(true);
    try {
      const res = await api.get(`/api/payslips/pl_summary/?month=${m}&year=${y}`);
      setPlData(res.data || []);
      const initialEdits = {};
      (res.data || []).forEach(b => {
        initialEdits[b.branch] = {
          revenue: b.revenue,
          other_expenses: b.other_expenses
        };
      });
      setEditedFinancials(initialEdits);
    } catch (e) {
      console.error("Failed to fetch P&L summary", e);
    } finally {
      setPlLoading(false);
    }
  };

  const handleInputChange = (branch, field, val) => {
    setEditedFinancials(prev => ({
      ...prev,
      [branch]: {
        ...prev[branch],
        [field]: val
      }
    }));
  };

  const handleSaveFinancials = async (branch, rev, exp, id) => {
    setSavingBranch(branch);
    try {
      const payload = {
        branch,
        month: selectedMonth,
        year: selectedYear,
        revenue: parseFloat(rev) || 0,
        other_expenses: parseFloat(exp) || 0
      };
      if (id) {
        await api.put(`/api/branch-financials/${id}/`, payload);
      } else {
        await api.post(`/api/branch-financials/`, payload);
      }
      alert(`Financials for ${branch} saved successfully!`);
      fetchPLData(selectedMonth, selectedYear);
    } catch (e) {
      console.error("Failed to save financials", e);
      alert("Failed to save financials.");
    } finally {
      setSavingBranch(null);
    }
  };

  const fetchData = async (region = selectedRegion, m = selectedMonth, y = selectedYear) => {
    setLoading(true);
    setError(null);
    try {
      const summaryUrl = region ? `/api/payslips/cycles_summary/?branch=${region}` : "/api/payslips/cycles_summary/";
      const statsUrl = region 
        ? `/api/payslips/company_stats/?branch=${region}&month=${m}&year=${y}` 
        : `/api/payslips/company_stats/?month=${m}&year=${y}`;

      const [cyclesRes, statsRes] = await Promise.all([
        api.get(summaryUrl).catch(e => {
          console.error("Cycle API Error Details:", e);
          throw new Error(`Summary Endpt Failure: ${e.response?.status || e.message}`);
        }),
        api.get(statsUrl).catch(e => {
          console.error("Stats API Error Details:", e);
          throw new Error(`KPI Endpt Failure: ${e.response?.status || e.message}`);
        })
      ]);

      setRuns(cyclesRes.data || []);
      if (statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (err) {
      console.error("Aggregated Fetch Exception:", err);
      setError(err.message || "Network communication error or API disconnect");
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/api/employees/");
      const list = extractArray(res.data);
      setAllEmployees(list);
      const regions = ["Chennai", "Vellore", "Salem", "Kanchipuram", "Hosur"];
      const statsObj = {
        Chennai: 0,
        Vellore: 0,
        Salem: 0,
        Kanchipuram: 0,
        Hosur: 0,
        "Not Assigned": 0,
      };
      list.forEach((e) => {
        const branch = e.branch;
        if (branch) {
          const matched = regions.find((reg) => reg.toLowerCase() === branch.trim().toLowerCase());
          if (matched) {
            statsObj[matched] += 1;
          } else {
            statsObj["Not Assigned"] += 1;
          }
        } else {
          statsObj["Not Assigned"] += 1;
        }
      });
      setEmployeeStats(statsObj);
    } catch (e) {
      console.error("Failed to fetch employees for stats", e);
    }
  };

  const filteredEmployees = useMemo(() => {
    return allEmployees.filter((emp) => {
      if (selectedRegion) {
        const matchBranch = emp.branch && emp.branch.trim().toLowerCase() === selectedRegion.trim().toLowerCase();
        if (!matchBranch) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = emp.employee_name && emp.employee_name.toLowerCase().includes(q);
        const roleMatch = emp.role && emp.role.toLowerCase().includes(q);
        const deptMatch = emp.department && emp.department.toLowerCase().includes(q);
        const codeMatch = emp.emp_code && emp.emp_code.toLowerCase().includes(q);
        if (!nameMatch && !roleMatch && !deptMatch && !codeMatch) return false;
      }
      return true;
    });
  }, [allEmployees, selectedRegion, searchQuery]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchData(selectedRegion, selectedMonth, selectedYear);
  }, [selectedRegion, selectedMonth, selectedYear]);

  useEffect(() => {
    if (activeTab === "profitability") {
      fetchPLData(selectedMonth, selectedYear);
    }
  }, [activeTab, selectedMonth, selectedYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll & Profitability"
        description="Review company-wide processing history, branch budgets, and financial P&L cycles."
        actions={
          <div className="flex gap-2">
            {activeTab === "profitability" ? (
              <Button icon={Play} onClick={() => fetchPLData(selectedMonth, selectedYear)}>Refresh P&L</Button>
            ) : (
              <Button icon={Play} onClick={() => { fetchData(selectedRegion, selectedMonth, selectedYear); fetchEmployees(); }}>Refresh Data</Button>
            )}
          </div>
        }
      />

      {error && activeTab === "cycles" && (
        <div className="p-4 border-l-4 border-red-500 bg-red-50 rounded-r-2xl shadow-sm animate-pulse-subtle">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-red-100 rounded-full text-red-600">
              <Clock className="h-4 w-4 rotate-45" />
            </div>
            <div>
              <h4 className="font-semibold text-red-800 text-sm">Live Feed Disconnection Detected</h4>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <p className="text-[10px] text-red-500/70 mt-1 font-mono">Diagnosis: Terminal or browser environment mismatch. Please verify backend console status.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex rounded-2xl overflow-hidden bg-muted/40 p-1.5 max-w-md border border-border flex-1 min-w-[280px]">
        <button
          onClick={() => setActiveTab("cycles")}
          className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "cycles"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Payroll Cycles
        </button>
        <button
          onClick={() => setActiveTab("profitability")}
          className={`flex-1 py-2 text-center rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === "profitability"
              ? "bg-card text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Profitability (P&L)
        </button>
      </div>

      {activeTab === "cycles" ? (
        <>
          {/* Monthly Period Filter Selector */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-card border border-border/60 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <span className="text-base font-bold text-foreground block">Payroll Period Selector</span>
                <span className="text-xs text-muted-foreground">Select Month & Year to view monthly salary metrics, status & payouts</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {yearsList.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Monthly KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
            <StatsCard
              label="Total Base Salary (Gross Total)"
              value={stats.totalBaseSalaryFmt || "₹0"}
              delta={`${stats.totalActiveEmployees || 0} Active Employees`}
              icon={Wallet}
              accent="primary"
            />
            <StatsCard
              label="Generated Net Payout"
              value={stats.generatedNetFmt || "₹0"}
              delta={`Gross: ${stats.generatedGrossFmt || "₹0"} (${stats.slipsCount || 0} Slips)`}
              icon={TrendingUp}
              accent="success"
            />
            <StatsCard
              label="Paid / Pending Employees"
              value={`${stats.paidCount || 0} Paid • ${stats.unpaidCount || 0} Pending`}
              delta={`Paid: ${stats.paidAmountFmt || "₹0"} | Pending: ${stats.unpaidAmountFmt || "₹0"}`}
              icon={CheckCircle2}
              accent="warning"
            />
            <StatsCard
              label="Total Deductions Amount"
              value={stats.totalDeductionsFmt || "₹0"}
              delta="EPF, ESI & Statutory Deductions"
              icon={Clock}
              accent="info"
            />
          </div>

          {/* Monthly Detailed Metrics Summary Banner */}
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-pink-500/10 border border-indigo-200/50 dark:border-indigo-900/40 rounded-3xl p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                  {monthsList.find(m => m.value === selectedMonth)?.label} {selectedYear} Monthly Payroll Breakdown
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete breakdown of employee base salaries, generated payouts, paid status, and deductions.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                <div className="bg-card px-3 py-1.5 rounded-xl border border-border shadow-2xs flex items-center gap-1.5">
                  <span className="text-muted-foreground">Base Salary (Gross):</span>
                  <span className="font-bold text-foreground">{stats.totalBaseSalaryFmt || "₹0"}</span>
                </div>
                <div className="bg-card px-3 py-1.5 rounded-xl border border-border shadow-2xs flex items-center gap-1.5">
                  <span className="text-muted-foreground">Generated Net:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats.generatedNetFmt || "₹0"}</span>
                </div>
                <div className="bg-card px-3 py-1.5 rounded-xl border border-border shadow-2xs flex items-center gap-1.5">
                  <span className="text-muted-foreground">Total Deductions:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{stats.totalDeductionsFmt || "₹0"}</span>
                </div>
                <div className="bg-card px-3 py-1.5 rounded-xl border border-border shadow-2xs flex items-center gap-1.5">
                  <span className="text-muted-foreground">Paid Staff:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{stats.paidCount || 0} ({stats.paidAmountFmt || "₹0"})</span>
                </div>
                <div className="bg-card px-3 py-1.5 rounded-xl border border-border shadow-2xs flex items-center gap-1.5">
                  <span className="text-muted-foreground">Unpaid Pending:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{stats.unpaidCount || 0} ({stats.unpaidAmountFmt || "₹0"})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Region-Wise Payroll Distribution */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="text-base font-bold tracking-tight text-foreground">Filter by Region</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
              <button
                onClick={() => setSelectedRegion("")}
                className={`bg-gradient-to-br from-indigo-50/50 to-purple-50/30 border border-indigo-100 rounded-2xl p-4 md:p-5 flex flex-col justify-between text-left transition-all duration-300 ${
                  selectedRegion === "" 
                    ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                    : "opacity-50 hover:opacity-100 scale-[0.95]"
                }`}
              >
                <span className="font-bold text-xs md:text-sm tracking-tight text-indigo-700">All Regions</span>
                <div className="flex items-baseline gap-1.5 mt-3">
                  <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                    {Object.values(employeeStats).reduce((a, b) => a + b, 0)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">staff</span>
                </div>
              </button>
              {Object.entries(employeeStats).map(([region, count]) => {
                if (region === "Not Assigned") return null;
                const style = regionStyles[region] || defaultStyle;
                const isSelected = selectedRegion.toLowerCase() === region.toLowerCase();
                const hasActiveFilter = selectedRegion !== "";

                return (
                  <button
                    key={region}
                    onClick={() => setSelectedRegion(prev => prev.toLowerCase() === region.toLowerCase() ? "" : region)}
                    className={`bg-gradient-to-br ${style.bg} border ${style.border} rounded-2xl p-4 md:p-5 flex flex-col justify-between text-left transition-all duration-300 ${
                      isSelected 
                        ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-background shadow-md scale-[1.05]" 
                        : hasActiveFilter 
                          ? "opacity-50 hover:opacity-100 scale-[0.95]" 
                          : "hover:shadow-sm hover:scale-[1.02]"
                    }`}
                  >
                    <span className={`font-bold text-xs md:text-sm tracking-tight ${style.text}`}>{region}</span>
                    <div className="flex items-baseline gap-1.5 mt-3">
                      <span className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{count}</span>
                      <span className="text-xs font-semibold text-muted-foreground">staff</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Toolbar searchValue={searchQuery} onSearchChange={setSearchQuery} />

          {/* Sub-tab view header */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/60 rounded-2xl p-3.5 shadow-xs mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">
                {selectedRegion ? `${selectedRegion} Region` : "All Regions"}:
              </span>
              <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border/50">
                {filteredEmployees.length} staff
              </span>
            </div>

            <div className="flex rounded-xl overflow-hidden bg-muted/50 p-1 border border-border/70 text-xs">
              <button
                type="button"
                onClick={() => setCycleSubTab("employees")}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                  cycleSubTab === "employees"
                    ? "bg-card text-foreground shadow-xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Employee Roster ({filteredEmployees.length})
              </button>
              <button
                type="button"
                onClick={() => setCycleSubTab("history")}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                  cycleSubTab === "history"
                    ? "bg-card text-foreground shadow-xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Payroll Cycles History ({runs.length})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2 bg-card border border-border rounded-2xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Aggregating real-time payroll data...</p>
            </div>
          ) : cycleSubTab === "employees" ? (
            <DataTable
              data={filteredEmployees}
              emptyMessage={
                selectedRegion
                  ? `No employees found in ${selectedRegion} region.`
                  : "No employees found."
              }
              columns={[
                {
                  key: "employee_name",
                  label: "Employee",
                  render: (e) => (
                    <div>
                      <div className="font-bold text-sm text-foreground">{e.employee_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {e.emp_code && (
                          <span className="text-[10px] font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            ID: {e.emp_code}
                          </span>
                        )}
                        {e.email && <span className="text-xs text-muted-foreground">{e.email}</span>}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "role",
                  label: "Role & Department",
                  render: (e) => (
                    <div>
                      <div className="text-sm font-semibold text-foreground">{e.role || "Staff"}</div>
                      <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">
                        {e.department || "General"}
                      </Badge>
                    </div>
                  ),
                },
                {
                  key: "branch",
                  label: "Branch",
                  render: (e) => (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                      <MapPin className="h-3 w-3" />
                      {e.branch || "Chennai"}
                    </span>
                  ),
                },
                {
                  key: "salary",
                  label: "Base Salary",
                  render: (e) => (
                    <span className="font-bold text-sm font-mono text-foreground">
                      ₹{parseFloat(e.salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (e) => (
                    <Badge
                      variant={e.status === "active" ? "success" : e.status === "onleave" ? "warning" : "secondary"}
                      className="capitalize"
                    >
                      {e.status || "active"}
                    </Badge>
                  ),
                },
                {
                  key: "act",
                  label: "Action",
                  render: (e) => (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate("/payslip")}
                        className="flex items-center gap-1 rounded-lg border border-border px-3 h-8 text-xs hover:bg-muted font-semibold text-primary transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Payslip
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <DataTable
              data={runs}
              emptyMessage="No payroll cycles found. Generate payslips to create payroll cycle history."
              columns={[
                { key: "period", label: "Period", render: (r) => <span className="font-semibold text-sm tracking-tight">{r.period}</span> },
                { key: "employees", label: "Total Staff", render: (r) => <span className="text-sm text-muted-foreground font-medium">{r.employees}</span> },
                { key: "gross", label: "Total Gross Payout", render: (r) => <span className="text-sm">{r.gross}</span> },
                { key: "net", label: "Total Net Distributed", render: (r) => <span className="font-bold text-sm text-foreground">{r.net}</span> },
                {
                  key: "status", label: "Status",
                  render: (r) => (
                    <Badge variant={r.status === "Completed" ? "success" : "warning"} className="capitalize">{r.status}</Badge>
                  ),
                },
                {
                  key: "act", label: "",
                  render: () => (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate("/payslip")}
                        className="rounded-lg border border-border px-3 h-8 text-xs hover:bg-muted font-medium transition-colors"
                      >
                        Details
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </>
      ) : (
        <>
          {/* Period Selector Controls for P&L */}
          <div className="flex flex-wrap items-center gap-3 bg-card border border-border/60 rounded-3xl p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Select Financial Period:</span>
            </div>
            
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {monthsList.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {yearsList.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {plLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-2 bg-card border border-border rounded-2xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Calculating branch P&L metrics...</p>
            </div>
          ) : (
            <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-sm overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Revenue (A)</th>
                    <th className="py-3 px-4">Payroll Cost (B)</th>
                    <th className="py-3 px-4">Other Expenses (C)</th>
                    <th className="py-3 px-4">Total Expenses (B+C)</th>
                    <th className="py-3 px-4">Net Profit/Loss (A-Exp)</th>
                    <th className="py-3 px-4">Margin %</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {plData.map((row) => {
                    const currentEdit = editedFinancials[row.branch] || { revenue: row.revenue, other_expenses: row.other_expenses };
                    
                    const revNum = parseFloat(currentEdit.revenue) || 0;
                    const otherExpNum = parseFloat(currentEdit.other_expenses) || 0;
                    const payrollCost = row.payroll_cost;
                    const totalExp = payrollCost + otherExpNum;
                    const netPL = revNum - totalExp;
                    const margin = revNum > 0 ? ((netPL / revNum) * 100).toFixed(1) : "0.0";
                    const isProfit = netPL >= 0;

                    return (
                      <tr key={row.branch} className="hover:bg-muted/30 transition-colors">
                        <td className="py-4 px-4 font-bold text-foreground flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-indigo-500" />
                          {row.branch}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 max-w-[140px]">
                            <span className="text-muted-foreground">₹</span>
                            <input
                              type="number"
                              value={currentEdit.revenue}
                              onChange={(e) => handleInputChange(row.branch, "revenue", e.target.value)}
                              className="w-full bg-background border border-border rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono font-medium text-muted-foreground">
                          ₹{payrollCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 max-w-[140px]">
                            <span className="text-muted-foreground">₹</span>
                            <input
                              type="number"
                              value={currentEdit.other_expenses}
                              onChange={(e) => handleInputChange(row.branch, "other_expenses", e.target.value)}
                              className="w-full bg-background border border-border rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                              placeholder="0.00"
                            />
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono font-medium text-muted-foreground">
                          ₹{totalExp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-4 px-4 font-mono font-bold ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {isProfit ? "+" : ""}₹{netPL.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            isProfit 
                              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30" 
                              : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30"
                          }`}>
                            {margin}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="brand"
                            icon={Save}
                            disabled={savingBranch === row.branch}
                            onClick={() => handleSaveFinancials(row.branch, currentEdit.revenue, currentEdit.other_expenses, row.id)}
                          >
                            {savingBranch === row.branch ? "Saving..." : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PayrollPage;
