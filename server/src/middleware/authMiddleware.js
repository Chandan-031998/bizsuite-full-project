// server/src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const extractToken = (req) => {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;

  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
    return authHeader.trim(); // if token sent without Bearer
  }

  const xToken = req.headers?.["x-access-token"] || req.headers?.["x-auth-token"];
  if (xToken && typeof xToken === "string") return xToken.trim();

  return null;
};

export const authenticateToken = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      message: "Missing token",
      hint: "Send Authorization: Bearer <token>",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });

    const role =
      user?.role ?? user?.Role ?? user?.userRole ?? user?.type ?? "user";

    req.user = {
      ...user,
      role: String(role).toLowerCase(), // ✅ normalize role
    };

    next();
  });
};

export const authorizeRoles = (...allowedRoles) => {
  const allowed = allowedRoles.map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();

    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
  };
};
