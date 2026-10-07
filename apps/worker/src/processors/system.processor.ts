import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { SYSTEM_JOBS, WORKER_HEARTBEAT_KEY } from '../queues';

export interface SystemInfoStore {
  upsert(args: {
    where: { key: string };
    create: { key: string; value: string };
    update: { value: string };
  }): Promise<unknown>;
}

export interface SystemProcessorDeps {
  systemInfo: SystemInfoStore;
  logger: Logger;
  now?: () => Date;
}

/**
 * Handles jobs on the system queue. The heartbeat records when a worker last processed work,
 * which lets operators and future admin views confirm the queue pipeline is alive.
 */
export function createSystemProcessor({
  systemInfo,
  logger,
  now = () => new Date(),
}: SystemProcessorDeps) {
  return async (job: Pick<Job, 'name' | 'id'>): Promise<{ recordedAt: string }> => {
    if (job.name !== SYSTEM_JOBS.heartbeat) {
      throw new Error(`Unknown system job: ${job.name}`);
    }
    const recordedAt = now().toISOString();
    await systemInfo.upsert({
      where: { key: WORKER_HEARTBEAT_KEY },
      create: { key: WORKER_HEARTBEAT_KEY, value: recordedAt },
      update: { value: recordedAt },
    });
    logger.debug({ jobId: job.id }, 'Recorded worker heartbeat');
    return { recordedAt };
  };
}
