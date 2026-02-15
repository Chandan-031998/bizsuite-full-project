// server/src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { initDb, seedAdmin, dbContextMiddleware, get } from "./db.js";

import authRoutes from "./routes/authRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import accountsRoutes from "./routes/accountsRoutes.js";
import leadsRoutes from "./routes/leadsRoutes.js";
import expensesRoutes from "./routes/expensesRoutes.js";
import tasksRoutes from "./routes/tasksRoutes.js";
import notificationsRoutes from "./routes/notificationsRoutes.js";
import quotationsRoutes from "./routes/quotationsRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

// ✅ NEW
import certificatesRoutes from "./routes/certificatesRoutes.js";

const app = express();

// Use TRUST_PROXY=1 only if behind reverse proxy / cPanel
if (String(process.env.TRUST_PROXY || "0") === "1") {
  app.set("trust proxy", 1);
}

const PORT = process.env.PORT || 4000;

/**
 * ✅ CORS FIX
 * Set on Render env:
 * CORS_ORIGINS=https://accounts.vertexsoftware.in,http://localhost:5173
 *
 * - Allows exact origins from env
 * - Allows any subdomain of vertexsoftware.in
 * - Exposes Content-Disposition so browser can read PDF filename
 */
const originsRaw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || "";
const allowedOrigins = originsRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl/postman/server-to-server
  if (allowedOrigins.length === 0) return true; // dev-friendly fallback

  if (allowedOrigins.includes(origin)) return true;

  // Allow any subdomain of vertexsoftware.in (accounts., crm., etc.)
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (host === "vertexsoftware.in" || host.endsWith(".vertexsoftware.in")) return true;
  } catch {
    // ignore invalid origin strings
  }

  return false;
};

const corsOptions = {
  origin: (origin, cb) => {
    const ok = isAllowedOrigin(origin);
    if (ok) return cb(null, true);
    return cb(new Error("CORS blocked: " + origin), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition", "Content-Type"],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// ✅ IMPORTANT: enables proper transactions per request
app.use(dbContextMiddleware);

// ✅ Fast health check (no DB)
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ts: Date.now() });
});

// ✅ Ready check (DB check)
app.get("/api/ready", async (_req, res) => {
  try {
    await get("SELECT 1 AS one", []);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, db: true, ts: Date.now() });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, message: e?.message || "DB not ready" });
  }
});

app.use("/api/auth", authRoutes);

// user routes
app.use("/api/users", usersRoutes);
app.use("/api/admin/users", usersRoutes);

// main modules
app.use("/api/accounts", accountsRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/quotations", quotationsRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ✅ NEW MODULE
app.use("/api/certificates", certificatesRoutes);

// ✅ global error handler (handles CORS errors too)
app.use((err, _req, res, _next) => {
  console.error("UNHANDLED ERROR:", err);

  if (String(err?.message || "").startsWith("CORS blocked:")) {
    return res.status(403).json({ message: err.message });
  }

  res.status(500).json({
    message: "Internal Server Error",
    detail: err?.message,
  });
});

initDb()
  .then(seedAdmin)
  .then(() => {
    const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    server.requestTimeout = 2 * 60 * 1000;
    server.headersTimeout = 2 * 60 * 1000;
    server.keepAliveTimeout = 65 * 1000;
  })
  .catch((err) => {
    console.error("DB init failed", err);
    process.exit(1);
  });

export default app;
