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

3. Para una instalación nueva, genera en tu gestor de contraseñas 64 caracteres
   hexadecimales aleatorios y guárdalos como credencial de esta base local.
   En el archivo `.env` de la raíz configura `POSTGRES_PASSWORD` con ese valor.
   En `packages/database/.env` configura la URL que usan Prisma y la API.
   Sustituye el marcador por la misma contraseña en ambos archivos:

   ```dotenv
   # .env de la raíz (Docker Compose)
   POSTGRES_PASSWORD=<contraseña-local>
   ```

   ```dotenv
   # packages/database/.env (Prisma y API)
   DATABASE_URL=postgresql://framelogic:<contraseña-local>@127.0.0.1:5432/framelogic
   ```

   La contraseña hexadecimal se puede insertar directamente en la URL. Para
   una credencial existente con caracteres reservados, codifica el componente
   contraseña de la URL y usa el valor original en Compose. Las variables
   exportadas en la terminal tienen prioridad sobre los archivos. Mantén los
   valores en tu máquina y fuera de Git. Desde la raíz, valida la configuración
   con `docker compose config --quiet` para evitar imprimir la contraseña.
   El puerto de desarrollo queda publicado únicamente en `127.0.0.1`.

   **Si ya tienes un volumen**, empieza con la contraseña vigente del rol.
   PostgreSQL solo usa `POSTGRES_PASSWORD` al inicializar un directorio de
   datos vacío. Para rotar la credencial, acuerda una ventana local, comprueba
   el respaldo y pausa los clientes. Conéctate al contenedor existente mediante
   `docker exec -it framelogic-postgres psql -U framelogic -d framelogic`,
   confirma la conexión con `\conninfo` y usa `\password framelogic` para
   introducir la nueva contraseña en el prompt oculto. Actualiza ambos archivos
   locales y las variables exportadas, recrea el servicio con el mismo volumen
   y reinicia los clientes. Verifica una conexión nueva con el paso 8.
   Conserva el volumen durante toda la rotación.

4. Levanta la base de datos desde la raíz:

   ```
   docker compose up -d
   ```

   Verifica con `docker ps` que `framelogic-postgres` sale en `Up`.

5. Aplica la migración desde `packages/database`:

   ```
   npx prisma migrate dev --config prisma7.config.ts
   ```

   Si la base ya está al día, Prisma dice que está en sincronía y no
   crea una migración nueva. No se crea una migración nueva a mano.

6. Genera el cliente de Prisma desde `packages/database`:

   ```
   npx prisma generate --config prisma7.config.ts
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
