import { env } from "cloudflare:workers";
import { createAuthEmailContent, type AuthEmailPurpose } from "./auth-email-content";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

export function hasAuthEmailDeliveryConfigured(): boolean {
  return env.SORTED_AUTH_EMAIL_ENABLED?.trim().toLowerCase() === "true" &&
    Boolean(env.RESEND_API_KEY?.trim()) &&
    Boolean(env.SORTED_AUTH_EMAIL_FROM?.trim());
}

export async function sendAuthEmail(input: {
  to: string;
  url: string;
  purpose: AuthEmailPurpose;
}): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.SORTED_AUTH_EMAIL_FROM?.trim();
  if (!hasAuthEmailDeliveryConfigured() || !apiKey || !from) {
    throw new Error("Account email delivery is not configured.");
  }

  const content = createAuthEmailContent(input.purpose, input.url);
  let response: Response;
  try {
    response = await fetch(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    });
  } catch {
    console.error("Sorted transactional email request failed before a response was received.");
    throw new Error("Account email delivery could not be completed.");
  }

  if (!response.ok) {
    console.error("Sorted transactional email provider rejected a request.", { status: response.status });
    throw new Error("Account email delivery could not be completed.");
  }
}
