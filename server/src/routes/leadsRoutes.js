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

// ✅ Stats FIRST (prevents future route collisions)
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

    if (!name) return res.status(400).json({ message: "Name is required" });

    const addedBy = req.user.id;

    const result = await run(
      `INSERT INTO leads
        (name, email, phone, company, place, source, stage, added_by, assigned_to, extra1, extra2)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        name,
        email || null,
        phone || null,
        company || null,
        place || null,
        source || null,
        stage,
        addedBy,
        assigned_to || null,
        extra1 || null,
        extra2 || null,
      ]
    );

    res.status(201).json({ id: result.id });
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
        req.params.id,
      ]
    );

    res.json({ id: req.params.id });
  } catch (err) {
    console.error("PUT /leads/:id failed:", err);
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
      [req.params.id, note, next_follow_up_date || null]
    );

    res.status(201).json({ id: result.id });
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
