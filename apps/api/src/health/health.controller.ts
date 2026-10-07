import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process is running. Used by container liveness probes. Never touches dependencies. */
  @Get('live')
  live() {
    return this.health.liveness();
  }

  /** Dependencies are reachable. Returns 503 when any check fails so load balancers drain the node. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.readiness();
    res.status(report.status === 'ok' ? 200 : 503);
    return report;
  }
}
