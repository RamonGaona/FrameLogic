import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

// El cliente de Prisma no se inyecta: viene del paquete compartido
// `@framelogic/database`, igual que lo usa el /health. Por eso este
// módulo no importa ningún PrismaModule.
@Module({
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

