import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { AUTH_ALLOWED_HOSTS, AUTH_TRUSTED_ORIGINS, isOwnerOnlySiteHost } from "./auth-hosts";
import { hasAuthEmailDeliveryConfigured, sendAuthEmail } from "./auth-email";

function logAuthApiError(error: unknown): void {
  const details = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const body = details.body && typeof details.body === "object"
    ? details.body as Record<string, unknown>
    : {};
  const errorName = typeof details.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(details.name)
    ? details.name
    : "unknown";
  const status = typeof details.status === "string" && /^[A-Z_]{1,40}$/.test(details.status)
    ? details.status
    : undefined;
  const statusCode = typeof details.statusCode === "number" && Number.isInteger(details.statusCode)
    ? details.statusCode
    : undefined;
  const rawCode = body.code ?? details.code;
  const code = typeof rawCode === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(rawCode)
    ? rawCode
    : undefined;
  const rawMessage = error instanceof Error ? error.message : "";
  const message = rawMessage
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bre_[A-Za-z0-9_-]+\b/g, "[redacted-key]")
    .replace(/\b(token|secret|password|api[_-]?key)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 180);

  // Expected auth errors such as invalid credentials are common; keep the
  // Worker logs focused on server failures and unknown exceptions.
  if (statusCode !== undefined && statusCode < 500) return;

  console.error("Sorted Better Auth API request failed.", {
    errorName,
    status,
    statusCode,
    code,
    message: message || undefined,
  });
}

export function createAuth(host: string | null | undefined) {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be configured with at least 32 characters.");
  }
  if (!env.DB) throw new Error("The D1 database binding is unavailable.");

  return betterAuth({
    appName: "Sorted",
    baseURL: env.BETTER_AUTH_URL?.trim() || {
      allowedHosts: AUTH_ALLOWED_HOSTS,
      fallback: "https://sort3d.space",
    },
    trustedOrigins: AUTH_TRUSTED_ORIGINS,
    onAPIError: {
      onError: logAuthApiError,
    },
    secret,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // The private preview can sign in without a verified email so its owner
      // can connect an account; customer hosts always require verification.
      requireEmailVerification: !isOwnerOnlySiteHost(host),
      sendResetPassword: async ({ user, url }) => sendAuthEmail({
        to: user.email,
        url,
        purpose: "password-reset",
      }),
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => sendAuthEmail({
        to: user.email,
        url,
        purpose: "verification",
      }),
      // The sign-up screen explicitly requests a link after Better Auth returns.
      // This also covers its generic-success response for an existing account,
      // where Better Auth does not run the new-user sign-up callback.
      sendOnSignUp: false,
      sendOnSignIn: hasAuthEmailDeliveryConfigured(),
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
    },
  });
}
