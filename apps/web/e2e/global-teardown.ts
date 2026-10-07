export default async function globalTeardown() {
  const pid = Number(process.env.E2E_WORKER_PID);
  if (pid) process.kill(pid, 'SIGTERM');
}
