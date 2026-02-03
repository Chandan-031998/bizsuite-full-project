// server/src/routes/authRoutes.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { get, run } from "../db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || "dev-secret";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// ✅ Optional: block public register in production
const ALLOW_PUBLIC_REGISTER =
  String(process.env.ALLOW_PUBLIC_REGISTER || "0") === "1" ||
  process.env.NODE_ENV !== "production";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

router.post("/register", async (req, res) => {
  try {
    if (!ALLOW_PUBLIC_REGISTER) {
      return res.status(403).json({
        message:
          "Public registration is disabled. Ask admin to create your account.",
      });
    }

    const { name, email, password, role } = req.body || {};
    const cleanEmail = normalizeEmail(email);

    if (!name || !cleanEmail || !password) {
      return res.status(400).json({ message: "name, email, password are required" });
    }

    // ✅ do NOT default to admin (safer)
    const safeRole = String(role || "sales").toLowerCase();
    const allowedRoles = ["admin", "accounts", "sales"];
    const finalRole = allowedRoles.includes(safeRole) ? safeRole : "sales";

    const existing = await get(
      "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
      [cleanEmail]
    );
    if (existing) return res.status(400).json({ message: "Email already in use" });

    const hash = await bcrypt.hash(String(password), 10);

    await run(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)",
      [String(name).trim(), cleanEmail, hash, finalRole]
    );

    return res.status(201).json({ message: "User registered successfully" });
  } catch (e) {
    console.error("Register error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = normalizeEmail(email);

    if (!cleanEmail || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await get(
      `SELECT id, name, email, role, created_at, password_hash
       FROM users
       WHERE LOWER(email) = LOWER(?)`,
      [cleanEmail]
    );

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!user.password_hash) {
      return res.status(500).json({ message: "Password hash missing in DB for this user" });
    }

    const ok = await bcrypt.compare(String(password), String(user.password_hash));
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // ✅ include email too (helpful)
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: EXPIRES_IN }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };

    return res.json({ token, user: safeUser });
  } catch (e) {
    console.error("Login error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
