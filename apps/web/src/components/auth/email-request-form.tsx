'use client';

import { emailOnlySchema } from '@openteam/validation';
import type { FormEvent } from 'react';
import { AuthCard, Field, Notice, SubmitButton, TextLink } from './form-parts';
import { useAuthForm } from './use-form';

interface Props {
  title: string;
  intro: string;
  path: string;
  submitLabel: string;
  pendingLabel: string;
  successMessage: string;
}

/** Single email field form used by resend-verification and forgot-password. */
export function EmailRequestForm({
  title,
  intro,
  path,
  submitLabel,
  pendingLabel,
  successMessage,
}: Props) {
  const form = useAuthForm(emailOnlySchema, path);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await form.submit({ email: new FormData(event.currentTarget).get('email') });
  }

  return (
    <AuthCard title={title} intro={<p>{intro}</p>}>
      {form.status === 'success' ? (
        <Notice tone="success" focusRef={form.noticeRef}>
          {successMessage}
        </Notice>
      ) : (
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-5"
          aria-busy={form.pending}
        >
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
          <SubmitButton pending={form.pending} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
        </form>
      )}
      <p className="mt-6">
        <TextLink href="/sign-in">Back to sign in</TextLink>
      </p>
    </AuthCard>
  );
}
