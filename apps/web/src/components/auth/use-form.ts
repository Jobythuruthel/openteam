'use client';

import { fieldErrors as toFieldErrors } from '@openteam/validation';
import { useCallback, useRef, useState } from 'react';
import type { z } from 'zod';
import type { ApiResult } from '@/lib/api';
import { api } from '@/lib/api';

export type FormStatus = 'idle' | 'submitting' | 'error' | 'success';

/**
 * Shared submit flow for the auth forms: validate locally with the same schema the API uses,
 * call the API, then expose field errors, a form level message and the result.
 */
export function useAuthForm<S extends z.ZodType, T>(schema: S, path: string) {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [result, setResult] = useState<T | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  function focusNotice() {
    requestAnimationFrame(() => noticeRef.current?.focus());
  }

  async function submit(values: unknown): Promise<ApiResult<T> | null> {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const local = toFieldErrors(parsed.error);
      setErrors(local);
      setStatus('error');
      setMessage('Some fields need attention.');
      const first = Object.keys(local)[0];
      if (first) document.getElementById(first)?.focus();
      return null;
    }
    setErrors({});
    setMessage('');
    setCode('');
    setStatus('submitting');
    const response = await api<T>(path, { method: 'POST', body: parsed.data });
    if (response.ok) {
      setResult(response.data);
      setStatus('success');
    } else {
      setErrors(response.fieldErrors);
      setCode(response.code);
      setMessage(response.message);
      setStatus('error');
    }
    focusNotice();
    return response;
  }

  const reset = useCallback(() => {
    setStatus('idle');
    setErrors({});
    setMessage('');
    setCode('');
    setResult(null);
  }, []);

  return {
    status,
    errors,
    message,
    code,
    result,
    reset,
    submit,
    noticeRef,
    pending: status === 'submitting',
  };
}
