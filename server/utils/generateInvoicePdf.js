// server/utils/generateInvoicePdf.js
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/**
 * Generate invoice PDF and stream it to the HTTP response.
 *
 * @param {object} options
 * @param {object} options.invoice   - invoice row from DB
 * @param {object} options.client    - client row from DB
 * @param {Array}  options.items     - invoice items [{ description, quantity, unit_price, tax_percent }, ...]
 * @param {object} options.res       - Express response object
 */
function generateInvoicePdf({ invoice, client, items, res }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  const filename = `Invoice-${invoice.invoice_number || invoice.id || 'invoice'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/"/g, '')}"`
  );

  doc.pipe(res);

  // ---------- helpers ----------
  const formatINR = (value) => {
    const n = Number(value || 0);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(isNaN(n) ? 0 : n);
  };

  const safe = (v, fallback = '—') => (v == null || v === '' ? fallback : v);

  // ---------- header ----------
  const logoPath = path.join(__dirname, '..', 'assets', 'vertex-logo.png');

  // Left block: logo + company details
  const headerTop = 60;

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, headerTop - 10, { width: 110 });
  } else {
    // Fallback text logo
    doc
      .fontSize(22)
      .fillColor('#111827')
      .text('Vertex Software', 50, headerTop);
  }

  doc
    .fontSize(9)
    .fillColor('#4b5563')
    .text('Software & IT Services', 50, headerTop + 40)
    .text('Mysuru, Karnataka, India', 50, headerTop + 52)
    .text('info@vertexsoftware.com · +91-XXXXXXXXXX', 50, headerTop + 64)
    .text('GSTIN: 29ABCDE1234F1Z5', 50, headerTop + 76);

  // Right block: INVOICE + meta
  doc
    .fontSize(20)
    .fillColor('#0f172a')
    .text('INVOICE', 0, headerTop - 5, { align: 'right' });

  doc.fontSize(9).fillColor('#4b5563');

  const metaX = 340;
  const metaY = headerTop + 40;
  const metaLineH = 12;

  const metaPairs = [
    ['Invoice #', safe(invoice.invoice_number)],
    ['Issue date', safe(invoice.issue_date)],
    ['Due date', safe(invoice.due_date)],
    ['Status', (invoice.status || 'due').toUpperCase()],
  ];

  metaPairs.forEach(([label, value], i) => {
    const y = metaY + i * metaLineH;
    doc
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(label + ':', metaX, y);
    doc
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(value, metaX + 80, y);
  });

  // ---------- Bill to ----------
  const billToTop = headerTop + 110;
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#111827')
    .text('Bill to:', 50, billToTop);

  const clientName = safe(client?.name, 'Client');
  const clientEmail = safe(client?.email, '');
  const clientPhone = safe(client?.phone, '');
  const clientAddress = safe(client?.billing_address, '');

  const billLines = [clientName];
  if (clientEmail) billLines.push(clientEmail);
  if (clientPhone) billLines.push(clientPhone);
  if (clientAddress) billLines.push(clientAddress);

  doc
    .font('Helvetica')
    .fillColor('#374151')
    .text(billLines.join('\n'), 80, billToTop);

  // small horizontal line
  doc
    .moveTo(50, billToTop + 55)
    .lineTo(545, billToTop + 55)
    .lineWidth(0.5)
    .strokeColor('#e5e7eb')
    .stroke();

  // ---------- Items table ----------
  const tableTop = billToTop + 70;

  const descX = 50;
  const qtyX = 320;
  const rateX = 390;
  const amountX = 470;

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#6b7280');

  doc.text('Description', descX, tableTop);
  doc.text('Qty', qtyX, tableTop, { width: 40, align: 'right' });
  doc.text('Rate', rateX, tableTop, { width: 60, align: 'right' });
  doc.text('Amount', amountX, tableTop, { width: 80, align: 'right' });

  // header underline
  doc
    .moveTo(50, tableTop + 14)
    .lineTo(545, tableTop + 14)
    .lineWidth(0.5)
    .strokeColor('#e5e7eb')
    .stroke();

  // body
  let y = tableTop + 22;
  doc.font('Helvetica').fillColor('#111827');

  let subtotal = 0;
  let gstTotal = 0;

  (items || []).forEach((item) => {
    const qty = Number(item.quantity || item.qty || 0);
    const rate = Number(item.unit_price || item.rate || 0);
    const base = qty * rate;
    const taxPct = Number(item.tax_percent || item.tax || 0) || 0;

    subtotal += base;
    const lineGst = base * (taxPct / 100);
    gstTotal += lineGst;

    const lineAmount = base + lineGst;

    const desc =
      item.description ||
      item.service ||
      (item.account_name ? `${item.account_name} – Service` : 'Service');

    doc.text(desc, descX, y, { width: 250 });
    doc.text(qty.toString(), qtyX, y, { width: 40, align: 'right' });
    doc.text(formatINR(rate), rateX, y, { width: 60, align: 'right' });
    doc.text(formatINR(lineAmount), amountX, y, { width: 80, align: 'right' });

    y += 18;
  });

  // If backend has its own total, prefer that to avoid mismatch
  const paid = Number(invoice.paid || 0);
  const totalFromLines = subtotal + gstTotal;
  const total =
    Number(invoice.amount || invoice.total || 0) > 0
      ? Number(invoice.amount || invoice.total || 0)
      : totalFromLines;
  const balanceDue = Math.max(total - paid, 0);

  // ---------- Totals box ----------
  const totalsTop = tableTop + 22;
  const totalsX = 350;

  // subtle vertical separator
  doc
    .moveTo(totalsX - 10, totalsTop - 8)
    .lineTo(totalsX - 10, y + 10)
    .lineWidth(0.5)
    .strokeColor('#e5e7eb')
    .stroke();

  const totals = [
    ['Subtotal', subtotal],
    ['GST', gstTotal],
    ['Total', total],
    ['Paid', paid],
    ['Balance Due', balanceDue],
  ];

  totals.forEach(([label, value], i) => {
    const lineY = totalsTop + i * 14;
    const isBold = label === 'Total' || label === 'Balance Due';

    doc
      .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor('#4b5563')
      .text(label, totalsX, lineY, { width: 80 });

    doc
      .font(isBold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(isBold ? '#0f766e' : '#111827')
      .text(formatINR(value), totalsX + 80, lineY, {
        width: 100,
        align: 'right',
      });
  });

  // ---------- Notes / footer ----------
  const footerTop = Math.max(y + 40, totalsTop + totals.length * 14 + 30);

  const notesText =
    invoice.notes ||
    'Payment terms: Please make the payment within 7 days from the invoice date.';

  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#6b7280')
    .text(notesText, 50, footerTop, { width: 480 });

  doc
    .moveDown()
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#6b7280')
    .text('Thank you for your business!', 50, footerTop + 40);

  // finish
  doc.end();
}

module.exports = generateInvoicePdf;
