# Catálogo JSON universal de FrameLogic (v0.1.173)

La pestaña **Configuración → Base de datos** permite consultar un catálogo
`DBFrameLogic.json` local sin iniciar sesión. El **candado general** de
Configuración controla de forma provisional la edición. Solo se introduce
una versión de catálogo al cambiarla explícitamente; las versiones de
FrameLogic y del archivo JSON son independientes.

## Estructura real y compatibilidad

El catálogo que utiliza actualmente FrameLogic almacena sus piezas en
**`registros[]`**, con la propiedad obligatoria `codigo` y cualquier
cantidad de campos y subdivisiones. No se convierte a un objeto `codigos`
porque eso rompería los archivos existentes.

Un archivo nuevo puede tener esta estructura:

```json
{
  "version": "1.0.0",
  "fecha_modificacion": "",
  "usuario_modificacion": "",
  "ruta_base": "D:\\Documents\\FrameLogic",
  "registros": [
    {
      "codigo": "REC3002",
      "nombre": "Perfil rectangular",
      "familia": "Estructura metálica",
      "ruta": "Perfiles\\REC3002.step",
      "peso": 18.5,
      "activo": true
    }
  ]
}
```

- **`version`** es una cadena manual con formato `MAYOR.MENOR.PARCHE`,
  por ejemplo `1.0.0`, `1.0.1` o `2.0.0`. El usuario autorizado debe
  pulsar **Editar versión → Guardar versión** y luego **Guardar JSON**.
  Ninguna actualización de FrameLogic incrementa esta cadena.
- **`fecha_modificacion`** guarda fecha y hora ISO 8601 con zona horaria,
  generada al preparar una escritura efectiva. La interfaz la muestra en
  la zona horaria del navegador. No cambia al navegar o descargar una copia.
- **`usuario_modificacion`** será la identidad del editor autenticado.
  El candado temporal no identifica a una persona, así que hoy permanece vacío.
- **`ruta_base`** se guarda una sola vez en la raíz; para un catálogo
  nuevo comienza en `D:\Documents\FrameLogic`. Los campos `ruta` dentro
  de cada registro conservan exactamente el texto relativo original. El
  archivo `DBFrameLogic.json` se busca por referencia en
  `D:\Documents\FrameLogic\DB\DBFrameLogic.json` y **no** se abre
  automáticamente a partir de una cadena de ruta de Windows.

Los archivos heredados con `version: 1` y/o con `fecha` y `usuario`
siguen siendo legibles. Un catálogo sin campo `version` también se
acepta, muestra **Sin versión registrada**, y no se modifica en lectura.
El antiguo valor numérico `1` se trata como una marca del formato previo,
no como la versión `1.0.0`; solo el usuario autorizado puede reemplazarlo.
Los metadatos `fecha` y `usuario` preexistentes se conservan: cuando
se guarda efectivamente un cambio, también se sincronizan con los nuevos
campos `fecha_modificacion` y `usuario_modificacion`. Nunca se inventan
fechas históricas faltantes.

## Consultar y editar

En el encabezado se muestra **Información del archivo JSON** con
Versión del JSON, Última modificación, Usuario, Estado y Origen.
Debajo aparece la Ruta base y el buscador, seguido del listado vertical
de códigos y sus propiedades dinámicas. La edición incluye cambio
de tipos Texto / Número / Booleano / Vacío, modificación de estructuras
anidadas y creación de códigos que heredan la **unión de subdivisiones**
de todas las piezas existentes, sin copiar valores de otras piezas.

Al pulsar **Editar versión**, el campo admite únicamente la forma
`MAYOR.MENOR.PARCHE`. **Guardar versión** confirma el borrador en memoria;
**Cancelar** lo descarta sin cambiar el catálogo. **Guardar JSON** es el
único paso que intenta persistir cambios en el archivo local; la fecha
de modificación solo se actualiza al preparar ese guardado.

## Guardar original, guardar nuevo o descargar copia

Chrome/Edge pueden utilizar File System Access API para abrir un archivo
elegido por el usuario. FrameLogic recuerda su *handle* en IndexedDB
cuando el navegador lo permite, nunca una autorización implícita por ruta.
Al volver a abrir, consulta si todavía tiene permiso de lectura y, si no,
muestra **Autorizar acceso**. La autorización de escritura se solicita
únicamente después de pulsar **Guardar JSON** con el candado desbloqueado.

Antes de sobrescribir un archivo seleccionado, FrameLogic comprueba
que su contenido no haya cambiado fuera de la aplicación. La escritura
se realiza con `createWritable()`, `write()` y `close()`; si ocurre
un error antes del cierre, se intenta `abort()`. La escritura puede
ser transaccional según el navegador, pero **no se garantiza atomicidad
en todas las plataformas**. Conviene conservar copias de seguridad.

- **Guardar JSON** con archivo editable: modifica el archivo autorizado y
  confirma la nueva fecha en la interfaz únicamente tras el cierre exitoso.
- **Guardar JSON** sin *handle* pero con selector de guardado: el usuario
  elige manualmente un archivo nuevo o una ruta de destino.
- **Descargar copia**: genera otra copia y nunca informa que actualizó
  el original. Si el navegador no admite selección de destino, **Guardar
  JSON** también descarga una copia, pero mantiene el aviso de cambios
  pendientes en el original.

## Limitación del candado actual

**El acceso de editor actualmente acepta usuario y contraseña vacíos**,
como mecanismo provisional de interfaz implementado en
`settingsEditorGate.ts`. No es autenticación segura: cualquier persona con
control de la página puede manipular JavaScript, memoria o el JSON que le
pertenezca. El navegador es quien autoriza la escritura en el archivo
local; ninguno de estos mecanismos constituye autorización remota.

Se conserva el candado existente y se comprueba antes de cambiar la
versión, las celdas y antes/durante el guardado; si se bloquea la interfaz
antes de completar la escritura, se intenta abortar. En una futura
implementación multiusuario, **todas las escrituras compartidas deberán
validarse por un backend** con identidad, roles, expiración de sesión,
control de concurrencia y auditoría. No colocar contraseñas en texto plano
en `DBFrameLogic.json`, variables frontend o registros de consola.
