// server/src/db.js  (MySQL version)
import dotenv from "dotenv";
dotenv.config();

import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { AsyncLocalStorage } from "node:async_hooks";

/* -----------------------------
   ENV (use your .env values)
------------------------------*/
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "";

const POOL_SIZE = Number(process.env.DB_POOL_SIZE || 5);

// Optional SSL (some hosts require it). Set DB_SSL=1 if needed.
const DB_SSL = String(process.env.DB_SSL || "0") === "1";

if (!DB_NAME) {
  console.warn("DB_NAME is missing. Please set DB_NAME in .env");
}

/* -----------------------------
   MySQL Pool
------------------------------*/
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: POOL_SIZE,
  queueLimit: 0,
  connectTimeout: 15000,
  ...(DB_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
});

// ✅ backward compatibility (some files import `db`)
export const db = pool;

/* -----------------------------
   Transaction-safe Context
   (supports run("BEGIN") etc.)
------------------------------*/
const als = new AsyncLocalStorage();

/**
 * Add this middleware ONCE in server.js:
 * app.use(dbContextMiddleware);
 */
export const dbContextMiddleware = (req, res, next) => {
  const ctx = { conn: null, inTx: false, cleaned: false };

  als.run(ctx, () => {
    const cleanup = async () => {
      if (ctx.cleaned) return;
      ctx.cleaned = true;

      if (ctx.conn) {
        try {
          // If request ended without commit/rollback, rollback safely
          if (ctx.inTx) {
            try {
              await ctx.conn.rollback();
            } catch {}
          }
        } finally {
          try {
            ctx.conn.release();
          } catch {}
          ctx.conn = null;
          ctx.inTx = false;
        }
      }
    };

    res.on("finish", () => void cleanup());
    res.on("close", () => void cleanup());

    next();
  });
};

const getCtx = () => als.getStore();

const isBegin = (sql) =>
  /^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(String(sql).trim());
const isCommit = (sql) => /^\s*COMMIT\b/i.test(String(sql).trim());
const isRollback = (sql) => /^\s*ROLLBACK\b/i.test(String(sql).trim());

const ensureTxConn = async () => {
  const ctx = getCtx();
  if (!ctx) {
    throw new Error(
      "DB context missing. Ensure app.use(dbContextMiddleware) is added before routes."
    );
  }
  if (!ctx.conn) ctx.conn = await pool.getConnection();
  return ctx;
};

/* -----------------------------
   Query helpers (same API)
------------------------------*/
export const run = async (sql, params = []) => {
  const q = String(sql).trim();

  // Transaction commands
  if (isBegin(q)) {
    const ctx = await ensureTxConn();
    if (!ctx.inTx) {
      await ctx.conn.beginTransaction();
      ctx.inTx = true;
    }
    return { id: null, changes: 0 };
  }

  if (isCommit(q)) {
    const ctx = await ensureTxConn();
    if (ctx.inTx) {
      await ctx.conn.commit();
      ctx.inTx = false;
    }
    // release connection after commit
    if (ctx.conn) {
      ctx.conn.release();
      ctx.conn = null;
    }
    return { id: null, changes: 0 };
  }

  if (isRollback(q)) {
    const ctx = await ensureTxConn();
    if (ctx.inTx) {
      await ctx.conn.rollback();
      ctx.inTx = false;
    }
    // release connection after rollback
    if (ctx.conn) {
      ctx.conn.release();
      ctx.conn = null;
    }
    return { id: null, changes: 0 };
  }

  // Normal queries
  const ctx = getCtx();
  const useTx = Boolean(ctx?.inTx && ctx?.conn);

  const executor = useTx ? ctx.conn : pool;

  const [result] = await executor.execute(q, params);

  // mysql2 returns ResultSetHeader for INSERT/UPDATE/DELETE
  const isInsert = /^\s*insert\s+/i.test(q);
  const insertId = isInsert && result && typeof result.insertId === "number" ? result.insertId : null;

  const changes =
    result && typeof result.affectedRows === "number" ? result.affectedRows : 0;

  return { id: insertId, changes };
};

