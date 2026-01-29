// server/src/routes/usersRoutes.js
import express from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * Admin-only user management:
 * - GET    /users          → list users
 * - POST   /users          → create user (admin / accounts / sales)
 * - PUT    /users/:id      → update name/email/role/password
 * - PUT    /users/:id/role → change role only (still supported)
 * - DELETE /users/:id      → delete user (not self)
 */

const ROLES = ['admin', 'accounts', 'sales'];

router.get('/', authorizeRoles('admin'), async (_req, res) => {
  try {
    const rows = await all(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /users failed:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// CREATE USER
router.post('/', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ message: 'name, email, password and role are required' });
    }

    const trimmedRole = String(role).trim();
    if (!ROLES.includes(trimmedRole)) {
      return res
        .status(400)
        .json({ message: 'Invalid role (must be admin, accounts or sales)' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    try {
      const result = await run(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
        [name.trim(), email.trim(), password_hash, trimmedRole]
      );
      return res
        .status(201)
        .json({ id: result.id, name: name.trim(), email: email.trim(), role: trimmedRole });
    } catch (err) {
      if (err?.message?.includes('UNIQUE constraint failed: users.email')) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      if (err?.message?.includes('CHECK constraint failed: users')) {
        return res
          .status(400)
          .json({ message: 'Role failed DB CHECK (admin / accounts / sales only)' });
      }

      console.error('INSERT user failed:', err);
      return res.status(500).json({ message: 'Failed to create user (DB error)' });
    }
  } catch (err) {
    console.error('POST /users failed:', err);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// UPDATE USER – name / email / role / password (optional)
router.put('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, email, role, password } = req.body;

    const existing = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newName = name ? String(name).trim() : existing.name;
    const newEmail = email ? String(email).trim() : existing.email;

    let newRole = existing.role;
    if (role) {
      const trimmedRole = String(role).trim();
      if (!ROLES.includes(trimmedRole)) {
        return res
          .status(400)
          .json({ message: 'Invalid role (must be admin, accounts or sales)' });
      }
      newRole = trimmedRole;
    }

    let password_hash = existing.password_hash;
    if (password && String(password).trim() !== '') {
      password_hash = await bcrypt.hash(password, 10);
    }

    try {
      await run(
        'UPDATE users SET name = ?, email = ?, role = ?, password_hash = ? WHERE id = ?',
        [newName, newEmail, newRole, password_hash, req.params.id]
      );
      return res.json({
        id: req.params.id,
        name: newName,
        email: newEmail,
        role: newRole
      });
    } catch (err) {
      if (err?.message?.includes('UNIQUE constraint failed: users.email')) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      if (err?.message?.includes('CHECK constraint failed: users')) {
        return res
          .status(400)
          .json({ message: 'Role failed DB CHECK (admin / accounts / sales only)' });
      }
      console.error('UPDATE user failed:', err);
      return res.status(500).json({ message: 'Failed to update user (DB error)' });
    }
  } catch (err) {
    console.error('PUT /users/:id failed:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// UPDATE ROLE ONLY (still used if you want)
router.put('/:id/role', authorizeRoles('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const trimmedRole = String(role).trim();

    if (!ROLES.includes(trimmedRole)) {
      return res
        .status(400)
        .json({ message: 'Invalid role (must be admin, accounts or sales)' });
    }

    await run('UPDATE users SET role = ? WHERE id = ?', [trimmedRole, req.params.id]);
    res.json({ id: req.params.id, role: trimmedRole });
  } catch (err) {
    console.error('PUT /users/:id/role failed:', err);
    res.status(500).json({ message: 'Failed to update role' });
  }
});

// DELETE USER (not yourself)
router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    await run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('DELETE /users/:id failed:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;
