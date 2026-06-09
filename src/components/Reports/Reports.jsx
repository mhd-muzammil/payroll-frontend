import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "../ui/PageHeader";
import { Download, TrendingUp, DollarSign, Users, BarChart3, Loader2, AlertCircle } from "lucide-react";
import StatsCard from "../ui/StatsCard";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { api } from "@/api/Api";
import { extractArray } from "../../Utility/apiUtils";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const parseCurrency = (value) => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
};

const toK = (value) => Math.round((Number(value || 0) / 1000) * 10) / 10;

const compactCurrency = (value) => {
  const amount = Number(value || 0);
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return currency.format(amount);
};

const getEmployeeDepartment = (employee) => employee?.department || "Unassigned";

const buildSalaryBreakdown = (employees, payslips) => {
  const departments = new Map();

  if (payslips.length > 0) {
    payslips.forEach((payslip) => {
      const department = getEmployeeDepartment(payslip.employee_details);
      const current = departments.get(department) || { dept: department, base: 0, bonus: 0 };
      current.base +=
        Number(payslip.earned_basic || 0) +
        Number(payslip.earned_hra || 0) +
        Number(payslip.earned_conveyance || 0) +
        Number(payslip.earned_child_edu || 0) +
        Number(payslip.earned_personal_allowance || 0);
      current.bonus += Number(payslip.earned_incentive || 0) + Number(payslip.earned_other_earnings || 0);
      departments.set(department, current);
    });
  } else {
    employees.forEach((employee) => {
      const department = getEmployeeDepartment(employee);
      const current = departments.get(department) || { dept: department, base: 0, bonus: 0 };
      const structuredBase =
        Number(employee.basic || 0) +
        Number(employee.hra || 0) +
        Number(employee.conveyance || 0) +
        Number(employee.child_edu || 0) +
        Number(employee.personal_allowance || 0);
      current.base += structuredBase || Number(employee.salary || 0);
      current.bonus += Number(employee.incentive || 0) + Number(employee.other_earnings || 0);
      departments.set(department, current);
    });
  }

  return [...departments.values()]
    .map((item) => ({
      dept: item.dept.length > 10 ? `${item.dept.slice(0, 9)}...` : item.dept,
      fullDept: item.dept,
      base: toK(item.base),
      bonus: toK(item.bonus),
    }))
    .sort((a, b) => b.base + b.bonus - (a.base + a.bonus))
    .slice(0, 8);
};

const buildTrend = (cycles) =>
  [...cycles]
    .reverse()
    .slice(-6)
    .map((cycle) => {
      const [m = cycle.period] = String(cycle.period || "").split(" ");
      return {
        m,
        period: cycle.period,
        actual: toK(parseCurrency(cycle.net)),
        projected: toK(parseCurrency(cycle.gross)),
      };
    });

const buildStats = (employees, payslips, salaryBreakdown, trend) => {
  const totalEmployeeSalary = employees.reduce((sum, employee) => sum + Number(employee.salary || 0), 0);
  const totalBase = salaryBreakdown.reduce((sum, item) => sum + item.base, 0);
  const totalBonus = salaryBreakdown.reduce((sum, item) => sum + item.bonus, 0);
  const totalCompensation = totalBase + totalBonus;
  const avgCost = employees.length ? totalEmployeeSalary / employees.length : 0;
  const bonusRatio = totalCompensation ? (totalBonus / totalCompensation) * 100 : 0;

  return {
    avgCost: compactCurrency(avgCost),
    headcount: employees.length.toLocaleString("en-IN"),
    bonusRatio: `${bonusRatio.toFixed(1)}%`,
    reportsGenerated: (payslips.length || trend.length).toLocaleString("en-IN"),
  };
};

const ReportsPage = () => {
  const [employees, setEmployees] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesRes, payslipsRes, cyclesRes] = await Promise.all([
        api.get("/api/employees/"),
        api.get("/api/payslips/"),
        api.get("/api/payslips/cycles_summary/"),
      ]);

      setEmployees(extractArray(employeesRes.data));
      setPayslips(extractArray(payslipsRes.data));
      setCycles(extractArray(cyclesRes.data));
    } catch (err) {
      console.error("Reports Fetch Error:", err);
      setError("Failed to load live report data from the core system.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const salary = useMemo(() => buildSalaryBreakdown(employees, payslips), [employees, payslips]);
  const trend = useMemo(() => buildTrend(cycles), [cycles]);
  const stats = useMemo(() => buildStats(employees, payslips, salary, trend), [employees, payslips, salary, trend]);

  const hasSalaryData = salary.some((item) => item.base > 0 || item.bonus > 0);
  const hasTrendData = trend.some((item) => item.actual > 0 || item.projected > 0);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Reports & Analytics"
        description="Insights into compensation, trends and forecasting."
        actions={<Button icon={Download} className="w-full sm:w-auto">Export report</Button>}
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            Reports Feed Disconnected
          </div>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading live reports...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
            <StatsCard label="Avg Cost / Employee" value={stats.avgCost} delta="Live Avg" icon={DollarSign} accent="primary" />
            <StatsCard label="Total Headcount" value={stats.headcount} delta="Live Count" icon={Users} accent="info" />
            <StatsCard label="Bonus Ratio" value={stats.bonusRatio} delta="Live Mix" icon={TrendingUp} accent="success" />
            <StatsCard label="Reports Generated" value={stats.reportsGenerated} delta="Payslips" icon={BarChart3} accent="warning" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 md:p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold leading-none">Salary Breakdown</h3>
                <p className="text-sm text-muted-foreground mt-1.5">Base vs bonus by department (in ₹K)</p>
              </div>
              <div className="h-[320px] w-full pr-2">
                {hasSalaryData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.15)" vertical={false} />
                      <XAxis dataKey="dept" stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-card)' }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDept || ""}
                        formatter={(value, name) => [`₹${value}K`, name === "base" ? "Base" : "Bonus"]}
                      />
                      <Bar dataKey="base" stackId="a" fill="#8B5CF6" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="bonus" stackId="a" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-center text-sm text-muted-foreground">
                    Add employees or generate payslips to populate salary breakdown.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5 md:p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold leading-none">Actual vs Projected</h3>
                <p className="text-sm text-muted-foreground mt-1.5">Payroll forecast accuracy (₹K)</p>
              </div>
              <div className="h-[320px] w-full pr-2">
                {hasTrendData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.15)" vertical={false} />
                      <XAxis dataKey="m" stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis stroke="currentColor" className="text-muted-foreground" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-card)' }}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.period || ""}
                        formatter={(value, name) => [`₹${value}K`, name === "actual" ? "Actual" : "Projected"]}
                      />
                      <Legend wrapperStyle={{ paddingTop: 20, fontSize: 12 }} />
                      <Line type="monotone" dataKey="actual" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 4, fill: '#8B5CF6' }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="projected" stroke="#06B6D4" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 4, fill: '#06B6D4' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-center text-sm text-muted-foreground">
                    Generate payslips to populate payroll trend analytics.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportsPage;
