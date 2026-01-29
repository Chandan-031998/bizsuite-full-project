// server/src/routes/tasksRoutes.js
import express from 'express';
import { all, get, run } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authenticateToken);

const STATUS_OPTIONS = ['ongoing', 'completed', 'rejected'];

/**
 * Access rules:
 * - Admin   : see all tasks, create, update status, delete, chat
 * - Accounts: see all tasks, chat
 * - Sales   : see own tasks only, update status, chat
 */

// List tasks
router.get('/', authorizeRoles('admin', 'accounts', 'sales'), async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'sales') {
      rows = await all(
        `SELECT
           t.*,
           assignee.name AS assigned_to_name,
           assignee.role AS assigned_to_role,
           creator.name  AS created_by_name,
           creator.role  AS created_by_role
         FROM tasks t
         LEFT JOIN users assignee ON assignee.id = t.assigned_to
         LEFT JOIN users creator  ON creator.id  = t.created_by
         WHERE t.assigned_to = ?
         ORDER BY t.due_date IS NULL, t.due_date ASC, t.id DESC`,
        [req.user.id]
      );
    } else {
      rows = await all(
        `SELECT
           t.*,
           assignee.name AS assigned_to_name,
           assignee.role AS assigned_to_role,
           creator.name  AS created_by_name,
           creator.role  AS created_by_role
         FROM tasks t
         LEFT JOIN users assignee ON assignee.id = t.assigned_to
         LEFT JOIN users creator  ON creator.id  = t.created_by
         ORDER BY t.due_date IS NULL, t.due_date ASC, t.id DESC`
      );
    }

    res.json(rows);
  } catch (err) {
    console.error('GET /tasks failed:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// Admin creates task and assigns to Sales
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { title, description, due_date, assigned_to } = req.body;

    if (!title || !assigned_to) {
      return res.status(400).json({ message: 'title and assigned_to are required' });
    }

    const assignee = await get('SELECT id, role FROM users WHERE id = ?', [assigned_to]);
    if (!assignee) {
      return res.status(400).json({ message: 'Assigned user not found' });
    }
    if (assignee.role !== 'sales') {
      return res
        .status(400)
        .json({ message: 'Tasks here can only be assigned to Sales users' });
    }

    const result = await run(
      `INSERT INTO tasks (title, description, due_date, status, created_by, assigned_to)
       VALUES (?,?,?,?,?,?)`,
      [title, description || null, due_date || null, 'ongoing', req.user.id, assigned_to]
    );

    res.status(201).json({ id: result.id });
  } catch (err) {
    console.error('POST /tasks failed:', err);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// Update status (Admin or assigned Sales)
router.put('/:id/status', authorizeRoles('admin', 'sales'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_OPTIONS.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    if (req.user.role === 'sales' && task.assigned_to !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own tasks' });
    }

    await run('UPDATE tasks SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ id: req.params.id, status });
  } catch (err) {
    console.error('PUT /tasks/:id/status failed:', err);
    res.status(500).json({ message: 'Failed to update status' });
  }
});

// Delete task (Admin only)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    await run('DELETE FROM task_messages WHERE task_id = ?', [req.params.id]);
    await run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('DELETE /tasks/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

// Helper: check if current user can see this task
const ensureTaskAccess = async (req, res) => {
  const task = await get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task) {
    res.status(404).json({ message: 'Task not found' });
    return null;
  }
  if (req.user.role === 'sales' && task.assigned_to !== req.user.id) {
    res.status(403).json({ message: 'You can only access your own tasks' });
    return null;
  }
  // admin + accounts can see all
  return task;
};

// Get chat messages for a task
router.get(
  '/:id/messages',
  authorizeRoles('admin', 'accounts', 'sales'),
  async (req, res) => {
    try {
      const task = await ensureTaskAccess(req, res);
      if (!task) return;

      const rows = await all(
        `SELECT
           m.*,
           u.name AS author_name,
           u.role AS author_role
         FROM task_messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.task_id = ?
         ORDER BY m.created_at ASC, m.id ASC`,
        [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      console.error('GET /tasks/:id/messages failed:', err);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  }
);

// Post a chat message on a task
router.post(
  '/:id/messages',
  authorizeRoles('admin', 'accounts', 'sales'),
  async (req, res) => {
    try {
      const task = await ensureTaskAccess(req, res);
      if (!task) return;

      const { message } = req.body;
      if (!message || String(message).trim() === '') {
        return res.status(400).json({ message: 'Message is required' });
      }

      const result = await run(
        'INSERT INTO task_messages (task_id, author_id, message) VALUES (?,?,?)',
        [req.params.id, req.user.id, message]
      );

      const row = await get(
        `SELECT
           m.*,
           u.name AS author_name,
           u.role AS author_role
         FROM task_messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.id = ?`,
        [result.id]
      );

      res.status(201).json(row);
    } catch (err) {
      console.error('POST /tasks/:id/messages failed:', err);
      res.status(500).json({ message: 'Failed to post message' });
    }
  }
);

export default router;
