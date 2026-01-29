import express from "express";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { all, get, run } from "../db.js";
import { authenticateToken, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(authenticateToken);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- Helpers ---------------- */
const formatDate = (value) => {
  if (!value) return "-";
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
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "vertex-logo.png"),
    path.join(__dirname, "..", "..", "assets", "vertex_logo.png"),
    path.join(__dirname, "..", "..", "assets", "vertex.png"),
    path.resolve(process.cwd(), "assets", "vertex-logo.png"),
    path.resolve(process.cwd(), "assets", "vertex_logo.png"),
    path.resolve(process.cwd(), "assets", "vertex.png"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
};

const resolveSignaturePath = () => {
  const candidates = [
    path.join(__dirname, "..", "..", "assets", "sign.png"),
    path.join(__dirname, "..", "..", "assets", "signature.png"),
    path.resolve(process.cwd(), "assets", "sign.png"),
    path.resolve(process.cwd(), "assets", "signature.png"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
};

const hexToRgb = (hex) => {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const lerp = (a, b, t) => a + (b - a) * t;

const rgbToHex = ({ r, g, b }) => {
  const to = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
};

const lerpHex = (c1, c2, t) => {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return rgbToHex({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
};

const drawHorizontalGradient = (doc, x, y, w, h, leftHex, rightHex, steps = 90) => {
  const stepW = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 1 : i / (steps - 1);
    doc
      .save()
      .fillColor(lerpHex(leftHex, rightHex, t))
      .rect(x + i * stepW, y, Math.ceil(stepW + 0.25), h)
      .fill()
      .restore();
  }
};

/* ---- NEW: status/boolean/number helpers (fix "Completed" + avoid 500) ---- */
const normalizeStatus = (raw) => {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "completed" || s === "complete") return "paid";
  if (s === "unpaid") return "due";
  if (s === "paid" || s === "due" || s === "partial") return s;
  return null;
};

const parseBool01 = (v) => {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v ? 1 : 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return 1;
    if (s === "false" || s === "0") return 0;
  }
  return null;
};

const toNumberOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toIsoOrNull = (v) => {
  if (v === undefined) return undefined; // means "not provided"
  if (v === null) return null; // explicit null
  const s = String(v).trim();
  if (!s) return null; // empty => clear
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
};

const computeTotals = async (invoiceId) => {
  const totals = await get(
    `SELECT
       COALESCE((SELECT SUM(quantity * unit_price) FROM invoice_items WHERE invoice_id = ?), 0) AS total,
       COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = ?), 0) AS paid`,
    [invoiceId, invoiceId]
  );
  const total = Number(totals?.total || 0);
  const paid = Number(totals?.paid || 0);
  let status = "due";
  if (paid >= total && total > 0) status = "paid";
  else if (paid > 0) status = "partial";
  return { total, paid, status };
};

/* ---------------- Next invoice number ---------------- */
const generateNextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `VS-${year}-`;

  const last = await get(
    `SELECT invoice_number
     FROM invoices
     WHERE invoice_number LIKE ?
     ORDER BY id DESC
     LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSeq = 1;
  if (last && last.invoice_number) {
    const match = String(last.invoice_number).match(/(\d+)$/);
    if (match) nextSeq = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
};

const normalizeItem = (item, fallbackDescription = "Services") => {
  const qtyRaw = item.quantity !== undefined && item.quantity !== null ? item.quantity : item.qty;
  const rateRaw = item.unit_price !== undefined && item.unit_price !== null ? item.unit_price : item.rate;

  const quantity = Number(qtyRaw ?? 1) || 1;
  const unitPrice = Number(rateRaw ?? 0) || 0;

  const description = item.description || item.service || fallbackDescription || "Services";

  return { description, quantity, unitPrice, accountId: item.account_id || null };
};

/* ---------------- PDF Renderer (Single Page, Compact, Professional) ---------------- */
/* ---------------- PDF Renderer (more spacing + one-page feel) ---------------- */
function drawInvoicePDF(doc, payload) {
  const {
    invoiceNo,
    issueDate,
    dueDate,
    billToName,
    billToCompany,
    billToAddress,
    items,
    subtotal,
    cgst,
    sgst,
    total,
  } = payload;

  const COMPANY = {
    name: "Vertex Software",
    tagline: "Software Development & Services",
    gstin: "29CNGPC2359M1ZN",
    addressLines: [
      "2ND AND 3RD FLOOR,",
      "No. 472/7, Balaji Arcade,",
      "20th L Cross Road,",
      "Bengaluru, Bengaluru Urban,",
      "Karnataka – 560034",
    ],
  };

  const BANK = {
    accountName: "Chandan G", // ✅ changed
    bankName: "Axis Bank",
    accountNumber: "922010030814228",
    branch: "Mysore",
    ifsc: "UTIB0000151",
    upi: "9945943353-2@axl",
  };

  const NOTES = [
    "A 50% payment is required upfront before the project begins.",
    "Any additional revisions beyond the agreed scope will be charged separately.",
    "Final designs will be delivered within the agreed timeline.",
    "Final payment upon delivery as agreed.",
  ];

  const FOOTER_CONTACT = {
    website: "www.vertexsoftware.in",
    phone: "9380729687",
    email: "reachvertexsoftware@gmail.com",
  };

  const colors = {
    text: "#111827",
    muted: "#6B7280",
    border: "#D1D5DB",
    lightBg: "#F8FAFC",
    gradLeft: "#1D4ED8",
    gradRight: "#6D28D9",
  };

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  // Slightly tighter margins, but MORE internal spacing (looks airy)
  const M = { L: 55, T: 40, R: 55, B: 40 };
  const contentW = pageW - M.L - M.R;

  // Footer
  const FOOTER_BAR_H = 18;
  const FOOTER_ROW_H = 26;
  const FOOTER_H = FOOTER_ROW_H + FOOTER_BAR_H;
  const footerTopY = pageH - M.B - FOOTER_H;
  const maxY = footerTopY - 10;

  // Spacing tokens (more breathing room)
  const GAP = { XS: 6, SM: 10, MD: 16, LG: 22 };

  const logoPath = resolveLogoPath();
  const signaturePath = resolveSignaturePath();

  const divider = (y) => {
    doc.save();
    doc.strokeColor("#E5E7EB").lineWidth(1);
    doc.moveTo(M.L, y).lineTo(pageW - M.R, y).stroke();
    doc.restore();
  };

  const applyWatermark = () => {
    doc.save();
    doc.opacity(0.06);
    if (logoPath) {
      const wmW = 420;
      const wmX = (pageW - wmW) / 2;
      const wmY = (pageH - wmW) / 2;
      try {
        doc.image(logoPath, wmX, wmY, { width: wmW });
      } catch {}
    }
    doc.restore();
    doc.opacity(1);
  };

  const drawIconWeb = (cx, cy, r, fill) => {
    doc.save();
    doc.fillColor(fill).circle(cx, cy, r).fill();
    doc.strokeColor("#FFFFFF").lineWidth(1);
    doc.circle(cx, cy, r - 4).stroke();
    doc.moveTo(cx - (r - 5), cy).lineTo(cx + (r - 5), cy).stroke();
    doc.moveTo(cx, cy - (r - 5)).lineTo(cx, cy + (r - 5)).stroke();
    doc.restore();
  };

  const drawIconPhone = (cx, cy, r, fill) => {
    doc.save();
    doc.fillColor(fill).circle(cx, cy, r).fill();
    doc.strokeColor("#FFFFFF").lineWidth(1.2);
    doc.moveTo(cx - 4, cy - 1).lineTo(cx - 1, cy + 2).lineTo(cx + 4, cy - 2).stroke();
    doc.restore();
  };

  const drawIconMail = (cx, cy, r, fill) => {
    doc.save();
    doc.fillColor(fill).circle(cx, cy, r).fill();
    doc.strokeColor("#FFFFFF").lineWidth(1);
    const w = 10,
      h = 7;
    const x = cx - w / 2,
      y = cy - h / 2;
    doc.rect(x, y, w, h).stroke();
    doc.moveTo(x, y).lineTo(cx, cy).lineTo(x + w, y).stroke();
    doc.restore();
  };

  const drawFooter = () => {
    const rowY = footerTopY;
    doc.save();
    doc.fillColor(colors.lightBg).rect(0, rowY, pageW, FOOTER_ROW_H).fill();
    doc.restore();

    const third = pageW / 3;
    const yText = rowY + 6;

    const drawFooterItem = (centerX, iconFn, iconFill, text) => {
      const iconR = 9;
      const iconX = centerX - 72;
      const iconY = rowY + FOOTER_ROW_H / 2;
      iconFn(iconX, iconY, iconR, iconFill);

      doc.font("Helvetica").fontSize(9).fillColor(colors.muted);
      doc.text(text, iconX + 16, yText, { width: 180, align: "left" });
    };

    drawFooterItem(third * 0.5, drawIconWeb, "#7C3AED", FOOTER_CONTACT.website);
    drawFooterItem(third * 1.5, drawIconPhone, "#EC4899", FOOTER_CONTACT.phone);
    drawFooterItem(third * 2.5, drawIconMail, "#6D28D9", FOOTER_CONTACT.email);

    const barY = footerTopY + FOOTER_ROW_H;
    drawHorizontalGradient(doc, 0, barY, pageW, FOOTER_BAR_H, colors.gradLeft, colors.gradRight, 120);
  };

  const drawHeader = () => {
    doc.font("Helvetica").fontSize(8).fillColor(colors.muted);
    doc.text("*This Invoice is Computer Generated", M.L, 18);

    const topY = 44;

    // Left title
    doc.font("Helvetica-Bold").fontSize(18).fillColor(colors.text);
    doc.text("INVOICE", M.L, topY);

    // Logo
    const logoW = 80;
    const logoX = pageW - M.R - logoW;
    const logoY = topY - 6;
    if (logoPath) {
      try {
        doc.image(logoPath, logoX, logoY, { width: logoW });
      } catch {}
    }

    // Right block (more line spacing)
    const nameX = logoX - 190;
    const rightW = 180;
    let ry = topY;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.text);
    doc.text(COMPANY.name, nameX, ry, { width: rightW, align: "right" });
    ry += 14;

    doc.font("Helvetica").fontSize(8.2).fillColor(colors.muted);
    doc.text(COMPANY.tagline, nameX, ry, { width: rightW, align: "right" });
    ry += 12;

    doc.font("Helvetica-Bold").fontSize(8.2).fillColor(colors.text);
    doc.text(`GSTIN: ${COMPANY.gstin}`, nameX, ry, { width: rightW, align: "right" });
    ry += 12;

    doc.font("Helvetica").fontSize(8.2).fillColor(colors.muted);
    const addrBlock = COMPANY.addressLines.join("\n");
    const addrH = doc.heightOfString(addrBlock, { width: rightW, align: "right", lineGap: 2 });
    doc.text(addrBlock, nameX, ry, { width: rightW, align: "right", lineGap: 2 });
    ry += addrH;

    const headerBottom = Math.max(ry, topY + 26) + 10;
    divider(headerBottom);

    return headerBottom + 14;
  };

  const drawTableHeader = (x, y, w, cols) => {
    const h = 24; // a bit taller
    drawHorizontalGradient(doc, x, y, w, h, colors.gradLeft, colors.gradRight, 120);

    doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(colors.border).stroke();
    [cols.desc.x, cols.rate.x, cols.qty.x, cols.amt.x].forEach((vx) => {
      doc.moveTo(vx, y).lineTo(vx, y + h).strokeColor(colors.border).stroke();
    });

    doc.font("Helvetica-Bold").fontSize(8.2).fillColor("#FFFFFF");
    doc.text("Item", cols.item.x + 8, y + 7, { width: cols.item.w - 16, align: "left" });
    doc.text("Description", cols.desc.x + 8, y + 7, { width: cols.desc.w - 16, align: "left" });
    doc.text("Rate (INR)", cols.rate.x + 8, y + 7, { width: cols.rate.w - 16, align: "right" });
    doc.text("Qty", cols.qty.x + 8, y + 7, { width: cols.qty.w - 16, align: "right" });
    doc.text("Amount (INR)", cols.amt.x + 8, y + 7, { width: cols.amt.w - 16, align: "right" });

    doc.font("Helvetica").fontSize(9).fillColor(colors.text);
    return y + h;
  };

  const startPage = () => {
    applyWatermark();
    drawFooter();
    return drawHeader();
  };

  let y = startPage();

  /* ---------------- Bill To + Meta (with lineGap) ---------------- */
  const headerTopY = y;
  const leftW = 300;
  const rightW = 240;
  const rightX = M.L + contentW - rightW;

  const billToLines = ["", billToName, billToCompany, billToAddress]
    .filter((v) => v && String(v).trim())
    .map((v) => String(v).trim());

  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(colors.text);
  doc.text("Bill To", M.L, headerTopY);

  doc.font("Helvetica").fontSize(9.2).fillColor(colors.text);
  const billToBlock = billToLines.join("\n");
  doc.text(billToBlock, M.L, headerTopY + 14, { width: leftW, lineGap: 2 });

  // Meta labels
  doc.font("Helvetica-Bold").fontSize(9.2).fillColor(colors.text);
  doc.text("Invoice Number", rightX, headerTopY, { width: 120, align: "left" });
  doc.text("Issue Date", rightX, headerTopY + 16, { width: 120, align: "left" });
  doc.text("Due Date", rightX, headerTopY + 32, { width: 120, align: "left" });

  // Meta values
  doc.font("Helvetica").fontSize(9.2).fillColor(colors.text);
  doc.text(String(invoiceNo || "-"), rightX + 120, headerTopY, { width: rightW - 120, align: "right" });
  doc.text(String(issueDate || "-"), rightX + 120, headerTopY + 16, { width: rightW - 120, align: "right" });
  doc.text(String(dueDate || "-"), rightX + 120, headerTopY + 32, { width: rightW - 120, align: "right" });

  const billToH = doc.heightOfString(billToBlock, { width: leftW, lineGap: 2 });
  y = headerTopY + 14 + Math.max(billToH, 46) + GAP.MD;

  /* ---------------- Items table (more padding) ---------------- */
  const tableX = M.L;
  const tableW = contentW;

  const cols = {
    item: { x: tableX, w: 58 },
    desc: { x: 0, w: 0 },
    rate: { x: 0, w: 95 },
    qty: { x: 0, w: 70 },
    amt: { x: 0, w: 120 },
  };

  cols.desc.w = tableW - (cols.item.w + cols.rate.w + cols.qty.w + cols.amt.w);
  cols.desc.x = cols.item.x + cols.item.w;
  cols.rate.x = cols.desc.x + cols.desc.w;
  cols.qty.x = cols.rate.x + cols.rate.w;
  cols.amt.x = cols.qty.x + cols.qty.w;

  y = drawTableHeader(tableX, y, tableW, cols);

  const rows = Array.isArray(items) ? items : [];
  const minRowH = 28;
  const padY = 8;

  if (rows.length === 0) {
    const rowH = minRowH;
    doc.rect(tableX, y, tableW, rowH).lineWidth(0.8).strokeColor(colors.border).stroke();
    [cols.desc.x, cols.rate.x, cols.qty.x, cols.amt.x].forEach((vx) => {
      doc.moveTo(vx, y).lineTo(vx, y + rowH).strokeColor(colors.border).stroke();
    });
    doc.font("Helvetica").fontSize(9).fillColor(colors.muted);
    doc.text("No items", cols.desc.x + 8, y + padY, { width: cols.desc.w - 16, align: "left" });
    y += rowH;
  } else {
    rows.forEach((it, idx) => {
      const desc = String(it.description || "Item");
      const qty = Number(it.quantity || 0);
      const rate = Number(it.unit_price || 0);
      const amount = qty * rate;

      doc.font("Helvetica").fontSize(9.2).fillColor(colors.text);
      const descH = doc.heightOfString(desc, { width: cols.desc.w - 16, lineGap: 2 });
      const rowH = Math.max(minRowH, descH + (padY * 2));

      // One-page expectation: if overflow, we still try to keep it (no new page)
      if (y + rowH > maxY - 220) {
        // shrink slightly instead of adding new page (keeps one page)
        doc.fontSize(8.6);
      }

      doc.rect(tableX, y, tableW, rowH).lineWidth(0.8).strokeColor(colors.border).stroke();
      [cols.desc.x, cols.rate.x, cols.qty.x, cols.amt.x].forEach((vx) => {
        doc.moveTo(vx, y).lineTo(vx, y + rowH).strokeColor(colors.border).stroke();
      });

      const py = y + padY;
      doc.text(String(idx + 1), cols.item.x + 8, py, { width: cols.item.w - 16, align: "left" });
      doc.text(desc, cols.desc.x + 8, py, { width: cols.desc.w - 16, align: "left", lineGap: 2 });
      doc.text(formatINR(rate), cols.rate.x + 8, py, { width: cols.rate.w - 16, align: "right" });
      doc.text(String(qty), cols.qty.x + 8, py, { width: cols.qty.w - 16, align: "right" });
      doc.text(formatINR(amount), cols.amt.x + 8, py, { width: cols.amt.w - 16, align: "right" });

      y += rowH;
    });
  }

  y += GAP.LG;

  /* ---------------- Bank + Totals (clean, roomy) ---------------- */
  const bankGap = 18;
  let totalsW = 300;
  let totalsX = M.L + contentW - totalsW;
  const bankX = M.L;
  const bankW = totalsX - bankX - bankGap;

  // Totals box (no Amount Received)
  const totalsBoxH = 92;
  doc.rect(totalsX, y, totalsW, totalsBoxH).strokeColor(colors.border).lineWidth(0.9).stroke();

  const rowGap = 18;
  const tRow = (label, value, rowIndex, bold = false) => {
    const ry = y + 14 + rowIndex * rowGap;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(colors.text);
    doc.text(label, totalsX + 14, ry, { width: 180, align: "left" });
    doc.text(value, totalsX + 14, ry, { width: totalsW - 28, align: "right" });
  };

  tRow("Subtotal", formatINR(subtotal), 0);
  tRow("CGST (9%)", formatINR(cgst), 1);
  tRow("SGST (9%)", formatINR(sgst), 2);
  tRow("Grand Total", formatINR(total), 3, true);

  // Bank block (more line gap)
  doc.font("Helvetica-Bold").fontSize(12).fillColor(colors.text);
  doc.text("Bank Details", bankX, y, { width: bankW });

  const bankLines = [
    ["Account name :", BANK.accountName],
    ["Bank name :", BANK.bankName],
    ["Account no. :", BANK.accountNumber],
    ["Branch :", BANK.branch],
    ["IFSC code :", BANK.ifsc],
    ["UPI :", BANK.upi],
  ];

  const labelW = Math.min(122, Math.max(100, Math.round(bankW * 0.45)));
  const valueX = bankX + labelW;
  const valueW = Math.max(70, bankW - labelW);

  doc.font("Helvetica").fontSize(9.2);
  let bY = y + 20;

  bankLines.forEach(([k, v]) => {
    const key = String(k);
    const val = String(v ?? "");

    doc.fillColor(colors.muted);
    const hKey = doc.heightOfString(key, { width: labelW });

    doc.fillColor(colors.text);
    const hVal = doc.heightOfString(val, { width: valueW });

    const rowH = Math.max(16, hKey, hVal) + 2;

    doc.fillColor(colors.muted).text(key, bankX, bY, { width: labelW, align: "left" });
    doc.fillColor(colors.text).text(val, valueX, bY, { width: valueW, align: "left" });

    bY += rowH;
  });

  y = Math.max(bY, y + totalsBoxH) + GAP.LG;

  /* ---------------- Notes (more readable) ---------------- */
  doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.text);
  doc.text("Notes", M.L, y);

  const notesW = Math.round(contentW * 0.62);
  doc.font("Helvetica").fontSize(9.2).fillColor(colors.text);

  let ny = y + 16;
  NOTES.forEach((t, i) => {
    const line = `${i + 1}. ${t}`;
    const h = doc.heightOfString(line, { width: notesW, lineGap: 2 });
    doc.text(line, M.L, ny, { width: notesW, align: "left", lineGap: 2 });
    ny += Math.max(14, h + 2);
  });

  /* ---------------- Signature (push down to use bottom whitespace) ---------------- */
  const sigBoxW = 210;
  const sigBoxH = 64;
  const sigX = pageW - M.R - sigBoxW;

  // Signature block total height:
  const sigTotalH = 14 + 14 + 14 + 12 + sigBoxH; // approx
  const sigStartIdeal = footerTopY - sigTotalH - 8; // anchor above footer
  const sigY = Math.max(sigStartIdeal, y); // push down if there's space

  doc.font("Helvetica-Bold").fontSize(10).fillColor(colors.text);
  doc.text("Chandan G", sigX, sigY, { width: sigBoxW, align: "right" });

  doc.font("Helvetica").fontSize(9).fillColor(colors.muted);
  doc.text("Head of the Company", sigX, sigY + 14, { width: sigBoxW, align: "right" });

  doc.font("Helvetica").fontSize(8.6).fillColor(colors.muted);
  doc.text("Signature / Seal", sigX, sigY + 30, { width: sigBoxW, align: "right" });

  const boxY = sigY + 44;
  doc.rect(sigX, boxY, sigBoxW, sigBoxH).strokeColor(colors.border).lineWidth(0.9).stroke();

  if (signaturePath) {
    try {
      const pad = 6;
      doc.image(signaturePath, sigX + pad, boxY + pad, {
        fit: [sigBoxW - pad * 2, sigBoxH - pad * 2],
        align: "center",
        valign: "center",
      });
    } catch {}
  }
}


/* ---------------- Invoices ---------------- */

// Next invoice number preview
router.get("/invoices/next-number", authorizeRoles("admin", "accounts"), async (_req, res) => {
  try {
    const next = await generateNextInvoiceNumber();
    res.json({ next });
  } catch (err) {
    console.error("GET /accounts/invoices/next-number failed:", err);
    res.status(500).json({ message: "Failed to generate invoice number" });
  }
});

// Create invoice
router.post("/invoices", authorizeRoles("admin", "accounts"), async (req, res) => {
  try {
    const {
      client_id,
      clientId,
      invoice_number,
      issue_date,
      due_date,
      gst_applicable,
      notes,
      items = [],
      amount,
      description,
    } = req.body;

    if (!issue_date) {
      return res.status(400).json({ message: "issue_date is required (YYYY-MM-DD)" });
    }

    const clientIdFinal =
      client_id !== undefined && client_id !== null && String(client_id).trim() !== ""
        ? Number(client_id)
        : clientId !== undefined && clientId !== null && String(clientId).trim() !== ""
        ? Number(clientId)
        : 1;

    let number = invoice_number;
    if (!number || !String(number).trim()) {
      number = await generateNextInvoiceNumber();
    }

    await run("BEGIN");

    const inv = await run(
      `INSERT INTO invoices
         (client_id, invoice_number, issue_date, due_date, gst_applicable, status, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [clientIdFinal, number, issue_date, due_date || null, gst_applicable ? 1 : 0, "due", notes || null]
    );

    const invoiceId = inv.id;

    if (Array.isArray(items) && items.length > 0) {
      for (const rawItem of items) {
        const norm = normalizeItem(rawItem, description);
        await run(
          `INSERT INTO invoice_items
             (invoice_id, description, quantity, unit_price, account_id)
           VALUES (?,?,?,?,?)`,
          [invoiceId, norm.description, norm.quantity, norm.unitPrice, norm.accountId]
        );
      }
    } else if (amount !== undefined && amount !== null) {
      const amtNum = Number(amount) || 0;
      await run(
        `INSERT INTO invoice_items
           (invoice_id, description, quantity, unit_price, account_id)
         VALUES (?,?,?,?,?)`,
        [invoiceId, description || "Services", 1, amtNum, null]
      );
    }

    await run("COMMIT");
    res.status(201).json({ id: invoiceId, invoice_number: number });
  } catch (err) {
    console.error("POST /accounts/invoices failed:", err);
    try {
      await run("ROLLBACK");
    } catch {}
    res.status(500).json({ message: "Failed to create invoice" });
  }
});

// LIST INVOICES
router.get("/invoices", authorizeRoles("admin", "accounts", "sales"), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT
         i.*,
         c.name AS client_name,
         COALESCE((SELECT SUM(quantity * unit_price) FROM invoice_items it WHERE it.invoice_id = i.id), 0) AS total,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       ORDER BY i.issue_date DESC, i.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /accounts/invoices failed:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// GET SINGLE INVOICE
router.get("/invoices/:id", authorizeRoles("admin", "accounts", "sales"), async (req, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await get(
      `SELECT
         i.*,
         c.name            AS client_company_name,
         c.contact_person  AS client_contact_person,
         c.email           AS client_email,
         c.billing_address AS client_billing_address
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const items = await all(
      "SELECT description, quantity, unit_price, account_id FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC",
      [invoiceId]
    );

    const payments = await all(
      "SELECT payment_date, amount, mode FROM payments WHERE invoice_id = ? ORDER BY payment_date ASC",
      [invoiceId]
    );

    res.json({ invoice, items, payments });
  } catch (err) {
    console.error("GET /accounts/invoices/:id failed:", err);
    res.status(500).json({ message: "Failed to load invoice" });
  }
});

// RECORD PAYMENT
router.post("/invoices/:id/payments", authorizeRoles("admin", "accounts"), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { payment_date, amount, mode } = req.body;

    if (!payment_date || amount === undefined || amount === null) {
      return res.status(400).json({ message: "payment_date and amount are required for payments" });
    }

    await run("INSERT INTO payments (invoice_id, payment_date, amount, mode) VALUES (?,?,?,?)", [
      invoiceId,
      payment_date,
      amount,
      mode || null,
    ]);

    const totals = await computeTotals(invoiceId);
    await run("UPDATE invoices SET status = ? WHERE id = ?", [totals.status, invoiceId]);

    res.status(201).json({ message: "Payment recorded", status: totals.status, totals });
  } catch (err) {
    console.error("POST /accounts/invoices/:id/payments failed:", err);
    res.status(500).json({ message: "Failed to record payment" });
  }
});

/* =========================
   ✅ UPDATED UPDATE INVOICE
   - Accepts "Completed" -> paid
   - Supports items[] update (replace)
   - Updates notes/client/date/gst safely
   - If status wants paid: auto-pay remaining
========================= */
router.put("/invoices/:id", authorizeRoles("admin", "accounts"), async (req, res) => {
  const invoiceId = req.params.id;

  try {
    const body = req.body || {};

    const issueDate = toIsoOrNull(body.issue_date);
    const dueDate = toIsoOrNull(body.due_date);
    const gst01 = parseBool01(body.gst_applicable);

    const notes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined;
    const clientId = body.client_id !== undefined ? toNumberOrNull(body.client_id) : undefined;

    const requestedStatus = normalizeStatus(body.status); // due/partial/paid or null
    const additionalPayment = toNumberOrNull(body.additional_payment ?? body.payment_now ?? body.paymentNow);

    const paymentDateRaw = body.payment_date ?? body.paymentDate;
    const paymentDate = paymentDateRaw
      ? String(paymentDateRaw).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Items support (preferred)
    const items = Array.isArray(body.items) ? body.items : null;

    // Legacy amount/description support
    const amount = toNumberOrNull(body.amount ?? body.total);
    const description = body.description !== undefined ? String(body.description || "Services") : undefined;

    const existing = await get("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    if (!existing) return res.status(404).json({ message: "Invoice not found" });

    await run("BEGIN");

    /* ---- Update invoice header fields ---- */
    const fields = [];
    const params = [];

    if (issueDate !== undefined && issueDate !== null) {
      fields.push("issue_date = ?");
      params.push(issueDate);
    }

    if (dueDate !== undefined) {
      fields.push("due_date = ?");
      params.push(dueDate);
    }

    if (gst01 !== null) {
      fields.push("gst_applicable = ?");
      params.push(gst01);
    }

    if (notes !== undefined) {
      fields.push("notes = ?");
      params.push(notes);
    }

    if (clientId !== undefined && clientId !== null) {
      fields.push("client_id = ?");
      params.push(clientId);
    }

    if (fields.length > 0) {
      params.push(invoiceId);
      await run(`UPDATE invoices SET ${fields.join(", ")} WHERE id = ?`, params);
    }

    /* ---- Update items ---- */
    if (items && items.length > 0) {
      await run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);

      for (const rawItem of items) {
        const norm = normalizeItem(rawItem, description || "Services");
        await run(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, account_id)
           VALUES (?,?,?,?,?)`,
          [invoiceId, norm.description, norm.quantity, norm.unitPrice, norm.accountId]
        );
      }
    } else if (amount !== null || description !== undefined) {
      const first = await get(
        "SELECT id FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC LIMIT 1",
        [invoiceId]
      );

      if (first) {
        await run(
          `UPDATE invoice_items
             SET description = COALESCE(?, description),
                 quantity    = CASE WHEN ? IS NOT NULL THEN 1 ELSE quantity END,
                 unit_price  = COALESCE(?, unit_price)
           WHERE id = ?`,
          [description || null, amount, amount, first.id]
        );
      } else if (amount !== null) {
        await run(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, account_id)
           VALUES (?,?,?,?,?)`,
          [invoiceId, description || "Services", 1, amount, null]
        );
      }
    }

    /* ---- Add payment if provided ---- */
    if (additionalPayment !== null && additionalPayment > 0) {
      await run("INSERT INTO payments (invoice_id, payment_date, amount, mode) VALUES (?,?,?,?)", [
        invoiceId,
        paymentDate,
        additionalPayment,
        body.mode || "manual",
      ]);
    }

    /* ---- If status wants PAID/COMPLETED: auto-pay remaining ---- */
    let totals = await computeTotals(invoiceId);

    if (requestedStatus === "paid") {
      const remaining = Math.max(totals.total - totals.paid, 0);
      if (remaining > 0) {
        await run("INSERT INTO payments (invoice_id, payment_date, amount, mode) VALUES (?,?,?,?)", [
          invoiceId,
          paymentDate,
          remaining,
          "auto_close",
        ]);
        totals = await computeTotals(invoiceId);
      }
    }

    await run("UPDATE invoices SET status = ? WHERE id = ?", [totals.status, invoiceId]);
    await run("COMMIT");

    res.json({ id: invoiceId, status: totals.status, totals });
  } catch (err) {
    console.error("PUT /accounts/invoices/:id failed:", err);
    console.error("Request body:", req.body);
    try {
      await run("ROLLBACK");
    } catch {}
    res.status(500).json({ message: "Failed to update invoice" });
  }
});

// DELETE INVOICE
router.delete("/invoices/:id", authorizeRoles("admin"), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    await run("DELETE FROM payments WHERE invoice_id = ?", [invoiceId]);
    await run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
    await run("DELETE FROM invoices WHERE id = ?", [invoiceId]);
    res.json({ message: "Invoice deleted" });
  } catch (err) {
    console.error("DELETE /accounts/invoices/:id failed:", err);
    res.status(500).json({ message: "Failed to delete invoice" });
  }
});

// INVOICE PDF (✅ CGST+SGST; ✅ no Amount Received; ✅ single page layout)
router.get("/invoices/:id/pdf", authorizeRoles("admin", "accounts", "sales"), async (req, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await get(
      `SELECT
         i.*,
         c.name            AS client_company_name,
         c.contact_person  AS client_contact_person,
         c.billing_address AS client_billing_address
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = ?`,
      [invoiceId]
    );

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    let items = await all(
      "SELECT description, quantity, unit_price FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC",
      [invoiceId]
    );

    if (!items || items.length === 0) {
      const amt = Number(invoice.amount || 0);
      items = [{ description: invoice.description || "Services", quantity: 1, unit_price: amt }];
    }

    const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);

    // ✅ GST breakup: CGST 9% + SGST 9%
    const cgst = invoice.gst_applicable ? subtotal * 0.09 : 0;
    const sgst = invoice.gst_applicable ? subtotal * 0.09 : 0;
    const total = subtotal + cgst + sgst;

    const person = String(invoice.client_contact_person || "").trim();
    const company = String(invoice.client_company_name || "").trim();
    const addr = String(invoice.client_billing_address || "").trim();

    const billToName = person || company || "Client";
    const billToCompany = person ? company : "";
    const billToAddress = addr || "";

    const pdfDoc = new PDFDocument({
      size: "A4",
      margins: { top: 36, left: 50, right: 50, bottom: 36 },
    });

    const filename = `Invoice-${invoice.invoice_number || invoiceId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

    pdfDoc.pipe(res);

    drawInvoicePDF(pdfDoc, {
      invoiceNo: invoice.invoice_number || String(invoiceId),
      issueDate: formatDate(invoice.issue_date),
      dueDate: formatDate(invoice.due_date),
      billToName,
      billToCompany,
      billToAddress,
      items,
      subtotal,
      cgst,
      sgst,
      total,
    });

    pdfDoc.end();
  } catch (err) {
    console.error("GET /accounts/invoices/:id/pdf failed:", err);
    if (!res.headersSent) res.status(500).json({ message: "Failed to generate invoice PDF" });
  }
});

/* ---------------- Chart + Reports ---------------- */
router.get("/chart", authorizeRoles("admin", "accounts"), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT id, code, name, type
       FROM chart_of_accounts
       ORDER BY type ASC, code ASC, name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /accounts/chart failed:", err);
    res.status(500).json({ message: "Failed to fetch chart of accounts" });
  }
});

