/** Queue names are shared with the API, which enqueues work. Keep them stable: renames orphan jobs. */
export const QUEUES = {
  system: 'system',
} as const;

export const SYSTEM_JOBS = {
  heartbeat: 'heartbeat',
} as const;

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const WORKER_HEARTBEAT_KEY = 'worker_heartbeat';
