const mongoose = require("mongoose");
const { dbState } = require("../config/db");
const Meeting = require("../models/Meeting");
const Workspace = require("../models/Workspace");
const { state, createId } = require("../utils/dataStore");
const { respondWithControllerError } = require("../utils/controllerError");
const {
  getAccessibleMeeting,
  getWorkspace,
  isWorkspaceAdmin,
  isWorkspaceMember,
} = require("../utils/accessControl");
const { generateMeetingSummary, extractActionItems } = require("../services/aiService");

const UPDATE_FIELDS = ["title", "description", "scheduledAt", "status", "notes", "transcript", "summary", "actionItems", "attendees"];
const MEETING_STATUSES = ["scheduled", "live", "completed"];

const normalizeMeeting = (meeting) => ({
  _id: String(meeting._id || meeting.id),
  id: String(meeting._id || meeting.id),
  title: meeting.title,
  description: meeting.description || "",
  workspace: String(meeting.workspace?._id || meeting.workspace),
  createdBy: String(meeting.createdBy),
  attendees: meeting.attendees || [],
  status: meeting.status || "scheduled",
  scheduledAt: meeting.scheduledAt || new Date().toISOString(),
  notes: meeting.notes || "",
  transcript: meeting.transcript || "",
  summary: meeting.summary || "",
  actionItems: meeting.actionItems || [],
  createdAt: meeting.createdAt,
  updatedAt: meeting.updatedAt,
});

const getUserWorkspaces = async (userId) => {
  if (dbState.fallbackMode) {
    return state.workspaces.filter((workspace) => isWorkspaceMember(workspace, userId));
  }
  return Workspace.find({
    $or: [{ owner: userId }, { "members.user": userId }],
  }).select("_id").lean();
};

const listMeetings = async (req, res) => {
  try {
    const workspaces = await getUserWorkspaces(req.user.id);
    const workspaceIds = workspaces.map((workspace) => String(workspace._id || workspace.id));
    const requestedWorkspace = req.query.workspace;
    const visibleWorkspaceIds = requestedWorkspace
      ? workspaceIds.filter((id) => id === String(requestedWorkspace))
      : workspaceIds;

    if (dbState.fallbackMode) {
      const meetings = state.meetings.filter((meeting) =>
        visibleWorkspaceIds.includes(String(meeting.workspace))
      );
      return res.json(meetings.map(normalizeMeeting));
    }

    const meetings = await Meeting.find({
      workspace: { $in: visibleWorkspaceIds.filter(mongoose.isValidObjectId) },
    }).lean();
    return res.json(meetings.map(normalizeMeeting));
  } catch (error) {
    return respondWithControllerError(res, "Fetching meetings failed", error, "Failed to fetch meetings");
  }
};

