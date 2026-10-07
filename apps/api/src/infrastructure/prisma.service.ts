import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, pingDatabase, PrismaClient } from '@openteam/database';
import type { ApiEnv } from '@openteam/config';
import { API_ENV } from '../config/config.module';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    // Prisma connects lazily on the first query, so the API can boot while the database is down
    // and report that through the readiness probe instead of crash looping.
    this.client = createPrismaClient({ databaseUrl: env.DATABASE_URL });
  }

  ping(): Promise<boolean> {
    return pingDatabase(this.client);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
