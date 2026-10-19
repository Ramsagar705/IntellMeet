const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const { dbState } = require("../config/db");
const { createTask, deleteTask, listTasks, updateTask } = require("../controllers/taskController");
const { state } = require("../utils/dataStore");

const owner = { id: "task-owner", email: "owner@example.com", name: "Owner" };
const member = { id: "task-member", email: "member@example.com", name: "Member" };
const outsider = { id: "task-outsider", email: "outside@example.com", name: "Outsider" };

const invoke = async (handler, { user = owner, params = {}, query = {}, body = {} } = {}) => {
  const result = { status: 200, body: undefined };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
  };
  await handler({ user, params, query, body }, res);
  return result;
};

describe("workspace tasks", () => {
  beforeEach(() => {
    dbState.fallbackMode = true;
    state.users = [owner, member, outsider].map((user) => ({ ...user, _id: user.id }));
    state.workspaces = [
      {
        _id: "task-workspace",
        id: "task-workspace",
        owner: owner.id,
        members: [
          { user: owner.id, role: "owner" },
          { user: member.id, role: "member" },
        ],
      },
      {
        _id: "other-workspace",
        id: "other-workspace",
        owner: outsider.id,
        members: [{ user: outsider.id, role: "owner" }],
      },
    ];
    state.tasks = [];
  });

  it("creates and reloads workspace-scoped tasks with defaults and persisted fields", async () => {
    const created = await invoke(createTask, {
      body: {
        workspaceId: "task-workspace",
        title: "Prepare release",
        description: "Review the release checklist",
        assignee: member.id,
        priority: "High",
        dueDate: "2026-10-25",
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.status, "Backlog");
    assert.equal(created.body.assigneeName, member.name);
    assert.equal(created.body.canDelete, true);

    const reloaded = await invoke(listTasks, {
      user: member,
      query: { workspace: "task-workspace" },
    });
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.length, 1);
    assert.equal(reloaded.body[0].title, "Prepare release");
    assert.equal(reloaded.body[0].dueDate, "2026-10-25");
    assert.equal(reloaded.body[0].canEdit, true);
    assert.equal(reloaded.body[0].canDelete, false);
  });

  it("allows an authorized assignee to transition status and rejects invalid states", async () => {
    const created = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Move through columns", assignee: member.id },
    });

    const moved = await invoke(updateTask, {
      user: member,
      params: { id: created.body.id },
      body: { status: "In Progress" },
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.status, "In Progress");

    const completed = await invoke(updateTask, {
      user: member,
      params: { id: created.body.id },
      body: { status: "Done" },
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, "Done");

    const invalid = await invoke(updateTask, {
      user: member,
      params: { id: created.body.id },
      body: { status: "Archived" },
    });
    assert.equal(invalid.status, 400);
  });

  it("updates task details and assignment for the creator", async () => {
    const created = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Draft" },
    });
    const updated = await invoke(updateTask, {
      params: { id: created.body.id },
      body: {
        title: "Final draft",
        description: "Reviewed and ready",
        assignee: member.id,
        priority: "High",
        dueDate: "2026-11-01",
      },
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.title, "Final draft");
    assert.equal(updated.body.description, "Reviewed and ready");
    assert.equal(updated.body.assignee, member.id);
    assert.equal(updated.body.assigneeName, member.name);
    assert.equal(updated.body.priority, "High");
    assert.equal(updated.body.dueDate, "2026-11-01");
  });

  it("rejects non-member workspace access and cross-workspace task access", async () => {
    const created = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Private task" },
    });

    const forbiddenCreate = await invoke(createTask, {
      user: outsider,
      body: { workspaceId: "task-workspace", title: "Unauthorized task" },
    });
    const list = await invoke(listTasks, {
      user: outsider,
      query: { workspace: "task-workspace" },
    });
    const edit = await invoke(updateTask, {
      user: outsider,
      params: { id: created.body.id },
      body: { title: "Changed" },
    });
    const remove = await invoke(deleteTask, {
      user: outsider,
      params: { id: created.body.id },
    });

    assert.equal(forbiddenCreate.status, 404);
    assert.equal(list.status, 404);
    assert.equal(edit.status, 404);
    assert.equal(remove.status, 404);
  });

  it("rejects assigning a task to someone outside its workspace", async () => {
    const result = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Invalid assignee", assignee: outsider.id },
    });

    assert.equal(result.status, 400);
    assert.match(result.body.message, /member of this workspace/);
    assert.equal(state.tasks.length, 0);
  });

  it("allows only workspace admins or creators to delete tasks", async () => {
    const created = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Delete permission", assignee: member.id },
    });

    const denied = await invoke(deleteTask, {
      user: member,
      params: { id: created.body.id },
    });
    assert.equal(denied.status, 403);
    assert.equal(state.tasks.length, 1);

    const deleted = await invoke(deleteTask, { params: { id: created.body.id } });
    assert.equal(deleted.status, 200);
    assert.equal(state.tasks.length, 0);
  });

  it("does not allow an unrelated workspace member to edit an unassigned task", async () => {
    const created = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Owner task" },
    });
    const denied = await invoke(updateTask, {
      user: member,
      params: { id: created.body.id },
      body: { title: "Unauthorized edit" },
    });

    assert.equal(denied.status, 403);
    assert.equal(state.tasks[0].title, "Owner task");
  });

  it("validates required title, supported fields, and calendar dates", async () => {
    const missingTitle = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: " " },
    });
    const badDate = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Bad date", dueDate: "2026-02-30" },
    });
    const extraField = await invoke(createTask, {
      body: { workspaceId: "task-workspace", title: "Extra", createdBy: outsider.id },
    });

    assert.equal(missingTitle.status, 400);
    assert.equal(badDate.status, 400);
    assert.equal(extraField.status, 400);
  });
});
