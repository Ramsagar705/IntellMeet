const jwt = require("jsonwebtoken");
const { dbState } = require("../config/db");
const { getJwtSecret } = require("../config/jwt");
const User = require("../models/User");
const { state } = require("../utils/dataStore");

const sanitizeUser = (user) => ({
  id: String(user._id || user.id),
  _id: String(user._id || user.id),
  name: user.name,
  email: user.email,
  avatar: user.avatar || "",
  role: user.role || "member",
  bio: user.bio || "",
  jobTitle: user.jobTitle || "",
  department: user.department || "",
  status: user.status || "online",
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const authenticateToken = async (token) => {
  const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
  const user = dbState.fallbackMode
    ? state.users.find((candidate) => candidate._id === decoded.id || candidate.email === decoded.email)
    : await User.findById(decoded.id).lean();

  return user ? sanitizeUser(user) : null;
};

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== "string") {
    return res.status(401).json({ message: "Authentication required" });
  }

  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const user = await authenticateToken(token);
    if (!user) {
      if (dbState.fallbackMode) {
        return res.status(503).json({ message: "Authentication data is unavailable in local fallback storage" });
      }
      return res.status(401).json({ message: "User not found" });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError" || error?.name === "NotBeforeError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    console.error(`Authentication lookup failed: ${error.name || "UnknownError"}`);
    return res.status(503).json({ message: "Authentication service is temporarily unavailable" });
  }
};

const requireRole = (roles = []) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have access to this resource" });
  }

  next();
};

module.exports = {
  requireAuth,
  requireRole,
  sanitizeUser,
  authenticateToken,
};