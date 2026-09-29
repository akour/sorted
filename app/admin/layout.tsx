import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await getAdminContext();
  if (!admin) redirect("/sign-in?return_to=%2Fadmin");
  if (!admin.isAdmin) {
    return (
      <main className="admin-denied">
        <div>
          <p className="eyebrow">Sorted administration</p>
          <h1>Administrator access required</h1>
          <p>Your account can use the workspace, but it is not on the Sorted admin allowlist.</p>
          <a className="secondary-button" href="/workspace">Return to workspace</a>
        </div>
      </main>
    );
  }
  return children;
}
