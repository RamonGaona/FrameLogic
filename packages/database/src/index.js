import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

// Carga el .env propio de este paquete (packages/database/.env),
// sin depender de la carpeta desde donde se arranque la API.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("Falta DATABASE_URL: crea el .env de packages/database.");
}

const adapter = new PrismaPg({ connectionString });

// Cliente único de Prisma, reutilizable en toda la API.
// No se crea uno nuevo por cada petición.
export const prisma = new PrismaClient({ adapter });
