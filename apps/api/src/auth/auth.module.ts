import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthExceptionFilter } from './auth-exception.filter.js';
import { AuthService } from './auth.service.js';
import { createJwtOptions } from './jwt.config.js';
import { UserApprovalController } from './user-approval.controller.js';
import { UserApprovalService } from './user-approval.service.js';

// El cliente de Prisma no se inyecta: viene del paquete compartido
// `@framelogic/database`, igual que lo usa el /health. Por eso este
// módulo no importa ningún PrismaModule.
@Module({
  imports: [JwtModule.registerAsync({ useFactory: createJwtOptions })],
  controllers: [AuthController, UserApprovalController],
  providers: [
    AuthService,
    UserApprovalService,
    { provide: APP_FILTER, useClass: AuthExceptionFilter },
  ],
})
export class AuthModule {}
