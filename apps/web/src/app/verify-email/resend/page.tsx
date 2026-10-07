import type { Metadata } from 'next';
import { EmailRequestForm } from '@/components/auth/email-request-form';

export const metadata: Metadata = { title: 'Resend confirmation email' };

export default function ResendVerificationPage() {
  return (
    <EmailRequestForm
      title="Resend confirmation email"
      intro="Enter the address you registered with and we will send a new confirmation link. Earlier links stop working."
      path="/auth/resend-verification"
      submitLabel="Send link"
      pendingLabel="Sending…"
      successMessage="If that address has an unconfirmed account, a new link is on its way."
    />
  );
}
