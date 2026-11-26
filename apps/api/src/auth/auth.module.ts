import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { createJwtOptions } from './jwt.config.js';

// El cliente de Prisma no se inyecta: viene del paquete compartido
// `@framelogic/database`, igual que lo usa el /health. Por eso este
// módulo no importa ningún PrismaModule.
@Module({
  imports: [JwtModule.registerAsync({ useFactory: createJwtOptions })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
