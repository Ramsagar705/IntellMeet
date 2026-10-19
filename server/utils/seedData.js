const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const Meeting = require("../models/Meeting");

const seedDemoData = async () => {
  const adminEmail = "admin@intellmeet.com";
  const memberEmail = "member@intellmeet.com";

  let adminUser = await User.findOne({ email: adminEmail.toLowerCase() });
  if (!adminUser) {
    adminUser = await User.create({
      name: "Ava Patel",
      email: adminEmail,
      passwordHash: await bcrypt.hash("Admin@123", 10),
      avatar: "",
      role: "admin",
      bio: "Operations leader driving planning, delivery and strategic meetings.",
      jobTitle: "VP of Operations",
      department: "Leadership",
      status: "online",
    });
  }

  let memberUser = await User.findOne({ email: memberEmail.toLowerCase() });
  if (!memberUser) {
    memberUser = await User.create({
      name: "Leo Martinez",
      email: memberEmail,
      passwordHash: await bcrypt.hash("Member@123", 10),
      avatar: "",
      role: "member",
      bio: "Product strategist focused on cross-functional execution.",
      jobTitle: "Product Manager",
      department: "Product",
      status: "online",
    });
  }

  let workspace = await Workspace.findOne({ name: "Atlas Launch Team" });
  if (!workspace) {
    workspace = await Workspace.create({
      name: "Atlas Launch Team",
      description: "Quarterly initiative workspace for launch planning and execution.",
      owner: adminUser._id,
      members: [
        { user: adminUser._id, role: "owner", joinedAt: new Date() },
        { user: memberUser._id, role: "member", joinedAt: new Date() },
      ],
      status: "active",
    });
  }

  let meeting = await Meeting.findOne({ title: "Quarterly customer launch review" });
  if (!meeting) {
    meeting = await Meeting.create({
      title: "Quarterly customer launch review",
      description: "Planning and operational review.",
      workspace: workspace._id,
      createdBy: adminUser._id,
      attendees: [adminUser._id, memberUser._id],
      status: "live",
      scheduledAt: new Date(),
      notes: "Discuss launch readiness, blockers, and follow-up owners.",
      transcript:
        "Ava: We need to prioritize onboarding cleanup before launch. Leo: We should confirm the stakeholder list and update the rollout plan. Both: This action item must be assigned by Friday.",
      summary: "The team aligned on the launch plan, confirmed key blockers, and assigned owners for the remaining delivery items.",
      actionItems: [
        { title: "Finalize onboarding checklist", assignee: "Leo Martinez", status: "Open", dueDate: "This week" },
        { title: "Review stakeholder list", assignee: "Ava Patel", status: "In progress", dueDate: "Tomorrow" },
      ],
    });
  }

  return { adminUser, memberUser, workspace, meeting };
};

module.exports = {
  seedDemoData,
};
