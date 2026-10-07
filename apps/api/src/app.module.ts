import { DynamicModule, Module } from '@nestjs/common';
import type { ApiEnv } from '@openteam/config';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { OpenApiModule } from './openapi/openapi.module';

@Module({})
export class AppModule {
  static forRoot(env?: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        InfrastructureModule,
        HealthModule,
        AuthModule,
        OpenApiModule,
      ],
    };
  }
}
