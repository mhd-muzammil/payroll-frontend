import React, { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Wallet, TrendingUp, Clock, ArrowUpRight, Loader2, AlertCircle } from "lucide-react";
import StatsCard from '../ui/StatsCard';

import PayrollTrend from './PayrollTrend';
import DepartmentSplit from './DepartmentSplit';
import RecentPayroll from './RecentPayroll';
import UpcomingPayment from './UpcomingPayment';

import GreetingHeader from '../ui/GreetingHeader';
import { api } from "@/api/Api";
import { extractArray } from "../../Utility/apiUtils";

const parseCurrency = (value) => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
};

const buildDepartmentSplit = (employees = []) => {
  const activeEmployees = employees.filter((employee) => employee.status === "active");
  const counts = activeEmployees.reduce((acc, employee) => {
    const department = employee.department || "Unassigned";
    acc[department] = (acc[department] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      value: activeEmployees.length ? Math.round((count / activeEmployees.length) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const buildPayrollTrend = (cycles = []) =>
  [...cycles]
    .reverse()
    .slice(-8)
    .map((cycle) => {
      const [m = cycle.period, year = ""] = String(cycle.period || "").split(" ");
      return {
        m,
        period: [m, year].filter(Boolean).join(" "),
        payroll: parseCurrency(cycle.net),
        bonus: Math.max(parseCurrency(cycle.gross) - parseCurrency(cycle.net), 0),
      };
    });

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/payslips/dashboard_summary/");
      const nextSummary = { ...res.data };

      if (!Array.isArray(nextSummary.departmentSplit) || nextSummary.departmentSplit.length === 0) {
        try {
          const employeesRes = await api.get("/api/employees/");
          nextSummary.departmentSplit = buildDepartmentSplit(extractArray(employeesRes.data));
        } catch (employeeErr) {
          console.warn("Department split fallback failed:", employeeErr);
          nextSummary.departmentSplit = [];
        }
      }

      if (!Array.isArray(nextSummary.payrollTrend) || nextSummary.payrollTrend.length === 0) {
        try {
          const cyclesRes = await api.get("/api/payslips/cycles_summary/");
          nextSummary.payrollTrend = buildPayrollTrend(extractArray(cyclesRes.data));
        } catch (cyclesErr) {
          console.warn("Payroll trend fallback failed:", cyclesErr);
          nextSummary.payrollTrend = [];
        }
      }

      setSummary(nextSummary);
    } catch (err) {
      console.error("Dashboard Fetch Error:", err);
      setError("Failed to aggregate real-time metrics from the core system.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="text-center">
          <h3 className="font-semibold text-foreground text-lg">Loading Enterprise Dashboard</h3>
          <p className="text-sm mt-0.5">Querying real-time telemetry records...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-red-200 bg-red-50 rounded-3xl text-red-800 max-w-lg mx-auto my-12 shadow-sm">
        <div className="flex items-center gap-3 font-semibold text-lg text-red-900">
          <AlertCircle className="h-5 w-5" />
          System Feed Disconnected
        </div>
        <p className="text-sm mt-2 text-red-700">{error}</p>
        <Button onClick={fetchDashboard} className="mt-4" variant="outline">Retry Fetch</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-500">
      <GreetingHeader subtitle="Manage your organization's payroll cycle, view reports, and track overall expense efficiency." />
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          Payroll <span className="text-gradient">Overview</span>
        </h2>
        <div className="flex items-center gap-3">
            <Button variant="outline" className="hidden sm:flex" onClick={fetchDashboard}>Refresh Metrics</Button>
            {/* <Button icon={ArrowUpRight} className="w-full sm:w-auto">Run payroll</Button> */}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatsCard label="Overall Payroll" value={summary?.totalPayroll || "₹0"} delta="All Time" icon={Wallet} accent="primary" />
        <StatsCard label="Total Employees" value={summary?.totalEmployees || "0"} delta="Active" icon={Users} accent="info" />
        <StatsCard label="Avg. Base Salary" value={summary?.avgSalary || "₹0"} delta="Per Head" icon={TrendingUp} accent="success" />
        <StatsCard label="Pending Onboards" value={summary?.pendingApprovals || "0"} icon={Clock} accent="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
            <PayrollTrend data={summary?.payrollTrend || []} />
        </div>
        <div className="lg:col-span-1">
            <DepartmentSplit data={summary?.departmentSplit || []} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
            <RecentPayroll data={summary?.recentTransactions || []} />
        </div>
        <div className="lg:col-span-1">
            <UpcomingPayment data={summary?.upcoming} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
