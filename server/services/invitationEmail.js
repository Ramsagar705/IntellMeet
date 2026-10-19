const { Resend } = require("resend");

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const sendWorkspaceInvitationEmail = async ({
  to,
  workspaceName,
  inviterName,
  inviterEmail,
  role,
  invitationUrl,
}) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.error("Invitation email not sent: RESEND_API_KEY and EMAIL_FROM must be configured");
    return { accepted: false };
  }

  const inviter = inviterName
    ? `${inviterName}${inviterEmail ? ` (${inviterEmail})` : ""}`
    : inviterEmail || "A workspace administrator";
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInviter = escapeHtml(inviter);
  const safeRole = escapeHtml(role);
  const safeInvitationUrl = escapeHtml(invitationUrl);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject: `You're invited to join ${workspaceName.replace(/[\r\n]/g, " ")} on IntellMeet`,
      text: `${inviter} invited you to join the ${workspaceName} workspace as a ${role}.\n\nAccept your invitation: ${invitationUrl}\n\nThis link is single-use and expires in 7 days.`,
      html: `<p>${safeInviter} invited you to join the <strong>${safeWorkspaceName}</strong> workspace as a <strong>${safeRole}</strong>.</p><p><a href="${safeInvitationUrl}">Accept your invitation</a></p><p>This link is single-use and expires in 7 days.</p>`,
    });

    if (error || !data?.id) {
      console.error(`Invitation email was not accepted by Resend${error?.statusCode ? ` (HTTP ${error.statusCode})` : ""}`);
      return { accepted: false };
    }

    return { accepted: true, providerId: data.id };
  } catch (error) {
    console.error(`Invitation email provider request failed: ${error?.name || "UnknownError"}${error?.statusCode ? ` (HTTP ${error.statusCode})` : ""}`);
    return { accepted: false };
  }
};

module.exports = { sendWorkspaceInvitationEmail };
