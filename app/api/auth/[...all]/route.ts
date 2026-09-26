import { env } from "cloudflare:workers";
import { createAuth } from "@/lib/auth";
import { isOwnerOnlySiteHost } from "@/lib/auth-hosts";

const unavailable = () => Response.json(
  { message: "Account sign-in is not configured on this deployment." },
  { status: 503 },
);

async function handleAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const isSignupRequest = url.pathname.startsWith("/api/auth/sign-up/");

  // New public accounts stay closed until Sorted has email verification and
  // recovery delivery configured. The Sites preview is owner-only.
  if (isSignupRequest && !isOwnerOnlySiteHost(host)) {
    return Response.json(
      { message: "Customer sign-up will open after account email delivery is configured." },
      { status: 403 },
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
