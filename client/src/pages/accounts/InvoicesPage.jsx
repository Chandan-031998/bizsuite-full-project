import React, { useEffect, useMemo, useState } from "react";
import api, { warmUpServer } from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const emptyLineItem = { service: "", description: "", qty: 1, rate: 0, tax: 0 };
const defaultNotes = "Payment instructions, bank details, GST note, etc.";

const formatCurrency = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(isNaN(n) ? 0 : n);
};

// IMPORTANT: <input type="date"> must be YYYY-MM-DD
const toDateInput = (v) => {
  if (!v) return "";
  if (typeof v === "string") {
    if (v.includes("T")) return v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const formatDateDisplay = (v) => {
  const s = toDateInput(v);
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

const normStatus = (s) => {
  const v = String(s || "due").toLowerCase().trim();
  // allow backend variants
  if (v === "completed") return "paid";
  if (v === "complete") return "paid";
  if (v === "unpaid") return "due";
  return v;
};

const statusLabel = (status) => {
  const s = normStatus(status);
  if (s === "paid") return "PAID";
  if (s === "partial") return "PARTIAL";
  return "DUE";
};

const statusClass = (status) => {
  const s = normStatus(status);
  if (s === "paid")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "partial")
    return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-rose-50 text-rose-700 border border-rose-200";
};

/* =========================
   ✅ PDF DOWNLOAD HELPERS
========================= */
const getFilenameFromDisposition = (cd) => {
  if (!cd) return null;
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
  return decodeURIComponent(m?.[1] || m?.[2] || "").trim() || null;
};

async function downloadInvoicePdf(invoiceId, invoiceNumber) {
  // Helps Render cold start (safe even if it fails)
  await warmUpServer();

  const res = await api.get(`/accounts/invoices/${invoiceId}/pdf`, {
    responseType: "blob",
    timeout: 120000,
    headers: { Accept: "application/pdf" },
  });

  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);

  const cd = res.headers?.["content-disposition"];
  const filename =
    getFilenameFromDisposition(cd) ||
    `Invoice-${invoiceNumber || invoiceId}.pdf`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // revoke after short delay to avoid Safari edge issues
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

const InvoicesPage = () => {
  const { user } = useAuth();
  const role = user?.role;
  const canCreate = role === "admin" || role === "accounts";
  const canEdit = role === "admin";

  const todayStr = toDateInput(new Date());

  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({ clients: 0, invoices: 0 });
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState("");

  const [form, setForm] = useState({
    clientId: "",
    invoiceNumber: "",
    issueDate: todayStr,
    dueDate: "",
    notes: defaultNotes,
    gstApplicable: true,
  });

  const [items, setItems] = useState([emptyLineItem]);

  const [editingId, setEditingId] = useState(null);
  const [editingMeta, setEditingMeta] = useState(null);
  const [editStatus, setEditStatus] = useState("due");
  const [paymentNow, setPaymentNow] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;

    items.forEach((it) => {
      const qty = Number(it.qty) || 0;
      const rate = Number(it.rate) || 0;
      const base = qty * rate;
      const taxPct = Number(it.tax) || 0;
      subtotal += base;
      taxTotal += base * (taxPct / 100);
    });

    return { subtotal, taxTotal, total: subtotal + taxTotal };
  }, [items]);

  const effectiveTotal = useMemo(() => {
    const t = Number(totals.total || 0);
    if (t > 0) return t;
    const metaTotal = Number(editingMeta?.total || 0);
    return metaTotal > 0 ? metaTotal : 0;
  }, [totals.total, editingMeta]);

  const outstanding = useMemo(() => {
    if (!editingId || !editingMeta) return 0;
    const paid = Number(editingMeta.paid || 0);
    return Math.max(Number(effectiveTotal || 0) - paid, 0);
  }, [editingId, editingMeta, effectiveTotal]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [clientsRes, invoicesRes, nextRes] = await Promise.all([
        api.get("/accounts/clients"),
        api.get("/accounts/invoices"),
        api.get("/accounts/invoices/next-number"),
      ]);

      const clientsData = clientsRes.data || [];
      const invoicesData = invoicesRes.data || [];
      const next = nextRes.data?.next || "";

      setClients(clientsData);
      setInvoices(invoicesData);
      setStats({ clients: clientsData.length, invoices: invoicesData.length });
      setNextInvoiceNumber(next);

      setForm((prev) => ({
        ...prev,
        invoiceNumber: editingId ? prev.invoiceNumber : next,
      }));
    } catch (err) {
      console.error(err);
      alert("Failed to load clients / invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEditingMeta(null);
    setEditStatus("due");
    setPaymentNow("");
    setItems([emptyLineItem]);
    setForm((prev) => ({
      ...prev,
      clientId: "",
      invoiceNumber: nextInvoiceNumber || prev.invoiceNumber,
      issueDate: todayStr,
      dueDate: "",
      notes: defaultNotes,
      gstApplicable: true,
    }));
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleAddLineItem = () =>
    setItems((prev) => [...prev, { ...emptyLineItem }]);

  const handleRemoveLineItem = (index) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const buildItemsPayload = () => {
    return (items || [])
      .map((it) => ({
        service: it.service || "",
        description: it.description || "",
        quantity: Number(it.qty) || 0,
        unit_price: Number(it.rate) || 0,
        tax_percent: Number(it.tax) || 0,
      }))
      .filter((x) => {
        const hasText = (x.service || x.description || "").trim().length > 0;
        const hasMoney = (x.quantity || 0) > 0 || (x.unit_price || 0) > 0;
        return hasText || hasMoney;
      });
  };

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!canCreate) return;

    if (!form.clientId) return alert("Please select a client");
    if (!form.issueDate) return alert("Please select an issue date");

    const descriptionSummary = items
      .map((it) => it.description || it.service)
      .filter(Boolean)
      .join(", ");

    const statusToSend = editingId ? normStatus(editStatus) : "due";

    const payload = {
      client_id: Number(form.clientId),
      invoice_number: form.invoiceNumber,
      issue_date: form.issueDate,
      due_date: form.dueDate ? form.dueDate : null,
      gst_applicable: !!form.gstApplicable,
      notes: form.notes ? form.notes : null,

      // send BOTH to avoid backend mismatch (some use total, some use amount)
      amount: Number(effectiveTotal || 0),
      total: Number(effectiveTotal || 0),

      // description aliases (some backends use service_description)
      description: descriptionSummary || "Services",
      service_description: descriptionSummary || "Services",

      // IMPORTANT: send status on update
      status: statusToSend,

      // IMPORTANT: send items (helps update route that expects items)
      items: buildItemsPayload(),
    };

    let paymentAmount = 0;
    if (editingId && editingMeta) {
      const entered = Number(paymentNow);
      if (!isNaN(entered) && entered > 0) paymentAmount = entered;

      // If user marks as Paid but doesn't enter amount, auto-pay remaining
      if (paymentAmount <= 0 && statusToSend === "paid" && outstanding > 0) {
        paymentAmount = outstanding;
      }
    }

    setSaving(true);
    try {
      if (editingId) {
        // 1) update invoice fields + status + total
        await api.put(`/accounts/invoices/${editingId}`, payload);

        // 2) record payment (optional)
        if (paymentAmount > 0) {
          await api.post(`/accounts/invoices/${editingId}/payments`, {
            payment_date: todayStr,
            amount: paymentAmount,
            mode: "manual",
          });
        }
      } else {
        // create invoice
        await api.post("/accounts/invoices", payload);
      }

      await loadInitial();
      resetForm();
    } catch (err) {
      console.error(err);
      alert(
        err.response?.data?.message ||
          `Failed to ${editingId ? "update" : "create"} invoice`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = async (invoice) => {
    if (!canEdit) return;

    setEditingId(invoice.id);
    setEditingMeta({
      total: Number(invoice.total || 0),
      paid: Number(invoice.paid || 0),
      status: invoice.status || "due",
    });

    const s = normStatus(invoice.status || "due");
    setEditStatus(s);
    setPaymentNow("");

    setForm((prev) => ({
      ...prev,
      clientId: String(invoice.client_id || ""),
      invoiceNumber: invoice.invoice_number,
      issueDate: toDateInput(invoice.issue_date) || todayStr,
      dueDate: toDateInput(invoice.due_date) || "",
      notes: invoice.notes || defaultNotes,
      gstApplicable: Boolean(invoice.gst_applicable),
    }));

    try {
      const res = await api.get(`/accounts/invoices/${invoice.id}`);
      const apiItems = res.data?.items || [];

      if (apiItems.length) {
        setItems(
          apiItems.map((it) => ({
            service: it.service || "",
            description: it.description || "",
            qty: it.quantity || 1,
            rate: it.unit_price || 0,
            tax: it.tax_percent || 0,
          }))
        );
      } else {
        setItems([
          {
            ...emptyLineItem,
            description: invoice.service_description || "",
            qty: 1,
            rate: invoice.total || 0,
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load invoice items", err);
      setItems([
        {
          ...emptyLineItem,
          description: invoice.service_description || "",
          qty: 1,
          rate: invoice.total || 0,
        },
      ]);
    }
  };

  const handleCancelEdit = () => resetForm();

  const handleDeleteInvoice = async (id) => {
    if (!canEdit) return;
    if (!window.confirm("Delete this invoice?")) return;

    try {
      await api.delete(`/accounts/invoices/${id}`);
      await loadInitial();
      if (editingId === id) resetForm();
    } catch (err) {
      console.error(err);
      alert("Failed to delete invoice");
    }
  };

  const handleDownloadPdf = async (id, invoiceNumber) => {
    try {
      await downloadInvoicePdf(id, invoiceNumber);
    } catch (err) {
      console.error(err);

      const isNetwork =
        String(err?.message || "").toLowerCase().includes("network") ||
        !err?.response;

      alert(
        isNetwork
          ? "PDF download blocked (CORS or server sleeping). Fix backend CORS_ORIGINS + redeploy, then retry."
          : err?.response?.data?.message || "Failed to download invoice PDF"
      );
    }
  };

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
              VS
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Vertex Software
              </div>
              <div className="text-[11px] text-slate-500">
                Accounts · CRM · Expense Management
              </div>
              <div className="mt-2 text-[10px] text-slate-500 space-y-0.5">
                <div>Mysuru, Karnataka, India</div>
                <div>info@vertexsoftware.com · +91-9380729687</div>
                <div>GSTIN: 29CNGPC2359M1ZN</div>
              </div>
            </div>
          </div>

          <div className="text-right text-[11px] text-slate-500">
            <div className="text-xs font-semibold text-slate-800 mb-1">
              Next invoice
            </div>
            <div className="text-sky-700 text-sm font-semibold">
              {nextInvoiceNumber || "—"}
            </div>
            <div className="mt-2 space-y-1">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{stats.clients} clients available</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>{stats.invoices} invoices created</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId ? "Edit invoice" : "Create invoice"}
              </h2>
              <p className="text-[11px] text-slate-500">
                Totals are calculated automatically.
              </p>
            </div>
            {editingId && (
              <div className="text-[11px] text-slate-500">
                Editing{" "}
                <span className="text-sky-700 font-semibold">
                  {form.invoiceNumber}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveInvoice} className="space-y-3 text-[11px]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block mb-1 text-slate-600">Client</label>
                <select
                  name="clientId"
                  value={form.clientId}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  disabled={!canCreate}
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
                <label className="block mb-1 text-slate-600">Invoice number</label>
                <input
                  name="invoiceNumber"
                  value={form.invoiceNumber}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 text-[11px] outline-none"
                  disabled
                />
                <p className="mt-1 text-[10px] text-slate-400">Auto generated.</p>
              </div>

              <div>
                <label className="block mb-1 text-slate-600">Issue date</label>
                <input
                  type="date"
                  name="issueDate"
                  value={form.issueDate}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-600">Due date</label>
                <input
                  type="date"
                  name="dueDate"
                  value={form.dueDate}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-600">Line items</span>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="inline-flex items-center px-2 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[11px] text-sky-700 border border-sky-100"
                >
                  + Add line item
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full text-[11px]">
                  <thead className="text-slate-500 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left w-[18%]">Service</th>
                      <th className="px-3 py-2 text-left w-[32%]">Description</th>
                      <th className="px-3 py-2 text-right w-[8%]">Qty</th>
                      <th className="px-3 py-2 text-right w-[12%]">Rate</th>
                      <th className="px-3 py-2 text-right w-[8%]">Tax %</th>
                      <th className="px-3 py-2 text-right w-[12%]">Total</th>
                      <th className="px-3 py-2 text-right w-[10%]" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const qty = Number(item.qty) || 0;
                      const rate = Number(item.rate) || 0;
                      const taxPct = Number(item.tax) || 0;
                      const base = qty * rate;
                      const lineTotal = base + base * (taxPct / 100);

                      return (
                        <tr key={index} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <input
                              value={item.service}
                              onChange={(e) =>
                                handleItemChange(index, "service", e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                              placeholder="Service name"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={item.description}
                              onChange={(e) =>
                                handleItemChange(index, "description", e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                              placeholder="Eg: Website development"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.qty}
                              onChange={(e) =>
                                handleItemChange(index, "qty", e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-right text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.rate}
                              onChange={(e) =>
                                handleItemChange(index, "rate", e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-right text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              value={item.tax}
                              onChange={(e) =>
                                handleItemChange(index, "tax", e.target.value)
                              }
                              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-right text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-slate-900">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveLineItem(index)}
                                className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start mt-2">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block mb-1 text-slate-600">Notes</label>
                  <textarea
                    rows={3}
                    name="notes"
                    value={form.notes}
                    onChange={handleFormChange}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                  />
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                    <input
                      id="gstApplicable"
                      type="checkbox"
                      name="gstApplicable"
                      checked={form.gstApplicable}
                      onChange={handleFormChange}
                      className="h-3 w-3"
                    />
                    <label htmlFor="gstApplicable">GST applicable</label>
                  </div>
                </div>

                {editingId && editingMeta && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="block mb-1 text-slate-600">Status</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        >
                          <option value="due">Due</option>
                          <option value="paid">Completed</option>
                        </select>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-500">Outstanding</div>
                        <div className="text-slate-900 font-semibold">
                          {formatCurrency(outstanding)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Paid so far: {formatCurrency(editingMeta.paid || 0)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block mb-1 text-slate-600">
                        Additional payment (optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentNow}
                        onChange={(e) => setPaymentNow(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-300 text-right text-[11px] outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
                        placeholder={
                          outstanding > 0 ? `Eg: ${outstanding.toFixed(2)}` : "0.00"
                        }
                      />
                      <div className="mt-1 text-[10px] text-slate-500">
                        Tip: If you select Completed without entering amount, remaining
                        will be auto-paid.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax total</span>
                  <span>{formatCurrency(totals.taxTotal)}</span>
                </div>
                <div className="border-t border-slate-200 my-1" />
                <div className="flex justify-between text-slate-900 font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(effectiveTotal)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {editingId && (
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
                  ? editingId
                    ? "Updating…"
                    : "Saving…"
                  : editingId
                  ? "Update invoice"
                  : "Save invoice"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Invoice #</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-left">Issue</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Loading invoices…
                </td>
              </tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No invoices created yet.
                </td>
              </tr>
            )}
            {!loading &&
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="px-3 py-2 text-slate-900 font-medium">
                    {inv.invoice_number}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {inv.client_name || "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {formatDateDisplay(inv.issue_date)}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {formatDateDisplay(inv.due_date)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {formatCurrency(inv.total)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-900">
                    {formatCurrency(inv.paid)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center justify-center ${statusClass(
                        inv.status
                      )}`}
                    >
                      {statusLabel(inv.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(inv.id, inv.invoice_number)}
                      className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100"
                    >
                      PDF
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEditClick(inv)}
                          className="px-2 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(inv.id)}
                          className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InvoicesPage;