const getMeeting = async (req, res) => {
  try {
    const meeting = await getAccessibleMeeting(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    return res.json(normalizeMeeting(meeting));
  } catch (error) {
    return respondWithControllerError(res, "Fetching meeting failed", error, "Failed to fetch meeting");
  }
};

const createMeeting = async (req, res) => {
  try {
    const { title, description = "", workspace: workspaceId, attendees = [] } = req.body || {};
    if (typeof title !== "string" || !title.trim() || typeof workspaceId !== "string" || !workspaceId.trim()) {
      return res.status(400).json({ message: "Meeting title and workspace are required" });
    }
    if (typeof description !== "string" || !Array.isArray(attendees)) {
      return res.status(400).json({ message: "Invalid meeting details" });
    }

    if (!dbState.fallbackMode && !mongoose.isValidObjectId(workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!isWorkspaceMember(workspace, req.user.id)) {
      return res.status(403).json({ message: "You do not have access to this workspace" });
    }
    if (!isWorkspaceAdmin(workspace, req.user.id)) {
      return res.status(403).json({ message: "Only workspace owners and admins can create meetings" });
    }

    const memberIds = new Set((workspace.members || []).map((member) => String(member.user)));
    const requestedAttendees = attendees.map(String);
    if (requestedAttendees.some((attendeeId) => !memberIds.has(attendeeId))) {
      return res.status(400).json({ message: "All attendees must be workspace members" });
    }
    const meetingAttendees = [...new Set([req.user.id, ...requestedAttendees])];

    if (dbState.fallbackMode) {
      const id = createId();
      const now = new Date().toISOString();
      const meeting = {
        _id: id,
        id,
        title: title.trim(),
        description: description.trim(),
        workspace: String(workspaceId),
        createdBy: req.user.id,
        attendees: meetingAttendees,
        status: "scheduled",
        scheduledAt: now,
        notes: "",
        transcript: "",
        summary: "",
        actionItems: [],
        createdAt: now,
        updatedAt: now,
      };
      state.meetings.unshift(meeting);
      return res.status(201).json(normalizeMeeting(meeting));
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      description: description.trim(),
      workspace: workspace._id,
      createdBy: req.user.id,
      attendees: meetingAttendees,
      status: "scheduled",
    });
    return res.status(201).json(normalizeMeeting(meeting));
  } catch (error) {
    return respondWithControllerError(res, "Creating meeting failed", error, "Failed to create meeting");
  }
};

const updateMeeting = async (req, res) => {
  try {
    const meeting = await getAccessibleMeeting(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const workspace = await getAccessibleWorkspace(meeting.workspace?._id || meeting.workspace, req.user.id);
    if (!workspace || (!isWorkspaceAdmin(workspace, req.user.id) && String(meeting.createdBy) !== req.user.id)) {
      return res.status(403).json({ message: "Only the meeting creator or a workspace admin can edit this meeting" });
    }

    const updates = req.body || {};
    const unsupportedFields = Object.keys(updates).filter((field) => !UPDATE_FIELDS.includes(field));
    if (unsupportedFields.length) {
      return res.status(400).json({ message: `Unsupported meeting fields: ${unsupportedFields.join(", ")}` });
    }
    if (updates.title !== undefined && (typeof updates.title !== "string" || !updates.title.trim())) {
      return res.status(400).json({ message: "Meeting title must not be empty" });
    }
    if (updates.description !== undefined && typeof updates.description !== "string") {
      return res.status(400).json({ message: "Meeting description must be text" });
    }
    if (
      updates.scheduledAt !== undefined &&
      (typeof updates.scheduledAt !== "string" || Number.isNaN(Date.parse(updates.scheduledAt)))
    ) {
      return res.status(400).json({ message: "Meeting schedule must be a valid date" });
    }
    if (updates.status !== undefined && !MEETING_STATUSES.includes(updates.status)) {
      return res.status(400).json({ message: "Invalid meeting status" });
    }
    for (const field of ["notes", "transcript", "summary"]) {
      if (updates[field] !== undefined && typeof updates[field] !== "string") {
        return res.status(400).json({ message: `Meeting ${field} must be text` });
      }
    }
    if (updates.attendees !== undefined) {
      if (!Array.isArray(updates.attendees) || updates.attendees.some((id) => typeof id !== "string")) {
        return res.status(400).json({ message: "Attendees must be a list" });
      }
      const memberIds = new Set((workspace.members || []).map((member) => String(member.user)));
      if (updates.attendees.map(String).some((id) => !memberIds.has(id))) {
        return res.status(400).json({ message: "All attendees must be workspace members" });
      }
      updates.attendees = [...new Set([req.user.id, ...updates.attendees.map(String)])];
    }
    if (
      updates.actionItems !== undefined &&
      (!Array.isArray(updates.actionItems) ||
        updates.actionItems.some(
          (item) =>
            !item ||
            typeof item !== "object" ||
            Array.isArray(item) ||
            typeof item.title !== "string" ||
            !item.title.trim()
        ))
    ) {
      return res.status(400).json({ message: "Action items must be a list" });
    }

    for (const [field, value] of Object.entries(updates)) {
      if (field === "title") meeting[field] = value.trim();
      else if (field === "description") meeting[field] = value.trim();
      else if (field === "scheduledAt") meeting[field] = new Date(value);
      else meeting[field] = value;
    }
    if (dbState.fallbackMode) meeting.updatedAt = new Date().toISOString();
    else await meeting.save();
    return res.json(normalizeMeeting(meeting));
  } catch (error) {
    return respondWithControllerError(res, "Updating meeting failed", error, "Failed to update meeting");
  }
};

const deleteMeeting = async (req, res) => {
  try {
    const meeting = await getAccessibleMeeting(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });

    const workspace = await getAccessibleWorkspace(meeting.workspace?._id || meeting.workspace, req.user.id);
    if (!workspace || (!isWorkspaceAdmin(workspace, req.user.id) && String(meeting.createdBy) !== req.user.id)) {
      return res.status(403).json({ message: "Only the meeting creator or a workspace admin can delete this meeting" });
    }

    if (dbState.fallbackMode) {
      const index = state.meetings.findIndex(
        (item) => String(item._id || item.id) === String(req.params.id)
      );
      if (index !== -1) state.meetings.splice(index, 1);
    } else {
      await Meeting.deleteOne({ _id: meeting._id });
    }
    return res.status(204).end();
  } catch (error) {
    return respondWithControllerError(res, "Deleting meeting failed", error, "Failed to delete meeting");
  }
};

const getMeetingManager = async (meeting, userId) => {
  const workspace = await getAccessibleWorkspace(meeting.workspace?._id || meeting.workspace, userId);
  return workspace && (isWorkspaceAdmin(workspace, userId) || String(meeting.createdBy) === userId);
};

const generateSummary = async (req, res) => {
  try {
    const meeting = await getAccessibleMeeting(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (!(await getMeetingManager(meeting, req.user.id))) {
      return res.status(403).json({ message: "Only the meeting creator or a workspace admin can generate meeting insights" });
    }
    const summary = await generateMeetingSummary(meeting.transcript || meeting.notes, meeting.title);
    meeting.summary = summary;
    if (dbState.fallbackMode) meeting.updatedAt = new Date().toISOString();
    else await meeting.save();
    return res.json({ summary });
  } catch (error) {
    return respondWithControllerError(res, "Generating meeting summary failed", error, "Failed to generate summary");
  }
};

const generateActions = async (req, res) => {
  try {
    const meeting = await getAccessibleMeeting(req.params.id, req.user.id);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (!(await getMeetingManager(meeting, req.user.id))) {
      return res.status(403).json({ message: "Only the meeting creator or a workspace admin can generate meeting insights" });
    }
    const actionItems = await extractActionItems(meeting.transcript || meeting.notes);
    meeting.actionItems = actionItems;
    if (dbState.fallbackMode) meeting.updatedAt = new Date().toISOString();
    else await meeting.save();
    return res.json({ actionItems });
  } catch (error) {
    return respondWithControllerError(res, "Generating meeting action items failed", error, "Failed to generate action items");
  }
};

module.exports = {
  listMeetings,
  getMeeting,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  generateSummary,
  generateActions,
};
