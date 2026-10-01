import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminWorkspaceAppearance } from "@/db/schema";

export const WORKSPACE_ACCENTS = {
  violet: { label: "Sorted violet", color: "#6154c7", dark: "#4e42a8" },
  ocean: { label: "Ocean blue", color: "#2676ad", dark: "#1d5e8d" },
  evergreen: { label: "Evergreen", color: "#247b63", dark: "#1b624f" },
  terracotta: { label: "Terracotta", color: "#a95032", dark: "#873f29" },
} as const;

export type WorkspaceAppearanceValues = {
  accent: keyof typeof WORKSPACE_ACCENTS;
  density: "comfortable" | "compact";
  corners: "soft" | "crisp";
};

export type WorkspaceAppearance = WorkspaceAppearanceValues & { updatedAt: string | null };

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearanceValues = {
  accent: "violet",
  density: "comfortable",
  corners: "soft",
};

export function normalizeWorkspaceAppearance(value?: Partial<WorkspaceAppearanceValues> | null): WorkspaceAppearanceValues {
  return {
    accent: value?.accent && Object.hasOwn(WORKSPACE_ACCENTS, value.accent) ? value.accent : DEFAULT_WORKSPACE_APPEARANCE.accent,
    density: value?.density === "compact" ? "compact" : DEFAULT_WORKSPACE_APPEARANCE.density,
    corners: value?.corners === "crisp" ? "crisp" : DEFAULT_WORKSPACE_APPEARANCE.corners,
  };
}

export async function readWorkspaceAppearance(): Promise<WorkspaceAppearance> {
  const [saved] = await getDb()
    .select()
    .from(adminWorkspaceAppearance)
    .where(eq(adminWorkspaceAppearance.id, "global"))
    .limit(1);

  return { ...normalizeWorkspaceAppearance(saved), updatedAt: saved?.updatedAt ?? null };
}
