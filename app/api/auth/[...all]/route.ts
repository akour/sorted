import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";
import { hasAuthEmailDeliveryConfigured } from "@/lib/auth-email";
import { isCustomerAuthHost, isOwnerOnlySiteHost } from "@/lib/auth-hosts";

const unavailable = () => Response.json(
  { message: "Account sign-in is not configured on this deployment." },
  { status: 503 },
);

async function handleAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const isSignupRequest = url.pathname.startsWith("/api/auth/sign-up/");
  const isEmailDeliveryRequest = url.pathname.endsWith("/request-password-reset") ||
    url.pathname.endsWith("/send-verification-email");
  const emailDeliveryConfigured = hasAuthEmailDeliveryConfigured();

  // Keep customer sign-up closed until the sender domain has been verified
  // and delivery has been deliberately enabled in the runtime environment.
  if (isSignupRequest && !isOwnerOnlySiteHost(host) &&
    (!isCustomerAuthHost(host) || !emailDeliveryConfigured)) {
    console.error("Sorted customer sign-up was blocked by host or email configuration.", {
      customerHost: isCustomerAuthHost(host),
      emailDeliveryConfigured,
    });
    return Response.json(
      { message: "Customer sign-up is not open yet." },
      { status: 403 },
    );
  }

  if (isEmailDeliveryRequest && !emailDeliveryConfigured) {
    console.error("Sorted auth email request was blocked by incomplete delivery configuration.", {
      enabled: env.SORTED_AUTH_EMAIL_ENABLED?.trim().toLowerCase() === "true",
      apiKeyPresent: Boolean(env.RESEND_API_KEY?.trim()),
      senderPresent: Boolean(env.SORTED_AUTH_EMAIL_FROM?.trim()),
    });
    return Response.json(
      { message: "Account email delivery is not configured." },
      { status: 503 },
    );
  }

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.trim().length < 32 || !env.DB) {
    if (isEmailDeliveryRequest) {
      console.error("Sorted auth email request was blocked by missing auth runtime bindings.", {
        authSecretPresent: Boolean(env.BETTER_AUTH_SECRET?.trim()),
        databaseBound: Boolean(env.DB),
      });
    }
    return unavailable();
  }

  try {
    const response = await createAuth(host).handler(request);
    if (isEmailDeliveryRequest && !response.ok) {
      const payload = await response.clone().json().catch(() => null) as { code?: unknown } | null;
      const code = typeof payload?.code === "string" && /^[A-Z0-9_]{1,80}$/i.test(payload.code)
        ? payload.code
        : undefined;
      console.error("Sorted auth email endpoint returned an error.", {
        status: response.status,
        code,
      });
    }
    return response;
  } catch (error) {
    if (isEmailDeliveryRequest) {
      console.error("Sorted auth email endpoint failed before returning a response.", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    return unavailable();
  }
}

export const GET = handleAuth;
export const POST = handleAuth;
