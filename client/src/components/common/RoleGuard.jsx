// client/src/components/common/RoleGuard.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

export const RoleGuard = ({ roles, children }) => {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return null; // just hides UI chunk
  return children;
};
