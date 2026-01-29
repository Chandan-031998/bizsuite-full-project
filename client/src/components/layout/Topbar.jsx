// client/src/components/layout/Topbar.jsx
import React from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/logo.png"; // ✅ make sure this path is correct

const Topbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();

  return (
    <header
      className="
        h-14 border-b border-slate-200
        flex items-center justify-between px-3 sm:px-4
        bg-gradient-to-r from-slate-50 via-indigo-50 to-indigo-100/80
        backdrop-blur sticky top-0 z-20
      "
    >
      {/* LEFT: Hamburger + Logo + Name */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Hamburger (mobile only) */}
        <button
          onClick={onMenuClick}
          className="
            lg:hidden
            h-9 w-9 flex items-center justify-center
            rounded-lg bg-white border border-slate-200
            text-slate-700 shadow-sm
            hover:bg-slate-100
          "
          aria-label="Open menu"
        >
          ☰
        </button>

        {/* Logo */}
        <div className="h-8 w-8 rounded-xl bg-white shadow-sm flex items-center justify-center border border-slate-200 overflow-hidden">
          <img
            src={logo}
            alt="Vertex Software"
            className="h-6 w-auto object-contain"
          />
        </div>

        {/* Brand text */}
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-slate-800">
            Vertex Software
          </div>
          <div className="text-[11px] text-slate-500 hidden sm:block">
            Accounts · CRM · Expense Management
          </div>
        </div>
      </div>

      {/* RIGHT: User + Logout */}
      {user && (
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-xs text-slate-700 hidden sm:block">
            Welcome,{" "}
            <span className="font-medium text-indigo-700">
              {user.name}
            </span>
          </div>

          <button
            onClick={logout}
            className="
              text-[11px] px-3 py-1.5 rounded-full
              bg-indigo-600 hover:bg-indigo-500
              text-white shadow-sm
              border border-indigo-500/70
              transition-colors
            "
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
};

export default Topbar;
