import { headers } from "next/headers";
import { AccountAuthForm } from "@/components/account-auth-form";
import { hasAuthEmailDeliveryConfigured } from "@/lib/auth-email";
import { isOwnerOnlySiteHost, normalizeHost } from "@/lib/auth-hosts";

export default async function SignInPage() {
  const requestHeaders = await headers();
  return <AccountAuthForm
    mode="sign-in"
    isOwnerPreview={isOwnerOnlySiteHost(normalizeHost(requestHeaders.get("host")))}
    canUseEmail={hasAuthEmailDeliveryConfigured()}
  />;
}
