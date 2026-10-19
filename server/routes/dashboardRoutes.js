const express = require("express");
const { getDashboardSummary } = require("../controllers/dashboardController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/summary", getDashboardSummary);

module.exports = router;
