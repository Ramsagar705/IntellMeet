const { dbState } = require("../config/db");
const User = require("../models/User");
const { state } = require("../utils/dataStore");
const { sanitizeUser } = require("../middleware/authMiddleware");

const getProfile = async (req, res) => {
  try {
    if (dbState.fallbackMode) {
      const user = state.users.find((candidate) => candidate._id === req.user.id || candidate.email === req.user.email);
      return user ? res.json({ user: sanitizeUser(user) }) : res.status(404).json({ message: "User not found" });
    }

    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile", details: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, bio, jobTitle, department, avatar, status } = req.body || {};

    if (dbState.fallbackMode) {
      const user = state.users.find((candidate) => candidate._id === req.user.id || candidate.email === req.user.email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (name) user.name = name;
      if (typeof bio === "string") user.bio = bio;
      if (typeof jobTitle === "string") user.jobTitle = jobTitle;
      if (typeof department === "string") user.department = department;
      if (typeof avatar === "string") user.avatar = avatar;
      if (status) user.status = status;
      user.updatedAt = new Date().toISOString();

      return res.json({ user: sanitizeUser(user) });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (typeof bio === "string") user.bio = bio;
    if (typeof jobTitle === "string") user.jobTitle = jobTitle;
    if (typeof department === "string") user.department = department;
    if (typeof avatar === "string") user.avatar = avatar;
    if (status) user.status = status;
    await user.save();

    return res.json({ user: sanitizeUser(user.toObject()) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", details: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
