const mongoose = require("mongoose");

const workspaceInvitationSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

workspaceInvitationSchema.index(
  { workspace: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
workspaceInvitationSchema.index({ workspace: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("WorkspaceInvitation", workspaceInvitationSchema);
