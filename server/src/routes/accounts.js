// server/routes/accounts.js
import express from "express";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "../db.js"; // MySQL-style db.query()

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------
// Helpers
// ---------------------------
const formatDate = (value) => {
  if (!value) return "-";
  // if already YYYY-MM-DD
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
};

const formatINR = (value) => {
  const n = Number(value || 0);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
};

const resolveLogoPath = () => {
  // Required path: static/assets/vertex_logo.png
  const p1 = path.resolve(process.cwd(), "static", "assets", "vertex_logo.png");
  if (fs.existsSync(p1)) return p1;

  // fallback if server cwd differs
  const p2 = path.resolve(__dirname, "..", "..", "static", "assets", "vertex_logo.png");
  if (fs.existsSync(p2)) return p2;

  return null;
};

function drawInvoicePDF(doc, payload) {
  const {
    invoiceNo,
    issueDate,
    dueDate,
    clientPersonName,
    clientCompanyName,
    clientAddress,
    items,
    subtotal,
    tax,
    total,
    paid,
    balance,
  } = payload;

  // Company block (exact as requested)
  const COMPANY = {
    name: "Vertex Software",
    website: "https://www.vertexsoftware.in/",
    email: "info@vertexsoftware.com",
    phone: "+91 9380729687",
    address:
      "No. 4, CNM Prime City, Nirmala School Road, Kandaya Nagara Main Road, Srirampura 2nd Stage, Mysuru – 570023",
  };

  // Bank details (fill as needed; kept blank-safe)
  const BANK = {
    accountName: "Vertex Software",
    bankName: "",
    accountNumber: "",
    branch: "",
    ifsc: "",
    upi: "",
  };

  const NOTES = [
    "A 50% payment is required upfront before the project begins.",
    "Any additional revisions beyond the agreed scope will be charged separately.",
    "Final designs will be delivered within the agreed timeline.",
    "Final payment upon delivery as agreed.",
  ];

  const M = { L: 50, T: 40, R: 50, B: 40 };
  const pageW = doc.page.width;
  const contentW = pageW - M.L - M.R;

  const colors = {
    text: "#111827",
    muted: "#6B7280",
    border: "#D1D5DB",
    lightBorder: "#E5E7EB",
    headerBg: "#F3F4F6",
  };

  let y = M.T;

  // 1) Header (logo left + company info)
  const logoPath = resolveLogoPath();
  const logoW = 70;
  const logoH = 70;

  if (logoPath) {
    try {
      doc.image(logoPath, M.L, y, { width: logoW });
    } catch {}
  }

  const infoX = M.L + (logoPath ? logoW + 12 : 0);
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(colors.text)
    .text(COMPANY.name, infoX, y);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.muted)
    .text(COMPANY.website, infoX, y + 18)
    .text(`Email: ${COMPANY.email}`, infoX, y + 32)
    .text(`Phone: ${COMPANY.phone}`, infoX, y + 46);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.muted)
    .text(`Address: ${COMPANY.address}`, infoX, y + 60, { width: contentW - (infoX - M.L) });

  y += 100;

  // 2) Title centered + note
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(colors.text)
    .text("INVOICE", M.L, y, { width: contentW, align: "center" });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(colors.muted)
    .text("This invoice is computer generated", M.L, y + 22, { width: contentW, align: "center" });

  y += 55;

  // 3) Bill To (left) + 4) Invoice Meta (right)
  const blockGap = 10;
  const leftW = Math.floor(contentW * 0.58);
  const rightW = contentW - leftW - blockGap;

  // Bill To
  doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.text).text("Bill To", M.L, y);
  doc.font("Helvetica").fontSize(10).fillColor(colors.text);

  let billY = y + 16;
  if (clientPersonName) doc.text(clientPersonName, M.L, billY, { width: leftW });
  billY += 14;
  if (clientCompanyName) doc.text(clientCompanyName, M.L, billY, { width: leftW });
  billY += 14;
  if (clientAddress) doc.text(clientAddress, M.L, billY, { width: leftW });

  // Invoice Meta (right aligned block)
  const metaX = M.L + leftW + blockGap;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.text).text("Invoice Details", metaX, y, { width: rightW, align: "right" });

  const metaRows = [
    ["Invoice No", invoiceNo || "-"],
    ["Issue Date", issueDate || "-"],
    ["Due Date", dueDate || "-"],
  ];

  let metaY = y + 16;
  metaRows.forEach(([k, v]) => {
    doc.font("Helvetica").fontSize(9).fillColor(colors.muted).text(`${k}:`, metaX, metaY, { width: rightW - 90, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(colors.text).text(v, metaX + (rightW - 88), metaY, { width: 88, align: "right" });
    metaY += 14;
  });

  y += 85;

  // Divider
  doc.moveTo(M.L, y).lineTo(M.L + contentW, y).lineWidth(0.8).strokeColor(colors.lightBorder).stroke();
  y += 14;

  // 5) Items Table
  const tableX = M.L;
  const tableW = contentW;

  const colW = {
    idx: 28,
    desc: 270,
    rate: 85,
    qty: 45,
    amt: tableW - (28 + 270 + 85 + 45), // remainder
  };

  const colX = {
    idx: tableX,
    desc: tableX + colW.idx,
    rate: tableX + colW.idx + colW.desc,
    qty: tableX + colW.idx + colW.desc + colW.rate,
    amt: tableX + colW.idx + colW.desc + colW.rate + colW.qty,
  };

  const drawTableHeader = (yy) => {
    const h = 22;

    doc.save();
    doc.fillColor(colors.headerBg).rect(tableX, yy, tableW, h).fill();
    doc.restore();

    doc.rect(tableX, yy, tableW, h).lineWidth(0.8).strokeColor(colors.border).stroke();
    // vertical lines
    doc.moveTo(colX.desc, yy).lineTo(colX.desc, yy + h).strokeColor(colors.border).stroke();
    doc.moveTo(colX.rate, yy).lineTo(colX.rate, yy + h).strokeColor(colors.border).stroke();
    doc.moveTo(colX.qty, yy).lineTo(colX.qty, yy + h).strokeColor(colors.border).stroke();
    doc.moveTo(colX.amt, yy).lineTo(colX.amt, yy + h).strokeColor(colors.border).stroke();

    doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.text);
    doc.text("#", colX.idx + 6, yy + 6, { width: colW.idx - 12, align: "left" });
    doc.text("Item Description", colX.desc + 6, yy + 6, { width: colW.desc - 12, align: "left" });
    doc.text("Rate (INR)", colX.rate + 6, yy + 6, { width: colW.rate - 12, align: "right" });
    doc.text("Qty", colX.qty + 6, yy + 6, { width: colW.qty - 12, align: "right" });
    doc.text("Amount (INR)", colX.amt + 6, yy + 6, { width: colW.amt - 12, align: "right" });

    return yy + h;
  };

  const ensurePageForRow = (neededH) => {
    // keep enough space for totals + bank + notes + footer later
    const safeBottom = doc.page.height - M.B - 280;
    if (y + neededH > safeBottom) {
      doc.addPage();
      y = M.T;
      y = drawTableHeader(y);
    }
  };

  y = drawTableHeader(y);

  doc.font("Helvetica").fontSize(9).fillColor(colors.text);

  (items || []).forEach((it, i) => {
    const desc = String(it.description || it.service || "Item");
    const qty = Number(it.quantity || it.qty || 0);
    const rate = Number(it.unit_price ?? it.rate ?? 0);
    const amount = qty * rate;

    const descH = doc.heightOfString(desc, { width: colW.desc - 12 });
    const rowH = Math.max(20, descH + 10);

    ensurePageForRow(rowH);

    // row border
    doc.rect(tableX, y, tableW, rowH).lineWidth(0.8).strokeColor(colors.border).stroke();
    // vertical lines
    doc.moveTo(colX.desc, y).lineTo(colX.desc, y + rowH).strokeColor(colors.border).stroke();
    doc.moveTo(colX.rate, y).lineTo(colX.rate, y + rowH).strokeColor(colors.border).stroke();
    doc.moveTo(colX.qty, y).lineTo(colX.qty, y + rowH).strokeColor(colors.border).stroke();
    doc.moveTo(colX.amt, y).lineTo(colX.amt, y + rowH).strokeColor(colors.border).stroke();

    const padY = y + 5;
    doc.text(String(i + 1), colX.idx + 6, padY, { width: colW.idx - 12, align: "left" });
    doc.text(desc, colX.desc + 6, padY, { width: colW.desc - 12, align: "left" });
    doc.text(formatINR(rate), colX.rate + 6, padY, { width: colW.rate - 12, align: "right" });
    doc.text(String(qty), colX.qty + 6, padY, { width: colW.qty - 12, align: "right" });
    doc.text(formatINR(amount), colX.amt + 6, padY, { width: colW.amt - 12, align: "right" });

    y += rowH;
  });

  y += 14;

  // If remaining space is not enough for sections, move to next page
  const remainingNeed = 260;
  if (y + remainingNeed > doc.page.height - M.B) {
    doc.addPage();
    y = M.T;
  }

  // 6) Totals (Right aligned)
  const totalsW = 220;
  const totalsX = M.L + contentW - totalsW;

  const writeTotalRow = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(colors.text);
    doc.text(label, totalsX, y, { width: totalsW - 90, align: "left" });
    doc.text(value, totalsX + (totalsW - 90), y, { width: 90, align: "right" });
    y += 16;
  };

  writeTotalRow("Subtotal", formatINR(subtotal));
  writeTotalRow("Tax", formatINR(tax)); // must show 0.00 if not applicable
  writeTotalRow("Total", formatINR(total), true);
  writeTotalRow("Paid", formatINR(paid));
  writeTotalRow("Balance Due", formatINR(balance), true);

  y += 18;

  // 7) Bank Details Section
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.text).text("Bank Details", M.L, y);
  y += 12;

  const bankRows = [
    ["Account Name", BANK.accountName || ""],
    ["Bank Name", BANK.bankName || ""],
    ["Account Number", BANK.accountNumber || ""],
    ["Branch", BANK.branch || ""],
    ["IFSC Code", BANK.ifsc || ""],
    ["UPI ID", BANK.upi || ""],
  ];

  const labelW = 120;
  const valueW = contentW - labelW;

  bankRows.forEach(([k, v]) => {
    doc.font("Helvetica").fontSize(9).fillColor(colors.muted).text(`${k}:`, M.L, y, { width: labelW });
    doc.font("Helvetica").fontSize(9).fillColor(colors.text).text(v, M.L + labelW, y, { width: valueW });
    y += 14;
  });

  y += 10;

  // 8) Notes Section (exact points)
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.text).text("Notes", M.L, y);
  y += 12;

  doc.font("Helvetica").fontSize(9).fillColor(colors.text);
  NOTES.forEach((t, idx) => {
    doc.text(`${idx + 1}. ${t}`, M.L, y, { width: contentW });
    y += 14;
  });

  y += 20;

  // 9) Footer: Authorized sign + reserved spaces
  doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.text).text("Chandan G Head of the Company", M.L, y);
  y += 24;

  const boxW = 180;
  const boxH = 60;
  const sealX = M.L + contentW - (boxW * 2 + 16);
  const signX = M.L + contentW - boxW;

  doc.font("Helvetica").fontSize(9).fillColor(colors.muted).text("Company seal (future)", sealX, y - 12, { width: boxW, align: "center" });
  doc.rect(sealX, y, boxW, boxH).strokeColor(colors.border).lineWidth(0.8).stroke();

  doc.font("Helvetica").fontSize(9).fillColor(colors.muted).text("Signature (future)", signX, y - 12, { width: boxW, align: "center" });
  doc.rect(signX, y, boxW, boxH).strokeColor(colors.border).lineWidth(0.8).stroke();
}

