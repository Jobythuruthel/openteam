'use client';

import { tokenSchema } from '@openteam/validation';
import { useEffect, useRef, useState } from 'react';
import { AuthCard, Notice, Spinner, TextLink } from '@/components/auth/form-parts';
import { api, takeTokenFromHash } from '@/lib/api';

type State = { kind: 'loading' } | { kind: 'success' } | { kind: 'error'; message: string };

export function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const lastToken = useRef<string | null | undefined>(undefined);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function run() {
      const token = takeTokenFromHash();
      // React strict mode runs effects twice in development, and a token can only be used once.
      if (lastToken.current !== undefined && (token === null || token === lastToken.current))
        return;
      lastToken.current = token;
      if (!token || !tokenSchema.safeParse(token).success) {
        setState({
          kind: 'error',
          message: 'This confirmation link is incomplete. Open the full link from your email.',
        });
        return;
      }
      setState({ kind: 'loading' });
      void api('/auth/verify-email', { method: 'POST', body: { token } }).then((result) => {
        setState(
          result.ok
            ? { kind: 'success' }
            : {
                kind: 'error',
                message:
                  result.code === 'invalid_or_expired_token'
                    ? 'This link has expired or was already used.'
                    : result.message,
              },
        );
      });
    }
    run();
    // Opening another emailed link while this page is open only changes the fragment.
    window.addEventListener('hashchange', run);
    return () => window.removeEventListener('hashchange', run);
  }, []);

  useEffect(() => {
    if (state.kind !== 'loading') noticeRef.current?.focus();
  }, [state]);

  return (
    <AuthCard title="Confirm your email">
      {state.kind === 'loading' ? (
        <p role="status" className="flex items-center gap-2">
          <Spinner /> Confirming your email address…
        </p>
      ) : null}
      {state.kind === 'success' ? (
        <>
          <Notice tone="success" focusRef={noticeRef}>
            Your email address is confirmed.
          </Notice>
          <p className="mt-6">
            <TextLink href="/sign-in">Sign in to continue</TextLink>
          </p>
        </>
      ) : null}
      {state.kind === 'error' ? (
        <>
          <Notice tone="error" focusRef={noticeRef}>
            {state.message}
          </Notice>
          <p className="mt-6">
            <TextLink href="/verify-email/resend">Send a new confirmation link</TextLink>
          </p>
        </>
      ) : null}
    </AuthCard>
  );
}
