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

export function AccountAuthForm({ mode, isOwnerPreview }: { mode: AuthMode; isOwnerPreview: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSignUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });

      if (result.error) throw new Error(result.error.message || "Could not sign in.");

      if (isOwnerPreview) {
        const linkResponse = await fetch("/api/account/link", { method: "POST", cache: "no-store" });
        const linkData = await linkResponse.json().catch(() => ({})) as { error?: string };
        if (!linkResponse.ok) {
          throw new Error(linkData.error || "Your account signed in, but it could not be connected to this workspace.");
        }
        setNotice("Your account is connected to the existing workspace. Use this email and password when customer sign-in opens on sort3d.space.");
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
              Customer sign-up is not open yet. Email verification and account recovery need to be configured before new accounts can be created.
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

            {error && <p className="account-auth-error" role="alert">{error}</p>}
            {notice && <p className="account-auth-success" role="status">{notice}</p>}

            {notice ? (
              <button className="account-auth-submit" type="button" onClick={() => router.replace(safeReturnPath())}>
                Open workspace <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button className="account-auth-submit" type="submit" disabled={busy || (isSignUp && !isOwnerPreview)}>
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
