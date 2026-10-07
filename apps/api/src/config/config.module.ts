import { Global, Module } from '@nestjs/common';
import { ApiEnv, loadApiEnv } from '@openteam/config';

export const API_ENV = Symbol('API_ENV');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: ApiEnv = loadApiEnv()) {
    return {
      module: ConfigModule,
      providers: [{ provide: API_ENV, useValue: env }],
      exports: [API_ENV],
    };
  }
}
