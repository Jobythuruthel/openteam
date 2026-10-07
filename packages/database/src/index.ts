import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export type {
  EmailVerificationToken,
  PasswordResetToken,
  Session,
  SessionRevocationReason,
  User,
  UserStatus,
} from '@prisma/client';

export interface CreatePrismaClientOptions {
  databaseUrl: string;
}

export function createPrismaClient({ databaseUrl }: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}

/** Returns true when the database answers a trivial query. Never throws. */
export async function pingDatabase(client: PrismaClient): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
