import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { verifyPayPalWebhook } from "@/lib/paypal";

type PayPalWebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    start_time?: string;
    subscriber?: { email_address?: string };
    billing_info?: { next_billing_time?: string };
  };
};

export async function POST(request: Request) {
  const event = await request.json().catch(() => null) as PayPalWebhookEvent | null;
  if (!event) return Response.json({ error: "Invalid webhook payload." }, { status: 400 });

  const verified = await verifyPayPalWebhook(request, event).catch(() => false);
  if (!verified) return Response.json({ error: "Invalid webhook signature." }, { status: 401 });

  const subscriptionId = event.resource?.id;
  if (!subscriptionId) return Response.json({ ok: true });

  const statusByEvent: Record<string, string> = {
    "BILLING.SUBSCRIPTION.ACTIVATED": "active",
    "BILLING.SUBSCRIPTION.UPDATED": event.resource?.status?.toLowerCase() || "active",
    "BILLING.SUBSCRIPTION.SUSPENDED": "suspended",
    "BILLING.SUBSCRIPTION.CANCELLED": "cancelled",
    "BILLING.SUBSCRIPTION.EXPIRED": "expired",
  };
  const status = statusByEvent[event.event_type || ""];
  if (!status) return Response.json({ ok: true });

  await getDb().update(subscriptions).set({
    status,
    payerEmail: event.resource?.subscriber?.email_address || "",
    currentPeriodStart: event.resource?.start_time || null,
    nextBillingTime: event.resource?.billing_info?.next_billing_time || null,
    cancelledAt: status === "cancelled" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  }).where(eq(subscriptions.providerSubscriptionId, subscriptionId));

  return Response.json({ ok: true });
}
