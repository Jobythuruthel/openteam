'use client';

import Link from 'next/link';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {intro ? <div className="mt-3 text-neutral-700 dark:text-neutral-300">{intro}</div> : null}
      <div className="mt-8">{children}</div>
    </main>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
};

/** Labelled input wired to its hint and error through aria-describedby. */
export function Field({ id, label, error, hint, ...input }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-neutral-600 dark:text-neutral-400">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-md border border-neutral-400 bg-white px-3 py-2 text-neutral-900 outline-none focus-visible:ring-3 focus-visible:ring-blue-600 focus-visible:ring-offset-2 aria-invalid:border-red-700 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-2.5 font-medium text-white outline-none hover:bg-neutral-700 focus-visible:ring-3 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    />
  );
}

/**
 * Feedback region. Errors use role=alert so screen readers announce them immediately;
 * success uses role=status so it is announced politely.
 */
export function Notice({
  tone,
  children,
  focusRef,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
  focusRef?: React.Ref<HTMLDivElement>;
}) {
  const styles = {
    error: 'border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
    success: 'border-green-700 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
    info: 'border-blue-700 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  }[tone];
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border-l-4 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-blue-600 ${styles}`}
    >
      {children}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium underline underline-offset-2 outline-none focus-visible:rounded focus-visible:ring-3 focus-visible:ring-blue-600"
    >
      {children}
    </Link>
  );
}
