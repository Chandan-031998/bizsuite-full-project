// server/src/routes/leadsRoutes.js
import express from "express";
import { all, get, run } from "../db.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authenticateToken);

/**
 * Leads (CRM)
 * Admin + Sales: CRU
 * Admin only   : delete
 */

// 🔒 helper: mysql2 does NOT allow undefined in bind params
const toNull = (v) => (typeof v === "undefined" ? null : v);

// Optional: normalize allowed stages to avoid junk values
const ALLOWED_STAGES = ["New", "Contacted", "Follow-up", "Proposal Sent", "Won", "Lost"];
const normaliseStage = (stage) => {
  if (typeof stage === "undefined" || stage === null) return null; // means "do not change" in COALESCE
  const s = String(stage).trim();
  return ALLOWED_STAGES.includes(s) ? s : null;
};

// ✅ Stats FIRST
router.get("/stats/summary", authorizeRoles("admin", "sales"), async (_req, res) => {
  try {
    const stages = await all(
      `SELECT stage, COUNT(*) AS count
       FROM leads
       GROUP BY stage
       ORDER BY stage`,
      []
    );

    const totalRow = await get(`SELECT COUNT(*) AS total FROM leads`, []);
    const wonRow = await get(`SELECT COUNT(*) AS won FROM leads WHERE stage = 'Won'`, []);

    const total = Number(totalRow?.total || 0);
    const won = Number(wonRow?.won || 0);
    const conversionRate = total === 0 ? 0 : (won / total) * 100;

    res.json({ stages, conversionRate });
  } catch (err) {
    console.error("GET /leads/stats/summary failed:", err);
    res.status(500).json({ message: "Failed to compute stats" });
  }
});

// Create lead
router.post("/", authorizeRoles("admin", "sales"), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      company,
      place,
      source,
      stage = "New",
      assigned_to,
      extra1,
      extra2,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const safeStage = ALLOWED_STAGES.includes(String(stage)) ? String(stage) : "New";
    const addedBy = req.user.id;

    const result = await run(
      `INSERT INTO leads
        (name, email, phone, company, place, source, stage, added_by, assigned_to, extra1, extra2)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        String(name).trim(),
        toNull(email),
        toNull(phone),
        toNull(company),
        toNull(place),
        toNull(source),
        safeStage,
        addedBy,
        toNull(assigned_to),
        toNull(extra1),
        toNull(extra2),
      ]
    );

    const id = result?.insertId || result?.lastID || result?.id;
    res.status(201).json({ id });
  } catch (err) {
    console.error("POST /leads failed:", err);
    res.status(500).json({ message: "Failed to create lead" });
  }
});

// List leads
router.get("/", authorizeRoles("admin", "sales"), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT
         l.*,
         owner.name   AS assigned_to_name,
         creator.name AS added_by_name
       FROM leads l
       LEFT JOIN users owner   ON owner.id   = l.assigned_to
       LEFT JOIN users creator ON creator.id = l.added_by
       ORDER BY l.created_at DESC`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /leads failed:", err);
    res.status(500).json({ message: "Failed to fetch leads" });
  }
});

// Update lead
router.put("/:id", authorizeRoles("admin", "sales"), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      company,
      place,
      source,
      stage,
      assigned_to,
      extra1,
      extra2,
    } = req.body;

    const existing = await get(`SELECT id FROM leads WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ message: "Lead not found" });

    // If stage is provided but invalid, reject (better than silently setting null)
    const safeStage = normaliseStage(stage);
    if (typeof stage !== "undefined" && stage !== null && safeStage === null) {
      return res.status(400).json({ message: `Invalid stage. Allowed: ${ALLOWED_STAGES.join(", ")}` });
    }

    await run(
      `UPDATE leads
       SET name        = COALESCE(?, name),
           email       = COALESCE(?, email),
           phone       = COALESCE(?, phone),
           company     = COALESCE(?, company),
           place       = COALESCE(?, place),
           source      = COALESCE(?, source),
           stage       = COALESCE(?, stage),
           assigned_to = COALESCE(?, assigned_to),
           extra1      = COALESCE(?, extra1),
           extra2      = COALESCE(?, extra2)
       WHERE id = ?`,
      [
        toNull(name),
        toNull(email),
        toNull(phone),
        toNull(company),
        toNull(place),
        toNull(source),
        safeStage,                 // IMPORTANT: stage normalized (or null)
        toNull(assigned_to),       // IMPORTANT: undefined -> null
        toNull(extra1),
        toNull(extra2),
        req.params.id,
      ]
    );

    res.json({ id: Number(req.params.id), message: "Lead updated" });
  } catch (err) {
    console.error("PUT /leads/:id failed:", err);
    // If you want to quickly confirm undefined issue:
    // console.error("BODY:", req.body);
    res.status(500).json({ message: "Failed to update lead" });
  }
});

// Delete lead – Admin only
router.delete("/:id", authorizeRoles("admin"), async (req, res) => {
  try {
    const leadId = req.params.id;
    await run("DELETE FROM lead_activities WHERE lead_id = ?", [leadId]);
    await run("DELETE FROM leads WHERE id = ?", [leadId]);
    res.json({ message: "Lead deleted" });
  } catch (err) {
    console.error("DELETE /leads/:id failed:", err);
    res.status(500).json({ message: "Failed to delete lead" });
  }
});

// Activities
router.post("/:id/activities", authorizeRoles("admin", "sales"), async (req, res) => {
  try {
    const { note, next_follow_up_date } = req.body;

    const lead = await get("SELECT id FROM leads WHERE id = ?", [req.params.id]);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const result = await run(
      `INSERT INTO lead_activities (lead_id, note, next_follow_up_date)
       VALUES (?,?,?)`,
      [req.params.id, toNull(note), toNull(next_follow_up_date)]
    );

    const id = result?.insertId || result?.lastID || result?.id;
    res.status(201).json({ id });
  } catch (err) {
    console.error("POST /leads/:id/activities failed:", err);
    res.status(500).json({ message: "Failed to add activity" });
  }
});

router.get("/:id/activities", authorizeRoles("admin", "sales"), async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM lead_activities
       WHERE lead_id = ?
       ORDER BY created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /leads/:id/activities failed:", err);
    res.status(500).json({ message: "Failed to fetch activities" });
  }
});

export default router;
