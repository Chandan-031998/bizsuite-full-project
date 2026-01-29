# BizSuite – Full‑stack Accounts + CRM + Expenses Demo

This is a small but functional reference implementation of the BizSuite idea:

- **Node.js + Express + SQLite** backend
- **React + Vite + Tailwind + Recharts** frontend
- Role‑based access for **Admin / Accounts / Sales**
- Modules for:
  - Chart of Accounts
  - Invoices & Payments (GST / non‑GST)
  - P&L and very simple Balance Sheet
  - Quotations
  - Leads / mini‑CRM
  - Expenses
  - Tasks
  - Dashboard with finance + pipeline widgets

> ⚠️ This is a demo for learning/prototyping, not a production‑hardened system.
> There is no complex error handling, audit logging, or multi‑tenant logic.

---

## 1. Prerequisites

- Node.js 18+
- npm or yarn

Optional for Docker:
- Docker & Docker Compose

---

## 2. Backend – Express API

```bash
cd server
npm install
```

Create a first admin user by running the `/api/auth/register` endpoint once (you can use a tool like curl or Postman):

```bash
# From project root (adjust email/password as you like)
curl -X POST http://localhost:4000/api/auth/register   -H "Content-Type: application/json"   -d '{
    "name": "Admin",
    "email": "admin@example.com",
    "password": "admin123",
    "role": "admin"
  }'
```

Run the server in dev mode:

```bash
npm run dev
```

The API listens on **http://localhost:4000/api** by default.

---

## 3. Frontend – React dashboard

```bash
cd client
npm install
npm run dev
```

You can now open:

- **http://localhost:5173** → BizSuite UI
- Log in with the admin credentials you created earlier.

---

## 4. Quick API overview

Base URL: `http://localhost:4000/api`

- `POST /auth/login` – login, returns JWT + user
- `GET /dashboard` – overall metrics + charts
- `GET /accounts/invoices` – list invoices with totals and amounts paid
- `GET /accounts/chart` – list chart of accounts
- `GET /accounts/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /accounts/reports/balance-sheet?asOf=YYYY-MM-DD`
- `GET /leads`, `GET /leads/stats/summary`
- `GET /expenses`, `GET /expenses/summary/monthly`
- `GET /tasks`
- `GET /users` (admin only), `PUT /users/:id/role`

The frontend already calls these endpoints and renders dashboards and tables accordingly.

---

## 5. Docker (optional)

From project root:

```bash
docker-compose up --build
```

- Server → `http://localhost:4000`
- Client → `http://localhost:5173` mapped to nginx container

---

## 6. Notes

- Database is a single `data.sqlite` file in `/server` (mounted via docker‑compose).
- Auth is simple JWT in headers; do **not** reuse this as‑is for production security.
- Feel free to extend the schema, add validations, and harden according to your needs.




rm data.sqlite



npm start 


npm




INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Vertex Admin',
  'adminvertex@example.com',
  '$2a$10$Yvm6GfijGjsMDWGTbJtWGO/hL3.Gfexx1mWMmq1vZBYDU65Nvh21a',
  'admin'
);



Email    : adminvertex@example.com
Password : vertex1998
Role     : admin
