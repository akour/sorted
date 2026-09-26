import { redirect } from "next/navigation";
import { getOwnerId } from "@/lib/owner";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await getOwnerId();
  if (!ownerId) redirect("/sign-in?return_to=%2Fworkspace");
  return children;
}
