import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SubscriptionCheckout } from "@/components/subscription-checkout";
import { createAuth } from "@/lib/auth";
import { normalizeHost } from "@/lib/auth-hosts";

export default async function SubscribePage() {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("host"));
  const session = await createAuth(host).api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in?return_to=/subscribe");
  if (!session.user.emailVerified) redirect("/sign-in?return_to=/subscribe");

  return (
    <main className="account-auth-page">
      <div className="account-auth-shell">
        <a className="account-auth-brand" href="/" aria-label="Sorted home">
          <span className="account-auth-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>sorted</span>
        </a>
        <SubscriptionCheckout email={session.user.email} />
        <p className="account-auth-footer"><a href="/">← Back to Sorted</a><span>Secure billing by PayPal.</span></p>
      </div>
    </main>
  );
}
