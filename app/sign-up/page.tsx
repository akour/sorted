import { headers } from "next/headers";
import { AccountAuthForm } from "@/components/account-auth-form";
import { isOwnerOnlySiteHost, normalizeHost } from "@/lib/auth-hosts";

export default async function SignUpPage() {
  const requestHeaders = await headers();
  return <AccountAuthForm mode="sign-up" isOwnerPreview={isOwnerOnlySiteHost(normalizeHost(requestHeaders.get("host")))} />;
}
