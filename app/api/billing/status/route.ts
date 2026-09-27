import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { normalizeHost } from "@/lib/auth-hosts";
import { getPayPalSubscription } from "@/lib/paypal";

export async function GET(request: Request) {
  const host = normalizeHost(request.headers.get("host"));
  const session = await createAuth(host).api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in to continue." }, { status: 401 });

  const [record] = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.authUserId, session.user.id))
    .orderBy(desc(subscriptions.id))
    .limit(1);

  if (!record) return Response.json({ status: "none", active: false });

  let status = record.status;
  let nextBillingTime = record.nextBillingTime;
  try {
    const remote = await getPayPalSubscription(record.providerSubscriptionId);
    status = remote.status.toLowerCase();
    nextBillingTime = remote.billing_info?.next_billing_time || null;
    await getDb().update(subscriptions).set({
      status,
      payerEmail: remote.subscriber?.email_address || record.payerEmail,
      currentPeriodStart: remote.start_time || record.currentPeriodStart,
      nextBillingTime,
      updatedAt: new Date().toISOString(),
    }).where(eq(subscriptions.id, record.id));
  } catch {
    // Keep the last known status if PayPal is temporarily unavailable.
  }

  return Response.json({
    status,
    active: status === "active",
    nextBillingTime,
    provider: "paypal",
    price: "$20/month",
  });
}
