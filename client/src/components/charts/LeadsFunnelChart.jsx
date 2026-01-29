// client/src/components/charts/LeadsFunnelChart.jsx
import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const LeadsFunnelChart = ({ data = [] }) => {
  return (
    <div className="h-72 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">
        Leads Pipeline
      </h3>
      <p className="text-[11px] text-slate-500 mb-3">
        Count of leads by stage (New → Won / Lost).
      </p>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              {/* Bar gradient – teal/indigo style to match brand */}
              <linearGradient id="leadBarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f766e" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.2} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.8} />
            <XAxis
              dataKey="stage"
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5f5" }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5f5" }}
              allowDecimals={false}
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
            <Bar
              dataKey="count"
              name="Leads"
              stroke="#0f766e"
              strokeWidth={1}
              fill="url(#leadBarGradient)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default LeadsFunnelChart;
