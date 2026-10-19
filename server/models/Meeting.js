const mongoose = require("mongoose");

const actionItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    assignee: { type: String, default: "Unassigned" },
    status: { type: String, default: "Open" },
    dueDate: { type: String, default: "This week" },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["scheduled", "live", "completed"],
      default: "scheduled",
    },
    scheduledAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
    },
    transcript: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      default: "",
    },
    actionItems: [actionItemSchema],
  },
  { timestamps: true }
);

meetingSchema.index({ workspace: 1, scheduledAt: -1 });

module.exports = mongoose.model("Meeting", meetingSchema);
