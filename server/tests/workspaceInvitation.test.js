const assert = require("node:assert/strict");
const { beforeEach, describe, it } = require("node:test");
const mongoose = require("mongoose");
const { dbState } = require("../config/db");
const {
  addWorkspaceMember,
  acceptInvitation,
  cancelWorkspaceInvitation,
  createWorkspace,
  getWorkspaceMembers,
  listWorkspaceInvitations,
  removeWorkspaceMember,
} = require("../controllers/workspaceController");
const { state } = require("../utils/dataStore");
const { createMeeting } = require("../controllers/meetingController");
const { isWorkspaceAdmin, isWorkspaceMember, isWorkspaceOwner } = require("../utils/accessControl");

const owner = { id: "user-owner", email: "owner@example.com", name: "Owner" };
const member = { id: "user-member", email: "member@example.com", name: "Member" };
const invitedUser = { id: "user-invited", email: "invitee@example.com", name: "Invitee" };
const outsider = { id: "user-outsider", email: "outside@example.com", name: "Outsider" };

const invoke = async (handler, { user = owner, params = {}, body = {} } = {}) => {
  const result = { status: 200, body: undefined, ended: false };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
    end() {
      result.ended = true;
      return this;
    },
  };
  await handler({ user, params, body }, res);
  return result;
};

const createInvitation = async (email = invitedUser.email, role = "member") => {
  const result = await invoke(addWorkspaceMember, {
    params: { id: "workspace-test" },
    body: { email, role },
  });
  assert.equal(result.status, 201);
  return {
    result,
    token: new URL(result.body.invitationLink).searchParams.get("token"),
  };
};

