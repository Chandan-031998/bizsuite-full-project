import React, { useEffect, useMemo, useState } from "react";
import api from "../../api/axios.js";

const toDateInput = (v) => {
  if (!v) return "";
  if (typeof v === "string") {
    if (v.includes("T")) return v.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const getFilenameFromDisposition = (disposition) => {
  if (!disposition) return null;

  // filename*=UTF-8''...
  const mStar = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (mStar?.[1]) {
    try {
      return decodeURIComponent(mStar[1]);
    } catch {
      return mStar[1];
    }
  }

  const m = /filename="([^"]+)"/i.exec(disposition);
  return m?.[1] || null;
};

export default function CertificatesPage() {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState([]);

  const today = toDateInput(new Date());

  const [form, setForm] = useState({
    student_name: "",
    student_email: "",
    program_title: "",
    certificate_type: "Course Completion",
    issued_on: today,
    duration: "",
  });

  const [edit, setEdit] = useState(null);

  const publicWebBase = window.location.origin;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/certificates");
      setItems(res.data || []);
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data?.detail || e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const verifyLinkFor = (c) => c.verify_url || `${window.location.origin}/verify/${c.token}`;

  const onCreate = async () => {
    try {
      if (!form.student_name?.trim() || !form.program_title?.trim() || !toDateInput(form.issued_on)) {
        alert("Student Name, Title, Issued On are required");
        return;
      }

      setCreating(true);

      const payload = {
        ...form,
        issued_on: toDateInput(form.issued_on),
        public_web_base: publicWebBase,
      };

      await api.post("/certificates", payload);
      setForm((p) => ({ ...p, student_name: "", student_email: "", program_title: "", duration: "" }));
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data?.detail || e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm("Delete this certificate?")) return;
    try {
      await api.delete(`/certificates/${id}`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data?.detail || e?.message || "Delete failed");
    }
  };

  const onUpdate = async () => {
    if (!edit) return;
    try {
      const payload = {
        student_name: edit.student_name,
        student_email: edit.student_email,
        program_title: edit.program_title,
        certificate_type: edit.certificate_type,
        issued_on: toDateInput(edit.issued_on),
        duration: edit.duration,
        public_web_base: publicWebBase,
      };

      await api.put(`/certificates/${edit.id}`, payload);
      setEdit(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e?.response?.data?.detail || e?.message || "Update failed");
    }
  };

  const downloadPdf = async (c) => {
    try {
      const res = await api.get(`/certificates/${c.id}/pdf`, {
        responseType: "blob",
        timeout: 120000,
        params: { public_web_base: publicWebBase },
        headers: { Accept: "application/pdf" },
      });

      const contentType = res.headers?.["content-type"] || "";
      if (contentType.includes("application/json")) {
        const txt = await res.data.text();
        try {
          const j = JSON.parse(txt);
          throw new Error(j.message || j.detail || "PDF failed");
        } catch {
          throw new Error(txt || "PDF failed");
        }
      }

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const filename =
        getFilenameFromDisposition(res.headers?.["content-disposition"]) ||
        `${c.certificate_number || "Certificate"}_${(c.student_name || c.id).replace(/\s+/g, "_")}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert(e?.message || e?.response?.data?.message || e?.response?.data?.detail || "PDF download failed");
    }
  };

  const sorted = useMemo(() => items, [items]);

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <div className="mb-4">
        <div className="text-xl font-semibold">Certificates (QR Generator)</div>
        <div className="text-sm text-slate-500">
          Generate PDF certificate with embedded QR → QR opens Verify page (public).
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-600 font-medium">Student Name *</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.student_name}
              onChange={(e) => setForm((p) => ({ ...p, student_name: e.target.value }))}
              placeholder="Student full name"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">Student Email</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.student_email}
              onChange={(e) => setForm((p) => ({ ...p, student_email: e.target.value }))}
              placeholder="student@email.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">Course / Internship Title *</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.program_title}
              onChange={(e) => setForm((p) => ({ ...p, program_title: e.target.value }))}
              placeholder="Python + ML Internship"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">Certificate Type</label>
            <select
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.certificate_type}
              onChange={(e) => setForm((p) => ({ ...p, certificate_type: e.target.value }))}
            >
              <option>Course Completion</option>
              <option>Internship Completion</option>
              <option>Participation</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">Issued On *</label>
            <input
              type="date"
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={toDateInput(form.issued_on)}
              onChange={(e) => setForm((p) => ({ ...p, issued_on: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs text-slate-600 font-medium">Duration (optional)</label>
            <input
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              value={form.duration}
              onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
              placeholder="4 Weeks / Jan 2026 - Feb 2026"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCreate}
            disabled={creating}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {creating ? "Generating..." : "Generate Certificate PDF + QR"}
          </button>

          <button
            onClick={load}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Recent Certificates</div>
          {loading && <div className="text-xs text-slate-500">Loading…</div>}
        </div>

        <div className="mt-3 space-y-3">
          {!loading && sorted.length === 0 && <div className="text-sm text-slate-500">No certificates yet.</div>}

          {sorted.map((c) => (
            <div
              key={c.id}
              className="border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
            >
              <div>
                <div className="font-semibold text-slate-900">
                  {c.certificate_number} : {c.student_name}
                </div>
                <div className="text-sm text-slate-600">
                  {c.program_title} · {c.certificate_type} · Issued: {toDateInput(c.issued_on)}
                </div>
                <div className="text-xs text-slate-500">Verify: {verifyLinkFor(c)}</div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium hover:bg-slate-50"
                  onClick={() => navigator.clipboard.writeText(verifyLinkFor(c))}
                >
                  Copy Link
                </button>

                <button
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:opacity-95"
                  onClick={() => downloadPdf(c)}
                >
                  Download PDF
                </button>

                <button
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium hover:bg-slate-50"
                  onClick={() => setEdit({ ...c })}
                >
                  Update
                </button>

                <button
                  className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100"
                  onClick={() => onDelete(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Update Certificate</div>
              <button
                className="text-sm px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50"
                onClick={() => setEdit(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-600 font-medium">Student Name</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={edit.student_name || ""}
                  onChange={(e) => setEdit((p) => ({ ...p, student_name: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Student Email</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={edit.student_email || ""}
                  onChange={(e) => setEdit((p) => ({ ...p, student_email: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Program Title</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={edit.program_title || ""}
                  onChange={(e) => setEdit((p) => ({ ...p, program_title: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Type</label>
                <select
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={edit.certificate_type || "Course Completion"}
                  onChange={(e) => setEdit((p) => ({ ...p, certificate_type: e.target.value }))}
                >
                  <option>Course Completion</option>
                  <option>Internship Completion</option>
                  <option>Participation</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Issued On</label>
                <input
                  type="date"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={toDateInput(edit.issued_on)}
                  onChange={(e) => setEdit((p) => ({ ...p, issued_on: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-600 font-medium">Duration</label>
                <input
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  value={edit.duration || ""}
                  onChange={(e) => setEdit((p) => ({ ...p, duration: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={onUpdate} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium">
                Save
              </button>
              <button
                onClick={() => setEdit(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-500">Note: QR in PDF uses your deployed domain automatically.</div>
          </div>
        </div>
      )}
    </div>
  );
}
