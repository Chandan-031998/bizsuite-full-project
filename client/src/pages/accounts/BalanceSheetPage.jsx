import React, { useEffect, useState } from "react";
import axios from "../../api/axios.js";

const BalanceSheetPage = () => {
  const [asOf, setAsOf] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get("/accounts/reports/balance-sheet", {
        params: { asOf },
      });
      setData(res.data);
    } catch (err) {
      console.error("GET /accounts/reports/balance-sheet failed:", err);
      if (!err.response) {
        setError("Unable to reach the server. Please check that the API is running.");
      } else if (err.response.status === 404) {
        setError("Balance Sheet endpoint not found on the server (404).");
      } else if (err.response.status === 403) {
        setError("You do not have permission to view the Balance Sheet (403).");
      } else {
        setError("Failed to load Balance Sheet");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40 min-h-full">
      {/* Header + filters */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Balance Sheet
          </h2>
          <p className="text-[11px] text-slate-500">
            Simple snapshot of assets and equity as of a selected date.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] bg-white/80 border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
          <span className="text-slate-500">As on</span>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          />
          <button
            onClick={load}
            className="px-3 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-xs"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-500 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-[11px] text-slate-500">Loading balance sheet…</div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          {/* Assets */}
          <div className="bg-white/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Assets
            </h3>
            <ul className="space-y-1">
              {data.assets.items.map((a) => (
                <li key={a.label} className="flex justify-between">
                  <span className="text-slate-600">{a.label}</span>
                  <span className="text-slate-900 font-medium">
                    ₹{Number(a.amount || 0).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500">Total Assets</span>
              <span className="text-slate-900 font-semibold">
                ₹{Number(data.assets.total || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Liabilities */}
          <div className="bg-white/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Liabilities
            </h3>
            {data.liabilities.items.length === 0 ? (
              <div className="text-slate-500">
                No liabilities tracked in this simplified model.
              </div>
            ) : (
              <ul className="space-y-1">
                {data.liabilities.items.map((a) => (
                  <li key={a.label} className="flex justify-between">
                    <span className="text-slate-600">{a.label}</span>
                    <span className="text-slate-900 font-medium">
                      ₹{Number(a.amount || 0).toLocaleString("en-IN")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Equity */}
          <div className="bg-white/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-900 mb-2">
              Equity
            </h3>
            <ul className="space-y-1">
              {data.equity.items.map((a) => (
                <li key={a.label} className="flex justify-between">
                  <span className="text-slate-600">{a.label}</span>
                  <span className="text-slate-900 font-medium">
                    ₹{Number(a.amount || 0).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500">Total Equity</span>
              <span className="text-slate-900 font-semibold">
                ₹{Number(data.equity.total || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !data && (
        <div className="text-[11px] text-slate-500">
          No data available yet for the selected date.
        </div>
      )}
    </div>
  );
};

export default BalanceSheetPage;
