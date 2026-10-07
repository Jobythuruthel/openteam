import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailDispatcher, QueueEmailDispatcher } from './email.dispatcher';
import { PasswordService } from './password.service';
import { RateLimitService } from './rate-limit.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    RateLimitService,
    SessionService,
    SessionGuard,
    TokenService,
    { provide: CLOCK, useValue: systemClock },
    { provide: EmailDispatcher, useClass: QueueEmailDispatcher },
  ],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
