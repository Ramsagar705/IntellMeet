const mongoose = require("mongoose");
const { dbState } = require("../config/db");
const Task = require("../models/Task");
const { state, createId } = require("../utils/dataStore");
const { respondWithControllerError } = require("../utils/controllerError");
const {
  getAccessibleWorkspace,
  getWorkspace,
  isWorkspaceAdmin,
  isWorkspaceMember,
  normalizeId,
} = require("../utils/accessControl");

const TASK_STATUSES = ["Backlog", "In Progress", "Done"];
const TASK_PRIORITIES = ["Low", "Medium", "High"];
const TASK_FIELDS = ["title", "description", "assignee", "priority", "dueDate", "status"];

const getWorkspaceUserIds = (workspace) => new Set([
  normalizeId(workspace.owner),
  ...(workspace.members || []).map((member) => normalizeId(member.user)),
]);

const isValidDueDate = (value) => {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const normalizeTask = (task, userId) => {
  const assigneeId = task.assignee ? normalizeId(task.assignee) : "";
  const fallbackAssignee = dbState.fallbackMode
    ? state.users.find((user) => normalizeId(user._id || user.id) === assigneeId)
    : null;
  const creatorId = normalizeId(task.createdBy);
  const admin = task.workspaceRecord ? isWorkspaceAdmin(task.workspaceRecord, userId) : false;

  return {
    id: normalizeId(task._id || task.id),
    workspaceId: normalizeId(task.workspace?._id || task.workspace),
    title: task.title,
    description: task.description || "",
    assignee: assigneeId,
    assigneeName: task.assignee?.name || fallbackAssignee?.name || "",
    priority: task.priority,
    dueDate: task.dueDate || "",
    status: task.status,
    createdBy: creatorId,
    canEdit: admin || creatorId === userId || assigneeId === userId,
    canDelete: admin || creatorId === userId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
};

const getTaskById = async (id) => {
  if (dbState.fallbackMode) {
    return state.tasks.find((task) => normalizeId(task._id || task.id) === normalizeId(id)) || null;
  }
  if (!mongoose.isValidObjectId(id)) return null;
  return Task.findById(id).populate("assignee", "name").lean();
};

const validateTaskFields = (updates, { creating = false } = {}) => {
  const unsupportedFields = Object.keys(updates).filter((field) =>
    ![...TASK_FIELDS, ...(creating ? ["workspaceId"] : [])].includes(field)
  );
  if (unsupportedFields.length) {
    return `Unsupported task fields: ${unsupportedFields.join(", ")}`;
  }
  if (creating && (typeof updates.workspaceId !== "string" || !updates.workspaceId.trim())) {
    return "Workspace is required";
  }
  if (creating && (typeof updates.title !== "string" || !updates.title.trim())) {
    return "Task title is required";
  }
  if (
    updates.title !== undefined &&
    (typeof updates.title !== "string" || !updates.title.trim() || updates.title.trim().length > 200)
  ) {
    return "Task title must be between 1 and 200 characters";
  }
  if (updates.description !== undefined && (
    typeof updates.description !== "string" || updates.description.length > 4000
  )) {
    return "Task description must be text no longer than 4000 characters";
  }
  if (updates.assignee !== undefined && updates.assignee !== null && (
    typeof updates.assignee !== "string"
  )) {
    return "Assignee must be a workspace member";
  }
  if (updates.priority !== undefined && !TASK_PRIORITIES.includes(updates.priority)) {
    return "Priority must be Low, Medium, or High";
  }
  if (updates.status !== undefined && !TASK_STATUSES.includes(updates.status)) {
    return "Status must be Backlog, In Progress, or Done";
  }
  if (updates.dueDate !== undefined && !isValidDueDate(updates.dueDate)) {
    return "Due date must be a valid date";
  }
  return null;
};

const validateAssignee = (updates, workspace) => {
  if (updates.assignee === undefined || updates.assignee === null || updates.assignee === "") return null;
  return getWorkspaceUserIds(workspace).has(normalizeId(updates.assignee))
    ? null
    : "Assignee must be a member of this workspace";
};

const taskBody = (updates) => ({
  title: updates.title.trim(),
  description: updates.description?.trim() || "",
  assignee: updates.assignee || null,
  priority: updates.priority || "Medium",
  dueDate: updates.dueDate || "",
  status: updates.status || "Backlog",
});

const listTasks = async (req, res) => {
  try {
    const workspaceId = typeof req.query.workspace === "string" ? req.query.workspace.trim() : "";
    if (!workspaceId) return res.status(400).json({ message: "Workspace is required" });
    const workspace = await getAccessibleWorkspace(workspaceId, req.user.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    let tasks;
    if (dbState.fallbackMode) {
      tasks = state.tasks.filter((task) => normalizeId(task.workspace) === normalizeId(workspaceId));
    } else {
      tasks = await Task.find({ workspace: workspace._id })
        .populate("assignee", "name")
        .sort({ createdAt: -1 })
        .lean();
    }
    return res.json(tasks.map((task) => normalizeTask({ ...task, workspaceRecord: workspace }, req.user.id)));
  } catch (error) {
    return respondWithControllerError(res, "Fetching tasks failed", error, "Failed to fetch tasks");
  }
};

const createTask = async (req, res) => {
  try {
    const updates = req.body || {};
    const validationError = validateTaskFields(updates, { creating: true });
    if (validationError) return res.status(400).json({ message: validationError });
    if (!dbState.fallbackMode && !mongoose.isValidObjectId(updates.workspaceId)) {
      return res.status(400).json({ message: "Invalid workspace ID" });
    }
    const workspace = await getWorkspace(updates.workspaceId);
    if (!workspace || !isWorkspaceMember(workspace, req.user.id)) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const assigneeError = validateAssignee(updates, workspace);
    if (assigneeError) return res.status(400).json({ message: assigneeError });

    const values = taskBody(updates);
    let task;
    if (dbState.fallbackMode) {
      const id = createId();
      const now = new Date().toISOString();
      task = {
        ...values,
        _id: id,
        id,
        workspace: normalizeId(workspace._id || workspace.id),
        createdBy: req.user.id,
        createdAt: now,
        updatedAt: now,
      };
      state.tasks.unshift(task);
    } else {
      task = await Task.create({
        ...values,
        workspace: workspace._id,
        createdBy: req.user.id,
      });
      task = await Task.findById(task._id).populate("assignee", "name").lean();
    }
    return res.status(201).json(normalizeTask({ ...task, workspaceRecord: workspace }, req.user.id));
  } catch (error) {
    return respondWithControllerError(res, "Creating task failed", error, "Failed to create task");
  }
};

const updateTask = async (req, res) => {
  try {
    const updates = req.body || {};
    const validationError = validateTaskFields(updates);
    if (validationError) return res.status(400).json({ message: validationError });
    const task = await getTaskById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    const workspaceId = normalizeId(task.workspace?._id || task.workspace);
    const workspace = await getAccessibleWorkspace(workspaceId, req.user.id);
    if (!workspace) return res.status(404).json({ message: "Task not found" });

    const taskWithWorkspace = { ...task, workspaceRecord: workspace };
    const currentTask = normalizeTask(taskWithWorkspace, req.user.id);
    if (!currentTask.canEdit) {
      return res.status(403).json({ message: "Only workspace admins, the task creator, or its assignee can edit this task" });
    }

    const assigneeError = validateAssignee(updates, workspace);
    if (assigneeError) return res.status(400).json({ message: assigneeError });
    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Provide at least one task field to update" });

    const values = {};
    for (const field of TASK_FIELDS) {
      if (updates[field] !== undefined) {
        values[field] = field === "title" || field === "description"
          ? updates[field].trim()
          : updates[field] || (field === "assignee" ? null : "");
      }
    }
    let savedTask;
    if (dbState.fallbackMode) {
      Object.assign(task, values, { updatedAt: new Date().toISOString() });
      savedTask = task;
    } else {
      savedTask = await Task.findByIdAndUpdate(req.params.id, { $set: values }, {
        new: true,
        runValidators: true,
      }).populate("assignee", "name").lean();
    }
    return res.json(normalizeTask({ ...savedTask, workspaceRecord: workspace }, req.user.id));
  } catch (error) {
    return respondWithControllerError(res, "Updating task failed", error, "Failed to update task");
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await getTaskById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    const workspaceId = normalizeId(task.workspace?._id || task.workspace);
    const workspace = await getAccessibleWorkspace(workspaceId, req.user.id);
    if (!workspace) return res.status(404).json({ message: "Task not found" });
    const currentTask = normalizeTask({ ...task, workspaceRecord: workspace }, req.user.id);
    if (!currentTask.canDelete) {
      return res.status(403).json({ message: "Only workspace admins or the task creator can delete this task" });
    }

    if (dbState.fallbackMode) {
      state.tasks = state.tasks.filter((entry) => normalizeId(entry._id || entry.id) !== currentTask.id);
    } else {
      await Task.findByIdAndDelete(req.params.id);
    }
    return res.json({ message: "Task deleted" });
  } catch (error) {
    return respondWithControllerError(res, "Deleting task failed", error, "Failed to delete task");
  }
};

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
};
