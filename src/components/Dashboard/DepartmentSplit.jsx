import React from 'react'
import { Card } from "@/components/ui/card"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"

const COLORS = ["#7C4DFF", "#06B6D4", "#F59E0B", "#10B981", "#EF4444", "#64748B", "#EC4899"];

const DepartmentSplit = ({ data = [] }) => {
  const departments = data.map((item, index) => ({
    ...item,
    value: Number(item.value || 0),
    count: Number(item.count || 0),
    color: COLORS[index % COLORS.length],
  }));
  const hasDepartments = departments.some((item) => item.count > 0);

  return (
    <Card className="p-5 md:p-6 h-full flex flex-col">
      <div className="mb-6">
        <h3 className="text-lg font-semibold leading-none">Department Split</h3>
        <p className="text-sm text-muted-foreground mt-1.5">Active employee headcount distribution</p>
      </div>
      {hasDepartments ? (
        <>
          <div className="relative h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={departments} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={departments.length > 1 ? 5 : 0}>
                  {departments.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-card)' }}
                  formatter={(value, _name, item) => [`${value}% (${item.payload.count})`, item.payload.name]}
                  itemStyle={{ padding: '2px 0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-auto pt-4">
            {departments.map((d) => (
              <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full shadow-sm shrink-0" style={{ background: d.color }} />
                  <span className="truncate text-muted-foreground font-medium">{d.name}</span>
                </div>
                <span className="shrink-0 font-bold">{d.value}%</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 text-center text-sm text-muted-foreground">
          Add active employees to populate department split.
        </div>
      )}
    </Card>
  )
}

export default DepartmentSplit
