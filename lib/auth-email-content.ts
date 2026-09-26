export type AuthEmailPurpose = "verification" | "password-reset";

export type AuthEmailContent = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export function createAuthEmailContent(purpose: AuthEmailPurpose, url: string): AuthEmailContent {
  const parsedUrl = new URL(url);
  if (!["https:", "http:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error("The authentication link is invalid.");
  }

  const copy = purpose === "verification"
    ? {
        subject: "Verify your Sorted email",
        title: "Verify your email",
        description: "Confirm your email address to finish setting up your Sorted account.",
        action: "Verify email",
      }
    : {
        subject: "Reset your Sorted password",
        title: "Reset your password",
        description: "Use this secure link to choose a new password for your Sorted account.",
        action: "Choose a new password",
      };
  const text = `${copy.title}\n\n${copy.description}\n\n${copy.action}: ${url}\n\nIf you did not request this, you can ignore this email.`;
  const safeUrl = escapeHtml(url);

  return {
    subject: copy.subject,
    text,
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:32px 16px;background:#f7f6fa;color:#292633;font-family:Arial,Helvetica,sans-serif"><main style="max-width:520px;margin:0 auto;padding:32px;border:1px solid #ebe7f1;border-radius:16px;background:#fff"><p style="margin:0 0 20px;color:#7057d9;font-size:15px;font-weight:700;letter-spacing:-.04em">sorted</p><h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">${copy.title}</h1><p style="margin:0 0 24px;color:#706b78;font-size:15px;line-height:1.6">${copy.description}</p><p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;padding:13px 18px;border-radius:9px;background:#7057d9;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${copy.action}</a></p><p style="margin:0;color:#8b8692;font-size:12px;line-height:1.6">If the button does not work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#6551b8;overflow-wrap:anywhere">${safeUrl}</a></p><p style="margin:24px 0 0;color:#8b8692;font-size:12px;line-height:1.6">If you did not request this, you can ignore this email.</p></main></body></html>`,
  };
}
