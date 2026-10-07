'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Notice, Spinner, TextLink } from '@/components/auth/form-parts';
import { api } from '@/lib/api';

interface Me {
  user: { id: string; email: string; emailVerified: boolean; status: string; createdAt: string };
  capabilities: Record<string, boolean>;
}

interface SessionRow {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; me: Me; sessions: SessionRow[] };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const buttonClass =
  'rounded-md border border-neutral-400 px-3 py-1.5 text-sm font-medium outline-none hover:bg-neutral-100 focus-visible:ring-3 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60 dark:border-neutral-600 dark:hover:bg-neutral-800';

export function AccountSettings() {
  const router = useRouter();
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const feedbackRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [me, sessions] = await Promise.all([
      api<Me>('/auth/me'),
      api<{ sessions: SessionRow[] }>('/auth/sessions'),
    ]);
    if (!me.ok && me.status === 401) return setState({ kind: 'signed-out' });
    if (!me.ok) return setState({ kind: 'error', message: me.message });
    if (!sessions.ok) return setState({ kind: 'error', message: sessions.message });
    setState({ kind: 'ready', me: me.data, sessions: sessions.data.sessions });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  async function revoke(session: SessionRow) {
    setBusy(session.id);
    const result = await api(`/auth/sessions/${session.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!result.ok) return setFeedback({ tone: 'error', text: result.message });
    if (session.current) return router.push('/sign-in');
    setFeedback({ tone: 'success', text: `Signed out ${session.deviceLabel}.` });
    await load();
  }

  async function signOut(all: boolean) {
    setBusy(all ? 'all' : 'current');
    const result = await api(all ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
    setBusy(null);
    if (!result.ok) return setFeedback({ tone: 'error', text: result.message });
    router.push('/sign-in');
  }

  async function resend(email: string) {
    setBusy('resend');
    const result = await api('/auth/resend-verification', { method: 'POST', body: { email } });
    setBusy(null);
    setFeedback(
      result.ok
        ? { tone: 'success', text: 'A new confirmation link is on its way.' }
        : { tone: 'error', text: result.message },
    );
  }

  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Account and sessions</h1>

      {state.kind === 'loading' ? (
        <p role="status" className="mt-8 flex items-center gap-2">
          <Spinner /> Loading your account…
        </p>
      ) : null}

      {state.kind === 'signed-out' ? (
        <div className="mt-8">
          <Notice tone="info">You are signed out.</Notice>
          <p className="mt-4">
            <TextLink href="/sign-in">Sign in</TextLink> to manage your account.
          </p>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="mt-8">
          <Notice tone="error">{state.message}</Notice>
          <button
            type="button"
            className={`${buttonClass} mt-4`}
            onClick={() => {
              setState({ kind: 'loading' });
              void load();
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="mt-8 flex flex-col gap-10">
          {feedback ? (
            <Notice tone={feedback.tone} focusRef={feedbackRef}>
              {feedback.text}
            </Notice>
          ) : null}

          <section aria-labelledby="account-heading">
            <h2 id="account-heading" className="text-xl font-semibold">
              Account
            </h2>
            <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
              <dt className="text-neutral-600 dark:text-neutral-400">Email</dt>
              <dd className="break-all">{state.me.user.email}</dd>
              <dt className="text-neutral-600 dark:text-neutral-400">Email status</dt>
              <dd>{state.me.user.emailVerified ? 'Confirmed' : 'Not confirmed'}</dd>
              <dt className="text-neutral-600 dark:text-neutral-400">Member since</dt>
              <dd>{dateFormat.format(new Date(state.me.user.createdAt))}</dd>
            </dl>
            {!state.me.user.emailVerified ? (
              <div className="mt-6">
                <Notice tone="info">
                  <p>
                    Confirm your email to publish, apply for jobs, create organisations and start
                    chat requests. Until then those features stay locked.
                  </p>
                  <button
                    type="button"
                    className={`${buttonClass} mt-3`}
                    disabled={busy === 'resend'}
                    onClick={() => void resend(state.me.user.email)}
                  >
                    {busy === 'resend' ? 'Sending…' : 'Resend confirmation email'}
                  </button>
                </Notice>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="text-xl font-semibold">
              Where you are signed in
            </h2>
            {state.sessions.length === 0 ? (
              <p className="mt-4">No active sessions.</p>
            ) : (
              <ul className="mt-4 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {state.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {session.deviceLabel}
                        {session.current ? (
                          <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                            This device
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Last active {dateFormat.format(new Date(session.lastSeenAt))}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy === session.id}
                      onClick={() => void revoke(session)}
                      aria-label={`Sign out ${session.deviceLabel}${session.current ? ' (this device)' : ''}`}
                    >
                      {busy === session.id ? 'Signing out…' : 'Sign out'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={busy !== null}
                onClick={() => void signOut(false)}
              >
                {busy === 'current' ? 'Signing out…' : 'Sign out'}
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy !== null}
                onClick={() => void signOut(true)}
              >
                {busy === 'all' ? 'Signing out everywhere…' : 'Sign out everywhere'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
