'use client';

import { PASSWORD_MIN_LENGTH, resetPasswordSchema, tokenSchema } from '@openteam/validation';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { AuthCard, Field, Notice, SubmitButton, TextLink } from '@/components/auth/form-parts';
import { useAuthForm } from '@/components/auth/use-form';
import { takeTokenFromHash } from '@/lib/api';

export function ResetPasswordForm() {
  // undefined while reading the URL, null when the link has no usable token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const form = useAuthForm(resetPasswordSchema, '/auth/reset-password');

  const { reset } = form;
  useEffect(() => {
    function read(initial: boolean) {
      const found = takeTokenFromHash();
      // A later fragment change without a token (we clear it ourselves) is not a new link.
      if (!initial && !found) return;
      setToken(found && tokenSchema.safeParse(found).success ? found : null);
      reset();
    }
    read(true);
    const onHashChange = () => read(false);
    // Opening another emailed link while this page is open only changes the fragment.
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [reset]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await form.submit({ token, password: new FormData(event.currentTarget).get('password') });
  }

  if (token === undefined) {
    return (
      <AuthCard title="Choose a new password">
        <p role="status">Loading…</p>
      </AuthCard>
    );
  }

  const tokenRejected =
    form.status === 'error' &&
    (form.code === 'invalid_or_expired_token' || Boolean(form.errors.token));
  if (token === null || tokenRejected) {
    return (
      <AuthCard title="Choose a new password">
        <Notice tone="error" focusRef={form.noticeRef}>
          This reset link is invalid, expired or already used.
        </Notice>
        <p className="mt-6">
          <TextLink href="/forgot-password">Request a new link</TextLink>
        </p>
      </AuthCard>
    );
  }

  if (form.status === 'success') {
    return (
      <AuthCard title="Password changed">
        <Notice tone="success" focusRef={form.noticeRef}>
          Your password is changed and you have been signed out on every device.
        </Notice>
        <p className="mt-6">
          <TextLink href="/sign-in">Sign in with your new password</TextLink>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={form.pending}>
        {form.status === 'error' ? (
          <Notice tone="error" focusRef={form.noticeRef}>
            {form.message}
          </Notice>
        ) : null}
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. Changing it signs you out everywhere.`}
          error={form.errors.password}
        />
        <SubmitButton pending={form.pending} pendingLabel="Saving…">
          Change password
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
