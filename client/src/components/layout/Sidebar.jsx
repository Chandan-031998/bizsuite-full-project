// client/src/components/layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import vertexLogo from "../../assets/logo.png";

const linkClasses = ({ isActive }) =>
  [
    "flex items-center px-3 py-2 rounded-xl text-xs font-medium transition",
    isActive
      ? "bg-sky-100 text-sky-700"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");

const Sidebar = ({ open, onClose }) => {
  const { user } = useAuth();
  const role = user?.role;

  const items = [
    { to: "/dashboard", label: "Dashboard", roles: ["admin", "accounts", "sales"] },
    { to: "/accounts/invoices", label: "Invoices", roles: ["admin", "accounts"] },
    { to: "/accounts/clients", label: "Clients", roles: ["admin", "accounts", "sales"] },
    { to: "/accounts/chart-of-accounts", label: "Chart of Accounts", roles: ["admin", "accounts"] },
    { to: "/accounts/pnl", label: "Profit & Loss", roles: ["admin", "accounts"] },
    { to: "/accounts/balance-sheet", label: "Balance Sheet", roles: ["admin", "accounts"] },
    { to: "/accounts/quotations", label: "Quotations", roles: ["admin", "accounts", "sales"] },
    { to: "/crm/leads", label: "Leads / CRM", roles: ["admin", "sales"] },
    { to: "/expenses", label: "Expenses", roles: ["admin", "accounts"] },
    { to: "/tasks", label: "Tasks & Follow-ups", roles: ["admin", "accounts", "sales"] },

    // ✅ NEW: Certificates QR module (Admin only)
    { to: "/certificates", label: "Certificates (QR)", roles: ["admin"] },

    { to: "/admin/users", label: "Users & Roles", roles: ["admin"] },
  ].filter((i) => !role || i.roles.includes(role));

  return (
    <>
      {/* Mobile overlay */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/30 z-30 lg:hidden transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-slate-50 to-slate-100
        border-r border-slate-200 flex flex-col shadow-sm transform transition-transform duration-300
        ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand */}
        <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white shadow flex items-center justify-center">
            <img src={vertexLogo} alt="logo" className="h-6 w-auto" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Vertex Software
            </div>
            <div className="text-[11px] text-slate-500">
              Accounts · CRM · Expenses
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={linkClasses}
              onClick={onClose}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        {user && (
          <div className="px-4 py-3 border-t border-slate-200 bg-white/70 text-[11px]">
            <div className="font-medium truncate">{user.name}</div>
            <div className="capitalize text-sky-700">{user.role}</div>
          </div>
        )}
      </aside>
    </>
  );
};

export default Sidebar;
