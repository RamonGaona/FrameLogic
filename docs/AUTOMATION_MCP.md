# Automatización y MCP experimental — v0.1.86

## Revisión del código existente

Base revisada: main `6743e24246900789a5f4ebcd969f79030ca1e073` (v0.1.85).

- `DesignModel`, `PieceDefinitionRegistry` y `PieceInstanceRegistry` conservan definiciones y colocaciones. Las instancias guardan ID, nombre, definición, capa, etiquetas y transformación; el asset geométrico pertenece a la definición.
- `DesignSelectionController` selecciona; `DesignPlacementController` y `SmartPieceInsertionController` insertan; `DesignTransformController`, `MoveCommand` y `PieceMoveCopySession` manejan movimiento/copia manual. `AlignController` alinea por referencias interactivas.
- `DesignSnapController` consulta SNAPs; `assetPositionForPieceSnap` convierte referencias locales a coordenadas nativas del asset.
- `CadHistoryController` es el historial compartido. `CadCommandManager` gestiona comandos interactivos, no es el historial.
- La aplicación se construye con Vite; versión raíz + badge; workflows Validate y Web build. Cloudflare Pages tiene despliegue conectado externamente a GitHub (no se añadieron credenciales ni otra plataforma).

## Arquitectura

`cliente MCP → servidor stdio → HTTP loopback autenticado → BrowserBridge → dispatcher → ModelOperations → DesignModel + CadHistoryController → sync visual`.

`ModelOperations` no depende del DOM ni del renderer. Recibe modelo, historial y puertos para sincronización, selección y comprobación de disponibilidad. La instancia real se expone como `core.automation`. La interfaz manual sigue usando sus controladores actuales; no se cambió su semántica. Se reutilizan registros, transformaciones, conversión de SNAPs y el historial existente.

`packages/contracts/src/automation.ts` contiene los esquemas Zod compartidos. `apps/mcp` usa el SDK oficial `@modelcontextprotocol/sdk` (línea v1, versión resuelta en lockfile). El protocolo no ofrece acceso a archivos, shell, evaluación de código ni repositorio. No necesita servicios comerciales.

## Operaciones verificadas

| Herramienta MCP | API interna / resultado |
| --- | --- |
| `get_model_info` | Conteos, unidad mm, Undo/Redo y limitaciones |
| `list_pieces` | Instancias y definiciones, sin copiar geometría |
| `get_piece` | Transformación persistida, definición y metadatos de instancia/definición |
| `list_piece_snaps` | SNAPs persistentes con ID, posición local y mundial; identidad compuesta instancia + SNAP |
| `get_piece_axes` | Origen FrameLogic mundial, ejes propios mundiales y referencias geométricas |
| `select_pieces` | Selección validada por IDs, con aprobación en navegador |
| `prepare_operation` | Valida `move_piece`, `copy_piece` o `copy_piece_array`; devuelve transformaciones propuestas sin modificar modelo |
| `confirm_operation` | Solicita aprobación humana en navegador; aplica exactamente la propuesta guardada |
| `undo`, `redo` | Historial CAD compartido, previa aprobación; puede afectar la última acción manual |

`align_piece` NO está implementado en esta API. El ALINEAR manual conserva sus pruebas. Inserción desde catálogo, ensamblajes vinculados y motor de reglas completo quedan pendientes.

## Coordenadas y datos

Posiciones/distancias en **mm**; rotaciones Euler XYZ en **radianes**. La transformación persistida coloca el asset. El origen FrameLogic de la definición puede ser distinto del origen del asset.

- SNAP mundial = transformación de instancia × (origen FrameLogic + base local × SNAP local).
- Ejes mundiales = rotación de instancia × base FrameLogic de definición.
- Desplazamiento local = combinación de esos ejes; no depende del gizmo ni de la cámara.
- `move_piece.position` en `world` indica la posición deseada del **origen FrameLogic**, no la traslación cruda del asset. Para movimiento relativo se usa `displacement` y espacio explícito.
- Copias: `direction` se normaliza; `distance` es separación positiva; `count` entre 1 y 100. La copia i se coloca a `(i+1) × distance` del original. Para sentido contrario, invertir dirección. `copy_piece` exige count 1.
- El eje longitudinal debe especificarse: consultar referencias `MAIN`/ejes; no se infiere por el nombre REC1500 ni se asume universalmente X. El fixture define explícitamente su longitudinal local X.

Las copias conservan definición, capa, nombre, etiquetas y rotación; solo cambian ID y posición. Los metadatos de ingeniería asociados a la definición siguen compartidos; no se duplica STEP/IFC ni se cambia su geometría.

## Propuestas, historial y errores

Una sola propuesta pendiente por motor, con ID impredecible, duración 120 s y huella del estado relevante. Preparar otra invalida la anterior. Confirmar consume el ID; cambios manuales de piezas, definiciones, capas o ensamblajes invalidan la propuesta. La respuesta contiene `ok`, `data` o `error`; MCP también marca `isError`.

Se rechazan IDs inexistentes, números no finitos, dirección nula, distancia no positiva, conteo fuera de rango, bases locales inválidas, capas bloqueadas y miembros de ensamblajes. Las operaciones numéricas no se permiten durante comandos, edición aislada o restauración de proyecto. No hay vista fantasma: la previsualización es JSON con las transformaciones calculadas.

Cada modificación confirmada registra una entrada en `CadHistoryController`. Crear cuatro copias requiere un solo Undo. Fallos durante aplicación/rehacer restauran registros previos; el historial conserva la entrada cuando su callback falla. El registro de ejecución `core.automation.audit` mantiene las últimas 200 entradas en memoria; no es persistente. Ante un fallo de sincronización visual persistente, el modelo puede estar restaurado aunque la vista requiera recarga; no se promete recuperación de un renderer averiado.

