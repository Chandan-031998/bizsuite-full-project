// client/src/components/charts/FinanceChart.jsx
import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const FinanceChart = ({ data = [] }) => {
  return (
    <div className="h-72 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Monthly Finance
      </h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Revenue vs expenses over time (based on invoices & expenses).
      </p>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {/* Revenue gradient (indigo → sky) */}
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f4f9a" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.1} />
              </linearGradient>

              {/* Expenses gradient (amber → rose) */}
              <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#fed7aa" stopOpacity={0.1} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.7} />
            <XAxis
              dataKey="period"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5f5" }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5f5" }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "0.75rem",
                fontSize: 11,
                boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
              }}
              labelStyle={{ color: "#0f172a", fontWeight: 500 }}
              itemStyle={{ color: "#0f172a" }}
            />

            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#0f4f9a"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              fillOpacity={1}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#f97316"
              strokeWidth={2}
              fill="url(#expensesGradient)"
              fillOpacity={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinanceChart;
