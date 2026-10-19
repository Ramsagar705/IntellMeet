const express = require("express");
const { getProfile, updateProfile } = require("../controllers/userController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/me", getProfile);
router.put("/me", updateProfile);

module.exports = router;
