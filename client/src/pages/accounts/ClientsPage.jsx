// client/src/pages/accounts/ClientsPage.jsx
import React, { useEffect, useState } from "react";
import axios from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const emptyForm = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  gst_number: "",
  billing_address: "",
  payment_terms: "",
};

const ClientsPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const isAdmin = role === "admin";

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadClients = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/accounts/clients");
      setClients(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load clients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleEdit = (client) => {
    setEditingId(client.id);
    setForm({
      name: client.name || "",
      contact_person: client.contact_person || "",
      email: client.email || "",
      phone: client.phone || "",
      gst_number: client.gst_number || "",
      billing_address: client.billing_address || "",
      payment_terms: client.payment_terms || "",
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      alert("Client / Company name is required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      gst_number: form.gst_number.trim() || null,
      billing_address: form.billing_address.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
    };

    setSaving(true);
    try {
      if (editingId) {
        await axios.put(`/accounts/clients/${editingId}`, payload);
      } else {
        await axios.post("/accounts/clients", payload);
      }
      await loadClients();
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to save client (status ${err.response?.status ?? "unknown"})`;
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this client? This cannot be undone.")) return;
    try {
      await axios.delete(`/accounts/clients/${id}`);
      await loadClients();
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.message ||
        `Failed to delete client (status ${err.response?.status ?? "unknown"})`;
      alert(msg);
    }
  };

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Clients
          </h2>
          <p className="text-[11px] text-slate-500">
            Manage your clients and contact information used in invoices & quotations.
          </p>
        </div>
      </div>

      {/* Add / Edit client card */}
      {isAdmin && (
        <form
          onSubmit={handleSubmit}
          className="bg-white/90 border border-slate-200 rounded-3xl p-5 space-y-4 text-[11px] shadow-sm"
        >
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              {editingId ? "Edit client" : "Add client"}
            </h3>
            <p className="text-[11px] text-slate-500">
              Store contact details, GST information and default payment terms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">
                Client / Company name
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="Client or company name"
                required
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Contact person
              </label>
              <input
                name="contact_person"
                value={form.contact_person}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="Primary contact person"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="client@example.com"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Phone</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="+91-XXXXXXXXXX"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">GSTIN</label>
              <input
                name="gst_number"
                value={form.gst_number}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="29ABCDE1234F1Z5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 mb-1">
                Billing address
              </label>
              <textarea
                name="billing_address"
                rows={3}
                value={form.billing_address}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="Street, city, state, PIN"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">
                Default payment terms
              </label>
              <textarea
                name="payment_terms"
                rows={3}
                value={form.payment_terms}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-[11px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                placeholder="Eg: Payment within 7 days"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {editingId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 text-[11px] hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium disabled:opacity-60 shadow-sm"
            >
              {saving
                ? "Saving…"
                : editingId
                ? "Update client"
                : "Save client"}
            </button>
          </div>
        </form>
      )}

      {/* Clients table */}
      <div className="bg-white/90 border border-slate-200 rounded-3xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Contact</th>
              <th className="px-3 py-2 text-left">GSTIN</th>
              <th className="px-3 py-2 text-left">Billing address</th>
              <th className="px-3 py-2 text-left">Payment terms</th>
              <th className="px-3 py-2 text-left">Created</th>
              {isAdmin && <th className="px-3 py-2 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-100 last:border-0 hover:bg-sky-50/60"
              >
                <td className="px-3 py-2 text-slate-900">
                  <div>{c.name}</div>
                  {c.contact_person && (
                    <div className="text-slate-500 text-[10px]">
                      {c.contact_person}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && (
                    <div className="text-slate-500 text-[10px]">
                      {c.phone}
                    </div>
                  )}
                  {!c.email && !c.phone && (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {c.gst_number || "—"}
                </td>
                <td className="px-3 py-2 text-slate-700 max-w-xs">
                  <div className="truncate">
                    {c.billing_address || (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-700 max-w-xs">
                  <div className="truncate">
                    {c.payment_terms || (
                      <span className="text-slate-400">—</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {c.created_at ? c.created_at.split(" ")[0] : "—"}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2 space-x-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(c)}
                      className="px-2 py-0.5 rounded-lg border border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="px-2 py-0.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}

            {!loading && clients.length === 0 && (
              <tr>
                <td
                  colSpan={isAdmin ? 7 : 6}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No clients created yet.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td
                  colSpan={isAdmin ? 7 : 6}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Loading clients…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClientsPage;
