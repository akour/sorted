import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { adminOAuthClients } from "../../../../../db/schema";
import { decryptAdminSecret, encryptAdminSecret, secretHint } from "../../../../../lib/admin-secrets";
import { isAdminResponse, requireAdmin, writeAdminAudit } from "../../../../../lib/admin";

const PROVIDER_ID = "google-play";
const LABEL = "Google Play OAuth";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/androidpublisher", "https://www.googleapis.com/auth/playdeveloperreporting"];

function redirectUri(request: Request) {
  return new URL("/api/connections/google-play/callback", request.url).toString();
}

function safeConfig(row: typeof adminOAuthClients.$inferSelect | undefined, request: Request) {
  return {
    configured: Boolean(row),
    enabled: row?.enabled ?? false,
    label: row?.label ?? LABEL,
    clientId: row?.clientId ?? "",
    clientSecretHint: row?.clientSecretHint ?? "",
    redirectUri: redirectUri(request),
    scopes: SCOPES,
    lastTestedAt: row?.lastTestedAt ?? null,
    lastError: row?.lastError ?? null,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

function validClientId(value: string) {
  return value.length >= 8 && value.length <= 300 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  try {
    const [row] = await getDb().select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER_ID)).limit(1);
    return Response.json(safeConfig(row, request));
  } catch (error) {
    console.error("Admin Google Play OAuth load failed", error);
    return Response.json({ error: "Could not load Google Play OAuth settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const body = await request.json() as { clientId?: string; clientSecret?: string; enabled?: boolean };
    const clientId = body.clientId?.trim() ?? "";
    const clientSecret = body.clientSecret?.trim() ?? "";
    if (!validClientId(clientId)) return Response.json({ error: "Enter the Google OAuth client ID from Google Cloud." }, { status: 400 });

    const db = getDb();
    const [existing] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER_ID)).limit(1);
    if (!existing && !clientSecret) return Response.json({ error: "Enter the OAuth client secret for the first setup." }, { status: 400 });
    const encryptedSecret = clientSecret ? await encryptAdminSecret(clientSecret) : existing?.clientSecretCiphertext;
    if (!encryptedSecret) return Response.json({ error: "The OAuth client secret could not be protected." }, { status: 500 });

    const now = new Date().toISOString();
    const values = {
      providerId: PROVIDER_ID,
      label: LABEL,
      clientId,
      clientSecretCiphertext: encryptedSecret,
      clientSecretHint: clientSecret ? secretHint(clientSecret) : existing?.clientSecretHint ?? "••••",
      enabled: body.enabled ?? existing?.enabled ?? true,
      lastTestedAt: clientSecret || clientId !== existing?.clientId ? null : existing?.lastTestedAt ?? null,
      lastError: clientSecret || clientId !== existing?.clientId ? null : existing?.lastError ?? null,
      createdBy: existing?.createdBy ?? admin.user.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const [saved] = await db.insert(adminOAuthClients).values(values).onConflictDoUpdate({
      target: adminOAuthClients.providerId,
      set: {
        label: values.label,
        clientId: values.clientId,
        clientSecretCiphertext: values.clientSecretCiphertext,
        clientSecretHint: values.clientSecretHint,
        enabled: values.enabled,
        lastTestedAt: values.lastTestedAt,
        lastError: values.lastError,
        updatedAt: values.updatedAt,
      },
    }).returning();
    await writeAdminAudit({ actorId: admin.user.id, action: "save-google-play-oauth", resourceType: "integration", resourceId: PROVIDER_ID, summary: "Saved Google Play OAuth configuration.", metadata: { enabled: values.enabled, clientSecretRotated: Boolean(clientSecret) } });
    return Response.json(safeConfig(saved, request));
  } catch (error) {
    console.error("Admin Google Play OAuth save failed", error);
    return Response.json({ error: "The Google Play OAuth configuration could not be saved." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const db = getDb();
    const [row] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER_ID)).limit(1);
    if (!row) return Response.json({ error: "Save the Google Play OAuth client first." }, { status: 400 });
    await decryptAdminSecret(row.clientSecretCiphertext);
    const now = new Date().toISOString();
    const [saved] = await db.update(adminOAuthClients).set({ lastTestedAt: now, lastError: null, updatedAt: now }).where(eq(adminOAuthClients.providerId, PROVIDER_ID)).returning();
    await writeAdminAudit({ actorId: admin.user.id, action: "test-google-play-oauth", resourceType: "integration", resourceId: PROVIDER_ID, summary: "Checked Google Play OAuth configuration.", metadata: { result: "ready-for-authorization" } });
    return Response.json({ detail: "Configuration is complete. The next step is authorizing a Google Play account.", ...safeConfig(saved, request) });
  } catch (error) {
    console.error("Admin Google Play OAuth test failed", error);
    const now = new Date().toISOString();
    await getDb().update(adminOAuthClients).set({ lastTestedAt: now, lastError: "The stored OAuth secret could not be decrypted.", updatedAt: now }).where(eq(adminOAuthClients.providerId, PROVIDER_ID));
    return Response.json({ error: "The stored OAuth client secret could not be opened. Save it again to rotate it." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  try {
    await getDb().delete(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER_ID));
    await writeAdminAudit({ actorId: admin.user.id, action: "remove-google-play-oauth", resourceType: "integration", resourceId: PROVIDER_ID, summary: "Removed Google Play OAuth configuration." });
    return Response.json({ configured: false, redirectUri: redirectUri(request), scopes: SCOPES });
  } catch (error) {
    console.error("Admin Google Play OAuth removal failed", error);
    return Response.json({ error: "The Google Play OAuth configuration could not be removed." }, { status: 500 });
  }
}
