const express = require("express");
const { acceptInvitation, declineInvitation } = require("../controllers/workspaceController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.post("/accept", acceptInvitation);
router.post("/decline", declineInvitation);

module.exports = router;
