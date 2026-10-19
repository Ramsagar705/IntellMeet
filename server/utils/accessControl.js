const mongoose = require("mongoose");
const { dbState } = require("../config/db");
const Workspace = require("../models/Workspace");
const Meeting = require("../models/Meeting");
const { state } = require("./dataStore");

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value._id !== undefined && value._id !== value) return normalizeId(value._id);
  }
  return String(value);
};

const getWorkspace = async (id) => {
  if (dbState.fallbackMode) {
    return state.workspaces.find((workspace) => normalizeId(workspace._id || workspace.id) === normalizeId(id)) || null;
  }

  if (!mongoose.isValidObjectId(id)) return null;
  return Workspace.findById(id);
};

const isWorkspaceMember = (workspace, userId) => {
  const normalizedUserId = normalizeId(userId);
  return (
    normalizeId(workspace.owner) === normalizedUserId ||
    (workspace.members || []).some((member) => normalizeId(member.user) === normalizedUserId)
  );
};

const isWorkspaceOwner = (workspace, userId) => {
  const normalizedUserId = normalizeId(userId);
  return normalizeId(workspace.owner) === normalizedUserId ||
    (workspace.members || []).some(
      (member) => normalizeId(member.user) === normalizedUserId && member.role === "owner"
    );
};

const isWorkspaceAdmin = (workspace, userId) =>
  isWorkspaceOwner(workspace, userId) ||
  (workspace.members || []).some(
    (member) =>
      normalizeId(member.user) === normalizeId(userId) &&
      (member.role === "admin" || member.role === "owner")
  );

const getAccessibleWorkspace = async (id, userId) => {
  const workspace = await getWorkspace(id);
  return workspace && isWorkspaceMember(workspace, userId) ? workspace : null;
};

const getAccessibleMeeting = async (id, userId) => {
  let meeting;
  if (dbState.fallbackMode) {
    meeting = state.meetings.find((item) => String(item._id || item.id) === String(id));
  } else {
    if (!mongoose.isValidObjectId(id)) return null;
    meeting = await Meeting.findById(id);
  }

  if (!meeting) return null;
  const workspaceId = meeting.workspace?._id || meeting.workspace;
  const workspace = await getAccessibleWorkspace(workspaceId, userId);
  return workspace ? meeting : null;
};

module.exports = {
  getWorkspace,
  getAccessibleWorkspace,
  getAccessibleMeeting,
  isWorkspaceMember,
  isWorkspaceOwner,
  isWorkspaceAdmin,
  normalizeId,
};
