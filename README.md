# FrameLogic

Plataforma web para trabajar con modelos 3D (IFC) en el navegador:
proyectos, archivos y el modelador 3D de FrameLogic con su lógica programable.
El cálculo estructural y BIM 4D son módulos posteriores, no hacen parte del MVP.

## Qué necesitas antes

- Node.js LTS
- Git
- Docker Desktop abierto y con el motor corriendo

## Cómo levantar todo

1. Clona el repo y pásate a tu rama de trabajo.

2. Instala las dependencias desde la raíz:

   ```
   npm install
   ```

   Si acabás de hacer `git pull` o `git merge`, volvé a correr `npm install`
   desde la raíz, aunque ya lo hayas corrido antes.

3. Crea los dos archivos `.env`, con la misma línea en los dos. Uno va en
   la raíz y el otro dentro de `packages/database`, porque Prisma 7 lee
   la URL desde `prisma7.config.ts` con `process.env`:

   ```
   DATABASE_URL="postgresql://framelogic:framelogic@localhost:5432/framelogic"
   ```

   Los `.env` nunca se suben a Git. Si `git status` muestra un `.env`,
   no se commitea.

4. Levanta la base de datos desde la raíz:

   ```
   docker compose up -d
   ```

   Verifica con `docker ps` que `framelogic-postgres` sale en `Up`.

5. Aplica la migración desde `packages/database`:

   ```
   npx prisma migrate dev
   ```

   Si la base ya está al día, Prisma dice que está en sincronía y no
   crea una migración nueva. No se crea una migración nueva a mano.

6. Genera el cliente de Prisma desde `packages/database`:

   ```
   npx prisma generate
   ```

   Este paso crea el cliente en `packages/database/generated/prisma`.
   Hay que correrlo en un checkout nuevo y después de cada merge o pull,
   porque si no la carpeta `generated/` queda vieja o no existe y la API
   falla con `ERR_MODULE_NOT_FOUND`. La carpeta `generated/` no se
   commitea, se genera en cada máquina.

7. Levanta la API desde `apps/api`:

   ```
   npm run start:dev
   ```

   Ojo: el `npm run dev` de la raíz levanta la web, no la API.

8. Prueba que todo quedó vivo:

   ```
   curl http://localhost:3000/health
   ```

   Debe responder:

   ```json
   { "status": "ok", "database": "ok" }
   ```

   Si la base está abajo, no devuelve un OK falso: responde error
   con `database: "down"`.

## Estructura del repo

- `apps/api` — la API (NestJS).
- `apps/web` — la página.
- `packages/database` — Prisma: schema, modelos (`User`, `Project`, `File`) y migraciones.
- `packages/contracts` — los contratos de la API en Zod: las formas de los datos
  que la API recibe y devuelve (12 contratos en 3 grupos: cuenta, proyectos, archivos).

## Regla de oro

Nada se codea sin estar primero en la lista de contratos de `packages/contracts`.
Si hace falta un dato nuevo, primero se escribe y se aprueba el contrato.
