// server/src/routes/expensesRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import { all, get, run } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authenticateToken);

// --- bill upload config (same as before, kept simple) ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'bills'));
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage });

/**
 * Access:
 *  - admin, accounts: GET + POST
 *  - admin: PUT + DELETE
 */

// List expenses
router.get('/', authorizeRoles('admin', 'accounts'), async (_req, res) => {
  try {
    const rows = await all(
      `SELECT *
       FROM expenses
       ORDER BY expense_date DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /expenses failed:', err);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

// Create expense (with optional bill upload)
router.post(
  '/',
  authorizeRoles('admin', 'accounts'),
  upload.single('bill'),
  async (req, res) => {
    try {
      const {
        category,
        project,
        amount,
        expense_date,
        payment_mode,
        description,
        is_reimbursable
      } = req.body;

      if (!category || !amount || !expense_date || !payment_mode) {
        return res.status(400).json({
          message: 'category, amount, expense_date and payment_mode are required'
        });
      }

      const billPath = req.file ? req.file.filename : null;
      const reimb = String(is_reimbursable) === 'true' ? 1 : 0;

      const result = await run(
        `INSERT INTO expenses
          (category, project, amount, expense_date, payment_mode, description, bill_path, is_reimbursable, reimbursement_status)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          category,
          project || null,
          Number(amount),
          expense_date,
          payment_mode,
          description || null,
          billPath,
          reimb,
          reimb ? 'pending' : 'none'
        ]
      );

      res.status(201).json({ id: result.id });
    } catch (err) {
      console.error('POST /expenses failed:', err);
      res.status(500).json({ message: 'Failed to create expense' });
    }
  }
);

// 🔹 Update expense (ADMIN ONLY)
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const {
      category,
      project,
      amount,
      expense_date,
      payment_mode,
      description,
      is_reimbursable,
      reimbursement_status
    } = req.body;

    const existing = await get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    let reimbVal = null;
    if (typeof is_reimbursable === 'boolean') {
      reimbVal = is_reimbursable ? 1 : 0;
    } else if (
      typeof is_reimbursable === 'string' &&
      (is_reimbursable === 'true' || is_reimbursable === 'false')
    ) {
      reimbVal = is_reimbursable === 'true' ? 1 : 0;
    }

    await run(
      `UPDATE expenses
       SET category            = COALESCE(?, category),
           project             = COALESCE(?, project),
           amount              = COALESCE(?, amount),
           expense_date        = COALESCE(?, expense_date),
           payment_mode        = COALESCE(?, payment_mode),
           description         = COALESCE(?, description),
           is_reimbursable     = COALESCE(?, is_reimbursable),
           reimbursement_status= COALESCE(?, reimbursement_status)
       WHERE id = ?`,
      [
        category ?? null,
        project ?? null,
        typeof amount !== 'undefined' && amount !== null ? Number(amount) : null,
        expense_date ?? null,
        payment_mode ?? null,
        description ?? null,
        reimbVal,
        reimbursement_status ?? null,
        req.params.id
      ]
    );

    res.json({ id: req.params.id });
  } catch (err) {
    console.error('PUT /expenses/:id failed:', err);
    res.status(500).json({ message: 'Failed to update expense' });
  }
});

// Delete expense (ADMIN ONLY)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    console.error('DELETE /expenses/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete expense' });
  }
});

export default router;
