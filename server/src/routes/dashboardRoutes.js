import express from "express";
import { all } from "../db.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authenticateToken);

/* ---------------- helpers ---------------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function parseAnyDate(value) {
  if (!value) return null;

  const s = String(value).trim();
  if (!s) return null;

  // ISO: 2026-01-10 or 2026-01-10T00:00:00.000Z
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;

  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]);
    const d2 = new Date(yy, mm, dd);
    if (!Number.isNaN(d2.getTime())) return d2;
  }

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) {
    const yy = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    const dd = Number(m2[3]);
    const d3 = new Date(yy, mm, dd);
    if (!Number.isNaN(d3.getTime())) return d3;
  }

  return null;
}

function toPeriod(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

function lastNPeriods(n) {
  const now = new Date();
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(toPeriod(d));
  }
  return arr;
}

/**
 * ✅ IMPORTANT FIX:
 * Your invoice totals are NOT stored in invoices.total in your current setup.
 * They are derived from invoice_items (SUM quantity * unit_price),
 * and payments are in payments table.
 */
async function fetchInvoices() {
  try {
    const rows = await all(
      `
      SELECT
        i.id,
        i.status,
        i.issue_date,
        COALESCE(
          (SELECT SUM(it.quantity * it.unit_price) FROM invoice_items it WHERE it.invoice_id = i.id),
          0
        ) AS total,
        COALESCE(
          (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id),
          0
        ) AS paid
      FROM invoices i
      ORDER BY i.id DESC
      `,
      []
    );

    return (rows || []).map((r) => ({
      id: r.id,
      status: r.status || "due",
      issue_date: r.issue_date,
      total: Number(r.total || 0),
      paid: Number(r.paid || 0),
    }));
  } catch (e) {
    console.error("Dashboard invoice query failed:", e);
    return [];
  }
}

async function fetchExpenses() {
  try {
    const rows = await all(
      `
      SELECT
        id,
        expense_date,
        COALESCE(amount, 0) AS amount
      FROM expenses
      ORDER BY id DESC
      `,
      []
    );
    return (rows || []).map((r) => ({
      id: r.id,
      expense_date: r.expense_date,
      amount: Number(r.amount || 0),
    }));
  } catch (e1) {
    // fallback if column name is "date"
    try {
      const rows = await all(
        `
        SELECT
          id,
          date AS expense_date,
          COALESCE(amount, 0) AS amount
        FROM expenses
        ORDER BY id DESC
        `,
        []
      );
      return (rows || []).map((r) => ({
        id: r.id,
        expense_date: r.expense_date,
        amount: Number(r.amount || 0),
      }));
    } catch (e2) {
      console.error("Dashboard expense query failed:", e1, e2);
      return [];
    }
  }
}

async function fetchLeadsPipeline() {
  try {
    const stages = await all(`SELECT stage, COUNT(*) AS count FROM leads GROUP BY stage`, []);
    return (stages || []).map((s) => ({
      stage: s.stage || "New",
      count: Number(s.count || 0),
    }));
  } catch (e) {
    console.error("Dashboard leads pipeline query failed:", e);
    return [];
  }
}

/* ---------------- route ---------------- */

router.get("/", authorizeRoles("admin", "accounts", "sales"), async (req, res) => {
  try {
    const months = clamp(Number(req.query.months || 12), 1, 36);
    const periods = lastNPeriods(months);

    const [invoices, expenses, leadsPipeline] = await Promise.all([
      fetchInvoices(),
      fetchExpenses(),
      fetchLeadsPipeline(),
    ]);

    const totalRevenue = invoices.reduce((sum, x) => sum + Number(x.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0);

    const outstandingPayments = invoices.reduce((sum, inv) => {
      const st = String(inv.status || "").toLowerCase();
      if (st === "paid") return sum;
      const due = Math.max(Number(inv.total || 0) - Number(inv.paid || 0), 0);
      return sum + due;
    }, 0);

    // monthly series
    const revenueByPeriod = Object.fromEntries(periods.map((p) => [p, 0]));
    const expenseByPeriod = Object.fromEntries(periods.map((p) => [p, 0]));

    for (const inv of invoices) {
      const d = parseAnyDate(inv.issue_date);
      if (!d) continue;
      const p = toPeriod(d);
      if (p in revenueByPeriod) revenueByPeriod[p] += Number(inv.total || 0);
    }

    for (const ex of expenses) {
      const d = parseAnyDate(ex.expense_date);
      if (!d) continue;
      const p = toPeriod(d);
      if (p in expenseByPeriod) expenseByPeriod[p] += Number(ex.amount || 0);
    }

    const monthlyFinance = periods.map((p) => ({
      period: p,
      revenue: Number(revenueByPeriod[p] || 0),
      expenses: Number(expenseByPeriod[p] || 0),
    }));

    const remainingBalance = Number(totalRevenue || 0) - Number(totalExpenses || 0);

    res.json({
      totalRevenue: Number(totalRevenue || 0),
      totalExpenses: Number(totalExpenses || 0),
      netProfit: Number((totalRevenue || 0) - (totalExpenses || 0)),
      remainingBalance: Number(remainingBalance || 0),
      outstandingPayments: Number(outstandingPayments || 0),
      leadsPipeline,
      monthlyFinance,
    });
  } catch (err) {
    console.error("GET /dashboard failed:", err);
    res.status(500).json({ message: "Failed to fetch dashboard data" });
  }
});

export default router;
