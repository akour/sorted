import { redirect } from "next/navigation";
import { getOwnerId } from "@/lib/owner";
import { readWorkspaceAppearance } from "@/lib/workspace-appearance";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await getOwnerId();
  if (!ownerId) redirect("/sign-in?return_to=%2Fworkspace");
  const appearance = await readWorkspaceAppearance().catch(() => ({ accent: "violet" as const, density: "comfortable" as const, corners: "soft" as const }));
  return <div className="appearance-theme workspace-appearance" data-accent={appearance.accent} data-density={appearance.density} data-corners={appearance.corners}>{children}</div>;
}
