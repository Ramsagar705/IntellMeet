const crypto = require("crypto");
const mongoose = require("mongoose");
const { dbState } = require("../config/db");
const Workspace = require("../models/Workspace");
const WorkspaceInvitation = require("../models/WorkspaceInvitation");
const User = require("../models/User");
const Meeting = require("../models/Meeting");
const { state, createId } = require("../utils/dataStore");
const { respondWithControllerError } = require("../utils/controllerError");
const { sendWorkspaceInvitationEmail } = require("../services/invitationEmail");
const {
  getWorkspace,
  getAccessibleWorkspace,
  isWorkspaceOwner,
  isWorkspaceAdmin,
} = require("../utils/accessControl");

const INVITATION_ROLES = ["admin", "member"];
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const isValidEmail = (email) =>
  typeof email === "string" &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const toInvitation = (invitation) => ({
  id: String(invitation._id || invitation.id),
  workspaceId: String(invitation.workspace),
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  invitedBy: String(invitation.invitedBy),
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

const toObject = (workspace) => {
  const id = String(workspace._id || workspace.id);
  return {
    _id: id,
    id,
    name: workspace.name,
    description: workspace.description || "",
    owner: String(workspace.owner),
    members: workspace.members || [],
    status: workspace.status || "active",
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
};

const getAppBaseUrl = () => {
  const configuredUrl = process.env.APP_BASE_URL?.trim();
  const baseUrl = configuredUrl || (
    process.env.NODE_ENV === "production"
      ? ""
      : process.env.CLIENT_URL?.trim() || "http://localhost:5173"
  );
  if (!baseUrl) return null;

  try {
    const parsedUrl = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return null;
    if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") return null;
    if (
      process.env.NODE_ENV === "production" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedUrl.hostname)
    ) return null;
    if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) return null;
    return baseUrl.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

const listWorkspaces = async (req, res) => {
  try {
    if (dbState.fallbackMode) {
      const workspaces = state.workspaces.filter((workspace) =>
        String(workspace.owner) === req.user.id ||
        (workspace.members || []).some((member) => String(member.user) === req.user.id)
      );
      return res.json(workspaces.map(toObject));
    }

    const workspaces = await Workspace.find({
      $or: [{ owner: req.user.id }, { "members.user": req.user.id }],
    }).lean();
    return res.json(workspaces);
  } catch (error) {
    return respondWithControllerError(res, "Fetching workspaces failed", error, "Failed to fetch workspaces");
  }
};

const getWorkspaceById = async (req, res) => {
  try {
    const workspace = await getAccessibleWorkspace(req.params.id, req.user.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    return res.json(dbState.fallbackMode ? toObject(workspace) : workspace);
  } catch (error) {
    return respondWithControllerError(res, "Fetching workspace failed", error, "Failed to fetch workspace");
  }
};

const createWorkspace = async (req, res) => {
  try {
    const { name, description = "" } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Workspace name is required" });
    }
    if (typeof description !== "string") {
      return res.status(400).json({ message: "Workspace description must be text" });
    }

    if (dbState.fallbackMode) {
      const id = createId();
      const workspace = {
        _id: id,
        id,
        name: name.trim(),
        description: description.trim(),
        owner: req.user.id,
        members: [{ user: req.user.id, role: "owner", joinedAt: new Date().toISOString() }],
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.workspaces.unshift(workspace);
      return res.status(201).json(toObject(workspace));
    }

    if (!mongoose.isValidObjectId(req.user.id)) {
      return res.status(401).json({ message: "Authenticated user ID is invalid" });
    }
    const ownerId = new mongoose.Types.ObjectId(req.user.id);
    const workspace = await Workspace.create({
      name: name.trim(),
      description: description.trim(),
      owner: ownerId,
      members: [{ user: ownerId, role: "owner" }],
    });
    return res.status(201).json(workspace);
  } catch (error) {
    return respondWithControllerError(res, "Creating workspace failed", error, "Failed to create workspace");
  }
};

const getWorkspaceMembers = async (req, res) => {
  try {
    const workspace = await getAccessibleWorkspace(req.params.id, req.user.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    const workspaceMembers = [...(workspace.members || [])];
    if (!workspaceMembers.some((member) => String(member.user) === String(workspace.owner))) {
      workspaceMembers.push({ user: workspace.owner, role: "owner" });
    }

    if (dbState.fallbackMode) {
      const members = workspaceMembers.map((member) => {
        const user = state.users.find((candidate) => String(candidate._id || candidate.id) === String(member.user));
        return {
          userId: String(member.user),
          role: member.role || "member",
          joinedAt: member.joinedAt,
          name: user?.name || "Unknown user",
          email: user?.email || "",
          avatar: user?.avatar || "",
          status: user?.status || "offline",
        };
      });
      return res.json({ members, owner: String(workspace.owner) });
    }

    const users = await User.find({ _id: { $in: workspaceMembers.map((member) => member.user) } }).lean();
    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const members = workspaceMembers.map((member) => {
      const user = userMap.get(String(member.user));
      return {
        userId: String(member.user),
        role: member.role || "member",
        joinedAt: member.joinedAt,
        name: user?.name || "Unknown user",
        email: user?.email || "",
        avatar: user?.avatar || "",
        status: user?.status || "offline",
      };
    });
    return res.json({ members, owner: String(workspace.owner) });
  } catch (error) {
    return respondWithControllerError(res, "Fetching workspace members failed", error, "Failed to fetch workspace members");
  }
};

const addWorkspaceMember = async (req, res) => {
  try {
    const { email, role = "member" } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }
    if (!INVITATION_ROLES.includes(role)) {
      return res.status(400).json({ message: "Role must be admin or member" });
    }

    if (!dbState.fallbackMode && !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }
    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace admins can add members" });
    }
    if (role === "admin" && !isWorkspaceOwner(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only the workspace owner can promote members to admin" });
    }
    const appBaseUrl = getAppBaseUrl();
    if (!appBaseUrl) {
      return res.status(503).json({ message: "APP_BASE_URL must be configured with the public application URL" });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const user = dbState.fallbackMode
      ? state.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail)
      : await User.findOne({ email: normalizedEmail }).lean();
    if (user) {
      const userId = String(user._id || user.id);
      if (
        String(workspace.owner) === userId ||
        (workspace.members || []).some((member) => String(member.user) === userId)
      ) {
        return res.status(409).json({ message: "User is already a workspace member" });
      }
    }

    const now = new Date();
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(invitationToken).digest("hex");
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const workspaceId = workspace._id || workspace.id;
    let invitation;
    let alreadyPending = false;
    if (dbState.fallbackMode) {
      state.invitations
        .filter(
          (invitation) =>
            String(invitation.workspace) === String(workspaceId) &&
            invitation.email === normalizedEmail &&
            invitation.status === "pending"
        )
        .forEach((invitation) => {
          if (new Date(invitation.expiresAt) <= now) invitation.status = "expired";
        });
      invitation = state.invitations.find(
        (entry) =>
          String(entry.workspace) === String(workspaceId) &&
          entry.email === normalizedEmail &&
          entry.status === "pending" &&
          new Date(entry.expiresAt) > now
      );
      alreadyPending = Boolean(invitation);
      if (invitation) {
        invitation.tokenHash = tokenHash;
        invitation.expiresAt = expiresAt.toISOString();
        invitation.role = role;
        invitation.invitedBy = req.user.id;
        invitation.updatedAt = now.toISOString();
      }
    } else {
      await WorkspaceInvitation.updateMany(
        { workspace: workspace._id, email: normalizedEmail, status: "pending", expiresAt: { $lte: now } },
        { $set: { status: "expired" } }
      );
      const pending = await WorkspaceInvitation.findOne({
        workspace: workspace._id,
        email: normalizedEmail,
        status: "pending",
        expiresAt: { $gt: now },
      });
      alreadyPending = Boolean(pending);
      const update = {
        $set: {
          tokenHash,
          role,
          invitedBy: req.user.id,
          expiresAt,
        },
      };
      if (pending) {
        invitation = await WorkspaceInvitation.findOneAndUpdate(
          { _id: pending._id, status: "pending", expiresAt: { $gt: now } },
          update,
          { new: true }
        );
      } else {
        try {
          invitation = await WorkspaceInvitation.create({
            workspace: workspace._id,
            email: normalizedEmail,
            invitedBy: req.user.id,
            role,
            tokenHash,
            expiresAt,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          invitation = await WorkspaceInvitation.findOneAndUpdate(
            { workspace: workspace._id, email: normalizedEmail, status: "pending", expiresAt: { $gt: now } },
            update,
            { new: true }
          );
          if (!invitation) throw error;
          alreadyPending = true;
        }
      }

      if (!invitation) {
        return res.status(409).json({ message: "Invitation is no longer pending; please try again" });
      }
    }

    if (dbState.fallbackMode && !invitation) {
      invitation = {
        _id: createId(),
        id: "",
        workspace: workspaceId,
        email: normalizedEmail,
        invitedBy: req.user.id,
        role,
        tokenHash,
        status: "pending",
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      invitation.id = invitation._id;
      state.invitations.push(invitation);
    }

    const invitationLink = `${appBaseUrl}/invitations/accept?token=${encodeURIComponent(invitationToken)}`;
    const emailResult = await sendWorkspaceInvitationEmail({
      to: normalizedEmail,
      workspaceName: workspace.name,
      inviterName: req.user.name,
      inviterEmail: req.user.email,
      role,
      invitationUrl: invitationLink,
    });
    const message = alreadyPending
      ? emailResult.accepted
        ? "A refreshed invitation email was accepted by Resend for delivery."
        : "The email could not be accepted by Resend; copy and share this updated link."
      : emailResult.accepted
        ? "The invitation email was accepted by Resend for delivery."
        : "Resend did not accept the invitation email. Copy and share this link.";
    return res.status(alreadyPending ? 200 : 201).json({
      invitation: toInvitation(invitation),
      invitationLink,
      emailSent: emailResult.accepted,
      emailProviderId: emailResult.providerId,
      alreadyPending,
      message,
    });
  } catch (error) {
    return respondWithControllerError(res, "Adding workspace member failed", error, "Failed to add workspace member");
  }
};

const updateWorkspaceMemberRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body || {};
    if (!INVITATION_ROLES.includes(role)) {
      return res.status(400).json({ message: "Role must be admin or member" });
    }
    if (!dbState.fallbackMode && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid member ID" });
    }

    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace admins can update roles" });
    }
    if (role === "admin" && !isWorkspaceOwner(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only the workspace owner can promote members to admin" });
    }
    const member = (workspace.members || []).find((entry) => String(entry.user) === String(userId));
    if (!member) return res.status(404).json({ message: "Member not found" });
    if (String(member.user) === String(workspace.owner)) {
      return res.status(400).json({ message: "The workspace owner role cannot be changed" });
    }

    member.role = role;
    if (dbState.fallbackMode) {
      workspace.updatedAt = new Date().toISOString();
    } else {
      await Workspace.updateOne(
        { _id: workspace._id, "members.user": member.user },
        { $set: { "members.$.role": role } }
      );
    }

    const user = dbState.fallbackMode
      ? state.users.find((candidate) => String(candidate._id || candidate.id) === String(userId))
      : await User.findById(userId).lean();
    return res.json({
      member: {
        userId: String(userId),
        role,
        joinedAt: member.joinedAt,
        name: user?.name || "Unknown user",
        email: user?.email || "",
        avatar: user?.avatar || "",
        status: user?.status || "offline",
      },
    });
  } catch (error) {
    return respondWithControllerError(res, "Updating workspace member role failed", error, "Failed to update workspace member role");
  }
};

const removeWorkspaceMember = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!dbState.fallbackMode && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid member ID" });
    }
    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace admins can remove members" });
    }
    if (String(workspace.owner) === String(userId)) {
      return res.status(400).json({ message: "The workspace owner cannot be removed" });
    }
    const member = (workspace.members || []).find((entry) => String(entry.user) === String(userId));
    if (!member) return res.status(404).json({ message: "Member not found" });
    if (!isWorkspaceOwner(workspace, req.user.id) && member.role !== "member") {
      return res.status(403).json({ message: "Workspace admins can only remove regular members" });
    }

    if (dbState.fallbackMode) {
      workspace.members = workspace.members.filter((entry) => String(entry.user) !== String(userId));
      workspace.updatedAt = new Date().toISOString();
    } else {
      await Workspace.updateOne(
        { _id: workspace._id, "members.user": member.user },
        { $pull: { members: { user: member.user } } }
      );
    }
    return res.status(204).end();
  } catch (error) {
    return respondWithControllerError(res, "Removing workspace member failed", error, "Failed to remove workspace member");
  }
};

const listWorkspaceInvitations = async (req, res) => {
  try {
    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace admins can view invitations" });
    }
    const now = new Date();
    let invitations;
    if (dbState.fallbackMode) {
      invitations = state.invitations.filter(
        (invitation) => String(invitation.workspace) === String(workspace._id || workspace.id)
      );
      invitations.forEach((invitation) => {
        if (invitation.status === "pending" && new Date(invitation.expiresAt) <= now) {
          invitation.status = "expired";
        }
      });
    } else {
      await WorkspaceInvitation.updateMany(
        { workspace: workspace._id, status: "pending", expiresAt: { $lte: now } },
        { $set: { status: "expired" } }
      );
      invitations = await WorkspaceInvitation.find({ workspace: workspace._id })
        .sort({ createdAt: -1 })
        .lean();
    }
    return res.json(invitations.map(toInvitation));
  } catch (error) {
    return respondWithControllerError(res, "Fetching workspace invitations failed", error, "Failed to fetch invitations");
  }
};

