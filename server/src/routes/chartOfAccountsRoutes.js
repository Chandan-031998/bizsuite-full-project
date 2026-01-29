// server/src/routes/chartOfAccountsRoutes.js
import express from "express";
import { all, run } from "../db.js";

const router = express.Router();

/**
 * GET /api/chart-of-accounts
 * Returns all account heads.
 */
router.get("/", async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, code, name, type
       FROM chart_of_accounts
       ORDER BY code ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /chart-of-accounts failed:", err);
    res
      .status(500)
      .json({ message: "Failed to load chart of accounts" });
  }
});

/**
 * POST /api/chart-of-accounts
 * Admin only – create a new account head.
 */
router.post("/", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admin can manage chart of accounts" });
    }

    const { code, name, type } = req.body;

    if (!code || !name || !type) {
      return res
        .status(400)
        .json({ message: "Code, name and type are required" });
    }

    await run(
      `INSERT INTO chart_of_accounts (code, name, type)
       VALUES (?, ?, ?)`,
      [code.trim(), name.trim(), type]
    );

    const [created] = await all(
      `SELECT id, code, name, type
       FROM chart_of_accounts
       WHERE code = ?`,
      [code.trim()]
    );

    res.status(201).json(created);
  } catch (err) {
    console.error("POST /chart-of-accounts failed:", err);
    if (err.message && err.message.includes("UNIQUE")) {
      return res
        .status(409)
        .json({ message: "Account code already exists" });
    }
    res.status(500).json({ message: "Failed to create account" });
  }
});

/**
 * DELETE /api/chart-of-accounts/:id
 * Admin only – delete an account head.
 */
router.delete("/:id", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admin can delete accounts" });
    }

    const { id } = req.params;
    await run(`DELETE FROM chart_of_accounts WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /chart-of-accounts/:id failed:", err);
    res.status(500).json({ message: "Failed to delete account" });
  }
});

export default router;
