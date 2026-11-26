<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Pruebas integrales de autenticación (F1-A5)

Ejecuta los comandos desde la raíz del repositorio con Node.js 24, el cliente Prisma ya generado y Docker disponible. Compila los contratos antes de ejecutar las pruebas si el paquete todavía no tiene su salida local.

```powershell
npm run build -w @framelogic/contracts
npm run test -w api
npm run test:e2e -w api
```

La suite HTTP habitual usa Prisma simulado. Para incluir las pruebas con PostgreSQL 16 real, habilita la ejecución desechable en la misma sesión.

```powershell
$env:APPROVAL_POSTGRES_TEST = '1'
try {
  npm run test:e2e -w api
} finally {
  Remove-Item Env:APPROVAL_POSTGRES_TEST
}
```

La prueba crea un contenedor `framelogic-approval-test-…` con un puerto local efímero, aplica el esquema inicial existente a una base exclusiva y prepara tres operadores ficticios. El recorrido comprueba registro 201, login pendiente 401, aprobación 200, login 200, bloqueo 200 y nuevo login 401. También comprueba los contratos, el JWT de 86.400 segundos, las operaciones de los tres operadores y los bloqueos cruzados concurrentes. El contenedor se retira al finalizar.

### Repetir el recorrido en Postman

1. Compila los contratos y la API. En PowerShell 7 levanta el entorno temporal e introduce una contraseña **ficticia** de al menos 8 caracteres y como máximo 72 bytes. Usa esa misma contraseña en el entorno local de Postman.

   ```powershell
   npm run build -w @framelogic/contracts
   npm run build -w api
   $env:FRAMELOGIC_POSTMAN_OPERATOR_PASSWORD = Read-Host -MaskInput 'Contraseña ficticia del operador'
   try {
     node apps/api/test/run-auth-postman.mjs
   } finally {
     Remove-Item Env:FRAMELOGIC_POSTMAN_OPERATOR_PASSWORD
   }
   ```

2. Importa [la colección F1-A5](../../docs/postman/framelogic-auth.postman_collection.json). En un entorno local de Postman define `baseUrl` con la URL temporal que imprime el comando y `operatorPassword` con la contraseña ficticia. El operador predeterminado es `operator-a@example.test`. Para repetir con otro operador, cambia `operatorEmail` a `operator-b@example.test` o `operator-c@example.test`.
3. Ejecuta la colección completa en orden en el **Collection Runner**. Desactiva **Persist responses for a session** y activa **Turn off logs during run**. La primera solicitud comprueba el marcador de la API desechable antes de enviar credenciales o registrar la cuenta. El Runner genera un correo nuevo por ejecución y mantiene el ID y el JWT del operador en variables temporales. Comparte únicamente estados y conteos de pruebas.
4. Termina el proceso de la API temporal con **Ctrl+C**. Comprueba que su contenedor desapareció con `docker ps -a --filter name=framelogic-approval-test-`. Si una interrupción forzada deja el contenedor, ejecuta `docker stop` con el nombre exacto que imprimió el proceso. Esto retira solo ese contenedor de pruebas. Elimina del entorno local de Postman la contraseña ficticia cuando termines.

### Comportamiento actual del bloqueo

El bloqueo impide iniciar sesión. Un JWT ya emitido conserva su firma y su expiración. La ruta administrativa comprueba el valor actual de `approved` en cada intento y rechaza a un operador bloqueado aunque el JWT siga vigente. Si el operador se rehabilita, un token suyo todavía vigente puede volver a superar esa comprobación. La política definitiva para estos JWT en las rutas protegidas queda pendiente del acuerdo de F1-B con Miguel.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
