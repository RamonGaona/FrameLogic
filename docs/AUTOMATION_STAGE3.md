# FrameLogic v0.1.93 — Etapa 3: automatización de objetos y scripts

## Objetivo

Consultar piezas del modelo y aplicar movimientos/copias en lotes desde el
chat integrado o desde clientes MCP. Sin APIs de pago ni ejecución de código
arbitrario. La edición de geometría STEP y las operaciones de alineación
automática siguen fuera del alcance.

La operación se realiza **en la pestaña del navegador**, no en Cloudflare ni
en un servicio de IA. La sesión MCP requiere la conexión explícita del usuario
y el proyecto abierto. La IA WebLLM local conserva permisos de solo lectura.

## Herramientas MCP nuevas

| Herramienta | Alcance | Modifica el modelo |
| --- | --- | --- |
| `query_objects` | Hasta 100 instancias filtradas por ID, nombre/código o selección; incluye transformación y bounds disponibles | No |
| `describe_object` | Datos de una instancia, ejes locales, SNAPs persistentes, bounds disponibles | No |
| `prepare_commands` | Simula 1–12 comandos de mover/copiar, hasta 100 copias, y devuelve un identificador de propuesta | No |
| `confirm_commands` | Solicita aprobación en la pestaña, comprueba vigencia y aplica el lote como un Undo | Sí, después de aprobar |

Todas las posiciones y distancias del contrato están expresadas en **mm**.
Los límites del volumen, cuando están disponibles, se calculan sobre la
geometría detallada del asset y se etiquetan `DETAIL_GEOMETRY`; no deben
confundirse con medidas B-Rep certificadas. Si la pieza aún no tiene geometría
cargada, `boundsMm` es `null`.

### Consulta de objetos

```json
{
  "tool": "query_objects",
  "args": { "search": "REC", "limit": 30 }
}
```

```json
{
  "tool": "query_objects",
  "args": { "selectedOnly": true, "limit": 20 }
}
```

```json
{
  "tool": "describe_object",
  "args": { "id": "ID-DE-INSTANCIA" }
}
```

El identificador corresponde a una **instancia** única, no a un nombre de
definición que pueda repetirse.

### Preparar y aprobar una secuencia

```json
{
  "tool": "prepare_commands",
  "args": {
    "commands": [
      {
        "operation": "move_piece",
        "id": "ID-DE-INSTANCIA",
        "space": "local",
        "displacement": { "x": 200, "y": 0, "z": 0 }
      },
      {
        "operation": "copy_piece_array",
        "id": "ID-DE-INSTANCIA",
        "space": "local",
        "direction": { "x": 1, "y": 0, "z": 0 },
        "distance": 1500,
        "count": 2
      }
    ]
  }
}
```

`prepare_commands` no modifica el modelo. Devuelve un `id` y el
detalle de cada destino. Para continuar, el cliente llama a
`confirm_commands` con `{ "proposalId": "id-devuelto" }`. FrameLogic
muestra **una sola confirmación humana para el lote completo**. Una negativa
no puede reusarse; debe prepararse de nuevo.

La propuesta vence en 120 segundos. Los cambios de nombre, posición, capas,
definiciones u otras instancias invalidan el plan previo. Las copias reciben
ID propios y siguen siendo instancias normales.

### Script desde el chat integrado

Con una pieza seleccionada:

```text
Mueve esta pieza 200 mm en X; copia esta pieza 2 veces cada 1500 mm en Y
```

También:

```text
Buscar piezas REC
Consultar piezas seleccionadas
Describe esta pieza
```

El chat reconoce **solo** comandos deterministas separados por `;`, en
ejes locales explícitos y distancias `mm`. No interpreta código JavaScript,
no convierte texto libre de WebLLM en órdenes y no ejecuta nada sin pulsar
**Revisar y aplicar** y aprobar el diálogo de confirmación.

## Seguridad e historial

- El servidor MCP nunca concede autorización por sí mismo.
- `confirm_commands` consume la propuesta una sola vez, comprueba el
  fingerprint del modelo, el estado interactivo y el bloqueo de capas.
- El lote se registra como **una sola entrada del historial CAD**.
- Si falla alguna creación, restaura las posiciones previas y elimina las
  copias creadas. Undo/Redo conserva los identificadores de copia al rehacer.
- No se admiten como objetivo de este lote piezas nuevas creadas dentro del
  mismo lote, ni edición de definiciones o geometría.

Se debe probar una operación completa con un proyecto STEP real, la selección
del chat, la conectividad del Worker y el Undo/Redo antes de usar estas
herramientas en un proyecto de fabricación.
