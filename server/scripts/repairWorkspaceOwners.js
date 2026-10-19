const mongoose = require("mongoose");
require("dotenv").config();

const { connectDB, dbState } = require("../config/db");
const Workspace = require("../models/Workspace");

const repairWorkspaceOwners = async () => {
  try {
    const connected = await connectDB();
    if (!connected || dbState.fallbackMode) {
      throw new Error("A MongoDB connection is required; no workspace data was changed");
    }

    let workspacesUpdated = 0;
    let ownerMembershipsAdded = 0;
    const cursor = Workspace.find({}).select("_id owner").cursor();

    for await (const workspace of cursor) {
      const ownerId = workspace.owner;
      const existingOwnerMembership = await Workspace.updateOne(
        { _id: workspace._id, "members.user": ownerId },
        { $set: { "members.$[ownerMember].role": "owner" } },
        { arrayFilters: [{ "ownerMember.user": ownerId }] }
      );
      const addedOwnerMembership = await Workspace.updateOne(
        {
          _id: workspace._id,
          members: { $not: { $elemMatch: { user: ownerId } } },
        },
        { $push: { members: { user: ownerId, role: "owner" } } }
      );

      if (existingOwnerMembership.modifiedCount || addedOwnerMembership.modifiedCount) {
        workspacesUpdated += 1;
      }
      if (addedOwnerMembership.modifiedCount) ownerMembershipsAdded += 1;
    }

    console.log(
      `Workspace owner repair complete: ${workspacesUpdated} workspaces updated, ${ownerMembershipsAdded} owner memberships added`
    );
  } finally {
    await mongoose.disconnect();
  }
};

repairWorkspaceOwners().catch((error) => {
  console.error(`Workspace owner repair failed: ${error.message}`);
  process.exitCode = 1;
});
