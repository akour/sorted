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

  // Keep customer sign-up closed until the sender domain has been verified
  // and delivery has been deliberately enabled in the runtime environment.
  if (isSignupRequest && !isOwnerOnlySiteHost(host) &&
    (!isCustomerAuthHost(host) || !hasAuthEmailDeliveryConfigured())) {
    return Response.json(
      { message: "Customer sign-up is not open yet." },
      { status: 403 },
    );
  }

  if (isEmailDeliveryRequest && !hasAuthEmailDeliveryConfigured()) {
    return Response.json(
      { message: "Account email delivery is not configured." },
      { status: 503 },
    );
  }

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.trim().length < 32 || !env.DB) {
    return unavailable();
  }

  try {
    return await createAuth(host).handler(request);
  } catch {
    return unavailable();
  }
}

export const GET = handleAuth;
export const POST = handleAuth;
