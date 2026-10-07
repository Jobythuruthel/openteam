import type { Metadata } from 'next';
import { EmailRequestForm } from '@/components/auth/email-request-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <EmailRequestForm
      title="Reset your password"
      intro="Enter your email address and we will send a link to choose a new password."
      path="/auth/request-password-reset"
      submitLabel="Send reset link"
      pendingLabel="Sending…"
      successMessage="If an account uses that address, a reset link is on its way. It expires in 60 minutes."
    />
  );
}
