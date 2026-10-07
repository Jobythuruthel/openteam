'use client';

import { loginSchema } from '@openteam/validation';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { AuthCard, Field, Notice, SubmitButton, TextLink } from '@/components/auth/form-parts';
import { useAuthForm } from '@/components/auth/use-form';

export function SignInForm() {
  const router = useRouter();
  const form = useAuthForm(loginSchema, '/auth/login');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await form.submit({ email: data.get('email'), password: data.get('password') });
    if (result?.ok) router.push('/settings/account');
  }

  return (
    <AuthCard
      title="Sign in"
      intro={
        <p>
          New to Open Team? <TextLink href="/register">Create an account</TextLink>.
        </p>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={form.pending}>
        {form.status === 'error' ? (
          <Notice tone="error" focusRef={form.noticeRef}>
            {form.message}
          </Notice>
        ) : null}
        {form.status === 'success' ? (
          <Notice tone="success" focusRef={form.noticeRef}>
            Signed in. Taking you to your account…
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
          autoComplete="current-password"
          required
          error={form.errors.password}
        />
        <SubmitButton
          pending={form.pending || form.status === 'success'}
          pendingLabel="Signing in…"
        >
          Sign in
        </SubmitButton>
      </form>
      <p className="mt-6">
        <TextLink href="/forgot-password">Forgot your password?</TextLink>
      </p>
    </AuthCard>
  );
}
