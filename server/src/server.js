// server/src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { initDb, seedAdmin, dbContextMiddleware, get } from "./db.js"; // ✅ get used for /api/ready

import authRoutes from "./routes/authRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import accountsRoutes from "./routes/accountsRoutes.js";
import leadsRoutes from "./routes/leadsRoutes.js";
import expensesRoutes from "./routes/expensesRoutes.js";
import tasksRoutes from "./routes/tasksRoutes.js";
import notificationsRoutes from "./routes/notificationsRoutes.js";
import quotationsRoutes from "./routes/quotationsRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

const app = express();

// Use TRUST_PROXY=1 only if behind reverse proxy / cPanel
if (String(process.env.TRUST_PROXY || "0") === "1") {
  app.set("trust proxy", 1);
}

const PORT = process.env.PORT || 4000;

// ✅ Support both env vars
const originsRaw = process.env.CORS_ORIGINS || process.env.CLIENT_URL || "";
const allowedOrigins = originsRaw
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser tools
    if (!origin) return cb(null, true);

    // if empty, allow all (dev-friendly)
    if (allowedOrigins.length === 0) return cb(null, true);

    // allow exact match
    if (allowedOrigins.includes(origin)) return cb(null, true);

    return cb(new Error("CORS blocked: " + origin), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// ✅ IMPORTANT: enables proper transactions per request
app.use(dbContextMiddleware);

// ✅ Fast health check (no DB) – used to warm up Render
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ts: Date.now() });
});

// ✅ Ready check (DB check) – helpful for debugging DB connectivity
app.get("/api/ready", async (_req, res) => {
  try {
    // quick lightweight query
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

// ✅ global error handler
app.use((err, _req, res, _next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({
    message: "Internal Server Error",
    detail: err?.message,
  });
});

initDb()
  .then(seedAdmin)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("DB init failed", err);
    process.exit(1);
  });

export default app;
