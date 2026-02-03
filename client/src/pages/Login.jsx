// client/src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext.jsx";
import vertexLogo from "../assets/vertex-logo.png";

// OPTIONAL: if you added warmUpServer export in axios.js
// If you haven't added it, this import will fail — in that case, remove these 2 lines.
import api, { warmUpServer } from "../api/axios.js";

const Login = () => {
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [hint, setHint] = useState(""); // for "waking up" / info messages

  // ✅ Warm up backend on page load (helps Render cold start)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // If warmUpServer exists, use it. Else fallback to /health.
        if (typeof warmUpServer === "function") {
          setHint("Warming up server… (first load may take a few seconds)");
          await warmUpServer();
        } else {
          setHint("Warming up server… (first load may take a few seconds)");
          await api.get("/health");
        }
        if (mounted) setHint("");
      } catch {
        // ignore warm-up failures; user can still login
        if (mounted) setHint("");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setHint("");

    const result = await login(email, password);

    // ✅ Support both return styles:
    // 1) boolean: true/false
    // 2) object: { ok, message }
    const ok = typeof result === "boolean" ? result : Boolean(result?.ok);
    const message =
      typeof result === "object" && result?.message ? String(result.message) : "";

    if (!ok) {
      // If AuthContext returns a message, use it.
      if (message) {
        setError(message);
        return;
      }

      // Otherwise show a better generic message.
      setError(
        "Login failed. If this is the first time opening the site, the server may be waking up. Please try again in 10–30 seconds."
      );
      return;
    }

    navigate("/dashboard");
  };

  // simple deterministic “random” for floating particles (no Math.random)
  const particles = Array.from({ length: 14 }).map((_, i) => {
    const x = (Math.sin(i * 999) * 0.5 + 0.5) * 100;
    const y = (Math.sin(i * 555) * 0.5 + 0.5) * 100;
    const s = 2 + ((i * 7) % 4); // size 2..5
    const d = 10 + (i % 6) * 2; // duration
    const delay = (i % 7) * 0.6;
    return { x, y, s, d, delay };
  });

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient base */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(99,102,241,0.18), rgba(56,189,248,0.16), rgba(168,85,247,0.14))",
          backgroundSize: "200% 200%",
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Soft grid overlay */}
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.12)_1px,transparent_0)] [background-size:18px_18px]" />

      {/* Floating blurred blobs */}
      <motion.div
        className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl"
        animate={{ x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-10 -right-28 h-96 w-96 rounded-full bg-sky-400/25 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 35, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-28 left-1/3 h-[28rem] w-[28rem] rounded-full bg-fuchsia-400/20 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -30, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p, idx) => (
          <motion.span
            key={idx}
            className="absolute rounded-full bg-slate-900/10"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.s}px`,
              height: `${p.s}px`,
            }}
            animate={{ y: [0, -14, 0], opacity: [0.25, 0.55, 0.25] }}
            transition={{
              duration: p.d,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md bg-white/85 border border-slate-200 rounded-3xl p-7 shadow-xl shadow-slate-900/10 backdrop-blur"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 flex items-center justify-center shadow-md">
              <img
                src={vertexLogo}
                alt="Vertex Software"
                className="h-8 w-8 object-contain"
              />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-900">
                Vertex Software
              </div>
              <div className="text-[11px] text-slate-500">
                Accounts · CRM · Expense Management
              </div>
            </div>
          </div>

          {/* ✅ hint message */}
          {hint && (
            <div className="mb-3 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              {hint}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:border-sky-500"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/70 focus:border-sky-500"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {/* ✅ real error */}
            {error && (
              <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 text-xs font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-sky-400 transition disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-3 text-[10px] text-slate-500">
            Tip: On first open, the server may “wake up” (Render free). If login
            takes long, wait and try again.
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
