# FrameLogic — automatización de ensambles jerárquicos (v0.1.102)

## Arquitectura

El chat web y el servidor MCP usan los mismos contratos Zod y el mismo `createOperationDispatcher`, que delega las operaciones de ensamble a `AssemblyAutomation` sobre `DesignModel` y el historial CAD. No se ejecuta JavaScript externo ni se permite omitir la aprobación desde MCP. El navegador debe seguir abierto y conectado cuando el agente opera remotamente.

La selección de ensambles usa el ID explícito del árbol `INSTANCIAS`; no se infiere por coincidencia con la lista de piezas seleccionadas. `get_selection_context` devuelve `assemblyIds`, `pieceIds` y `loosePieceIds`, y `list_assemblies` enumera la jerarquía real.

## Herramientas MCP

| Herramienta | Datos | Modifica el modelo |
| --- | --- | --- |
| `list_assemblies` | `{limit?: number}` (1–100) | No |
| `get_selection_context` | `{}` | No |
| `select_assembly` | `{id: "assembly-id"}` | Selección, previa aprobación |
| `prepare_assembly_operation` | `{request: ...}` | No |
| `confirm_assembly_operation` | `{proposalId: "..."}` | Sí, con aprobación humana |

Para mover el ensamble con todos sus subensambles:

```json
{"request":{"operation":"move_assembly","id":"assembly-id","space":"world","displacement":{"x":1500,"y":0,"z":0}}}
```

Para crear tres copias independientes de toda la jerarquía:

```json
{"request":{"operation":"copy_assembly_array","id":"assembly-id","space":"world","displacement":{"x":1500,"y":0,"z":0},"count":3}}
```

Los desplazamientos siempre están expresados en milímetros y en ejes globales XYZ. Los ensambles todavía no poseen un sistema de ejes locales propio; un agente no debe asumir que X es longitudinal. La primera herramienta devuelve la previsualización con ID y caducidad. La segunda confirma usando únicamente ese ID (no acepta un cambio de parámetros adicional).

## Chat web

Selecciona un ensamble desde `INSTANCIAS`, abre **Chat** y escribe:

- «Lista los ensambles»
- «Qué ensamble está seleccionado»
- «Mueve este ensamble 200 mm en X»
- «Copia este ensamble 3 veces cada 1500 mm en X»

La interfaz muestra una propuesta antes de cualquier movimiento. **Revisar y aplicar** requiere confirmación explícita; **Cancelar** descarta la propuesta.

## Garantías y límites

- El comando se rechaza si está activo otro editor/comando CAD o si el grupo, sus subensambles o sus piezas están bloqueados.
- Los IDs de copias son nuevos; las definiciones geométricas y assets STEP se comparten sin duplicarlos. Se descartan las etiquetas de copia vinculada para que sean copias independientes.
- La propuesta caduca a los dos minutos y se invalida cuando el modelo o la selección cambian. Confirmar dos veces un mismo ID no ejecuta dos movimientos.
- Se admiten hasta 20 copias y 1000 nuevas piezas / 500 nodos jerárquicos por operación.
- El movimiento o copia de un ensamble confirmado genera **un único** registro Undo/Redo; el motor ejecuta rollback si falla la creación de piezas o subensambles.
- Los comandos heredados `move_piece`, `copy_piece`, `copy_piece_array` siguen limitados a piezas sueltas para evitar cambiar parcialmente un ensamble.
- No se incluyen todavía restricciones mecánicas, alineación geométrica automática, simulación de uniones ni un motor de scripts mixtos piezas/ensambles.

## Verificación

Ejecutar `npm run test:automation`, `npm run test:browser-chat`, `npm run typecheck` y `npm run build`. La suite incluye transacciones jerárquicas, bloqueo, aprobación rechazada, snapshots caducados, Undo/Redo y selección explícita. Verificar manualmente en el navegador con un proyecto STEP real y subensambles de al menos tres niveles.
