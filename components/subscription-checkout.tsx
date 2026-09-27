"use client";

import { useEffect, useState } from "react";

type BillingStatus = {
  status?: string;
  active?: boolean;
  nextBillingTime?: string | null;
  error?: string;
};

export function SubscriptionCheckout({ email }: { email: string }) {
  const [status, setStatus] = useState<BillingStatus>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const response = await fetch("/api/billing/status", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as BillingStatus;
    setStatus(data);
  }

  useEffect(() => { void refresh(); }, []);

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/paypal/create", { method: "POST" });
      const data = await response.json().catch(() => ({})) as { approvalUrl?: string; error?: string };
      if (!response.ok || !data.approvalUrl) throw new Error(data.error || "Could not start PayPal checkout.");
      window.location.assign(data.approvalUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start PayPal checkout.");
      setBusy(false);
    }
  }

  if (status.active) {
    return (
      <section className="account-auth-card" aria-labelledby="subscription-title">
        <p className="account-auth-kicker">Sorted Pro</p>
        <h1 id="subscription-title">You’re subscribed</h1>
        <p className="account-auth-description">Your $20/month plan is active. You can use the full Sorted workspace.</p>
        {status.nextBillingTime && <p className="account-auth-hint">Next billing: {new Date(status.nextBillingTime).toLocaleDateString()}</p>}
        <a className="account-auth-submit" href="/workspace">Open workspace <span aria-hidden="true">→</span></a>
      </section>
    );
  }

  return (
    <section className="account-auth-card" aria-labelledby="subscription-title">
      <p className="account-auth-kicker">One plan. Full workspace.</p>
      <h1 id="subscription-title">Sorted Pro</h1>
      <p className="account-auth-description">Research, optimize, create, and plan growth for your products in one connected workspace.</p>

      <div className="subscription-price"><strong>$20</strong><span>/ month</span></div>
      <ul className="subscription-features">
        <li>Full growth workspace</li>
        <li>Research, ASO/AEO optimization, creative and promo planning</li>
        <li>Multiple products in one account</li>
        <li>Cancel anytime through PayPal</li>
      </ul>

      <p className="account-auth-hint">Signed in as {email}</p>
      {status.status === "approval_pending" && <p className="account-auth-hint">Your PayPal approval is still pending. Complete checkout or refresh this page.</p>}
      {error && <p className="account-auth-error" role="alert">{error}</p>}

      <button className="account-auth-submit" type="button" onClick={subscribe} disabled={busy}>
        {busy ? "Opening PayPal…" : "Subscribe with PayPal"}<span aria-hidden="true">→</span>
      </button>
      <p className="subscription-note">$20 USD billed monthly. No long-term contract.</p>
    </section>
  );
}