router.get("/reports/pnl", authorizeRoles("admin", "accounts"), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ message: "from and to are requested (YYYY-MM-DD)" });

    const income = await all(
      `SELECT
         COALESCE(a.name, 'Sales') AS account_name,
         SUM(ii.quantity * ii.unit_price) AS amount
       FROM invoices i
       JOIN invoice_items ii ON i.id = ii.invoice_id
       LEFT JOIN chart_of_accounts a ON a.id = ii.account_id
       WHERE i.issue_date BETWEEN ? AND ?
       GROUP BY account_name`,
      [from, to]
    );

    const expenses = await all(
      `SELECT
         category AS account_name,
         SUM(amount) AS amount
       FROM expenses
       WHERE expense_date BETWEEN ? AND ?
       GROUP BY category`,
      [from, to]
    );

    const totalIncome = income.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;

    res.json({ income, expenses, totalIncome, totalExpenses, netProfit });
  } catch (err) {
    console.error("GET /accounts/reports/pnl failed:", err);
    res.status(500).json({ message: "Failed to build P&L" });
  }
});

router.get("/reports/balance-sheet", authorizeRoles("admin", "accounts"), async (req, res) => {
  try {
    const { asOf } = req.query;
    if (!asOf) return res.status(400).json({ message: "asOf is required (YYYY-MM-DD)" });

    const incomeRows = await all(
      `SELECT SUM(ii.quantity * ii.unit_price) AS amount
       FROM invoices i
       JOIN invoice_items ii ON i.id = ii.invoice_id
       WHERE i.issue_date <= ?`,
      [asOf]
    );
    const totalIncome = Number(incomeRows[0]?.amount || 0);

    const expenseRows = await all(
      `SELECT SUM(amount) AS amount
       FROM expenses
       WHERE expense_date <= ?`,
      [asOf]
    );
    const totalExpenses = Number(expenseRows[0]?.amount || 0);

    const netProfit = totalIncome - totalExpenses;

    const cashRows = await all(
      `SELECT SUM(amount) AS amount
       FROM payments
       WHERE payment_date <= ?`,
      [asOf]
    );
    const cashAndBank = Number(cashRows[0]?.amount || 0);

    const billedRows = await all(
      `SELECT SUM(ii.quantity * ii.unit_price) AS amount
       FROM invoices i
       JOIN invoice_items ii ON i.id = ii.invoice_id
       WHERE i.issue_date <= ?`,
      [asOf]
    );
    const billed = Number(billedRows[0]?.amount || 0);
    const receivable = Math.max(billed - cashAndBank, 0);

    const assetsItems = [
      { label: "Cash & Bank", amount: cashAndBank },
      { label: "Accounts Receivable", amount: receivable },
    ].filter((x) => x.amount !== 0);

    const totalAssets = assetsItems.reduce((s, r) => s + Number(r.amount || 0), 0);

    res.json({
      asOf,
      assets: { items: assetsItems, total: totalAssets },
      liabilities: { items: [], total: 0 },
      equity: { items: [{ label: "Retained Earnings", amount: netProfit }], total: netProfit },
    });
  } catch (err) {
    console.error("GET /accounts/reports/balance-sheet failed:", err);
    res.status(500).json({ message: "Failed to build balance sheet" });
  }
});

