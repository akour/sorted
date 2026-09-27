import { env } from "cloudflare:workers";

const PAYPAL_LIVE_BASE = "https://api-m.paypal.com";
const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

function paypalBaseUrl() {
  return env.PAYPAL_ENVIRONMENT?.trim().toLowerCase() === "live" ? PAYPAL_LIVE_BASE : PAYPAL_SANDBOX_BASE;
}

export function paypalConfigured() {
  return Boolean(env.PAYPAL_CLIENT_ID?.trim() && env.PAYPAL_CLIENT_SECRET?.trim() && env.PAYPAL_PLAN_ID?.trim());
}

export function paypalPlanId() {
  return env.PAYPAL_PLAN_ID?.trim() || "";
}

async function getAccessToken() {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured.");

  const basic = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Could not authenticate with PayPal.");
  return data.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({})) as T & { message?: string; details?: Array<{ description?: string }> };
  if (!response.ok) throw new Error(data.details?.[0]?.description || data.message || "PayPal request failed.");
  return data;
}

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  subscriber?: { email_address?: string };
  billing_info?: { next_billing_time?: string };
  start_time?: string;
  links?: Array<{ href: string; rel: string; method?: string }>;
};

export async function createPayPalSubscription({ returnUrl, cancelUrl, customId }: { returnUrl: string; cancelUrl: string; customId: string }) {
  const planId = paypalPlanId();
  if (!planId) throw new Error("PAYPAL_PLAN_ID is not configured.");
  return paypalFetch<PayPalSubscription>("/v1/billing/subscriptions", {
    method: "POST",
    headers: { "PayPal-Request-Id": crypto.randomUUID() },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: customId,
      application_context: {
        brand_name: "Sorted",
        user_action: "SUBSCRIBE_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });
}

export async function getPayPalSubscription(subscriptionId: string) {
  return paypalFetch<PayPalSubscription>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string) {
  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Cancelled by customer" }),
  });
  if (!response.ok && response.status !== 204) throw new Error("Could not cancel the PayPal subscription.");
}

export async function verifyPayPalWebhook(request: Request, event: unknown) {
  const webhookId = env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured.");
  const token = await getAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: request.headers.get("paypal-auth-algo"),
      cert_url: request.headers.get("paypal-cert-url"),
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const result = await response.json().catch(() => ({})) as { verification_status?: string };
  return response.ok && result.verification_status === "SUCCESS";
}
