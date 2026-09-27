import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { AUTH_ALLOWED_HOSTS, AUTH_TRUSTED_ORIGINS, isOwnerOnlySiteHost } from "./auth-hosts";
import { hasAuthEmailDeliveryConfigured, sendAuthEmail } from "./auth-email";

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
      sendOnSignUp: hasAuthEmailDeliveryConfigured(),
      sendOnSignIn: hasAuthEmailDeliveryConfigured(),
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
    },
  });
}
