import { getDb } from "@/db";
import { adminWorkspaceAppearance } from "@/db/schema";
import { isAdminResponse, requireAdmin, writeAdminAudit } from "@/lib/admin";
import {
  normalizeWorkspaceAppearance,
  readWorkspaceAppearance,
  WORKSPACE_ACCENTS,
  type WorkspaceAppearanceValues,
} from "@/lib/workspace-appearance";

export async function GET() {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    return Response.json({ appearance: await readWorkspaceAppearance() });
  } catch (error) {
    console.error("Admin workspace appearance load failed", error);
    return Response.json({ error: "Could not load workspace appearance settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const body = await request.json() as Partial<WorkspaceAppearanceValues>;
    if (typeof body.accent !== "string" || !Object.hasOwn(WORKSPACE_ACCENTS, body.accent)) {
      return Response.json({ error: "Choose one of the available accent colors." }, { status: 400 });
    }
    if (body.density !== "comfortable" && body.density !== "compact") {
      return Response.json({ error: "Choose a supported workspace density." }, { status: 400 });
    }
    if (body.corners !== "soft" && body.corners !== "crisp") {
      return Response.json({ error: "Choose a supported card style." }, { status: 400 });
    }

    const next = normalizeWorkspaceAppearance(body);
    const previous = await readWorkspaceAppearance();
    const now = new Date().toISOString();
    const [saved] = await getDb().insert(adminWorkspaceAppearance).values({
      id: "global",
      ...next,
      updatedBy: admin.user.id,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: adminWorkspaceAppearance.id,
      set: { ...next, updatedBy: admin.user.id, updatedAt: now },
    }).returning();

    await writeAdminAudit({
      actorId: admin.user.id,
      action: "update-workspace-appearance",
      resourceType: "appearance",
      resourceId: "global",
      summary: "Updated the shared workspace appearance.",
      metadata: { previous: normalizeWorkspaceAppearance(previous), next },
    });
    return Response.json({ appearance: { ...normalizeWorkspaceAppearance(saved), updatedAt: saved.updatedAt } });
  } catch (error) {
    console.error("Admin workspace appearance save failed", error);
    return Response.json({ error: "Workspace appearance could not be saved." }, { status: 500 });
  }
}
