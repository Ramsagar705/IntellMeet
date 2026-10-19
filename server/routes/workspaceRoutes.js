const express = require("express");
const {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  getWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  listWorkspaceInvitations,
  cancelWorkspaceInvitation,
  updateWorkspace,
  deleteWorkspace,
} = require("../controllers/workspaceController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(requireAuth);
router.get("/", listWorkspaces);
router.post("/", createWorkspace);
router.get("/:id/members", getWorkspaceMembers);
router.post("/:id/members", addWorkspaceMember);
router.delete("/:id/members/:userId", removeWorkspaceMember);
router.patch("/:id/members/:userId/role", updateWorkspaceMemberRole);
router.get("/:id/invitations", listWorkspaceInvitations);
router.delete("/:id/invitations/:invitationId", cancelWorkspaceInvitation);
router.get("/:id", getWorkspace);
router.patch("/:id", updateWorkspace);
router.delete("/:id", deleteWorkspace);

module.exports = router;