const cancelWorkspaceInvitation = async (req, res) => {
  try {
    if (!dbState.fallbackMode && !mongoose.isValidObjectId(req.params.invitationId)) {
      return res.status(400).json({ message: "Invalid invitation ID" });
    }
    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace admins can cancel invitations" });
    }

    if (dbState.fallbackMode) {
      const invitation = state.invitations.find(
        (entry) =>
          String(entry._id || entry.id) === req.params.invitationId &&
          String(entry.workspace) === String(workspace._id || workspace.id)
      );
      if (!invitation || invitation.status !== "pending") {
        return res.status(404).json({ message: "Pending invitation not found" });
      }
      invitation.status = "cancelled";
      invitation.updatedAt = new Date().toISOString();
    } else {
      const invitation = await WorkspaceInvitation.findOneAndUpdate(
        {
          _id: req.params.invitationId,
          workspace: workspace._id,
          status: "pending",
        },
        { $set: { status: "cancelled" } },
        { new: true }
      );
      if (!invitation) return res.status(404).json({ message: "Pending invitation not found" });
    }
    return res.status(204).end();
  } catch (error) {
    return respondWithControllerError(res, "Cancelling workspace invitation failed", error, "Failed to cancel invitation");
  }
};

const respondToInvitation = async (req, res, nextStatus) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== "string" || !/^[a-f\d]{64}$/i.test(token)) {
      return res.status(400).json({ message: "A valid invitation token is required" });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invitation = dbState.fallbackMode
      ? state.invitations.find((entry) => entry.tokenHash === tokenHash)
      : await WorkspaceInvitation.findOne({ tokenHash });
    if (!invitation) return res.status(404).json({ message: "Invitation not found or invalid" });
    if (invitation.status !== "pending") {
      return res.status(409).json({ message: `Invitation is ${invitation.status}` });
    }
    if (new Date(invitation.expiresAt) <= new Date()) {
      invitation.status = "expired";
      if (dbState.fallbackMode) invitation.updatedAt = new Date().toISOString();
      else await invitation.save();
      return res.status(410).json({ message: "Invitation has expired" });
    }
    if (req.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ message: "Sign in with the email address this invitation was sent to" });
    }

    if (nextStatus === "declined") {
      invitation.status = "declined";
      if (dbState.fallbackMode) invitation.updatedAt = new Date().toISOString();
      else await invitation.save();
      return res.json({ status: "declined" });
    }

    const workspace = await getWorkspace(invitation.workspace);
    if (!workspace) return res.status(404).json({ message: "Workspace no longer exists" });
    const alreadyMember =
      String(workspace.owner) === req.user.id ||
      (workspace.members || []).some((member) => String(member.user) === req.user.id);
    if (!alreadyMember) {
      if (dbState.fallbackMode) {
        workspace.members.push({
          user: req.user.id,
          role: invitation.role,
          joinedAt: new Date().toISOString(),
        });
        workspace.updatedAt = new Date().toISOString();
      } else {
        await Workspace.updateOne(
          { _id: workspace._id, "members.user": { $ne: req.user.id } },
          { $push: { members: { user: req.user.id, role: invitation.role, joinedAt: new Date() } } }
        );
      }
    }
    invitation.status = "accepted";
    if (dbState.fallbackMode) invitation.updatedAt = new Date().toISOString();
    else await invitation.save();
    return res.json({ status: "accepted", workspaceId: String(workspace._id || workspace.id) });
  } catch (error) {
    return respondWithControllerError(res, "Responding to workspace invitation failed", error, "Failed to process invitation");
  }
};

