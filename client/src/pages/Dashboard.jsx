import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import api from "../api/axios.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const toINR = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(v || 0));

const clampArrByMonths = (arr, months) => {
  if (!Array.isArray(arr)) return [];
  if (months === "all") return arr;
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) return arr;
  if (arr.length <= n) return arr;
  return arr.slice(arr.length - n);
};

const normalizePeriod = (p) => {
  if (!p) return "";
  const s = String(p);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return s.slice(0, 7);
};

const monthKeyFromDate = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const buildStageSeries = (leadsPipeline) => {
  const stagesOrder = ["New", "Contacted", "Proposal", "Negotiation", "Won", "Lost"];
  const map = new Map(
    (leadsPipeline || []).map((x) => [String(x.stage || "").trim(), Number(x.count || 0)])
  );
  return stagesOrder.map((stage) => ({ stage, count: map.get(stage) ?? 0 }));
};

const RangePill = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all",
      active
        ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 border-transparent text-white shadow-sm"
        : "bg-white/70 border-slate-200 text-slate-600 hover:bg-white hover:shadow-sm",
    ].join(" ")}
  >
    {children}
  </button>
);

const StatCard = ({ label, value, tone = "indigo" }) => {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="bg-white/80 backdrop-blur border border-slate-200 rounded-2xl shadow-sm p-4"
    >
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-2">
        <span
          className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ring-1 ${
            tones[tone] || tones.indigo
          }`}
        >
          {value}
        </span>
      </div>
    </motion.div>
  );
};

const cardAnim = {
  hidden: { opacity: 0, y: 10 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: "easeOut" },
  }),
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [dash, setDash] = useState(null);
  const [invoices, setInvoices] = useState([]);

  const [range, setRange] = useState("6");
  const [focusStage, setFocusStage] = useState(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErr("");

      try {
        const [dashRes, invRes] = await Promise.allSettled([
          api.get("/dashboard"),
          api.get("/accounts/invoices"),
        ]);

        if (!mounted) return;

        if (dashRes.status === "fulfilled") setDash(dashRes.value.data);
        if (invRes.status === "fulfilled") setInvoices(invRes.value.data || []);

        if (dashRes.status === "rejected" && invRes.status === "rejected") {
          setErr("Failed to load dashboard");
        }
      } catch (e) {
        if (!mounted) return;
        setErr(e?.response?.data?.message || "Failed to load dashboard");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // ---- Derived fallback from /accounts/invoices
  const derived = useMemo(() => {
    const list = Array.isArray(invoices) ? invoices : [];

    let totalInvoiced = 0;
    let totalPaid = 0;
    let outstanding = 0;

    const byMonth = new Map();

    for (const inv of list) {
      const total = Number(inv.total || 0);
      const paid = Number(inv.paid || 0);

      totalInvoiced += total;
      totalPaid += paid;
      outstanding += Math.max(total - paid, 0);

      const k = monthKeyFromDate(inv.issue_date);
      if (!k) continue;
      const curr = byMonth.get(k) || { period: k, revenue: 0, expenses: 0 };
      curr.revenue += total;
      byMonth.set(k, curr);
    }

    const monthlyFinance = Array.from(byMonth.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );

    return {
      totalRevenue: totalInvoiced,
      outstandingPayments: outstanding,
      monthlyFinance,
      totalPaid,
    };
  }, [invoices]);

  // ---- API values
  const {
    totalRevenue: apiRevenue = 0,
    totalExpenses: apiExpenses = 0,
    outstandingPayments: apiOutstanding = 0,
    leadsPipeline = [],
    monthlyFinance: apiMonthlyFinance = [],
  } = dash || {};

  // ✅ CRITICAL: choose displayed totals first, then compute KPIs from that
  const revenueFromApi = Number(apiRevenue || 0);
  const derivedRevenue = Number(derived.totalRevenue || 0);

  const usingDerivedRevenue = revenueFromApi <= 0 && derivedRevenue > 0;

  const totalRevenue = usingDerivedRevenue ? derivedRevenue : revenueFromApi;
  const totalExpenses = Number(apiExpenses || 0);

  const outstandingPayments =
    Number(apiOutstanding || 0) > 0 ? apiOutstanding : derived.outstandingPayments;

  // ✅ Now compute these ONLY from displayed totals
  const remainingBalance = Number(totalRevenue || 0) - Number(totalExpenses || 0);
  const netProfit = remainingBalance; // since your definition is Revenue - Expenses

  const monthlyFinance =
    apiMonthlyFinance && apiMonthlyFinance.length > 0 ? apiMonthlyFinance : derived.monthlyFinance;

  const monthlySeries = useMemo(() => {
    const cleaned = (monthlyFinance || [])
      .filter((r) => r && r.period)
      .map((r) => ({
        period: normalizePeriod(r.period),
        revenue: Number(r.revenue || 0),
        expenses: Number(r.expenses || 0),
      }))
      .filter((r) => r.period);

    return clampArrByMonths(cleaned, range);
  }, [monthlyFinance, range]);

  const leadsSeries = useMemo(() => buildStageSeries(leadsPipeline), [leadsPipeline]);
  const leadsTotal = useMemo(
    () => leadsSeries.reduce((s, x) => s + Number(x.count || 0), 0),
    [leadsSeries]
  );
  const leadsWon = useMemo(
    () => leadsSeries.find((x) => x.stage === "Won")?.count || 0,
    [leadsSeries]
  );
  const conversion = useMemo(
    () => (leadsTotal ? Math.round((Number(leadsWon) / Number(leadsTotal)) * 100) : 0),
    [leadsWon, leadsTotal]
  );

  const focusedLeadsSeries = useMemo(() => {
    if (!focusStage) return leadsSeries;
    return leadsSeries.map((x) => (x.stage === focusStage ? x : { ...x, count: 0 }));
  }, [leadsSeries, focusStage]);

  const barColors = ["#6366F1", "#06B6D4", "#A855F7", "#22C55E", "#F59E0B", "#EF4444"];

  return (
    <div className="relative p-6 overflow-hidden">
      {/* Animated Background */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #6366F1 0%, transparent 60%)" }}
          animate={{ x: [0, 30, 0], y: [0, 18, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-10 -right-24 h-96 w-96 rounded-full blur-3xl opacity-25"
          style={{ background: "radial-gradient(circle, #06B6D4 0%, transparent 60%)" }}
          animate={{ x: [0, -25, 0], y: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, #A855F7 0%, transparent 60%)" }}
          animate={{ x: [0, 22, 0], y: [0, -18, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-slate-900">Dashboard</div>
          <div className="text-[12px] text-slate-500">
            Overview of revenue, expenses & leads (interactive)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RangePill active={range === "3"} onClick={() => setRange("3")}>3M</RangePill>
          <RangePill active={range === "6"} onClick={() => setRange("6")}>6M</RangePill>
          <RangePill active={range === "12"} onClick={() => setRange("12")}>12M</RangePill>
          <RangePill active={range === "all"} onClick={() => setRange("all")}>All</RangePill>
        </div>
      </div>

      {loading && (
        <div className="relative mt-4 bg-white/70 border border-slate-200 rounded-2xl p-4 text-sm text-slate-600">
          Loading dashboard…
        </div>
      )}

      {!loading && err && (
        <div className="relative mt-4 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* KPI Cards */}
          <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <motion.div variants={cardAnim} initial="hidden" animate="show" custom={0}>
              <StatCard label="Total Revenue" value={toINR(totalRevenue)} tone="indigo" />
            </motion.div>

            <motion.div variants={cardAnim} initial="hidden" animate="show" custom={1}>
              <StatCard
                label="Remaining Balance"
                value={toINR(remainingBalance)}
                tone={remainingBalance >= 0 ? "emerald" : "rose"}
              />
            </motion.div>

            <motion.div variants={cardAnim} initial="hidden" animate="show" custom={2}>
              <StatCard label="Total Expenses" value={toINR(totalExpenses)} tone="rose" />
            </motion.div>

            <motion.div variants={cardAnim} initial="hidden" animate="show" custom={3}>
              <StatCard label="Net Profit" value={toINR(netProfit)} tone="emerald" />
            </motion.div>

            <motion.div variants={cardAnim} initial="hidden" animate="show" custom={4}>
              <StatCard label="Outstanding Payments" value={toINR(outstandingPayments)} tone="violet" />
            </motion.div>
          </div>

          {/* Secondary stats */}
          <div className="relative mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard label="Total Leads in Pipeline" value={String(leadsTotal)} tone="slate" />
            <StatCard label="Leads Won" value={String(leadsWon)} tone="emerald" />
            <StatCard label="Lead Conversion Rate" value={`${conversion}%`} tone="amber" />
          </div>

          {/* Charts */}
          <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Finance Chart */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Monthly Finance</div>
                  <div className="text-[12px] text-slate-500">Animated chart with hover tooltips.</div>
                </div>
                <div className="text-[11px] text-slate-500">
                  Range:{" "}
                  <span className="font-semibold text-slate-700">
                    {range === "all" ? "All" : `${range}M`}
                  </span>
                </div>
              </div>

              <div className="mt-4 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlySeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value, name) => [
                        toINR(value),
                        name === "revenue" ? "Revenue" : "Expenses",
                      ]}
                      labelFormatter={(label) => `Period: ${label}`}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2} fillOpacity={0.08} />
                    <Area type="monotone" dataKey="expenses" stroke="#06B6D4" strokeWidth={2} fillOpacity={0.08} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {monthlySeries.length === 0 && (
                <div className="mt-3 text-[12px] text-slate-500">
                  No monthly data yet. Create invoices/expenses to see charts.
                </div>
              )}
            </motion.div>

            {/* Leads Pipeline */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200 shadow-sm p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Leads Pipeline</div>
                  <div className="text-[12px] text-slate-500">
                    Click a bar to focus. Click again to reset.
                  </div>
                </div>

                {focusStage ? (
                  <button
                    type="button"
                    onClick={() => setFocusStage(null)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50"
                  >
                    Clear: {focusStage}
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-500">Total: {leadsTotal}</div>
                )}
              </div>

              <div className="mt-4 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={focusedLeadsSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [Number(value || 0), "Leads"]}
                      labelFormatter={(label) => `Stage: ${label}`}
                    />
                    <Bar
                      dataKey="count"
                      radius={[12, 12, 0, 0]}
                      onClick={(d) => {
                        const stage = d?.stage;
                        if (!stage) return;
                        setFocusStage((prev) => (prev === stage ? null : stage));
                      }}
                    >
                      {focusedLeadsSeries.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 text-[11px] text-slate-500">
                Tip: If your stage names differ, update the stage list in this dashboard file.
              </div>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
