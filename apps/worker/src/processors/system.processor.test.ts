import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { WORKER_HEARTBEAT_KEY } from '../queues';
import { createSystemProcessor } from './system.processor';

const logger = pino({ level: 'silent' });

describe('system processor', () => {
  it('records the heartbeat timestamp', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const fixed = new Date('2026-10-07T10:00:00.000Z');
    const process = createSystemProcessor({ systemInfo: { upsert }, logger, now: () => fixed });

    const result = await process({ name: 'heartbeat', id: '1' });

    expect(result.recordedAt).toBe('2026-10-07T10:00:00.000Z');
    expect(upsert).toHaveBeenCalledWith({
      where: { key: WORKER_HEARTBEAT_KEY },
      create: { key: WORKER_HEARTBEAT_KEY, value: '2026-10-07T10:00:00.000Z' },
      update: { value: '2026-10-07T10:00:00.000Z' },
    });
  });

  it('rejects unknown job names so they fail visibly instead of silently succeeding', async () => {
    const process = createSystemProcessor({ systemInfo: { upsert: vi.fn() }, logger });
    await expect(process({ name: 'mystery', id: '2' })).rejects.toThrow('Unknown system job');
  });

  it('propagates storage failures so BullMQ retries the job', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('db down'));
    const process = createSystemProcessor({ systemInfo: { upsert }, logger });
    await expect(process({ name: 'heartbeat', id: '3' })).rejects.toThrow('db down');
  });
});
