"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Auth navigation must work without client-side routing. */
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

function safeReturnPath(): string {
  const value = new URLSearchParams(window.location.search).get("return_to");
  if (!value?.startsWith("/") || value.startsWith("//")) return "/workspace";

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/workspace";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/workspace";
  }
}

export function AccountAuthForm({
  mode,
  isOwnerPreview,
  canUseEmail,
  canCustomerSignUp = false,
}: {
  mode: AuthMode;
  isOwnerPreview: boolean;
  canUseEmail: boolean;
  canCustomerSignUp?: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeAction, setNoticeAction] = useState<"workspace" | "sign-in" | null>(null);
  const isSignUp = mode === "sign-up";
  const signUpUnavailable = isSignUp && !isOwnerPreview && !canCustomerSignUp;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: `${window.location.origin}/workspace`,
          })
        : await authClient.signIn.email({ email: email.trim(), password });

      if (isSignUp && result.error?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        throw new Error("An account already exists with this email. Sign in or use Forgot password to reset it.");
      }
      if (!isSignUp && result.error?.code === "INVALID_EMAIL_OR_PASSWORD") {
        throw new Error("That email and password don’t match. Try again, or use Forgot password to reset it.");
      }
      if (result.error?.code === "EMAIL_NOT_VERIFIED" && !isOwnerPreview) {
        setNotice(canUseEmail
          ? "Your email still needs verification. We sent a fresh link; check your inbox."
          : "Your email still needs verification, but email delivery is unavailable right now. Try again later.");
        setNoticeAction("sign-in");
        return;
      }
      if (result.error) throw new Error(result.error.message || "Could not sign in.");

      if (isOwnerPreview && !isSignUp) {
        // The private preview already resolves the workspace through its
        // trusted Sites identity. Linking the Sorted login is only needed for
        // customer-host access, so it must never block preview sign-in.
        void fetch("/api/account/link", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        }).catch(() => undefined);
        window.location.assign(safeReturnPath());
        return;
      }

      if (isOwnerPreview) {
        const linkResponse = await fetch("/api/account/link", { method: "POST", cache: "no-store" });
        const linkData = await linkResponse.json().catch(() => ({})) as { error?: string; emailVerified?: boolean };
        if (!linkResponse.ok) {
          setNotice(`Your Sorted sign-in worked, but this account could not be connected to the workspace. ${linkData.error || "Try again in a moment."}`);
          setNoticeAction("workspace");
          return;
        }
        setNotice(linkData.emailVerified
          ? "Your Sorted sign-in worked, and this account is connected to your workspace."
          : canUseEmail
            ? "Your Sorted sign-in worked, and this account is connected. Check your inbox and verify this email before using the account on sort3d.space."
            : "Your Sorted sign-in worked, and this account is connected. Customer sign-in will work once email verification is available.");
        setNoticeAction("workspace");
        return;
      }

      if (isSignUp) {
        setPassword("");
        setNotice("We sent a verification link to your email. Verify it to finish creating your account.");
        setNoticeAction("sign-in");
        return;
      }

      window.location.assign(safeReturnPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-auth-page">
      <div className="account-auth-shell">
        <a className="account-auth-brand" href="/" aria-label="Sorted home">
          <span className="account-auth-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>sorted</span>
        </a>

        <section className="account-auth-card" aria-labelledby="account-auth-title">
          <p className="account-auth-kicker">Your growth workspace</p>
          <h1 id="account-auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="account-auth-description">
            {isSignUp ? "Start with one product. Keep your research and growth work connected." : "Sign in to continue to your Sorted workspace."}
          </p>

          {isSignUp && isOwnerPreview && (
            <p className="account-auth-hint">
              {canUseEmail
                ? "Your private preview connects this Sorted login to your existing workspace. We’ll send a verification link so you can use the login on sort3d.space."
                : "Your private preview connects this Sorted login to your existing workspace. Customer sign-in on sort3d.space will need email verification once email delivery is enabled."}
            </p>
          )}
          {isSignUp && !isOwnerPreview && (
            <p className="account-auth-hint">
              {canCustomerSignUp
                ? "Verify your email before you can sign in. You can request a fresh link from the sign-in page."
                : "Customer sign-up will open after Sorted’s email sender is verified and enabled."}
            </p>
          )}

          <form className="account-auth-form" onSubmit={submit}>
            {isSignUp && (
              <label>
                Name
                <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
              </label>
            )}
            <label>
              Email
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isSignUp ? 12 : undefined}
                maxLength={128}
              />
              {isSignUp && <small>Use at least 12 characters.</small>}
            </label>

            {!isSignUp && (
              <p className="account-auth-forgot">
                {canUseEmail
                  ? <a href="/forgot-password">Forgot password?</a>
                  : <span>Password recovery will be available after email delivery is configured.</span>}
              </p>
            )}

            {error && <p className="account-auth-error" role="alert">{error}</p>}
            {notice && <p className="account-auth-success" role="status">{notice}</p>}

            {notice ? (
              noticeAction === "workspace" ? (
                <button className="account-auth-submit" type="button" onClick={() => window.location.assign(safeReturnPath())}>
                  Open workspace <span aria-hidden="true">→</span>
                </button>
              ) : (
                <a className="account-auth-submit" href="/sign-in">Back to sign in <span aria-hidden="true">→</span></a>
              )
            ) : (
              <button className="account-auth-submit" type="submit" disabled={busy || signUpUnavailable}>
                {busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            )}
          </form>

          <p className="account-auth-switch">
            {isSignUp ? "Already have an account?" : "New to Sorted?"}{" "}
            <a href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</a>
          </p>
        </section>

        <p className="account-auth-footer"><a href="/">← Back to Sorted</a><span>Nothing publishes automatically.</span></p>
      </div>
    </main>
  );
}
