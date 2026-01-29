// client/src/api/axios.js
import axios from "axios";

// Set in client/.env:
// VITE_API_BASE_URL=http://localhost:4000
const RAW = import.meta.env.VITE_API_BASE_URL || "https://bizsuite-full-project.onrender.com";

// normalize + ensure /api suffix
const cleaned = String(RAW).replace(/\/+$/, "");
const baseURL = cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bizsuite_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
