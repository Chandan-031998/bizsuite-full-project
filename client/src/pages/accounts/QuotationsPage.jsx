// client/src/pages/accounts/QuotationsPage.jsx
import React, { useEffect, useState } from "react";
import axios from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const formatCurrency = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const statusBadgeClass = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "accepted" || s === "won") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (s === "rejected" || s === "lost") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (s === "sent") {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  return "bg-slate-50 text-slate-700 border-slate-200";
};

const todayISO = () => new Date().toISOString().slice(0, 10);

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
  const isAdmin = role === "admin";

  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load clients (for dropdown) + quotations
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [clientsRes, quotesRes] = await Promise.all([
        axios.get("/accounts/clients"),
        axios.get("/quotations"), // change to "/accounts/quotations" if your backend is mounted that way
      ]);
      setClients(clientsRes.data || []);
      setRows(quotesRes.data || []);
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        "Failed to load quotations or clients";
      setError(msg);
      alert("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      quote_number: `Q-${new Date().getFullYear()}-${String(
        (rows[0]?.id || 0) + 1
      ).padStart(3, "0")}`,
    });
  };

  useEffect(() => {
    // Auto-generate a basic quote number when page first loads
    if (!form.quote_number && rows.length >= 0) {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditClick = (quote) => {
    if (!isAdmin) return;

    setForm({
      id: quote.id,
      client_id: quote.client_id || "",
      quote_number: quote.quote_number || "",
      quote_date: quote.quote_date || todayISO(),
      total_amount: quote.total_amount || "",
      status: (quote.status || "draft").toLowerCase(),
      notes: quote.notes || "",
    });
  };

  const handleDelete = async (quote) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete quotation ${quote.quote_number}?`)) return;

    try {
      await axios.delete(`/quotations/${quote.id}`); // or `/accounts/quotations/${quote.id}`
      await load();
      if (form.id === quote.id) {
        resetForm();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete quotation");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!form.client_id) {
      alert("Please select a client");
      return;
    }
    if (!form.quote_number) {
      alert("Please enter a quote number");
      return;
    }

    const payload = {
      client_id: Number(form.client_id),
      quote_number: form.quote_number,
      quote_date: form.quote_date || todayISO(),
      total_amount: Number(form.total_amount || 0),
      status: form.status || "draft",
      notes: form.notes || null,
    };

    setSaving(true);
    try {
      if (form.id) {
        // update
        await axios.put(`/quotations/${form.id}`, payload); // or `/accounts/quotations/${form.id}`
      } else {
        // create
        await axios.post("/quotations", payload); // or `/accounts/quotations`
      }
      await load();
      resetForm();
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message ||
        (form.id ? "Failed to update quotation" : "Failed to create quotation");
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900 flex items-center gap-2">
            Quotations &amp; Proposals
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-50 text-[10px] text-sky-700 border border-sky-100">
              {isAdmin ? "Admin can create & edit" : "Preview only · simple list"}
            </span>
          </h2>
          <p className="text-[11px] text-slate-500">
            Prepare quotes and track which ones are accepted and can be converted
            into invoices.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] px-3 py-2 rounded-xl">
          {error}
        </div>
      )}

      {/* Admin-only: create / edit form */}
      {isAdmin && (
        <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {form.id ? "Edit quotation" : "Create quotation"}
              </h3>
              <p className="text-[11px] text-slate-500">
                Basic quote details. You can later convert an accepted quote
                into an invoice from the backend.
              </p>
            </div>
            {form.id && (
              <div className="text-[11px] text-slate-500">
                Editing <span className="font-semibold">{form.quote_number}</span>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]"
          >
            {/* Client */}
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

            {/* Quote number */}
            <div>
              <label className="block mb-1 text-slate-600">Quote #</label>
              <input
                name="quote_number"
                value={form.quote_number}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Q-2025-001"
              />
            </div>

            {/* Date */}
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

            {/* Amount */}
            <div>
              <label className="block mb-1 text-slate-600">
                Amount (tax-inclusive)
              </label>
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

            {/* Status */}
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

            {/* Notes */}
            <div className="md:col-span-3">
              <label className="block mb-1 text-slate-600">Notes</label>
              <textarea
                rows={2}
                name="notes"
                value={form.notes}
                onChange={handleFormChange}
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                placeholder="Optional notes or scope summary"
              />
            </div>

            {/* Actions */}
            <div className="md:col-span-4 flex justify-end gap-2 pt-2">
              {form.id && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
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
                {saving
                  ? form.id
                    ? "Updating…"
                    : "Saving…"
                  : form.id
                  ? "Update quotation"
                  : "Save quotation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table card */}
      <div className="overflow-x-auto bg-white/80 border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/70">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Quote #</th>
              <th className="px-3 py-2 text-left font-medium">Client</th>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              {isAdmin && (
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={isAdmin ? 6 : 5}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Loading quotations…
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-sky-50/40 transition-colors"
                >
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {r.quote_number}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.client_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.quote_date || "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {formatCurrency(r.total_amount)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${statusBadgeClass(
                        r.status
                      )}`}
                    >
                      {(r.status || "draft").toLowerCase()}
                    </span>
                  </td>
                  {isAdmin && (
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
                <td
                  colSpan={isAdmin ? 6 : 5}
                  className="px-3 py-6 text-center text-slate-500"
                >
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
