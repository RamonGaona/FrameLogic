import { z } from "zod";
// Must run before constructing imported schemas: Workers disallow runtime code generation.
z.config({ jitless: true });
