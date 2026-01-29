import React, { useEffect, useState } from "react";
import axios from "../../api/axios.js";

const ChartOfAccountsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        // Backend route: GET /api/accounts/chart
        const res = await axios.get("/accounts/chart");
        setRows(res.data || []);
      } catch (err) {
        console.error("GET /accounts/chart failed:", err);
        if (!err.response) {
          setError("Unable to reach the server. Please check that the API is running.");
        } else if (err.response.status === 404) {
          setError("Chart of accounts endpoint not found on the server (404).");
        } else if (err.response.status === 403) {
          setError("You do not have permission to view the chart of accounts (403).");
        } else {
          setError(
            `Failed to load chart of accounts (status ${err.response.status}).`
          );
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Chart of Accounts
          </h2>
          <p className="text-[11px] text-slate-500">
            View the list of{" "}
            <span className="font-medium text-slate-700">
              asset, liability, income and expense
            </span>{" "}
            heads used in your invoices and reports.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-white/80 border border-sky-100 rounded-2xl px-3 py-1.5 text-[11px] shadow-sm">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-sky-600 text-[10px] font-semibold">
            i
          </span>
          <span className="text-slate-600">
            Accounts are read-only here. Add or map them from your DB / setup
            script.
          </span>
        </div>
      </div>

      {/* Error / info */}
      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] px-3 py-2 rounded-xl">
          {error}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white/80 border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500 font-medium">
                Code
              </th>
              <th className="px-3 py-2 text-left text-slate-500 font-medium">
                Name
              </th>
              <th className="px-3 py-2 text-left text-slate-500 font-medium">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-slate-400"
                >
                  Loading accounts…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && !error && (
              <tr>
                <td
                  colSpan={3}
                  className="px-3 py-6 text-center text-slate-400"
                >
                  No accounts defined yet. You can insert rows into the
                  <span className="font-mono mx-1 text-slate-600">
                    chart_of_accounts
                  </span>{" "}
                  table (e.g. Cash, Bank, Sales, Expenses) and they will appear
                  here.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-sky-50/60"
                >
                  <td className="px-3 py-2 text-slate-700 font-mono text-[11px]">
                    {r.code || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-800">{r.name}</td>
                  <td className="px-3 py-2 text-slate-500 capitalize">
                    {r.type}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChartOfAccountsPage;
