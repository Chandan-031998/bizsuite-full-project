import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../api/axios.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("bizsuite_user");
    return raw ? JSON.parse(raw) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem("bizsuite_token"));
  const [loading, setLoading] = useState(false);

  // Attach token to axios automatically
  useEffect(() => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem("bizsuite_token", token);
    } else {
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem("bizsuite_token");
    }
  }, [token]);

  // Persist user
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

      setUser(res.data.user);
      setToken(res.data.token);
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
    // Optional: clear axios header immediately
    delete api.defaults.headers.common.Authorization;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: Boolean(user && token),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
