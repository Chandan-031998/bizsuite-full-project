// server/src/routes/certificatesRoutes.js
import express from "express";
import crypto from "crypto";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

import { run, all, get } from "../db.js";
import requireAuth from "../middleware/authMiddleware.js";

const router = express.Router();

let ensured = false;

// --- Try SQLite first (your errors show SQLite binding behaviour) ---
const CREATE_CERT_TABLE_SQLITE = `
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  certificate_number TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  student_email TEXT,
  program_title TEXT NOT NULL,
  certificate_type TEXT NOT NULL DEFAULT 'Course Completion',
  issued_on TEXT NOT NULL,
  duration TEXT,
  verify_url TEXT,
  pdf_path TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// --- MySQL fallback (if you switch DB later) ---
const CREATE_CERT_TABLE_MYSQL = `
CREATE TABLE IF NOT EXISTS certificates (
  id INT NOT NULL AUTO_INCREMENT,
  token VARCHAR(64) NOT NULL,
  certificate_number VARCHAR(64) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  student_email VARCHAR(255) NULL,
  program_title VARCHAR(255) NOT NULL,
  certificate_type VARCHAR(64) NOT NULL DEFAULT 'Course Completion',
  issued_on DATE NOT NULL,
  duration VARCHAR(255) NULL,
  verify_url TEXT NULL,
  pdf_path TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token (token),
  UNIQUE KEY uniq_certificate_number (certificate_number),
  KEY idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function ensureTable() {
  if (ensured) return;

  try {
    await run(CREATE_CERT_TABLE_SQLITE);
    ensured = true;
    return;
  } catch (e1) {
    try {
      await run(CREATE_CERT_TABLE_MYSQL);
      ensured = true;
      return;
    } catch (e2) {
      console.error("CERT TABLE ENSURE ERROR (sqlite):", e1?.message || e1);
      console.error("CERT TABLE ENSURE ERROR (mysql):", e2?.message || e2);
      throw new Error("Could not create certificates table on current DB driver.");
    }
  }
}

const cleanStr = (v) => {
  if (typeof v === "undefined" || v === null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  return String(v);
};

const normalizeIssuedOn = (v) => {
  if (!v) return null;

  // yyyy-mm-dd
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // dd/mm/yyyy
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return null;
};

const makeToken = () => crypto.randomBytes(16).toString("hex");

const makeCertNumber = () => {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `VTX-${year}-${rand}`;
};

const userIdFromReq = (req) =>
  req.user?.id ?? req.user?.user_id ?? req.user?.userId ?? req.user?.uid ?? null;

const getPublicWebBase = (req) => {
  return (
    cleanStr(req.query?.public_web_base) ||
    cleanStr(req.body?.public_web_base) ||
    cleanStr(req.headers["x-public-web-base"]) ||
    cleanStr(req.headers.origin) ||
    cleanStr(process.env.PUBLIC_WEB_BASE_URL) ||
    "http://localhost:5173"
  );
};

async function buildPdfBuffer(cert, verifyUrl) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Border
  doc.rect(30, 30, 535, 782).lineWidth(2).stroke();

  doc.fontSize(24).text("Certificate", { align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(14).fillColor("#444").text("Vertex Software", { align: "center" });
  doc.fillColor("#000");
  doc.moveDown(1.2);

  doc.fontSize(16).text("This is to certify that", { align: "center" });
  doc.moveDown(0.6);

  doc.fontSize(22).text(cert.student_name, { align: "center" });
  doc.moveDown(0.8);

  doc.fontSize(14).text(`has successfully completed: ${cert.program_title}`, {
    align: "center",
  });
  doc.moveDown(0.5);

  doc.fontSize(14).text(`Certificate Type: ${cert.certificate_type}`, { align: "center" });
  doc.moveDown(0.5);

  doc.fontSize(14).text(`Issued On: ${String(cert.issued_on)}`, { align: "center" });

  if (cert.duration) {
    doc.moveDown(0.3);
    doc.fontSize(13).text(`Duration: ${cert.duration}`, { align: "center" });
  }

  doc.moveDown(1.2);
  doc.fontSize(12).fillColor("#444").text(`Certificate No: ${cert.certificate_number}`, {
    align: "center",
  });
  doc.fillColor("#000");

  const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });

  const base64 = qrDataUrl.split(",")[1];
  const qrBuf = Buffer.from(base64, "base64");
  doc.image(qrBuf, 230, 640, { width: 120 });

  doc.fontSize(10).fillColor("#555").text("Scan to verify", 0, 765, { align: "center" });
  doc.fillColor("#000");

  doc.end();
  return done;
}

/**
 * ✅ PUBLIC VERIFY (NO AUTH)
 * Frontend: /verify/:token
 * API: /api/certificates/verify/:token
 */
router.get("/verify/:token", async (req, res) => {
  await ensureTable();
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(400).json({ valid: false, message: "Missing token" });

    const row = await get(
      `SELECT id, token, certificate_number, student_name, student_email,
              program_title, certificate_type, issued_on, duration, verify_url,
              created_at, updated_at
       FROM certificates
       WHERE token = ?
       LIMIT 1`,
      [token]
    );

    if (!row) return res.json({ valid: false });

    return res.json({ valid: true, certificate: row });
  } catch (e) {
    console.error("VERIFY ERROR:", e?.message || e);
    return res.status(500).json({ valid: false, message: "Server error" });
  }
});

// ✅ Everything below requires login
router.use(requireAuth);

