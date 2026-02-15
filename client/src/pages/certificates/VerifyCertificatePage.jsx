import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../../api/axios.js";

export default function VerifyCertificatePage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get(`/certificates/verify/${token}`);
        if (!mounted) return;
        setState({ loading: false, data: res.data, error: "" });
      } catch (e) {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.detail ||
          e?.message ||
          "Invalid certificate";
        if (!mounted) return;
        setState({ loading: false, data: null, error: msg });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Vertex Software</div>
            <div className="text-xs text-slate-500">Certificate Verification</div>
          </div>
          <Link
            to="/"
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50"
          >
            Go to App
          </Link>
        </div>

        <div className="mt-6">
          {state.loading && (
            <div className="text-sm text-slate-600">Checking certificate…</div>
          )}

          {!state.loading && state.data?.valid && (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold">
                ✅ VALID CERTIFICATE
              </div>

              <div className="mt-5 space-y-2 text-sm">
                <div className="text-slate-900 font-semibold text-xl">
                  {state.data.student_name}
                </div>

                <div className="text-slate-700">
                  Course / Internship:{" "}
                  <span className="font-semibold">{state.data.program_title}</span>
                </div>

                <div className="text-slate-600">
                  Type: <span className="font-medium">{state.data.certificate_type}</span>
                </div>

                <div className="text-slate-600">
                  Issued On: <span className="font-medium">{state.data.issued_on}</span>
                </div>

                {state.data.duration && (
                  <div className="text-slate-600">
                    Duration: <span className="font-medium">{state.data.duration}</span>
                  </div>
                )}

                <div className="pt-3 text-xs text-slate-500">
                  Certificate No: {state.data.certificate_number}
                </div>
              </div>
            </>
          )}

          {!state.loading && !state.data?.valid && (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm font-semibold">
                ❌ INVALID CERTIFICATE
              </div>
              <div className="mt-3 text-sm text-slate-700">{state.error}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
