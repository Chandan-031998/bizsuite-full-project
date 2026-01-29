// client/src/pages/ExpensesPage.jsx
import React, { useEffect, useState } from "react";
import axios from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

const paymentModes = ["Cash", "Bank", "UPI", "Card", "Other"];

const formatAmount = (value) => {
  if (value == null) return "₹0";
  const num = Number(value) || 0;
  return num.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
};

const ExpensesPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const canCreate = role === "admin" || role === "accounts";
  const canEdit = role === "admin";
  const canDelete = role === "admin";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    category: "",
    project: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    payment_mode: "",
    is_reimbursable: false,
    description: "",
  });

  // edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    category: "",
    project: "",
    amount: "",
    expense_date: "",
    payment_mode: "",
    is_reimbursable: false,
    reimbursement_status: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  /* ---------- load expenses ---------- */

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/expenses");
      setRows(res.data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* ---------- create ---------- */

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.category || !form.amount || !form.expense_date || !form.payment_mode)
      return;

    setCreating(true);
    try {
      await axios.post("/expenses", {
        category: form.category,
        project: form.project,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        payment_mode: form.payment_mode,
        is_reimbursable: form.is_reimbursable,
        description: form.description,
      });

      setForm((f) => ({
        ...f,
        category: "",
        project: "",
        amount: "",
        payment_mode: "",
        is_reimbursable: false,
        description: "",
      }));
      await load();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to add expense");
    } finally {
      setCreating(false);
    }
  };

  /* ---------- edit ---------- */

  const startEdit = (exp) => {
    if (!canEdit) return;
    setEditingId(exp.id);
    setEditForm({
      category: exp.category || "",
      project: exp.project || "",
      amount: String(exp.amount ?? ""),
      expense_date: exp.expense_date || "",
      payment_mode: exp.payment_mode || "",
      is_reimbursable: !!exp.is_reimbursable,
      reimbursement_status: exp.reimbursement_status || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      category: "",
      project: "",
      amount: "",
      expense_date: "",
      payment_mode: "",
      is_reimbursable: false,
      reimbursement_status: "",
    });
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((f) => ({
      ...f,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const saveEdit = async (id) => {
    setSavingEdit(true);
    try {
      await axios.put(`/expenses/${id}`, {
        ...editForm,
        amount: editForm.amount === "" ? null : Number(editForm.amount),
      });
      await load();
      cancelEdit();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update expense");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------- delete ---------- */

  const handleDelete = async (id) => {
    if (!canDelete) return;
    if (!window.confirm("Delete this expense?")) return;
    try {
      await axios.delete(`/expenses/${id}`);
      await load();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to delete expense");
    }
  };

  /* ---------- render ---------- */

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Expense Management
          </h2>
          <p className="text-[11px] text-slate-600">
            Track expense categories, payment modes and reimbursable spends.
          </p>
        </div>
      </div>

      {/* create form */}
      {canCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white/95 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3 text-[11px] shadow-sm"
        >
          <div>
            <label className="block text-slate-600 mb-1">Category</label>
            <input
              name="category"
              value={form.category}
              onChange={handleFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            />
          </div>
          <div>
            <label className="block text-slate-600 mb-1">Project</label>
            <input
              name="project"
              value={form.project}
              onChange={handleFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <div>
            <label className="block text-slate-600 mb-1">Amount</label>
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={handleFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            />
          </div>
          <div>
            <label className="block text-slate-600 mb-1">Date</label>
            <input
              type="date"
              name="expense_date"
              value={form.expense_date}
              onChange={handleFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            />
          </div>
          <div>
            <label className="block text-slate-600 mb-1">Mode</label>
            <select
              name="payment_mode"
              value={form.payment_mode}
              onChange={handleFormChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              required
            >
              <option value="">Select</option>
              {paymentModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 mt-2 text-[10px] text-slate-600">
              <input
                type="checkbox"
                name="is_reimbursable"
                checked={form.is_reimbursable}
                onChange={handleFormChange}
                className="rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-500/40"
              />
              Reimbursable
            </label>
          </div>
          <div className="md:col-span-1 flex items-end justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-medium disabled:opacity-60 w-full md:w-auto shadow-sm"
            >
              {creating ? "Saving…" : "Add Expense"}
            </button>
          </div>
        </form>
      )}

      {/* table */}
      <div className="overflow-x-auto bg-white/95 border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Reimbursable</th>
              {canEdit && (
                <th className="px-3 py-2 text-left">Reimb. Status</th>
              )}
              {(canEdit || canDelete) && (
                <th className="px-3 py-2 text-left">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const isEditing = editingId === e.id;
              return (
                <tr
                  key={e.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                >
                  {/* Date */}
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <input
                        type="date"
                        name="expense_date"
                        value={editForm.expense_date}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      e.expense_date
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {isEditing ? (
                      <input
                        name="category"
                        value={editForm.category}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      e.category
                    )}
                  </td>

                  {/* Project */}
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <input
                        name="project"
                        value={editForm.project}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      e.project || "—"
                    )}
                  </td>

                  {/* Amount */}
                  <td className="px-3 py-2 text-slate-800">
                    {isEditing ? (
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.amount}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      />
                    ) : (
                      formatAmount(e.amount)
                    )}
                  </td>

                  {/* Mode */}
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <select
                        name="payment_mode"
                        value={editForm.payment_mode}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                      >
                        <option value="">Select</option>
                        {paymentModes.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      e.payment_mode
                    )}
                  </td>

                  {/* Reimbursable */}
                  <td className="px-3 py-2 text-slate-700">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          name="is_reimbursable"
                          checked={editForm.is_reimbursable}
                          onChange={handleEditChange}
                          className="rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-500/40"
                        />
                        <span>Reimbursable</span>
                      </label>
                    ) : e.is_reimbursable ? (
                      "Yes"
                    ) : (
                      "No"
                    )}
                  </td>

                  {/* Reimb status (admin only) */}
                  {canEdit && (
                    <td className="px-3 py-2 text-slate-700">
                      {isEditing ? (
                        <select
                          name="reimbursement_status"
                          value={editForm.reimbursement_status}
                          onChange={handleEditChange}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                        >
                          <option value="">(auto)</option>
                          <option value="none">None</option>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="paid">Paid</option>
                        </select>
                      ) : (
                        e.reimbursement_status || "—"
                      )}
                    </td>
                  )}

                  {/* Actions */}
                  {(canEdit || canDelete) && (
                    <td className="px-3 py-2 space-x-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEdit(e.id)}
                            disabled={savingEdit}
                            className="px-2 py-0.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px]"
                          >
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-2 py-0.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px]"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => startEdit(e)}
                              className="px-2 py-0.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 text-[11px]"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(e.id)}
                              className="px-2 py-0.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px]"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 8 : 7}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No expenses recorded yet.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td
                  colSpan={canEdit ? 8 : 7}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpensesPage;
