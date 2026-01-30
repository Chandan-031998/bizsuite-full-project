// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/axios.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("bizsuite_user");
    return raw ? JSON.parse(raw) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem("bizsuite_token"));
  const [loading, setLoading] = useState(false);

  // Keep token in localStorage + axios
  useEffect(() => {
    if (token) {
      localStorage.setItem("bizsuite_token", token);
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      localStorage.removeItem("bizsuite_token");
      delete api.defaults.headers.common.Authorization;
    }
  }, [token]);

  // Keep user in localStorage
  useEffect(() => {
    if (user) {
      localStorage.setItem("bizsuite_user", JSON.stringify(user));
      localStorage.setItem("bizsuite_role", user.role || "");
    } else {
      localStorage.removeItem("bizsuite_user");
      localStorage.removeItem("bizsuite_role");
    }
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post("/auth/login", {
        email: String(email || "").trim(),
        password: String(password || ""),
      });

      // Expecting: { token, user }
      setUser(res.data?.user || null);
      setToken(res.data?.token || null);

      // Also set header immediately
      if (res.data?.token) {
        api.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
      }

      return true;
    } catch (err) {
      console.error("Login failed:", err?.response?.data || err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    delete api.defaults.headers.common.Authorization;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
