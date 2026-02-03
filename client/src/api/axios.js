// client/src/api/axios.js
import axios from "axios";

/**
 * IMPORTANT:
 * Set VITE_API_BASE_URL in:
 *   - client/.env.development (local)
 *   - client/.env.production  (live)
 *
 * Example:
 *   VITE_API_BASE_URL=https://bizsuite-full-project.onrender.com
 */

const DEFAULT_DEV = "http://localhost:4000";
const DEFAULT_PROD = "https://bizsuite-full-project.onrender.com";

const isLocal =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

// Take env if present, else auto-pick based on device
const RAW = import.meta.env.VITE_API_BASE_URL || (isLocal ? DEFAULT_DEV : DEFAULT_PROD);

// normalize + ensure /api suffix
const cleaned = String(RAW).replace(/\/+$/, "");
const baseURL = cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;

/** Attach token helper */
const attachAuth = (config) => {
  const token = localStorage.getItem("bizsuite_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
};

const createClient = (timeoutMs) => {
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: timeoutMs,
  });

  instance.interceptors.request.use(attachAuth, (error) => Promise.reject(error));

  // ✅ Retry ONCE for network/timeout/502/503/504
  instance.interceptors.response.use(
    (res) => res,
    async (err) => {
      const cfg = err.config;

      const msg = String(err?.message || "").toLowerCase();
      const isTimeout = err?.code === "ECONNABORTED" || msg.includes("timeout");
      const isNetwork = msg.includes("network");
      const status = err?.response?.status;
      const isBadGateway = status === 502 || status === 503 || status === 504;

      // Never retry auth failures
      const isAuthFail = status === 401 || status === 403;

      if (cfg && !cfg.__retried && !isAuthFail && (isTimeout || isNetwork || isBadGateway)) {
        cfg.__retried = true;
        await new Promise((r) => setTimeout(r, 1500));
        return instance(cfg);
      }

      return Promise.reject(err);
    }
  );

  return instance;
};

// ✅ Normal API client: fast UX
const api = createClient(20000);

// ✅ Long-timeout client: use ONLY for login/warmup (Render cold start)
export const apiLong = createClient(70000);

// ✅ helper to wake server before login (Render sleep)
export const warmUpServer = async () => {
  try {
    await apiLong.get("/health");
  } catch {
    // ignore
  }
};

export default api;
