"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

      if (result.error?.code === "EMAIL_NOT_VERIFIED" && !isOwnerPreview) {
        setNotice(canUseEmail
          ? "Your email still needs verification. We sent a fresh link; check your inbox."
          : "Your email still needs verification, but email delivery is unavailable right now. Try again later.");
        setNoticeAction("sign-in");
        return;
      }
      if (result.error) throw new Error(result.error.message || "Could not sign in.");

      if (isOwnerPreview) {
        const linkResponse = await fetch("/api/account/link", { method: "POST", cache: "no-store" });
        const linkData = await linkResponse.json().catch(() => ({})) as { error?: string };
        if (!linkResponse.ok) {
          throw new Error(linkData.error || "Your account signed in, but it could not be connected to this workspace.");
        }
        setNotice("Your account is connected to the existing workspace. Use this email and password when customer sign-in opens on sort3d.space.");
        setNoticeAction("workspace");
        return;
      }

      if (isSignUp) {
        setPassword("");
        setNotice("We sent a verification link to your email. Verify it to finish creating your account.");
        setNoticeAction("sign-in");
        return;
      }

      router.replace(safeReturnPath());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-auth-page">
      <div className="account-auth-shell">
        <Link className="account-auth-brand" href="/" aria-label="Sorted home">
          <span className="account-auth-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>sorted</span>
        </Link>

        <section className="account-auth-card" aria-labelledby="account-auth-title">
          <p className="account-auth-kicker">Your growth workspace</p>
          <h1 id="account-auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="account-auth-description">
            {isSignUp ? "Start with one product. Keep your research and growth work connected." : "Sign in to continue to your Sorted workspace."}
          </p>

          {isSignUp && isOwnerPreview && (
            <p className="account-auth-hint">
              To connect the workspace you already use, create your account with the same email as this private preview.
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
                  ? <Link href="/forgot-password">Forgot password?</Link>
                  : <span>Password recovery will be available after email delivery is configured.</span>}
              </p>
            )}

            {error && <p className="account-auth-error" role="alert">{error}</p>}
            {notice && <p className="account-auth-success" role="status">{notice}</p>}

            {notice ? (
              noticeAction === "workspace" ? (
                <button className="account-auth-submit" type="button" onClick={() => router.replace(safeReturnPath())}>
                  Open workspace <span aria-hidden="true">→</span>
                </button>
              ) : (
                <Link className="account-auth-submit" href="/sign-in">Back to sign in <span aria-hidden="true">→</span></Link>
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
            <Link href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link>
          </p>
        </section>

        <p className="account-auth-footer"><Link href="/">← Back to Sorted</Link><span>Nothing publishes automatically.</span></p>
      </div>
    </main>
  );
}
