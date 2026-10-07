import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient, pingDatabase } from './index';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('database (integration)', () => {
  const client = createPrismaClient({ databaseUrl: databaseUrl ?? '' });

  afterAll(async () => {
    await client.$disconnect();
  });

  it('answers a ping', async () => {
    expect(await pingDatabase(client)).toBe(true);
  });

  it('has the extensions from the initial migration', async () => {
    const rows = await client.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pgcrypto') ORDER BY extname`;
    expect(rows.map((row) => row.extname)).toEqual(['citext', 'pgcrypto']);
  });

  it('can read and write system_info', async () => {
    await client.systemInfo.upsert({
      where: { key: 'integration_test' },
      create: { key: 'integration_test', value: 'ok' },
      update: { value: 'ok' },
    });
    const row = await client.systemInfo.findUnique({ where: { key: 'integration_test' } });
    expect(row?.value).toBe('ok');
    await client.systemInfo.delete({ where: { key: 'integration_test' } });
  });
});

describe('pingDatabase', () => {
  it('returns false instead of throwing when the database is unreachable', async () => {
    const client = createPrismaClient({ databaseUrl: 'postgresql://nobody:x@127.0.0.1:1/none' });
    expect(await pingDatabase(client)).toBe(false);
    await client.$disconnect();
  });
});
