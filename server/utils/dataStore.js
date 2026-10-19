const bcrypt = require("bcryptjs");

const state = {
  users: [],
  workspaces: [],
  meetings: [],
  tasks: [],
  invitations: [],
  notifications: [],
};

const createId = () => `id_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const seedDemoData = () => {
  if (state.users.length > 0) {
    return state;
  }

  const adminId = createId();
  const memberId = createId();
  const workspaceId = createId();
  const meetingId = createId();

  const adminUser = {
    _id: adminId,
    id: adminId,
    name: "Ava Patel",
    email: "admin@intellmeet.com",
    passwordHash: bcrypt.hashSync("Admin@123", 10),
    avatar: "",
    role: "admin",
    bio: "Operations leader driving planning, delivery and strategic meetings.",
    jobTitle: "VP of Operations",
    department: "Leadership",
    status: "online",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const memberUser = {
    _id: memberId,
    id: memberId,
    name: "Leo Martinez",
    email: "member@intellmeet.com",
    passwordHash: bcrypt.hashSync("Member@123", 10),
    avatar: "",
    role: "member",
    bio: "Product strategist focused on cross-functional execution.",
    jobTitle: "Product Manager",
    department: "Product",
    status: "online",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const workspace = {
    _id: workspaceId,
    id: workspaceId,
    name: "Atlas Launch Team",
    description: "Quarterly initiative workspace for launch planning and execution.",
    owner: adminId,
    members: [
      { user: adminId, role: "owner", joinedAt: new Date().toISOString() },
      { user: memberId, role: "member", joinedAt: new Date().toISOString() },
    ],
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const meeting = {
    _id: meetingId,
    id: meetingId,
    title: "Quarterly customer launch review",
    description: "Planning and operational review.",
    workspace: workspaceId,
    createdBy: adminId,
    attendees: [adminId, memberId],
    status: "live",
    scheduledAt: new Date().toISOString(),
    notes: "Discuss launch readiness, blockers, and follow-up owners.",
    transcript: "Ava: We need to prioritize onboarding cleanup before launch. Leo: We should confirm the stakeholder list and update the rollout plan. Both: This action item must be assigned by Friday.",
    summary: "The team aligned on the launch plan, confirmed key blockers, and assigned owners for the remaining delivery items.",
    actionItems: [
      { title: "Finalize onboarding checklist", assignee: "Leo Martinez", status: "Open", dueDate: "This week" },
      { title: "Review stakeholder list", assignee: "Ava Patel", status: "In progress", dueDate: "Tomorrow" },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.users.push(adminUser, memberUser);
  state.workspaces.push(workspace);
  state.meetings.push(meeting);
  state.notifications.push(
    { id: createId(), title: "Action item assigned", message: "Ava assigned launch checklist follow-up to Leo.", createdAt: new Date().toISOString() },
    { id: createId(), title: "Meeting summary ready", message: "Quarterly launch review summary was generated.", createdAt: new Date().toISOString() }
  );

  return state;
};

module.exports = {
  state,
  createId,
  seedDemoData,
};
