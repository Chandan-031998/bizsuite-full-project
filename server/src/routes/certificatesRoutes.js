// server/src/routes/certificatesRoutes.js
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import QRCode from "qrcode";
import PDFDocument from "pdfkit";

import { run, get, all } from "../db.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "certificates");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const clean = (s) => String(s || "").trim();
const safeFile = (s) =>
  clean(s)
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

const toYMD = (v) => {
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const buildPublicBase = (req) => {
  // BEST: explicit env (production / LAN test)
  const envBase = clean(process.env.PUBLIC_APP_URL);
  if (envBase) return envBase.replace(/\/+$/, "");

  // fallback: origin from browser
  const origin = clean(req.get("origin"));
  if (origin) return origin.replace(/\/+$/, "");

  // last fallback
  return "http://localhost:5173";
};

async function generateCertificatePdf({
  certificate_number,
  token,
  verify_url,
  student_name,
  student_email,
  program_title,
  certificate_type,
  issued_on,
  duration,
}) {
  const qrPng = await QRCode.toBuffer(verify_url, { type: "png", margin: 1, scale: 7 });

  const fileName = `${safeFile(certificate_number)}_${safeFile(student_name)}.pdf`;
  const absPath = path.join(UPLOAD_DIR, fileName);
  const relPath = path.join("uploads", "certificates", fileName).replace(/\\/g, "/");

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });

    const out = fs.createWriteStream(absPath);
    out.on("finish", resolve);
    out.on("error", reject);

    doc.pipe(out);

    // Border
    doc
      .rect(25, 25, doc.page.width - 50, doc.page.height - 50)
      .lineWidth(2)
      .strokeColor("#2d4bd8")
      .stroke();

    // Title
    doc
      .font("Helvetica-Bold")
      .fontSize(34)
      .fillColor("#0b1020")
      .text("CERTIFICATE", 0, 85, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor("#0b1020")
      .text("This is to certify that", 0, 145, { align: "center" });

    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .text(student_name, 0, 175, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(13)
      .text("has successfully completed", 0, 220, { align: "center" });

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(program_title, 0, 250, { align: "center" });

    // Meta left
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#1f2a44")
      .text(`Type: ${certificate_type}`, 90, 345);

    doc.text(`Issued On: ${issued_on}`, 90, 365);

    if (student_email) doc.text(`Email: ${student_email}`, 90, 385);
    if (duration) doc.text(`Duration: ${duration}`, 90, 405);

    // QR right
    doc.image(qrPng, doc.page.width - 190, 330, { fit: [130, 130] });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#334155")
      .text("Scan to verify", doc.page.width - 190, 465, {
        width: 130,
        align: "center",
      });

    // Footer
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#475569")
      .text(`Certificate No: ${certificate_number}`, 90, 510);

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text(verify_url, 90, 528, { width: doc.page.width - 180 });

    doc.end();
  });

  return { absPath, relPath, fileName };
}

/* =========================
   ADMIN: LIST
========================= */
router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  async (_req, res) => {
    try {
      const rows = await all(
        `SELECT id, token, certificate_number, student_name, student_email,
                program_title, certificate_type, issued_on, duration, verify_url, pdf_path,
                created_at, updated_at
         FROM certificates
         ORDER BY id DESC
         LIMIT 50`
      );

      // helpful URL for frontend
      const data = rows.map((r) => ({
        ...r,
        pdf_url: r.pdf_path ? `/${r.pdf_path}` : null,
      }));

      res.json(data);
    } catch (e) {
      res.status(500).json({ message: "Failed to load certificates", detail: e?.message });
    }
  }
);

/* =========================
   PUBLIC: VERIFY BY TOKEN
========================= */
router.get("/verify/:token", async (req, res) => {
  try {
    const token = clean(req.params.token);
    const row = await get(
      `SELECT certificate_number, student_name, student_email, program_title,
              certificate_type, issued_on, duration, created_at
       FROM certificates
       WHERE token = ?`,
      [token]
    );

    res.setHeader("Cache-Control", "no-store");

    if (!row) {
      return res.status(404).json({ valid: false, message: "Invalid certificate" });
    }

    return res.json({
      valid: true,
      message: "Valid certificate",
      ...row,
    });
  } catch (e) {
    res.status(500).json({ valid: false, message: "Verify failed", detail: e?.message });
  }
});

