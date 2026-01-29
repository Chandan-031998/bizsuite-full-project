// server/src/routes/quotationsRoutes.js

import express from 'express';
import { all, get, run } from '../db.js';
import {
  authenticateToken,
  authorizeRoles,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * Helper to normalise status coming from the UI.
 * Allowed: draft, sent, accepted, rejected, won, lost
 */
const normaliseStatus = (status) => {
  const s = String(status || '').toLowerCase();
  const allowed = ['draft', 'sent', 'accepted', 'rejected', 'won', 'lost'];
  return allowed.includes(s) ? s : 'draft';
};

/**
 * CREATE quotation  (Admin only)
 */
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const {
      client_id,
      quote_number,
      quote_date,
      total_amount,
      status,
      notes,
    } = req.body;

    if (!client_id || !quote_number || !quote_date) {
      return res
        .status(400)
        .json({ message: 'client_id, quote_number and quote_date are required' });
    }

    const safeStatus = normaliseStatus(status);

    const result = await run(
      `INSERT INTO quotations
        (client_id, quote_number, quote_date, total_amount, status, notes)
       VALUES (?,?,?,?,?,?)`,
      [
        client_id,
        quote_number,
        quote_date,
        total_amount || 0,
        safeStatus,
        notes || null,
      ]
    );

    const id = result.lastID || result.id;
    return res.status(201).json({ id, message: 'Quotation created' });
  } catch (err) {
    console.error('Error creating quotation', err);
    return res.status(500).json({ message: 'Failed to create quotation' });
  }
});

/**
 * LIST quotations  (Admin + Accounts can view)
 */
router.get('/', authorizeRoles('admin', 'accounts'), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT q.*, c.name AS client_name
       FROM quotations q
       JOIN clients c ON c.id = q.client_id
       ORDER BY q.quote_date DESC, q.id DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching quotations', err);
    return res.status(500).json({ message: 'Failed to fetch quotations' });
  }
});

/**
 * GET single quotation  (Admin + Accounts)
 */
router.get('/:id', authorizeRoles('admin', 'accounts'), async (req, res) => {
  try {
    const q = await get(
      `SELECT q.*, c.name AS client_name
       FROM quotations q
       JOIN clients c ON c.id = q.client_id
       WHERE q.id = ?`,
      [req.params.id]
    );
    if (!q) {
      return res.status(404).json({ message: 'Quotation not found' });
    }
    return res.json(q);
  } catch (err) {
    console.error('Error fetching quotation', err);
    return res.status(500).json({ message: 'Failed to fetch quotation' });
  }
});

/**
 * UPDATE quotation  (Admin only)
 */
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const {
      client_id,
      quote_number,
      quote_date,
      total_amount,
      status,
      notes,
    } = req.body;

    const existing = await get(
      'SELECT id FROM quotations WHERE id = ?',
      [req.params.id]
    );
    if (!existing) {
      return res.status(404).json({ message: 'Quotation not found' });
    }

    const safeStatus = normaliseStatus(status);

    await run(
      `UPDATE quotations
       SET client_id   = ?,
           quote_number = ?,
           quote_date   = ?,
           total_amount = ?,
           status       = ?,
           notes        = ?
       WHERE id = ?`,
      [
        client_id,
        quote_number,
        quote_date,
        total_amount || 0,
        safeStatus,
        notes || null,
        req.params.id,
      ]
    );

    return res.json({ message: 'Quotation updated' });
  } catch (err) {
    console.error('Error updating quotation', err);
    return res.status(500).json({ message: 'Failed to update quotation' });
  }
});

/**
 * DELETE quotation  (Admin only)
 */
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await run('DELETE FROM quotations WHERE id = ?', [req.params.id]);
    return res.status(204).end();
  } catch (err) {
    console.error('Error deleting quotation', err);
    return res.status(500).json({ message: 'Failed to delete quotation' });
  }
});

/**
 * CONVERT quotation → invoice  (Admin only)
 */
router.post(
  '/:id/convert-to-invoice',
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const quoteId = req.params.id;
      const { invoice_number, issue_date, due_date, gst_applicable } = req.body;

      const q = await get('SELECT * FROM quotations WHERE id = ?', [quoteId]);
      if (!q) {
        return res.status(404).json({ message: 'Quotation not found' });
      }

      const inv = await run(
        `INSERT INTO invoices
          (client_id, invoice_number, issue_date, due_date, gst_applicable, status, notes)
         VALUES (?,?,?,?,?,?,?)`,
        [
          q.client_id,
          invoice_number,
          issue_date,
          due_date || null,
          gst_applicable ? 1 : 0,
          'due',
          `Converted from quotation ${q.quote_number}`,
        ]
      );

      const invoiceId = inv.lastID || inv.id;
      return res.json({ invoice_id: invoiceId });
    } catch (err) {
      console.error('Error converting quotation', err);
      return res.status(500).json({ message: 'Failed to convert quotation' });
    }
  }
);

export default router;
