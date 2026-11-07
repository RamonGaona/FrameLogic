# MCP remoto para FrameLogic web — v0.1.87

## Qué cambia

La web publicada incluye un botón **MCP**. Crea una sesión explícita con un servidor HTTPS separado, copia su configuración para un cliente MCP compatible y permite desconectarla. No requiere ejecutar el modelador ni un puente HTTP en el computador. La pestaña debe permanecer abierta y activa. No es un chat integrado ni incluye un proveedor de IA.

Arquitectura: cliente MCP HTTP → Worker HTTPS → Durable Object por sesión → sondeo de la pestaña → API existente del modelo. Se conserva el MCP local por stdio.

## Activación en Cloudflare (una vez)

El despliegue de Pages NO despliega el Worker. El código está preparado, pero requiere acceso a la cuenta Cloudflare que alojará el servidor. No confundir un build exitoso con un despliegue remoto verificado.

### Despliegue manual desde el repositorio

Con Node 24 y las dependencias instaladas:

```sh
npx wrangler@4.158.0 login
npm run mcp:deploy
npx wrangler@4.158.0 secret put SESSION_KEY --config apps/mcp/wrangler.jsonc
```

Introducir en el último comando una clave aleatoria de al menos 32 caracteres (recomendado 64 hexadecimales), guardada de forma privada. El servidor rechaza creación de sesiones si falta la clave. Utilizar la URL exacta que devuelve Wrangler; no se puede anticipar el subdominio de la cuenta.

`apps/mcp/wrangler.jsonc` crea el Worker `framelogic-mcp` y un namespace Durable Object SQLite. Autoriza solamente el origen `https://framelogic-dev.pages.dev`. Para otro dominio, modificar explícitamente ALLOWED_ORIGIN. No se autorizan todas las previews por comodín.

Comprobar `GET <origen-del-worker>/health`: debe indicar `framelogic-mcp` y `0.1.87`. Esto comprueba disponibilidad, no el flujo de modificación del modelo.

### Actualización automática por GitHub

Configurar los secretos del repositorio:

- `CLOUDFLARE_API_TOKEN`: token limitado a la cuenta con permiso para desplegar Workers y gestionar sus bindings y secretos.
- `CLOUDFLARE_ACCOUNT_ID`: ID de esa cuenta.
- `FRAMELOGIC_MCP_SESSION_KEY`: la clave privada de creación de sesiones, de al menos 32 caracteres.

El workflow **Remote MCP server** valida y despliega cambios del MCP y contratos al llegar a `main`; también admite ejecución manual. Sin esos secretos solo valida y deja constancia explícita de que no desplegó. Pages conserva su configuración existente. No hay activación automática de sesiones en la web.

## Uso

1. Abrir la web y cargar una pieza o proyecto. Terminar los comandos activos y salir del editor de piezas.
2. Pulsar **MCP**. Introducir el origen HTTPS real del Worker y la clave privada de creación de sesiones.
3. Pulsar **Crear conexión**. Esperar el estado conectado.
4. Copiar la configuración en un cliente que admita **Streamable HTTP y cabecera Authorization**. La configuración usa `mcpServers.framelogic.url` y `headers.Authorization`; algunos clientes requieren adaptarla a su propio formato. No se promete compatibilidad con interfaces que solo admiten OAuth o no permiten cabeceras personalizadas.
5. Cerrar el panel para trabajar. Consultar `list_pieces` y `get_piece_axes`, preparar la operación y confirmar. La aprobación ocurre en el navegador; el agente no puede saltársela.
6. **Desconectar y revocar** invalida la sesión. Recargar la página pierde la conexión y las claves locales; crear otra sesión. Todas caducan en una hora.

No compartir la clave de creación de sesiones con el agente. La configuración copiada contiene solo la credencial temporal del agente. No pegar claves en chats públicos, commits o enlaces.

## Alcance y límites

- Herramientas de v0.1.86: consultar piezas/SNAPs/ejes, seleccionar, preparar movimientos y copias, confirmar, Undo/Redo. ALIGN programático y chat siguen pendientes.
- Claves distintas para navegador y agente. Un agente no puede hacerse pasar por el navegador para enviar resultados ni revocar la sesión. Una sesión pertenece a una pestaña; el identificador de pestaña se conserva en el Durable Object.
- El servidor persiste hashes de credenciales, caducidad e identificador de pestaña, no archivos STEP/IFC ni geometría. Solicitudes y resultados (incluidos metadatos consultados) transitan por el servidor en memoria. No es almacenamiento de proyectos ni auditoría persistente.
- Una solicitud pendiente por sesión, entrega única, tiempo máximo 90 s, sin reintentos de modificaciones. Una aprobación tardía no ejecuta la acción. Caducidad comprobada también al recibir solicitudes y alarma que borra credenciales.
- Ante desconexión, reinicio del Worker, timeout o resultado perdido, revisar el modelo antes de repetir. Un reinicio puede interrumpir operaciones en curso; no hay reanudación automática. Desconectar no deshace cambios ya aplicados.
- El sondeo cada segundo y los objetos consumen las cuotas de Cloudflare; se detienen al desconectar. No se activa ningún plan de pago desde este código. Revisar el consumo y los límites de la cuenta antes de ampliar usuarios.
- La clave de creación de sesiones es para un piloto de confianza. Un servicio multiusuario público requiere identidad por usuario, límites de uso y administración de accesos antes de distribuir esa clave.

## Verificación

```sh
npm run typecheck
npm run test:automation
npm run build
npx wrangler@4.158.0 deploy --dry-run --config apps/mcp/wrangler.jsonc
```

Pruebas automatizadas: cliente oficial MCP Streamable HTTP → manejador Worker → sesión simulada con la misma clase Durable Object → puente de navegador real → modelo/historial reales. Cubren copias, Undo, rechazo humano, credenciales separadas, aislamiento, pestañas, revocación, caducidad y entrega única. Son pruebas con almacenamiento simulado, no una prueba desplegada en Cloudflare.

Prueba manual de aceptación tras desplegar: crear sesión en la web pública, conectar cliente real, crear cuatro copias de una pieza, rechazar otra operación, deshacer, desconectar y comprobar rechazo de la antigua credencial. Verificar también que una segunda sesión no ve el modelo de la primera. Esta aceptación remota queda pendiente hasta disponer del despliegue.
