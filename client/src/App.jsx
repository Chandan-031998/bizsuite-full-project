import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/common/RoleGuard.jsx";

import Sidebar from "./components/layout/Sidebar.jsx";
import Topbar from "./components/layout/Topbar.jsx";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import InvoicesPage from "./pages/accounts/InvoicesPage.jsx";
import ChartOfAccountsPage from "./pages/accounts/ChartOfAccountsPage.jsx";
import PnLPage from "./pages/accounts/PnLPage.jsx";
import BalanceSheetPage from "./pages/accounts/BalanceSheetPage.jsx";
import QuotationsPage from "./pages/accounts/QuotationsPage.jsx";
import LeadsPage from "./pages/crm/LeadsPage.jsx";
import ExpensesPage from "./pages/ExpensesPage.jsx";
import TasksPage from "./pages/TasksPage.jsx";
import UsersPage from "./pages/admin/UsersPage.jsx";
import ClientsPage from "./pages/accounts/ClientsPage.jsx";

/* ===========================
   APP LAYOUT (FIXED)
=========================== */
const AppLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

/* ===========================
   ROUTES
=========================== */
const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Root */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Navigate to="/dashboard" replace />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Dashboard />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/invoices"
        element={
          <ProtectedRoute>
            <AppLayout>
              <InvoicesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/clients"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ClientsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/chart-of-accounts"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ChartOfAccountsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/pnl"
        element={
          <ProtectedRoute>
            <AppLayout>
              <PnLPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/balance-sheet"
        element={
          <ProtectedRoute>
            <AppLayout>
              <BalanceSheetPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/accounts/quotations"
        element={
          <ProtectedRoute>
            <AppLayout>
              <QuotationsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/crm/leads"
        element={
          <ProtectedRoute>
            <AppLayout>
              <LeadsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ExpensesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TasksPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <AppLayout>
              <UsersPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
