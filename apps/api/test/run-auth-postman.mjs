import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import {
  approvalOperators,
  seedApprovalOperators,
  startApprovalPostgres,
} from './support/approval-postgres.fixture.ts';

async function run() {
  const password = process.env.FRAMELOGIC_POSTMAN_OPERATOR_PASSWORD;
  if (!password || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new Error(
      'Configura FRAMELOGIC_POSTMAN_OPERATOR_PASSWORD con una contraseña ficticia de al menos 8 caracteres y como máximo 72 bytes.',
    );
  }

  const shutdown = new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    process.stdin.once('end', resolve);
  });
  const fixture = await startApprovalPostgres();
  let app;
  let prisma;
  try {
    process.env.DATABASE_URL = fixture.url;
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.APPROVAL_OPERATOR_IDS = approvalOperators.join(',');
    ({ prisma } = await import('@framelogic/database'));
    await seedApprovalOperators(prisma, fixture.database, password);

    const { AppModule } = await import('../dist/app.module.js');
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    app.use((_request, response, next) => {
      response.setHeader('X-FrameLogic-Test-Instance', 'approval-postgres');
      next();
    });
    await app.listen(0, '127.0.0.1');
    process.stdin.resume();
    console.log(`API temporal en ${await app.getUrl()}`);
    console.log(`Contenedor de pruebas ${fixture.container}`);
    await shutdown;
  } finally {
    process.stdin.pause();
    try {
      await app?.close();
    } finally {
      try {
        await prisma?.$disconnect();
      } finally {
        fixture.stop();
      }
    }
  }
}

try {
  await run();
} catch {
  console.error(
    'El entorno de Postman no se completó. Comprueba Docker, la compilación de la API y la variable de contraseña ficticia.',
  );
  process.exitCode = 1;
}
