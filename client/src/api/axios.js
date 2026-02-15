// client/src/api/axios.js
import axios from "axios";

/**
 * BizSuite API Client
 * - BaseURL auto-normalizes to .../api
 * - Adds Authorization: Bearer <token> from localStorage
 * - Exports: default api + apiLong (long timeout) + warmUpServer()
 */

const DEFAULT_DEV_ORIGIN = "http://localhost:4000";
const DEFAULT_PROD_ORIGIN = "https://bizsuite-full-project.onrender.com";

const isBrowser = typeof window !== "undefined";
const isLocalhost =
  isBrowser && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

const RAW_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (isLocalhost ? DEFAULT_DEV_ORIGIN : DEFAULT_PROD_ORIGIN);

const normalizeBaseURL = (raw) => {
  const cleaned = String(raw || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
};

export const API_BASE_URL = normalizeBaseURL(RAW_BASE);

// token keys you might be using across modules
export const TOKEN_KEYS = ["bizsuite_token", "token", "access_token"];

export const readToken = () => {
  if (!isBrowser) return "";
  for (const k of TOKEN_KEYS) {
    const v = window.localStorage.getItem(k);
    if (v) return v;
  }
  return "";
};

export const writeToken = (token, key = "bizsuite_token") => {
  if (!isBrowser) return;
  TOKEN_KEYS.forEach((k) => window.localStorage.removeItem(k));
  if (token) window.localStorage.setItem(key, token);
};

export const clearToken = () => {
  if (!isBrowser) return;
  TOKEN_KEYS.forEach((k) => window.localStorage.removeItem(k));
};

const attachAuth = (config) => {
  const token = readToken();
  if (!token) return config;

  // Axios v1 may use AxiosHeaders; handle both forms
  config.headers = config.headers || {};
  if (typeof config.headers.set === "function") {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

const shouldRetry = (err) => {
  const cfg = err?.config;
  if (!cfg) return false;

  // Retry only SAFE methods to avoid duplicate inserts
  const method = String(cfg.method || "get").toLowerCase();
  const safe = ["get", "head", "options"].includes(method);
  if (!safe) return false;

  const status = err?.response?.status;
  const msg = String(err?.message || "").toLowerCase();

  const isTimeout = err?.code === "ECONNABORTED" || msg.includes("timeout");
  const isNetwork =
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("connection");
  const isGateway = status === 502 || status === 503 || status === 504;
  const isAuthFail = status === 401 || status === 403;

  return !isAuthFail && (isTimeout || isNetwork || isGateway);
};

const createClient = (timeoutMs) => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: timeoutMs,

    // Enable only if your backend uses cookies/sessions
    // Set in .env: VITE_WITH_CREDENTIALS=true
    withCredentials: String(import.meta.env.VITE_WITH_CREDENTIALS || "false") === "true",
  });

  instance.interceptors.request.use(attachAuth, (e) => Promise.reject(e));

  // Retry once on network/timeout/502/503/504 for SAFE methods only
  instance.interceptors.response.use(
    (res) => res,
    async (err) => {
      const cfg = err?.config;
      if (cfg && !cfg.__retried && shouldRetry(err)) {
        cfg.__retried = true;
        await new Promise((r) => setTimeout(r, 1200));
        return instance(cfg);
      }
      return Promise.reject(err);
    }
  );

  return instance;
};

const api = createClient(20000);

// long client for PDF/report downloads etc.
export const apiLong = createClient(90000);

// optional: wake up Render (cold start)
export const warmUpServer = async () => {
  try {
    await apiLong.get("/health");
  } catch {
    // ignore
  }
};

export default api;
