import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

// ✅ IMPORTANT:
// Your backend has /api/quotations (NOT /api/accounts/quotations)
// Because api baseURL already includes "/api", we use "/quotations" here.
const QUOTES_URL = "/quotations";
const CLIENTS_URL = "/accounts/clients";

const formatCurrency = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusBadgeClass = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "accepted" || s === "won")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "rejected" || s === "lost")
    return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "sent") return "bg-sky-50 text-sky-700 border-sky-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const makeNextQuoteNumber = (rows) => {
  const year = new Date().getFullYear();
  const maxSeq = (rows || []).reduce((max, r) => {
    const qn = String(r?.quote_number || "");
    const m = qn.match(/(\d+)\s*$/);
    const seq = m ? parseInt(m[1], 10) : Number(r?.id || 0);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `Q-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
};

const emptyForm = {
  id: null,
  client_id: "",
  quote_number: "",
  quote_date: todayISO(),
  total_amount: "",
  status: "draft",
  notes: "",
};

const QuotationsPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  // ✅ Admin + Accounts can manage. Sales = view-only
  const canManage = role === "admin" || role === "accounts";

  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const titleBadge = useMemo(() => {
    if (canManage) return "Admin/Accounts can create & edit";
    return "Preview only · read-only";
  }, [canManage]);

  const resetForm = (nextRows = rows) => {
    setForm({
      ...emptyForm,
      quote_number: makeNextQuoteNumber(nextRows),
      quote_date: todayISO(),
    });
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      // ✅ quotations
      const quotesRes = await api.get(QUOTES_URL);
      const quoteData = quotesRes.data || [];
      setRows(quoteData);

      // ✅ clients only needed for create/edit form
      if (canManage) {
        const clientsRes = await api.get(CLIENTS_URL);
        setClients(clientsRes.data || []);
      } else {
        setClients([]);
      }

      setForm((prev) => {
        if (prev.quote_number) return prev;
        return { ...prev, quote_number: makeNextQuoteNumber(quoteData) };
      });
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.message ||
        (status === 404
          ? "API endpoint not found for quotations"
          : status === 403
          ? "Forbidden: insufficient role"
          : "Failed to load quotations");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditClick = (quote) => {
    if (!canManage) return;
    setForm({
      id: quote.id,
      client_id: quote.client_id || "",
      quote_number: quote.quote_number || "",
      quote_date: quote.quote_date || todayISO(),
      total_amount: quote.total_amount ?? "",
      status: (quote.status || "draft").toLowerCase(),
      notes: quote.notes || "",
    });
  };

  const handleDelete = async (quote) => {
    if (!canManage) return;
    if (!window.confirm(`Delete quotation ${quote.quote_number}?`)) return;

    try {
      await api.delete(`${QUOTES_URL}/${quote.id}`);
      await load();
      if (form.id === quote.id) resetForm();
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to delete quotation");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManage) return;

    if (!form.client_id) return setError("Please select a client");
    if (!form.quote_number) return setError("Please enter a quote number");

    const payload = {
      client_id: Number(form.client_id),
      quote_number: form.quote_number,
      quote_date: form.quote_date || todayISO(),
      total_amount: Number(form.total_amount || 0),
      status: form.status || "draft",
      notes: form.notes || null,
    };

    setSaving(true);
    setError("");
    try {
      if (form.id) {
        await api.put(`${QUOTES_URL}/${form.id}`, payload);
      } else {
        await api.post(QUOTES_URL, payload);
      }
      await load();
      resetForm();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        (form.id ? "Failed to update quotation" : "Failed to create quotation");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900 flex items-center gap-2">
            Quotations &amp; Proposals
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-[10px] text-sky-700 border border-sky-100">
              {titleBadge}
            </span>
          </h2>
          <p className="text-[11px] text-slate-500">
            Prepare quotes and track which ones are accepted and can be converted into invoices.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-[11px] text-slate-700 hover:bg-white"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] px-3 py-2 rounded-xl">
          {error}
        </div>
      )}

      {/* Manage form */}
      {canManage && (
        <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {form.id ? "Edit quotation" : "Create quotation"}
              </h3>
              <p className="text-[11px] text-slate-500">Basic quote details.</p>
            </div>
            {form.id && (
              <div className="text-[11px] text-slate-500">
                Editing <span className="font-semibold">{form.quote_number}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
            <div className="md:col-span-2">
              <label className="block mb-1 text-slate-600">Client</label>
              <select
                name="client_id"
                value={form.client_id}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1 text-slate-600">Quote #</label>
              <input
                name="quote_number"
                value={form.quote_number}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Q-2026-001"
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-600">Date</label>
              <input
                type="date"
                name="quote_date"
                value={form.quote_date}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-600">Amount (tax-inclusive)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                name="total_amount"
                value={form.total_amount}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-600">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted / Won</option>
                <option value="rejected">Rejected / Lost</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block mb-1 text-slate-600">Notes</label>
              <textarea
                rows={2}
                name="notes"
                value={form.notes}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Optional notes"
              />
            </div>

            <div className="md:col-span-4 flex justify-end gap-2 pt-2">
              {form.id && (
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-[11px]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold disabled:opacity-60 text-[11px]"
              >
                {saving ? (form.id ? "Updating…" : "Saving…") : form.id ? "Update quotation" : "Save quotation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto bg-white/80 border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/70">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Quote #</th>
              <th className="px-3 py-2 text-left font-medium">Client</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              {canManage && <th className="px-3 py-2 text-right font-medium">Actions</th>}
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-3 py-6 text-center text-slate-500">
                  Loading quotations…
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40">
                  <td className="px-3 py-2 text-slate-900 font-medium">{r.quote_number}</td>
                  <td className="px-3 py-2 text-slate-700">{r.client_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.quote_date || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(r.total_amount)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${statusBadgeClass(r.status)}`}>
                      {(r.status || "draft").toLowerCase()}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleEditClick(r)}
                        className="px-2 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-3 py-6 text-center text-slate-500">
                  No quotations created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QuotationsPage;
