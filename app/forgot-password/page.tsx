import { PasswordResetForm } from "@/components/password-reset-form";
import { hasAuthEmailDeliveryConfigured } from "@/lib/auth-email";

export default function ForgotPasswordPage() {
  return <PasswordResetForm mode="request" emailDeliveryEnabled={hasAuthEmailDeliveryConfigured()} />;
}
