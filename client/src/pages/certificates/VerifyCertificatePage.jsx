import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../../api/axios.js";

export default function VerifyCertificatePage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await api.get(`/certificates/verify/${token}`, {
          // IMPORTANT: public verify should work even without login token
          // if your axios attaches token, it's okay; server does NOT require auth on this route
          timeout: 20000,
        });
        if (!mounted) return;
        setData(res.data);
      } catch (e) {
        if (!mounted) return;
        setData({ valid: false });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  const valid = data?.valid;
  const c = data?.certificate;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Certificate Verification</div>
            <div className="text-sm text-slate-500">Vertex Software</div>
          </div>

          {loading ? (
            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">Checking…</span>
          ) : valid ? (
            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">VALID</span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-semibold">INVALID</span>
          )}
        </div>

        <div className="my-4 h-px bg-slate-200" />

        {valid && c ? (
          <div className="space-y-2 text-sm">
            <div><b>Certificate No:</b> {c.certificate_number}</div>
            <div><b>Student Name:</b> {c.student_name}</div>
            <div><b>Program:</b> {c.program_title}</div>
            <div><b>Type:</b> {c.certificate_type}</div>
            <div><b>Issued On:</b> {String(c.issued_on).slice(0, 10)}</div>
            {c.duration ? <div><b>Duration:</b> {c.duration}</div> : null}
          </div>
        ) : !loading ? (
          <div className="text-sm text-slate-600">
            This certificate token is not found or invalid.
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between text-sm">
          <a className="text-indigo-600 font-medium" href="https://vertexsoftware.in" target="_blank" rel="noreferrer">
            vertexsoftware.in
          </a>

          {/* ✅ FIX: do NOT go to admin.html */}
          <Link className="text-indigo-600 font-medium" to="/login">
            Admin Login →
          </Link>
        </div>
      </div>
    </div>
  );
}