/* =========================
   ADMIN: CREATE + PDF + QR
========================= */
router.post(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const student_name = clean(req.body.student_name);
      const program_title = clean(req.body.program_title);
      const issued_on = toYMD(req.body.issued_on);

      const student_email = clean(req.body.student_email);
      const certificate_type = clean(req.body.certificate_type || "Course Completion");
      const duration = clean(req.body.duration);

      if (!student_name || !program_title || !issued_on) {
        return res.status(400).json({
          message: "student_name, program_title, issued_on are required",
        });
      }

      const token = crypto.randomBytes(16).toString("hex"); // 32 chars
      const year = issued_on.slice(0, 4);
      const certificate_number = `VTX-${year}-${token.slice(0, 8).toUpperCase()}`;

      const base = buildPublicBase(req);
      const verify_url = `${base}/verify/${token}`;

      // Generate PDF (includes QR)
      const { relPath } = await generateCertificatePdf({
        certificate_number,
        token,
        verify_url,
        student_name,
        student_email,
        program_title,
        certificate_type,
        issued_on,
        duration,
      });

      const created_by = req.user?.id || null;

      const r = await run(
        `INSERT INTO certificates
          (token, certificate_number, student_name, student_email, program_title, certificate_type, issued_on, duration, verify_url, pdf_path, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          token,
          certificate_number,
          student_name,
          student_email || null,
          program_title,
          certificate_type,
          issued_on,
          duration || null,
          verify_url,
          relPath,
          created_by,
        ]
      );

      const row = await get(`SELECT * FROM certificates WHERE id = ?`, [r.id]);
      res.json({ ...row, pdf_url: row.pdf_path ? `/${row.pdf_path}` : null });
    } catch (e) {
      res.status(500).json({ message: "Create failed", detail: e?.message });
    }
  }
);

/* =========================
   ADMIN: DOWNLOAD PDF
========================= */
router.get(
  "/:id/pdf",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = await get(`SELECT pdf_path, certificate_number, student_name FROM certificates WHERE id = ?`, [id]);
      if (!row || !row.pdf_path) return res.status(404).json({ message: "PDF not found" });

      const abs = path.join(process.cwd(), row.pdf_path);
      if (!fs.existsSync(abs)) return res.status(404).json({ message: "PDF missing on disk" });

      const filename = `${safeFile(row.certificate_number)}_${safeFile(row.student_name)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      fs.createReadStream(abs).pipe(res);
    } catch (e) {
      res.status(500).json({ message: "Download failed", detail: e?.message });
    }
  }
);

/* =========================
   ADMIN: UPDATE (regenerates PDF)
========================= */
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await get(`SELECT * FROM certificates WHERE id = ?`, [id]);
      if (!existing) return res.status(404).json({ message: "Not found" });

      const student_name = clean(req.body.student_name || existing.student_name);
      const program_title = clean(req.body.program_title || existing.program_title);
      const issued_on = toYMD(req.body.issued_on || existing.issued_on);

      const student_email = clean(req.body.student_email || existing.student_email);
      const certificate_type = clean(req.body.certificate_type || existing.certificate_type);
      const duration = clean(req.body.duration || existing.duration);

      if (!student_name || !program_title || !issued_on) {
        return res.status(400).json({ message: "student_name, program_title, issued_on are required" });
      }

      // rebuild verify URL (important when moving from localhost to domain)
      const base = buildPublicBase(req);
      const verify_url = `${base}/verify/${existing.token}`;

      // regenerate pdf
      const { relPath } = await generateCertificatePdf({
        certificate_number: existing.certificate_number,
        token: existing.token,
        verify_url,
        student_name,
        student_email,
        program_title,
        certificate_type,
        issued_on,
        duration,
      });

      await run(
        `UPDATE certificates
         SET student_name=?, student_email=?, program_title=?, certificate_type=?, issued_on=?, duration=?, verify_url=?, pdf_path=?
         WHERE id=?`,
        [
          student_name,
          student_email || null,
          program_title,
          certificate_type,
          issued_on,
          duration || null,
          verify_url,
          relPath,
          id,
        ]
      );

      const row = await get(`SELECT * FROM certificates WHERE id = ?`, [id]);
      res.json({ ...row, pdf_url: row.pdf_path ? `/${row.pdf_path}` : null });
    } catch (e) {
      res.status(500).json({ message: "Update failed", detail: e?.message });
    }
  }
);

/* =========================
   ADMIN: DELETE
========================= */
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = await get(`SELECT pdf_path FROM certificates WHERE id = ?`, [id]);
      if (!row) return res.status(404).json({ message: "Not found" });

      await run(`DELETE FROM certificates WHERE id = ?`, [id]);

      // best-effort delete file
      if (row.pdf_path) {
        const abs = path.join(process.cwd(), row.pdf_path);
        try {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {}
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Delete failed", detail: e?.message });
    }
  }
);

export default router;
