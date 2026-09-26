import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { AUTH_ALLOWED_HOSTS, AUTH_TRUSTED_ORIGINS, isOwnerOnlySiteHost } from "./auth-hosts";

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
    secret,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // The owner-only Sites identity independently proves ownership for the
      // one existing account. Customer hosts require email verification.
      requireEmailVerification: !isOwnerOnlySiteHost(host),
    },
  });
}
