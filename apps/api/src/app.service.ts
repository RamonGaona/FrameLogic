import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { prisma } from '@framelogic/database';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<{ status: string; database: string }> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch {
      // No exponemos el error interno: puede traer datos de la conexión.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
  }
}
