const express = require("express");
const { listMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting, generateSummary, generateActions } = require("../controllers/meetingController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/", listMeetings);
router.post("/", createMeeting);
router.get("/:id", getMeeting);
router.patch("/:id", updateMeeting);
router.delete("/:id", deleteMeeting);
router.post("/:id/generate-summary", generateSummary);
router.post("/:id/generate-actions", generateActions);

module.exports = router;