describe("workspace invitations", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.RESEND_API_KEY = "";
    process.env.EMAIL_FROM = "";
    delete process.env.APP_BASE_URL;
    dbState.fallbackMode = true;
    state.users = [owner, member, invitedUser, outsider].map((user) => ({
      ...user,
      _id: user.id,
      avatar: "",
      status: "online",
    }));
    state.workspaces = [
      {
        _id: "workspace-test",
        id: "workspace-test",
        name: "Test workspace",
        owner: owner.id,
        members: [
          { user: owner.id, role: "owner", joinedAt: new Date().toISOString() },
          { user: member.id, role: "member", joinedAt: new Date().toISOString() },
        ],
      },
    ];
    state.meetings = [];
    state.invitations = [];
  });

  it("creates a pending invitation for an existing account without adding it before acceptance", async () => {
    const { result, token } = await createInvitation();
    assert.ok(token);
    assert.equal(result.body.invitation.email, invitedUser.email);
    assert.equal(result.body.invitation.status, "pending");
    assert.equal(result.body.emailSent, false);
    assert.equal(result.body.alreadyPending, false);
    assert.equal(
      state.workspaces[0].members.some((entry) => entry.user === invitedUser.id),
      false
    );
    assert.notEqual(state.invitations[0].tokenHash, token);
  });

  it("sends invitation details through Resend and reports acceptance only after a provider response", async (t) => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "IntellMeet <invitations@example.com>";
    process.env.APP_BASE_URL = "https://intellmeet.example.com";
    let requestUrl;
    let requestOptions;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(JSON.stringify({ id: "email_test_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { result, token } = await createInvitation(invitedUser.email, "member");
    const requestBody = JSON.parse(requestOptions.body);

    assert.equal(result.status, 201);
    assert.equal(result.body.emailSent, true);
    assert.equal(result.body.emailProviderId, "email_test_123");
    assert.equal(requestUrl, "https://api.resend.com/emails");
    assert.equal(requestOptions.method, "POST");
    assert.deepEqual(requestBody.to, invitedUser.email);
    assert.equal(requestBody.from, process.env.EMAIL_FROM);
    assert.match(requestBody.subject, /Test workspace/);
    assert.match(requestBody.text, /Owner \(owner@example\.com\)/);
    assert.match(requestBody.text, /as a member/);
    assert.match(requestBody.text, new RegExp(`https://intellmeet\\.example\\.com/invitations/accept\\?token=${token}`));
  });

  it("keeps the invitation usable and provides a fallback link when Resend rate-limits the request", async (t) => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "IntellMeet <invitations@example.com>";
    process.env.APP_BASE_URL = "https://intellmeet.example.com";
    t.mock.method(globalThis, "fetch", async () => new Response(
      JSON.stringify({ name: "rate_limit_exceeded", message: "Too many requests" }),
      { status: 429, headers: { "content-type": "application/json" } }
    ));

    const { result, token } = await createInvitation();

    assert.equal(result.status, 201);
    assert.equal(result.body.emailSent, false);
    assert.match(result.body.message, /did not accept/);
    assert.equal(state.invitations.length, 1);
    const accepted = await invoke(acceptInvitation, { user: invitedUser, body: { token } });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, "accepted");
  });

  it("resends a refreshed link for a pending invitation without creating a duplicate record", async (t) => {
    const original = await createInvitation();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "IntellMeet <invitations@example.com>";
    process.env.APP_BASE_URL = "https://intellmeet.example.com";
    t.mock.method(globalThis, "fetch", async () => new Response(
      JSON.stringify({ id: "email_resend_123" }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));

    const resent = await invoke(addWorkspaceMember, {
      params: { id: "workspace-test" },
      body: { email: invitedUser.email },
    });
    const refreshedToken = new URL(resent.body.invitationLink).searchParams.get("token");
    const staleToken = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token: original.token },
    });
    const accepted = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token: refreshedToken },
    });

    assert.equal(resent.status, 200);
    assert.equal(resent.body.alreadyPending, true);
    assert.equal(resent.body.emailSent, true);
    assert.match(resent.body.message, /accepted by Resend/);
    assert.notEqual(refreshedToken, original.token);
    assert.equal(state.invitations.length, 1);
    assert.equal(staleToken.status, 404);
    assert.equal(accepted.status, 200);
  });

  it("creates invitations for unregistered emails and accepts them after registration", async () => {
    const newEmail = "newuser@example.com";
    const { token } = await createInvitation(newEmail);
    assert.equal(state.invitations[0].email, newEmail);
    assert.equal(state.workspaces[0].members.some((entry) => entry.user === "user-new"), false);

    const registeredUser = { id: "user-new", email: newEmail, name: "New User" };
    state.users.push({ ...registeredUser, _id: registeredUser.id });
    const accepted = await invoke(acceptInvitation, {
      user: registeredUser,
      body: { token },
    });
    assert.equal(accepted.status, 200);
    assert.equal(
      state.workspaces[0].members.filter((entry) => entry.user === registeredUser.id).length,
      1
    );
  });

  it("accepts only for the invited email and adds the member exactly once", async () => {
    const { token } = await createInvitation();
    const mismatch = await invoke(acceptInvitation, {
      user: outsider,
      body: { token },
    });
    assert.equal(mismatch.status, 403);

    const firstAccept = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token },
    });
    assert.equal(firstAccept.status, 200);
    assert.equal(firstAccept.body.status, "accepted");
    assert.equal(
      state.workspaces[0].members.filter((entry) => entry.user === invitedUser.id).length,
      1
    );

    const repeatedAccept = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token },
    });
    assert.equal(repeatedAccept.status, 409);
    assert.equal(
      state.workspaces[0].members.filter((entry) => entry.user === invitedUser.id).length,
      1
    );
  });

  it("rejects invalid and expired invitation tokens", async () => {
    const invalid = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token: "not-a-valid-token" },
    });
    assert.equal(invalid.status, 400);

    const { token } = await createInvitation();
    state.invitations[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    const expired = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token },
    });
    assert.equal(expired.status, 410);
    assert.equal(state.invitations[0].status, "expired");
  });

  it("blocks ordinary members from inviting and outsiders from inspecting members", async () => {
    const forbiddenInvite = await invoke(addWorkspaceMember, {
      user: member,
      params: { id: "workspace-test" },
      body: { email: invitedUser.email },
    });
    assert.equal(forbiddenInvite.status, 403);

    const forbiddenInspection = await invoke(getWorkspaceMembers, {
      user: outsider,
      params: { id: "workspace-test" },
    });
    assert.equal(forbiddenInspection.status, 404);
  });

  it("requires a configured non-local HTTPS application URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_BASE_URL = "http://localhost:5173";
    const result = await invoke(addWorkspaceMember, {
      params: { id: "workspace-test" },
      body: { email: invitedUser.email },
    });
    assert.equal(result.status, 503);
    assert.equal(state.invitations.length, 0);
  });

  it("resends an existing pending invitation without creating a duplicate and lets admins invite regular members only", async () => {
    const firstInvitation = await createInvitation();
    const duplicate = await invoke(addWorkspaceMember, {
      params: { id: "workspace-test" },
      body: { email: invitedUser.email },
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.alreadyPending, true);
    assert.equal(duplicate.body.emailSent, false);
    assert.notEqual(
      new URL(duplicate.body.invitationLink).searchParams.get("token"),
      firstInvitation.token
    );
    assert.equal(state.invitations.length, 1);
    const staleToken = await invoke(acceptInvitation, {
      user: invitedUser,
      body: { token: firstInvitation.token },
    });
    assert.equal(staleToken.status, 404);

    state.workspaces[0].members.push({ user: outsider.id, role: "admin" });
    const adminInvite = await invoke(addWorkspaceMember, {
      user: outsider,
      params: { id: "workspace-test" },
      body: { email: "newperson@example.com", role: "member" },
    });
    assert.equal(adminInvite.status, 201);
    const adminPromotion = await invoke(addWorkspaceMember, {
      user: outsider,
      params: { id: "workspace-test" },
      body: { email: "another@example.com", role: "admin" },
    });
    assert.equal(adminPromotion.status, 403);
  });

  it("prevents owner removal and removes regular members while allowing invitation cancellation", async () => {
    const ownerRemoval = await invoke(removeWorkspaceMember, {
      params: { id: "workspace-test", userId: owner.id },
    });
    assert.equal(ownerRemoval.status, 400);

    const removal = await invoke(removeWorkspaceMember, {
      params: { id: "workspace-test", userId: member.id },
    });
    assert.equal(removal.status, 204);
    assert.equal(state.workspaces[0].members.some((entry) => entry.user === member.id), false);

    const { result } = await createInvitation();
    const cancel = await invoke(cancelWorkspaceInvitation, {
      params: { id: "workspace-test", invitationId: result.body.invitation.id },
    });
    assert.equal(cancel.status, 204);
    const listing = await invoke(listWorkspaceInvitations, {
      params: { id: "workspace-test" },
    });
    assert.equal(listing.body[0].status, "cancelled");
  });

  it("keeps workspace and meeting creation working in local fallback mode", async () => {
    const workspaceResult = await invoke(createWorkspace, {
      body: { name: "New workspace", description: "Existing creation flow" },
    });
    assert.equal(workspaceResult.status, 201);
    assert.equal(workspaceResult.body.name, "New workspace");

    const meetingResult = await invoke(createMeeting, {
      body: { title: "Planning meeting", workspace: workspaceResult.body.id },
    });
    assert.equal(meetingResult.status, 201);
    assert.equal(meetingResult.body.title, "Planning meeting");
    assert.equal(meetingResult.body.workspace, workspaceResult.body.id);
  });

  it("creates a workspace with one owner membership and lets that owner create a meeting", async () => {
    const workspaceResult = await invoke(createWorkspace, {
      body: { name: "Owner meeting workspace" },
    });
    assert.equal(workspaceResult.status, 201);
    assert.equal(workspaceResult.body.owner, owner.id);
    assert.equal(workspaceResult.body.members.length, 1);
    assert.equal(workspaceResult.body.members[0].user, owner.id);
    assert.equal(workspaceResult.body.members[0].role, "owner");

    const meetingResult = await invoke(createMeeting, {
      body: {
        title: "Owner-created meeting",
        workspace: workspaceResult.body.id,
        createdBy: outsider.id,
        userId: outsider.id,
      },
    });
    assert.equal(meetingResult.status, 201);
    assert.equal(meetingResult.body.createdBy, owner.id);
  });

  it("allows workspace admins to create meetings", async () => {
    state.workspaces[0].members.push({ user: outsider.id, role: "admin" });
    const result = await invoke(createMeeting, {
      user: outsider,
      body: { title: "Admin-created meeting", workspace: "workspace-test" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.createdBy, outsider.id);
  });

  it("denies ordinary members and unrelated users from creating meetings", async () => {
    const memberResult = await invoke(createMeeting, {
      user: member,
      body: { title: "Member-created meeting", workspace: "workspace-test" },
    });
    assert.equal(memberResult.status, 403);

    const outsiderResult = await invoke(createMeeting, {
      user: outsider,
      body: { title: "Outsider-created meeting", workspace: "workspace-test" },
    });
    assert.equal(outsiderResult.status, 403);
  });

  it("returns distinct errors for missing workspaces and invalid Mongo workspace IDs", async () => {
    const missing = await invoke(createMeeting, {
      body: { title: "Missing workspace meeting", workspace: "workspace-missing" },
    });
    assert.equal(missing.status, 404);

    dbState.fallbackMode = false;
    try {
      const invalid = await invoke(createMeeting, {
        body: { title: "Invalid workspace meeting", workspace: "not-an-object-id" },
      });
      assert.equal(invalid.status, 400);
    } finally {
      dbState.fallbackMode = true;
    }
  });

  it("normalizes Mongo ObjectIds when comparing workspace owners and members", () => {
    const ownerId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();
    const workspace = {
      owner: ownerId,
      members: [
        { user: ownerId, role: "owner" },
        { user: adminId, role: "admin" },
      ],
    };
    assert.equal(isWorkspaceOwner(workspace, ownerId.toHexString()), true);
    assert.equal(isWorkspaceAdmin(workspace, ownerId.toHexString()), true);
    assert.equal(isWorkspaceMember(workspace, adminId.toHexString()), true);
    assert.equal(isWorkspaceAdmin(workspace, adminId.toHexString()), true);
    assert.equal(isWorkspaceAdmin(workspace, new mongoose.Types.ObjectId().toHexString()), false);
  });

  it("authorizes a recorded owner membership when legacy owner references are inconsistent", async () => {
    state.workspaces[0].owner = outsider.id;
    const result = await invoke(createMeeting, {
      body: { title: "Recorded owner meeting", workspace: "workspace-test" },
    });
    assert.equal(result.status, 201);
  });
});
