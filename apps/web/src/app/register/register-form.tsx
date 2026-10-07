'use client';

import { PASSWORD_MIN_LENGTH, registerSchema } from '@openteam/validation';
import type { FormEvent } from 'react';
import { AuthCard, Field, Notice, SubmitButton, TextLink } from '@/components/auth/form-parts';
import { useAuthForm } from '@/components/auth/use-form';

export function RegisterForm() {
  const form = useAuthForm(registerSchema, '/auth/register');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await form.submit({ email: data.get('email'), password: data.get('password') });
  }

  if (form.status === 'success') {
    return (
      <AuthCard title="Check your email">
        <Notice tone="success" focusRef={form.noticeRef}>
          <p>
            If that address can receive email, a confirmation link is on its way. It expires in 24
            hours.
          </p>
        </Notice>
        <p className="mt-6">
          No email after a few minutes?{' '}
          <TextLink href="/verify-email/resend">Send a new link</TextLink>.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      intro={
        <p>
          Already a member? <TextLink href="/sign-in">Sign in</TextLink>.
        </p>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={form.pending}>
        {form.status === 'error' ? (
          <Notice tone="error" focusRef={form.noticeRef}>
            {form.message}
          </Notice>
        ) : null}
        <Field
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          error={form.errors.email}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words make a strong, memorable password.`}
          error={form.errors.password}
        />
        <SubmitButton pending={form.pending} pendingLabel="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
