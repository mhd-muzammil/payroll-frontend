import React from 'react'
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatAxisCurrency = (value) => {
  const amount = Number(value || 0);
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}k`;
  return `₹${amount}`;
};

const getChangeLabel = (data) => {
  const first = data.find((item) => item.payroll > 0)?.payroll || 0;
  const last = [...data].reverse().find((item) => item.payroll > 0)?.payroll || 0;
  if (!first || !last || first === last) return "Live data";
  const change = ((last - first) / first) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
};

const PayrollTrend = ({ data = [] }) => {
  const hasTrendData = data.some((item) => item.payroll > 0 || item.bonus > 0);

  return (
    <Card className="p-5 md:p-6 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-lg font-semibold leading-none">Payroll Trend</h3>
          <p className="text-sm text-muted-foreground mt-1.5">Generated payslip totals over the last 8 months</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="primary" className="bg-primary/10 text-primary border-none font-semibold">{getChangeLabel(data)}</Badge>
        </div>
      </div>
      <div className="h-[300px] w-full pr-2">
        {hasTrendData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(127,127,127,0.15)" vertical={false} />
              <XAxis dataKey="m" stroke="currentColor" tick={{ fontSize: 12 }} className="text-muted-foreground" axisLine={false} tickLine={false} />
              <YAxis stroke="currentColor" tick={{ fontSize: 12 }} className="text-muted-foreground" axisLine={false} tickLine={false} tickFormatter={formatAxisCurrency} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                formatter={(value, name) => [formatCurrency(value), name === "payroll" ? "Payroll" : "Bonus"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.period || ""}
              />
              <Area type="monotone" dataKey="payroll" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#g1)" />
              <Area type="monotone" dataKey="bonus" stroke="#06B6D4" strokeWidth={2.5} fill="url(#g2)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="ml-4 flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-center text-sm text-muted-foreground">
            Generate payroll to populate the monthly trend.
          </div>
        )}
      </div>
    </Card>
  )
}

export default PayrollTrend
