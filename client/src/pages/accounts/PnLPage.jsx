import React, { useEffect, useState } from "react";
import axios from "../../api/axios.js";

const todayISO = () => new Date().toISOString().slice(0, 10);
const oneMonthAgoISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

const PnLPage = () => {
  const [from, setFrom] = useState(() => oneMonthAgoISO());
  const [to, setTo] = useState(() => todayISO());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await axios.get("/accounts/reports/pnl", {
        params: { from, to },
      });
      setData(res.data);
      setError("");
    } catch (err) {
      console.error("GET /accounts/reports/pnl failed:", err);
      if (!err.response) {
        setError("Unable to reach the server. Please check that the API is running.");
      } else if (err.response.status === 404) {
        setError("P&L endpoint not found on the server (404).");
      } else if (err.response.status === 403) {
        setError("You do not have permission to view the P&L report (403).");
      } else {
        setError("Failed to load P&L report");
      }
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Profit &amp; Loss
          </h2>
          <p className="text-[11px] text-slate-500">
            Income vs expenses for a selected date range.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] bg-white/80 border border-slate-200 rounded-2xl px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <button
            onClick={load}
            className="px-3 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-sm"
          >
            Run
          </button>
        </div>
      </div>

      {error && <div className="text-[11px] text-rose-500">{error}</div>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Income card */}
          <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Income
            </h3>
            {(!data.income || data.income.length === 0) ? (
              <div className="text-[11px] text-slate-500">
                No income records in this range.
              </div>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {data.income.map((row) => (
                  <li
                    key={row.account_name}
                    className="flex justify-between text-slate-700"
                  >
                    <span>{row.account_name}</span>
                    <span className="font-medium text-slate-900">
                      ₹{Number(row.amount || 0).toLocaleString("en-IN")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Expenses card */}
          <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Expenses
            </h3>
            {(!data.expenses || data.expenses.length === 0) ? (
              <div className="text-[11px] text-slate-500">
                No expense records in this range.
              </div>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {data.expenses.map((row) => (
                  <li
                    key={row.account_name}
                    className="flex justify-between text-slate-700"
                  >
                    <span>{row.account_name}</span>
                    <span className="font-medium text-slate-900">
                      ₹{Number(row.amount || 0).toLocaleString("en-IN")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Summary bar */}
          <div className="md:col-span-2 bg-white/90 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] shadow-sm">
            <div className="text-slate-600">
              Total Income:{" "}
              <span className="text-slate-900 font-semibold">
                ₹{Number(data.totalIncome || 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="text-slate-600">
              Total Expenses:{" "}
              <span className="text-slate-900 font-semibold">
                ₹{Number(data.totalExpenses || 0).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="text-slate-600">
              Net Profit:{" "}
              <span
                className={`font-semibold ${
                  (data.netProfit || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                ₹{Number(data.netProfit || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="text-[11px] text-slate-500">
          No data yet — create some invoices and expenses, then run the report.
        </div>
      )}
    </div>
  );
};

export default PnLPage;
