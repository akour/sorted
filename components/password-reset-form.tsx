"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Auth navigation must work without client-side routing. */
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type PasswordResetMode = "request" | "reset";

export function PasswordResetForm({
  mode,
  emailDeliveryEnabled = false,
}: {
  mode: PasswordResetMode;
  emailDeliveryEnabled?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "request") {
        if (!emailDeliveryEnabled) throw new Error("Password recovery is not configured yet.");
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error) throw new Error(result.error.message || "Could not request a reset link.");
        setNotice("If a Sorted account exists for that email, a reset link will arrive shortly.");
        setEmail("");
      } else {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("This reset link is invalid or expired. Request a new one.");
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) throw new Error("This reset link is invalid or expired. Request a new one.");
        setPassword("");
        setConfirmPassword("");
        setNotice("Your password has been changed. Sign in with your new password.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  const isRequest = mode === "request";

  return (
    <main className="account-auth-page">
      <div className="account-auth-shell">
        <a className="account-auth-brand" href="/" aria-label="Sorted home">
          <span className="account-auth-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>sorted</span>
        </a>

        <section className="account-auth-card" aria-labelledby="password-reset-title">
          <p className="account-auth-kicker">Your growth workspace</p>
          <h1 id="password-reset-title">
            {isRequest ? "Reset your password" : "Choose a new password"}
          </h1>
          <p className="account-auth-description">
            {isRequest
              ? "Enter your account email and we’ll send a secure reset link if it matches a Sorted account."
              : "Choose a new password for your Sorted account."}
          </p>

          {isRequest && !emailDeliveryEnabled ? (
            <p className="account-auth-hint">Password recovery will be available after Sorted’s email sender is verified and enabled.</p>
          ) : (
            <form className="account-auth-form" onSubmit={submit}>
              {isRequest ? (
                <label>
                  Email
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
                </label>
              ) : (
                <>
                  <label>
                    New password
                    <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} />
                    <small>Use at least 12 characters.</small>
                  </label>
                  <label>
                    Confirm new password
                    <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={128} />
                  </label>
                </>
              )}

              {error && <p className="account-auth-error" role="alert">{error}</p>}
              {notice && <p className="account-auth-success" role="status">{notice}</p>}

              {!notice && (
                <button className="account-auth-submit" type="submit" disabled={busy}>
                  {busy ? "Please wait…" : isRequest ? "Send reset link" : "Save new password"}
                  {!busy && <span aria-hidden="true">→</span>}
                </button>
              )}
            </form>
          )}

          {notice && <p className="account-auth-switch"><a href="/sign-in">Back to sign in</a></p>}
          {isRequest && !notice && <p className="account-auth-switch"><a href="/sign-in">Back to sign in</a></p>}
          {mode === "reset" && !notice && <p className="account-auth-switch"><a href="/forgot-password">Request a new reset link</a></p>}
        </section>

        <p className="account-auth-footer"><a href="/">← Back to Sorted</a><span>Nothing publishes automatically.</span></p>
      </div>
    </main>
  );
}