## Prueba reproducible sin archivos del usuario

Desde la raíz, Node 24 y dependencias instaladas:

```sh
npm install
npm run test:automation
npm run automation:demo
```

El fixture real `createAutomationFixture` crea REC1500 con ID `REC1500-instance`, origen local desplazado, base girada y rotación de instancia de 90°. Selecciona la pieza, consulta sus ejes, prepara y crea cuatro copias a 1500 mm. Posiciones X del asset resultantes: -1400, -2900, -4400 y -5900; original X=100 intacto. Una llamada Undo deja una sola instancia. El fixture no se inserta automáticamente en ningún proyecto del navegador.

Pruebas: modelo e historial reales; puertos visuales mínimos sin GPU. Integración: cliente/servidor del SDK mediante transporte en memoria, HTTP real en loopback, mismo código `BrowserBridge` que usa el navegador, motor y modelo reales. El test añade Origin al fetch de Node para reproducir el encabezado que envía un navegador. Otra prueba lanza el ejecutable real stdio y verifica herramientas y error sin sesión conectada. Esto no sustituye una prueba manual de importación de STEP/IFC y renderizado completo.

## Conexión a una sesión local del modelador

1. Ejecutar `npm run dev -- --host localhost --port 5173 --strictPort` (o `npm run dev --workspace @framelogic/web -- --host localhost --port 5173 --strictPort`). Abrir **http://localhost:5173**.
2. Configurar el host MCP para lanzar el proceso desde la raíz del repositorio:

```json
{
  "mcpServers": {
    "framelogic": {
      "command": "node",
      "args": ["--import", "tsx", "apps/mcp/src/main.ts"],
      "cwd": "/ruta/absoluta/FrameLogic"
    }
  }
}
```

`cwd` depende del host; si no lo soporta, configurar su directorio de trabajo según su documentación. Para diagnóstico manual: `npm run mcp:start`; no lanzar una segunda instancia si el host ya ocupa el puerto. No usar el comando npm como transporte stdio porque sus mensajes pueden contaminar stdout.

3. Copiar el token de 64 caracteres que el servidor muestra en **stderr**. En la consola de desarrollo de la página local, ejecutar `window.frameLogicConnectAutomation("TOKEN")`. No compartir ni guardar el token en URLs o proyectos.
4. Cargar una pieza/proyecto, terminar cualquier comando activo y salir del editor de piezas. Llamar `list_pieces`; usar el ID real de la instancia, no su nombre.
5. Llamar `get_piece_axes` y `prepare_operation` con el siguiente formato (sustituir ID y elegir el eje longitudinal correspondiente):

```json
{
  "request": {
    "operation": "copy_piece_array",
    "id": "ID_REAL_DE_INSTANCIA",
    "space": "local",
    "direction": { "x": 1, "y": 0, "z": 0 },
    "distance": 1500,
    "count": 4
  }
}
```

6. Revisar la propuesta y llamar `confirm_operation` con `{ "proposalId": "ID_DEVUELTO" }`. El navegador muestra un diálogo con el resumen y exige aprobación. Sin aprobación no se modifica el modelo. `undo` permite revertir las cuatro copias.

El puente solo escucha **127.0.0.1:43185**, comprueba Host y Origin exactos, exige token por proceso, limita el cuerpo a 4 MB y acepta una sesión y una solicitud pendientes. Reiniciar servidor para cambiar sesión/pestaña. No reintenta mutaciones tras timeout: un resultado perdido se reporta como desconocido y debe inspeccionarse el modelo antes de repetir. Cancelar el diálogo o desconectar no equivale a Undo de una acción ya ejecutada.

**La web de Cloudflare no se conecta a este servidor.** El gancho de conexión solo existe en compilaciones DEV; no se añadió acceso público ni conexión HTTPS→localhost. El control gráfico real debe probarse siguiendo estos pasos en el equipo del desarrollador; la integración automática cubre el motor y el protocolo, sin afirmar que se haya verificado una sesión gráfica remota del usuario.

## Extensión y motor de reglas

Un motor de reglas puede recibir `core.automation` y llamar `getPieceAxes`, `prepare`, presentar `Proposal` al usuario y finalmente `confirm(id)`. Debe conservar la confirmación de operaciones múltiples/destructivas. No debe escribir directamente en los registros ni acceder a Three.js para calcular posiciones.

Para una nueva herramienta: definir esquema en contracts, implementar operación numérica con validación y rollback, agregar despacho explícito y aprobación, registrar pruebas positivas/negativas y regresión del historial. El servidor registra únicamente la lista fija de esquemas. Antes de ofrecer ALIGN, extraer y probar la transformación geométrica del controlador actual sin eventos de ratón.

## Límites de esta primera fase

- Experimental y local; sin chat, autenticación externa, agente incluido ni despliegue del servidor MCP en Cloudflare.
- No modifica miembros de ensamblajes; no copia conexiones ni pertenencia a ensamblajes.
- SNAPs persistentes solamente; no consulta todos los candidatos temporales de picking.
- No incluye visualización fantasma, catálogo, reglas guardadas, auditoría persistente o múltiples clientes.
- Historial compartido: Undo/Redo no está limitado a acciones MCP.
- Un modelo muy grande puede requerir paginación y revisiones incrementales: actualmente se clona metadata y se compara una huella completa.
- Importación/exportación y carga/guardado conservan sus formatos. No se declara una nueva prueba manual completa de STEP/IFC, `.flpiece` o `.flproject`.
