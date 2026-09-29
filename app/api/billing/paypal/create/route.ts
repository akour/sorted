import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { normalizeHost } from "@/lib/auth-hosts";
import { createPayPalSubscription, paypalConfigured } from "@/lib/paypal";

export async function POST(request: Request) {
  const host = normalizeHost(request.headers.get("host"));
  const session = await createAuth(host).api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  if (!session.user.emailVerified) return Response.json({ error: "Verify your email before subscribing." }, { status: 403 });
  if (!paypalConfigured()) return Response.json({ error: "PayPal billing is not configured yet." }, { status: 503 });

  const origin = new URL(request.url).origin;
  const created = await createPayPalSubscription({
    customId: session.user.id,
    returnUrl: `${origin}/subscribe?paypal=approved&subscription_id={subscription_id}`,
    cancelUrl: `${origin}/subscribe?paypal=cancelled`,
  });

  const approvalUrl = created.links?.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) return Response.json({ error: "PayPal did not return an approval link." }, { status: 502 });

  await getDb().delete(subscriptions).where(eq(subscriptions.authUserId, session.user.id));
  await getDb().insert(subscriptions).values({
    authUserId: session.user.id,
    provider: "paypal",
    providerSubscriptionId: created.id,
    planId: created.plan_id,
    status: created.status.toLowerCase(),
  });

  return Response.json({ approvalUrl, subscriptionId: created.id });
}
