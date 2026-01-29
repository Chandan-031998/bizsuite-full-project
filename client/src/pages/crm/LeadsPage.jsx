import React, { useEffect, useMemo, useState } from "react";
import axios from "../../api/axios.js";
import { useAuth } from "../../context/AuthContext.jsx";

const stageOrder = ["New", "Contacted", "Follow-up", "Proposal Sent", "Won", "Lost"];

const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-IN");
};

const LeadsPage = () => {
  const { user } = useAuth();
  const role = user?.role;

  const canCreateLead = role === "admin" || role === "sales";
  const canDeleteLead = role === "admin";
  const canEditLead = role === "admin" || role === "sales";

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    place: "",
    source: "",
    stage: "New",
    extra1: "",
    extra2: "",
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ ...form });

  const [filters, setFilters] = useState({
    search: "",
    stage: "All",
    source: "All",
    owner: "All",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, statsRes] = await Promise.all([
        axios.get("/leads"),
        axios.get("/leads/stats/summary"),
      ]);
      setRows(listRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setCreating(true);
    try {
      await axios.post("/leads", form);
      setForm({
        name: "",
        company: "",
        email: "",
        phone: "",
        place: "",
        source: "",
        stage: "New",
        extra1: "",
        extra2: "",
      });
      await load();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to create lead");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (lead) => {
    setEditingId(lead.id);
    setEditForm({
      name: lead.name || "",
      company: lead.company || "",
      email: lead.email || "",
      phone: lead.phone || "",
      place: lead.place || "",
      source: lead.source || "",
      stage: lead.stage || "New",
      extra1: lead.extra1 || "",
      extra2: lead.extra2 || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ ...form });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((f) => ({ ...f, [name]: value }));
  };

  const saveEdit = async (id) => {
    setSavingEdit(true);
    try {
      await axios.put(`/leads/${id}`, editForm);
      await load();
      cancelEdit();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update lead");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await axios.delete(`/leads/${id}`);
      await load();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to delete lead");
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((f) => ({ ...f, [name]: value }));
  };

  const sourceOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source).filter(Boolean))),
    [rows]
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.added_by_name).filter(Boolean))),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const search = filters.search.trim().toLowerCase();
      if (search) {
        const hay = `${r.name || ""} ${r.company || ""} ${r.email || ""} ${r.phone || ""} ${r.place || ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (filters.stage !== "All" && r.stage !== filters.stage) return false;
      if (filters.source !== "All" && r.source !== filters.source) return false;
      if (filters.owner !== "All" && (r.added_by_name || "") !== filters.owner) return false;
      return true;
    });
  }, [rows, filters]);

  const stageStats = useMemo(
    () =>
      stageOrder.map((stage) => ({
        stage,
        count: rows.filter((r) => r.stage === stage).length,
      })),
    [rows]
  );

  if (loading && !rows.length) {
    return <div className="p-6 text-[12px] text-slate-500">Loading leads…</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-[12px] text-rose-600">
        {error}
        <div className="mt-2">
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[11px]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 bg-gradient-to-br from-slate-50 via-sky-50/60 to-indigo-50/40">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-slate-900">
            Leads / Mini CRM
          </h2>
          <p className="text-[11px] text-slate-500">
            Track lead stages, owners and simple pipeline analytics.
          </p>
        </div>
        {stats && (
          <div className="text-[11px] text-slate-500">
            Overall conversion rate:{" "}
            <span className="text-emerald-600 font-semibold">
              {Number(stats.conversionRate || 0).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="bg-white/90 border border-slate-200 rounded-2xl p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-[11px] shadow-sm">
        <div className="flex flex-wrap gap-2">
          {stageStats.map((s) => (
            <div
              key={s.stage}
              className={`px-2 py-1 rounded-full border text-[11px] flex items-center gap-1
                ${
                  s.stage === "Won"
                    ? "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                    : s.stage === "Lost"
                    ? "border-rose-400/60 bg-rose-50 text-rose-700"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
            >
              <span className="font-medium">{s.stage}</span>
              <span className="text-slate-400">· {s.count}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <input
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 w-40 text-[11px] focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            placeholder="Search name, company…"
          />
          <select
            name="stage"
            value={filters.stage}
            onChange={handleFilterChange}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px]"
          >
            <option value="All">All stages</option>
            {stageOrder.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            name="source"
            value={filters.source}
            onChange={handleFilterChange}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px]"
          >
            <option value="All">All sources</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="owner"
            value={filters.owner}
            onChange={handleFilterChange}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px]"
          >
            <option value="All">All owners</option>
            {ownerOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canCreateLead && (
        <form
          onSubmit={handleCreate}
          className="bg-white/90 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 xl:grid-cols-6 gap-3 text-[11px] shadow-sm"
        >
          {["name", "company", "email", "phone", "place", "source"].map((f) => (
            <div key={f}>
              <label className="block text-slate-600 mb-1">
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
              <input
                type={f === "email" ? "email" : "text"}
                name={f}
                value={form[f]}
                onChange={handleChange}
                className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900"
                required={f === "name"}
              />
            </div>
          ))}

          <div>
            <label className="block text-slate-600 mb-1">Stage</label>
            <select
              name="stage"
              value={form.stage}
              onChange={handleChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900"
            >
              {stageOrder.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 mb-1">Field 1</label>
            <input
              name="extra1"
              value={form.extra1}
              onChange={handleChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-slate-600 mb-1">Field 2</label>
            <input
              name="extra2"
              value={form.extra2}
              onChange={handleChange}
              className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-900"
            />
          </div>

          <div className="flex flex-col justify-end">
            <div className="text-[10px] text-slate-500 mb-1">
              Lead added by: <span className="text-sky-600 font-medium">{user?.name}</span>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-60"
            >
              {creating ? "Saving…" : "Add Lead"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto bg-white/95 border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-[11px]">
          <thead className="text-slate-500 border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="px-3 py-2 text-left">Lead</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-left">Place</th>
              <th className="px-3 py-2 text-left">Stage</th>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Lead Added By</th>
              <th className="px-3 py-2 text-left">Field 1</th>
              <th className="px-3 py-2 text-left">Field 2</th>
              <th className="px-3 py-2 text-left">Created</th>
              {(canEditLead || canDeleteLead) && <th className="px-3 py-2 text-left">Actions</th>}
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((r) => {
              const isEditing = editingId === r.id;
              return (
                <tr key={r.id} className="border-b border-slate-200/80 hover:bg-sky-50/60">
                  <td className="px-3 py-2 text-slate-900">
                    {isEditing ? (
                      <>
                        <input
                          name="name"
                          value={editForm.name}
                          onChange={handleEditChange}
                          className="w-full mb-1 px-2 py-1 rounded-lg bg-white border border-slate-200"
                        />
                        <input
                          type="email"
                          name="email"
                          value={editForm.email}
                          onChange={handleEditChange}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200"
                          placeholder="Email"
                        />
                      </>
                    ) : (
                      <>
                        {r.name}
                        {r.email && <span className="ml-1 text-slate-500">&lt;{r.email}&gt;</span>}
                      </>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        name="company"
                        value={editForm.company}
                        onChange={handleEditChange}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200"
                      />
                    ) : (
                      r.company || "-"
                    )}
                  </td>

                  <td className="px-3 py-2">{isEditing ? (
                    <input name="phone" value={editForm.phone} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200" />
                  ) : (r.phone || "-")}</td>

                  <td className="px-3 py-2">{isEditing ? (
                    <input name="place" value={editForm.place} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200" />
                  ) : (r.place || "-")}</td>

                  <td className="px-3 py-2">{isEditing ? (
                    <select name="stage" value={editForm.stage} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200">
                      {stageOrder.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  ) : (r.stage || "-")}</td>

                  <td className="px-3 py-2">{isEditing ? (
                    <input name="source" value={editForm.source} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200" />
                  ) : (r.source || "-")}</td>

                  <td className="px-3 py-2">{r.added_by_name || "-"}</td>

                  <td className="px-3 py-2">{isEditing ? (
                    <input name="extra1" value={editForm.extra1} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200" />
                  ) : (r.extra1 || "-")}</td>

                  <td className="px-3 py-2">{isEditing ? (
                    <input name="extra2" value={editForm.extra2} onChange={handleEditChange}
                      className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200" />
                  ) : (r.extra2 || "-")}</td>

                  <td className="px-3 py-2 text-slate-500">{formatDate(r.created_at)}</td>

                  {(canEditLead || canDeleteLead) && (
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveEdit(r.id)}
                            disabled={savingEdit}
                            className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300"
                          >
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-300"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {canEditLead && (
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-300"
                            >
                              Edit
                            </button>
                          )}
                          {canDeleteLead && (
                            <button
                              type="button"
                              onClick={() => handleDelete(r.id)}
                              className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-300"
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

            {filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  {rows.length === 0
                    ? "No leads captured yet."
                    : "No leads match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeadsPage;
