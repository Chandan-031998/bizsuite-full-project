// client/src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import api, { apiLong, warmUpServer } from "../api/axios.js";

const AuthContext = createContext(null);

const safeJsonParse = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const clearAuthStorage = () => {
  localStorage.removeItem("bizsuite_token");
  localStorage.removeItem("bizsuite_user");
  localStorage.removeItem("bizsuite_role");
};

const persistUser = (user) => {
  if (!user) {
    localStorage.removeItem("bizsuite_user");
    localStorage.removeItem("bizsuite_role");
    return;
  }
  localStorage.setItem("bizsuite_user", JSON.stringify(user));
  localStorage.setItem("bizsuite_role", user?.role || "");
};

const persistToken = (token) => {
  if (!token) {
    localStorage.removeItem("bizsuite_token");
    return;
  }
  localStorage.setItem("bizsuite_token", token);
};

const applyTokenToClients = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    apiLong.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    delete apiLong.defaults.headers.common.Authorization;
  }
};

const getErrorMessage = (err) => {
  // Timeout
  if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
    return "Server is taking longer to respond (cold start). Please wait 10–30 seconds and try again.";
  }

  // No response => network/CORS/server down
  if (!err?.response) {
    return "Unable to reach server. Please check internet connection, CORS, or server status.";
  }

  const status = err.response.status;
  const apiMsg =
    err.response?.data?.message ||
    err.response?.data?.error ||
    err.response?.data?.detail;

  if (status === 401) return apiMsg || "Invalid email or password.";
  if (status === 403) return apiMsg || "Forbidden: insufficient role.";
  if (status === 404) return apiMsg || "API endpoint not found (404).";
  if (status === 429) return apiMsg || "Too many requests. Please try again later.";
  if (status >= 500) return apiMsg || "Server error. Please try again later.";

  return apiMsg || "Login failed. Please try again.";
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("bizsuite_user");
    return raw ? safeJsonParse(raw) : null;
  });

  const [token, setToken] = useState(() => localStorage.getItem("bizsuite_token") || null);
  const [loading, setLoading] = useState(false);

  // Prevent duplicate warmups + duplicate login calls
  const warmingRef = useRef(false);
  const loginInFlightRef = useRef(false);

  // Keep token synced into localStorage + axios clients
  useEffect(() => {
    persistToken(token);
    applyTokenToClients(token);
  }, [token]);

  // Keep user synced into localStorage
  useEffect(() => {
    persistUser(user);
  }, [user]);

  // ✅ Warm-up backend once (optional but good for Render cold start)
  const warmUpOnce = async () => {
    if (warmingRef.current) return;
    warmingRef.current = true;
    try {
      // Use exported warmUpServer if available (recommended)
      if (typeof warmUpServer === "function") {
        await warmUpServer();
      } else {
        // fallback
        await apiLong.get("/health");
      }
    } catch {
      // ignore
    } finally {
      warmingRef.current = false;
    }
  };

  /**
   * ✅ login() returns:
   * { ok: boolean, message?: string }
   */
  const login = async (email, password) => {
    if (loginInFlightRef.current) {
      return { ok: false, message: "Login already in progress. Please wait…" };
    }

    loginInFlightRef.current = true;
    setLoading(true);

    try {
      // Warm up first (helps Render sleep)
      await warmUpOnce();

      // IMPORTANT: use apiLong for login
      const res = await apiLong.post("/auth/login", {
        email: String(email || "").trim(),
        password: String(password || ""),
      });

      const newUser = res.data?.user || null;
      const newToken = res.data?.token || null;

      if (!newUser || !newToken) {
        return {
          ok: false,
          message: "Login response missing token/user. Check backend /auth/login response.",
        };
      }

      setUser(newUser);
      setToken(newToken);

      // Apply immediately too
      applyTokenToClients(newToken);

      return { ok: true };
    } catch (err) {
      console.error("Login failed:", err?.response?.data || err?.message);

      // Clear stored auth if auth failure
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        clearAuthStorage();
        setUser(null);
        setToken(null);
      }

      return { ok: false, message: getErrorMessage(err) };
    } finally {
      setLoading(false);
      loginInFlightRef.current = false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    applyTokenToClients(null);
    clearAuthStorage();
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
      warmUpOnce, // optional if you want to call from Login.jsx
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