const acceptInvitation = (req, res) => respondToInvitation(req, res, "accepted");
const declineInvitation = (req, res) => respondToInvitation(req, res, "declined");

const updateWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ message: "Workspace name must not be empty" });
    }
    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({ message: "Workspace description must be text" });
    }

    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceOwner(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace owner can edit" });
    }
    if (name !== undefined) workspace.name = name.trim();
    if (description !== undefined) workspace.description = description.trim();

    if (dbState.fallbackMode) {
      workspace.updatedAt = new Date().toISOString();
      return res.json(toObject(workspace));
    }
    await workspace.save();
    return res.json(workspace);
  } catch (error) {
    return respondWithControllerError(res, "Updating workspace failed", error, "Failed to update workspace");
  }
};

const deleteWorkspace = async (req, res) => {
  try {
    const workspace = await getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceOwner(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only the workspace owner can delete it" });
    }

    const hasMeetings = dbState.fallbackMode
      ? state.meetings.some((meeting) => String(meeting.workspace) === String(req.params.id))
      : await Meeting.exists({ workspace: workspace._id });
    if (hasMeetings) {
      return res.status(409).json({ message: "Workspace contains meetings; delete or move them before deleting the workspace" });
    }

    if (dbState.fallbackMode) {
      const index = state.workspaces.findIndex(
        (item) => String(item._id || item.id) === String(req.params.id)
      );
      if (index !== -1) state.workspaces.splice(index, 1);
    } else {
      await Workspace.deleteOne({ _id: workspace._id });
    }

    return res.status(204).end();
  } catch (error) {
    return respondWithControllerError(res, "Deleting workspace failed", error, "Failed to delete workspace");
  }
};

module.exports = {
  listWorkspaces,
  getWorkspace: getWorkspaceById,
  createWorkspace,
  getWorkspaceMembers,
  addWorkspaceMember,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  listWorkspaceInvitations,
  cancelWorkspaceInvitation,
  acceptInvitation,
  declineInvitation,
  updateWorkspace,
  deleteWorkspace,
};