// ---------------------------------------------------------------------------
// ONLY ENDPOINT: GET /accounts/invoices/:id/pdf
// ---------------------------------------------------------------------------
router.get("/accounts/invoices/:id/pdf", async (req, res, next) => {
  const invoiceId = req.params.id;

  try {
    // Invoice + client (no schema change)
    const [invoiceRows] = await db.query(
      `
      SELECT i.*,
             c.name            AS client_company_name,
             c.contact_person  AS client_person_name,
             c.billing_address AS client_address
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = ?
      `,
      [invoiceId]
    );

    if (!invoiceRows.length) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const inv = invoiceRows[0];

    // Items (no schema change)
    let items = [];
    try {
      const [rows] = await db.query(
        `
        SELECT description, quantity, unit_price
        FROM invoice_items
        WHERE invoice_id = ?
        ORDER BY id ASC
        `,
        [invoiceId]
      );
      items = rows || [];
    } catch {
      items = [];
    }

    // Fallback if no items
    if (!items.length) {
      const fallbackAmount = Number(inv.amount || 0);
      items = [
        {
          description: inv.description || "Services",
          quantity: 1,
          unit_price: fallbackAmount,
        },
      ];
    }

    const subtotal = items.reduce(
      (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0),
      0
    );

    // Tax: show 0.00 if not applicable
    const gstApplicable = !!inv.gst_applicable;
    const TAX_RATE = 0.0; // keep 0 unless you want GST calc; requirement says show 0.00 if not applicable
    const tax = gstApplicable ? subtotal * 0.18 : subtotal * TAX_RATE;

    const total = subtotal + tax;

    // Paid: prefer invoice.paid if exists; else sum payments if table exists
    let paid = Number(inv.paid || 0);
    if (!paid) {
      try {
        const [payRows] = await db.query(
          `SELECT IFNULL(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?`,
          [invoiceId]
        );
        paid = Number(payRows?.[0]?.paid || 0);
      } catch {}
    }

    const balance = Math.max(total - paid, 0);

    // Create PDF
    const doc = new PDFDocument({ size: "A4", margins: { top: 40, left: 50, right: 50, bottom: 40 } });

    const filename = `Invoice-${inv.invoice_number || invoiceId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

    doc.pipe(res);

    drawInvoicePDF(doc, {
      invoiceNo: inv.invoice_number || String(invoiceId),
      issueDate: formatDate(inv.issue_date),
      dueDate: formatDate(inv.due_date),
      clientPersonName: inv.client_person_name || inv.client_company_name || "",
      clientCompanyName: inv.client_company_name || "",
      clientAddress: inv.client_address || "",
      items,
      subtotal,
      tax,
      total,
      paid,
      balance,
    });

    doc.end();
  } catch (err) {
    console.error("Error generating invoice PDF", err);
    next(err);
  }
});

export default router;
