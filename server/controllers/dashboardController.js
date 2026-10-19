const { dbState } = require("../config/db");
const Workspace = require("../models/Workspace");
const Meeting = require("../models/Meeting");
const { state } = require("../utils/dataStore");

const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    if (dbState.fallbackMode) {
      const myWorkspaces = state.workspaces.filter((workspace) => {
        const memberIds = (workspace.members || []).map((member) => member.user);
        return workspace.owner === userId || memberIds.includes(userId);
      });

      const myMeetings = state.meetings.filter((meeting) => {
        return meeting.createdBy === userId || meeting.attendees.includes(userId);
      });

      const activeMeetingCount = myMeetings.filter((meeting) => meeting.status === "live").length;
      const totalTasks = myMeetings.reduce((count, meeting) => count + (meeting.actionItems || []).length, 0);

      return res.json({
        user: req.user,
        stats: {
          workspaces: myWorkspaces.length,
          meetings: myMeetings.length,
          activeMeetings: activeMeetingCount,
          tasks: totalTasks,
          engagement: 92,
          aiSummaryCoverage: 87,
        },
        notifications: state.notifications.slice(0, 3),
        workspaces: myWorkspaces,
        meetings: myMeetings,
      });
    }

    const [workspaces, meetings] = await Promise.all([
      Workspace.find({
        $or: [{ owner: userId }, { "members.user": userId }],
      }).lean(),
      Meeting.find({
        $or: [{ createdBy: userId }, { attendees: userId }],
      }).populate("workspace", "name description").lean(),
    ]);

    const activeMeetingCount = meetings.filter((meeting) => meeting.status === "live").length;
    const totalTasks = meetings.reduce((count, meeting) => count + (meeting.actionItems || []).length, 0);

    return res.json({
      user: req.user,
      stats: {
        workspaces: workspaces.length,
        meetings: meetings.length,
        activeMeetings: activeMeetingCount,
        tasks: totalTasks,
        engagement: 92,
        aiSummaryCoverage: 87,
      },
      notifications: [],
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        _id: workspace._id.toString(),
        id: workspace._id.toString(),
      })),
      meetings: meetings.map((meeting) => ({
        ...meeting,
        _id: meeting._id.toString(),
        id: meeting._id.toString(),
        workspace: meeting.workspace && typeof meeting.workspace === "object" ? meeting.workspace._id?.toString?.() || meeting.workspace : meeting.workspace,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch dashboard summary", details: error.message });
  }
};

module.exports = {
  getDashboardSummary,
};
