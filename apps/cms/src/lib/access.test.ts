import { describe, expect, it } from 'vitest';
import { proxy } from '../proxy';

describe('CMS access', () => {
  it('refuses every request with 403, signed in or not', async () => {
    const response = proxy();
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain('Access unavailable');
  });
});