export const get = async (sql, params = []) => {
  const q = String(sql).trim();
  const ctx = getCtx();
  const useTx = Boolean(ctx?.inTx && ctx?.conn);
  const executor = useTx ? ctx.conn : pool;

  const [rows] = await executor.execute(q, params);
  return rows?.[0] ?? null;
};

export const all = async (sql, params = []) => {
  const q = String(sql).trim();
  const ctx = getCtx();
  const useTx = Boolean(ctx?.inTx && ctx?.conn);
  const executor = useTx ? ctx.conn : pool;

  const [rows] = await executor.execute(q, params);
  return rows ?? [];
};

/* -----------------------------
   Schema (MySQL)
------------------------------*/
export const initDb = async () => {
  // USERS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','accounts','sales') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // CLIENTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      gst_number VARCHAR(64),
      billing_address TEXT,
      payment_terms VARCHAR(255),
      outstanding DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // DEFAULT CLIENT (id=1)
  await pool.query(`
    INSERT INTO clients (id, name, contact_person, email, phone, gst_number, billing_address, payment_terms, outstanding)
    SELECT 1, 'Default Client', NULL, 'client@example.com', NULL, NULL, NULL, 'Payment within 7 days', 0
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM clients WHERE id = 1);
  `);

  // CHART OF ACCOUNTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      type ENUM('asset','liability','income','expense') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  // INVOICES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      invoice_number VARCHAR(64) NOT NULL UNIQUE,
      issue_date DATE NOT NULL,
      due_date DATE NULL,
      gst_applicable TINYINT(1) DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'due',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_invoices_client FOREIGN KEY (client_id) REFERENCES clients(id)
    ) ENGINE=InnoDB;
  `);

  // INVOICE ITEMS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      service VARCHAR(255),
      description TEXT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      tax_percent DECIMAL(5,2) DEFAULT 0,
      account_id INT NULL,
      CONSTRAINT fk_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      CONSTRAINT fk_items_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
    ) ENGINE=InnoDB;
  `);

  // PAYMENTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      payment_date DATE NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      mode VARCHAR(64),
      CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // LEADS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      company VARCHAR(255),
      place VARCHAR(255),
      source VARCHAR(255),
      stage VARCHAR(64) NOT NULL,
      added_by INT NULL,
      assigned_to INT NULL,
      extra1 TEXT,
      extra2 TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_leads_added_by FOREIGN KEY (added_by) REFERENCES users(id),
      CONSTRAINT fk_leads_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `);

  // LEAD ACTIVITIES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lead_activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lead_id INT NOT NULL,
      note TEXT,
      next_follow_up_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_lead_activities_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `);

  // EXPENSES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(255) NOT NULL,
      project VARCHAR(255),
      amount DECIMAL(12,2) NOT NULL,
      expense_date DATE NOT NULL,
      payment_mode VARCHAR(64),
      description TEXT,
      bill_path TEXT,
      is_reimbursable TINYINT(1) DEFAULT 0,
      reimbursement_status VARCHAR(64) DEFAULT 'none'
    ) ENGINE=InnoDB;
  `);

  // TASKS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due_date DATE NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      created_by INT NULL,
      assigned_to INT NULL,
      related_lead_id INT NULL,
      CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      CONSTRAINT fk_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id),
      CONSTRAINT fk_tasks_lead FOREIGN KEY (related_lead_id) REFERENCES leads(id)
    ) ENGINE=InnoDB;
  `);

  // TASK MESSAGES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      author_id INT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_task_messages_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      CONSTRAINT fk_task_messages_author FOREIGN KEY (author_id) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `);

  // QUOTATIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      client_id INT NOT NULL,
      quote_number VARCHAR(64) NOT NULL UNIQUE,
      quote_date DATE NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      notes TEXT,
      CONSTRAINT fk_quotations_client FOREIGN KEY (client_id) REFERENCES clients(id)
    ) ENGINE=InnoDB;
  `);

  // NOTIFICATIONS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `);
};

// ✅ seed admin (same behavior as before)
export const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return;

  const hash = await bcrypt.hash(password, 10);
  await run(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
    [name, email, hash, "admin"]
  );

  console.log(`Seeded admin user: ${email}`);
};

export default { run, get, all, initDb, seedAdmin, db, dbContextMiddleware };