/* ---------------- Clients CRUD ---------------- */
router.get("/clients", authorizeRoles("admin", "accounts", "sales"), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT id, name, contact_person, email, phone, gst_number,
              billing_address, payment_terms, outstanding, created_at
       FROM clients
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /accounts/clients failed:", err);
    res.status(500).json({ message: "Failed to fetch clients" });
  }
});

router.post("/clients", authorizeRoles("admin"), async (req, res) => {
  try {
    const { name, contact_person, email, phone, gst_number, billing_address, payment_terms } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: "Client name is required" });

    const result = await run(
      `INSERT INTO clients
        (name, contact_person, email, phone, gst_number, billing_address, payment_terms)
       VALUES (?,?,?,?,?,?,?)`,
      [name.trim(), contact_person || null, email || null, phone || null, gst_number || null, billing_address || null, payment_terms || null]
    );

    const created = await get(
      `SELECT id, name, contact_person, email, phone, gst_number,
              billing_address, payment_terms, outstanding, created_at
       FROM clients WHERE id = ?`,
      [result.id]
    );

    res.status(201).json(created);
  } catch (err) {
    console.error("POST /accounts/clients failed:", err);
    res.status(500).json({ message: "Failed to create client" });
  }
});

router.put("/clients/:id", authorizeRoles("admin"), async (req, res) => {
  try {
    const { name, contact_person, email, phone, gst_number, billing_address, payment_terms } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: "Client name is required" });

    await run(
      `UPDATE clients
          SET name = ?, contact_person = ?, email = ?, phone = ?,
              gst_number = ?, billing_address = ?, payment_terms = ?
        WHERE id = ?`,
      [name.trim(), contact_person || null, email || null, phone || null, gst_number || null, billing_address || null, payment_terms || null, req.params.id]
    );

    const updated = await get(
      `SELECT id, name, contact_person, email, phone, gst_number,
              billing_address, payment_terms, outstanding, created_at
       FROM clients WHERE id = ?`,
      [req.params.id]
    );

    res.json(updated);
  } catch (err) {
    console.error("PUT /accounts/clients/:id failed:", err);
    res.status(500).json({ message: "Failed to update client" });
  }
});

router.delete("/clients/:id", authorizeRoles("admin"), async (req, res) => {
  try {
    await run("DELETE FROM clients WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /accounts/clients/:id failed:", err);
    res.status(500).json({ message: "Failed to delete client" });
  }
});

export default router;
