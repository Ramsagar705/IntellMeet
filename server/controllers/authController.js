const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { dbState } = require("../config/db");
const { getJwtSecret } = require("../config/jwt");
const { state, createId, seedDemoData } = require("../utils/dataStore");
const { sanitizeUser } = require("../middleware/authMiddleware");
const { respondWithControllerError } = require("../utils/controllerError");

const signToken = (user) => {
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role || "member",
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
};

const isValidEmail = (email) =>
  typeof email === "string" &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const isValidPasswordInput = (password) =>
  typeof password === "string" &&
  password.length >= 6 &&
  Buffer.byteLength(password, "utf8") <= 72;

const isValidLoginPassword = (password) =>
  typeof password === "string" &&
  password.length > 0 &&
  Buffer.byteLength(password, "utf8") <= 1024;

const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body || {};

    if (typeof name !== "string" || !name.trim() || !isValidEmail(email) || !password || !confirmPassword) {
      return res.status(400).json({ message: "Name, email, password and confirm password are required" });
    }

    if (!isValidPasswordInput(password) || typeof confirmPassword !== "string") {
      return res.status(400).json({ message: "Password must be at least 6 characters and no more than 72 UTF-8 bytes" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    if (dbState.fallbackMode) {
      seedDemoData();
      const existingUser = state.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ message: "User already exists" });
      }

      const user = {
        _id: createId(),
        name: normalizedName,
        email: normalizedEmail,
        passwordHash: bcrypt.hashSync(password, 10),
        avatar: "",
        role: "member",
        bio: "",
        jobTitle: "",
        department: "",
        status: "online",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      user.id = user._id;
      state.users.push(user);

      const token = signToken(user);
      return res.status(201).json({ token, user: sanitizeUser(user) });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      avatar: "",
      role: "member",
      bio: "",
      jobTitle: "",
      department: "",
      status: "online",
    });

    const token = signToken(user);
    return res.status(201).json({ token, user: sanitizeUser(user.toObject()) });
  } catch (error) {
    return respondWithControllerError(res, "Registration failed", error, "Registration failed");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || !isValidLoginPassword(password)) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (dbState.fallbackMode) {
      seedDemoData();
      const user = state.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);

      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const passwordMatches = bcrypt.compareSync(password, user.passwordHash);
      if (!passwordMatches) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      user.status = "online";
      user.updatedAt = new Date().toISOString();

      const token = signToken(user);
      return res.json({ token, user: sanitizeUser(user) });
    }

    const user = await User.findOne({ email: normalizedEmail }).lean();
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signToken(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    return respondWithControllerError(res, "Login failed", error, "Login failed");
  }
};

const me = async (req, res) => {
  return res.json({ user: req.user });
};

const logout = async (req, res) => {
  return res.json({ message: "Logged out successfully" });
};

module.exports = {
  register,
  login,
  me,
  logout,
};