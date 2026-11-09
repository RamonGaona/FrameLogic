# Chat local integrado — FrameLogic v0.1.88

## Alcance
El botón **Chat** se muestra dentro de FrameLogic Web al cargar el espacio modelo. No necesita conectar el Worker MCP, iniciar VS Code ni contratar una API de inteligencia artificial.

Funciona con el motor de operaciones y su despachador compartido. Nunca ejecuta código del usuario.

## Comandos básicos en español
- Lista las piezas
- Resumen del modelo
- Seleccionar una pieza en el visor y escribir: Muestra los ejes de esta pieza
- Copia esta pieza 4 veces cada 1500 mm en X
- Mueve esta pieza 200 mm en -Y
- Deshacer / Rehacer

La instrucción debe contener un **eje local explícito** X, Y, Z, -X, -Y o -Z y una distancia en milímetros; no se adivina qué eje es longitudinal. Se admiten de 1 a 100 copias. Si hay nombres repetidos, selecciona una instancia antes de enviar el comando.

Las órdenes que cambian el modelo solo **preparan una propuesta**: se muestran coordenadas, botón Revisar y aplicar y confirmación explícita en el navegador. Las propuestas caducan en dos minutos y no se pueden confirmar después de cambiar el modelo. El historial CAD existente conserva Undo/Redo.

## IA opcional en el navegador
El botón Activar IA local es voluntario. WebLLM se importa desde su CDN oficial https://esm.run/@mlc-ai/web-llm@0.2.87 después de solicitar consentimiento. Carga el modelo Llama-3.2-1B-Instruct-q4f16_1-MLC, que puede ocupar alrededor de 1 GB y requiere WebGPU y suficiente memoria gráfica.

La IA responde preguntas sobre una vista reducida de las piezas, **sin permisos para ejecutar acciones**. Solo el analizador determinista puede preparar cambios CAD.

No se necesitan claves de API ni pagos por token. La descarga inicial exige conexión, puede consumir datos y depende de la disponibilidad y licencias de terceros. Sin WebGPU los comandos siguen disponibles.

## Privacidad y límites
- No se envían instrucciones a un servidor de IA de pago.
- No se guardan mensajes ni credenciales en almacenamiento del navegador.
- El MCP remoto y sus controles de sesión siguen independientes del chat local.
- El panel se oculta dentro del editor aislado de piezas.
- Todavía no es un agente autónomo ni identifica ejes longitudinales de la geometría.

## Comprobaciones
Ejecutar npm run test:browser-chat, npm run typecheck y npm run build. Las pruebas unitarias no sustituyen una comprobación manual de WebGPU y de copias con modelo real.