// LIST
router.get("/", async (_req, res) => {
  await ensureTable();
  try {
    const rows = await all(
      `SELECT id, token, certificate_number, student_name, student_email,
              program_title, certificate_type, issued_on, duration, verify_url,
              created_at, updated_at
       FROM certificates
       ORDER BY id DESC
       LIMIT 200`
    );
    res.json(rows || []);
  } catch (e) {
    console.error("LIST ERROR:", e?.message || e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// CREATE
router.post("/", async (req, res) => {
  await ensureTable();

  try {
    const student_name = cleanStr(req.body?.student_name);
    const student_email = cleanStr(req.body?.student_email);
    const program_title = cleanStr(req.body?.program_title);
    const certificate_type = cleanStr(req.body?.certificate_type) || "Course Completion";
    const issued_on = normalizeIssuedOn(req.body?.issued_on || req.body?.issuedOn);
    const duration = cleanStr(req.body?.duration);

    if (!student_name || !program_title || !issued_on) {
      return res.status(400).json({ message: "student_name, program_title, issued_on required" });
    }

    const token = makeToken();
    const certificate_number = makeCertNumber();

    const publicBase = getPublicWebBase(req).replace(/\/+$/, "");
    const verify_url = `${publicBase}/verify/${token}`;

    const created_by = userIdFromReq(req);

    const result = await run(
      `INSERT INTO certificates
        (token, certificate_number, student_name, student_email, program_title, certificate_type, issued_on, duration, verify_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        token,
        certificate_number,
        student_name,
        student_email ?? null,
        program_title,
        certificate_type,
        issued_on,
        duration ?? null,
        verify_url,
        created_by ?? null,
      ]
    );

    // ✅ IMPORTANT FIX: SQLite doesn't return insertId (it returns lastInsertRowid/lastID)
    const insertedId =
      result?.insertId ?? result?.lastInsertRowid ?? result?.lastID ?? null;

    // If we don't have an id, fetch by token (safe, unique)
    const row = insertedId
      ? await get(
          `SELECT id, token, certificate_number, student_name, student_email,
                  program_title, certificate_type, issued_on, duration, verify_url,
                  created_at, updated_at
           FROM certificates WHERE id = ? LIMIT 1`,
          [insertedId]
        )
      : await get(
          `SELECT id, token, certificate_number, student_name, student_email,
                  program_title, certificate_type, issued_on, duration, verify_url,
                  created_at, updated_at
           FROM certificates WHERE token = ? LIMIT 1`,
          [token]
        );

    res.status(201).json(row);
  } catch (e) {
    console.error("CREATE ERROR:", e?.message || e);
    res.status(500).json({ message: e?.message || "Internal Server Error" });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  await ensureTable();
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const student_name = cleanStr(req.body?.student_name);
    const student_email = cleanStr(req.body?.student_email);
    const program_title = cleanStr(req.body?.program_title);
    const certificate_type = cleanStr(req.body?.certificate_type) || "Course Completion";
    const issued_on = normalizeIssuedOn(req.body?.issued_on || req.body?.issuedOn);
    const duration = cleanStr(req.body?.duration);

    if (!student_name || !program_title || !issued_on) {
      return res.status(400).json({ message: "student_name, program_title, issued_on required" });
    }

    const existing = await get(`SELECT token FROM certificates WHERE id = ? LIMIT 1`, [id]);
    if (!existing) return res.status(404).json({ message: "Not found" });

    const publicBase = getPublicWebBase(req).replace(/\/+$/, "");
    const verify_url = `${publicBase}/verify/${existing.token}`;

    const now = new Date().toISOString();

    await run(
      `UPDATE certificates
       SET student_name = ?, student_email = ?, program_title = ?,
           certificate_type = ?, issued_on = ?, duration = ?, verify_url = ?, updated_at = ?
       WHERE id = ?`,
      [
        student_name,
        student_email ?? null,
        program_title,
        certificate_type,
        issued_on,
        duration ?? null,
        verify_url,
        now,
        id,
      ]
    );

    const row = await get(
      `SELECT id, token, certificate_number, student_name, student_email,
              program_title, certificate_type, issued_on, duration, verify_url,
              created_at, updated_at
       FROM certificates WHERE id = ? LIMIT 1`,
      [id]
    );

    res.json(row);
  } catch (e) {
    console.error("UPDATE ERROR:", e?.message || e);
    res.status(500).json({ message: e?.message || "Update failed" });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  await ensureTable();
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    await run(`DELETE FROM certificates WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE ERROR:", e?.message || e);
    res.status(500).json({ message: e?.message || "Delete failed" });
  }
});

// PDF DOWNLOAD
router.get("/:id/pdf", async (req, res) => {
  await ensureTable();

  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid id" });

    const cert = await get(
      `SELECT id, token, certificate_number, student_name, student_email,
              program_title, certificate_type, issued_on, duration, verify_url
       FROM certificates WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!cert) return res.status(404).json({ message: "Not found" });

    const publicBase = getPublicWebBase(req).replace(/\/+$/, "");
    const verifyUrl = cleanStr(cert.verify_url) || `${publicBase}/verify/${cert.token}`;

    const pdfBuffer = await buildPdfBuffer(cert, verifyUrl);
    const safeName = String(cert.certificate_number || "certificate").replace(/[^\w\-]+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);

    return res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error("PDF ERROR:", e?.message || e);
    return res.status(500).json({ message: e?.message || "PDF generation failed" });
  }
});

export default router;
