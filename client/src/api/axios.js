// client/src/api/axios.js
import axios from "axios";

/**
 * Works on:
 * - Local dev: http://localhost:4000
 * - Production: https://bizsuite-full-project.onrender.com
 *
 * IMPORTANT:
 * Set VITE_API_BASE_URL in:
 *   - client/.env.development (local)
 *   - client/.env.production  (live)
 */

const DEFAULT_DEV = "http://localhost:4000";
const DEFAULT_PROD = "https://bizsuite-full-project.onrender.com";

const isLocal =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

// Take env if present, else auto-pick based on device
const RAW =
  import.meta.env.VITE_API_BASE_URL || (isLocal ? DEFAULT_DEV : DEFAULT_PROD);

// normalize + ensure /api suffix
const cleaned = String(RAW).replace(/\/+$/, "");
const baseURL = cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

// Attach token automatically
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("bizsuite_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
