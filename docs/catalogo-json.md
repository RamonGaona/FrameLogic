# Catálogo JSON universal de FrameLogic (v0.1.170)

La pestaña **Configuración → Base de datos** muestra el archivo `DBFrameLogic.json`
en un listado vertical de códigos y una tabla **Propiedad / Valor**. La tabla
recorre recursivamente cualquier grupo, objeto o lista y expone todos los
valores JSON, sin establecer columnas rígidas. Solo **`codigo`** es
obligatorio. El usuario consulta sin desbloquear; el **candado general**
de la cabecera habilita la edición para todas las pestañas.

Cada código puede tener propiedades y subdivisiones completamente distintas
de los demás. En modo editor, se pueden cambiar valores directamente, o
utilizar **Editar estructura JSON** para agregar, modificar o quitar cualquier
grupo, lista o campo adicional. La actualización modifica el JSON en memoria
y **Guardar JSON** lo escribe al archivo local si el navegador tiene permiso.

Cada propiedad simple tiene un selector de tipo **Texto / Número / Sí/No / Vacío**.
Si `peso_estimado_kg` quedó por error como texto, cambia el tipo a **Número**
sin editar toda la estructura. Los textos numéricos se convierten conservando
su valor; si el texto no es un número, el programa exige confirmar antes
de borrarlo. Los decimales admiten punto o coma y los negativos son válidos.
Un valor numérico vacío se conserva como `null`, nunca como cero.
El campo obligatorio `codigo` siempre debe permanecer como texto.

## Archivo local inicial

Guardar una copia con este nombre y ubicación en Windows:

`D:\Documents\FrameLogic\DB\DBFrameLogic.json`

Contenido inicial:

```json
{
  "version": 1,
  "registros": []
}
```

Para añadir códigos, usa **+ Agregar fila** en modo editor. Cada registro
exige un código único (sin distinguir mayúsculas). **Todos los demás campos
son opcionales y libres**: pueden existir grupos, listas, objetos, números
positivos o negativos, textos, booleanos y valores `null`. No se presupone
una unidad ni moneda; dependen de las propiedades que defina cada empresa.

## Candado general, por ahora sin credenciales

Al abrir Configuración, todas las pestañas están en **Solo lectura**.
El candado aparece fuera de las pestañas, arriba a la derecha.

Al pulsarlo se solicitan **Usuario** y **Contraseña**.
**Por ahora ambos deben quedar vacíos** y se pulsa **Aceptar**.
El candado abierto permite modificar cualquier ajuste, incluida la tabla
de base de datos. Al cerrar y volver a abrir Configuración se bloquea
de nuevo.

Este desbloqueo es una **medida provisional de interfaz**, no autenticación
real ni un mecanismo que impida cambios ajenos al programa. Al existir
código público, cualquiera puede conocer y reproducir esta condición.
No debe utilizarse para autorizar escritura remota. El bloqueo anterior
basado en un verificador de contraseña por archivo no se aplica ya al
formulario; la clave estará a cargo de un servicio seguro si se implementa
edición multiusuario.

## Nueva pieza / código: unión de subdivisiones

Con el **candado general abierto**, el botón **+ Nueva pieza / código** crea
una fila con un código único provisional `NUEVO_0001`, `NUEVO_0002`, etc.
FrameLogic recorre **todos los códigos del JSON actualmente cargado** y
construye una plantilla que reúne sus propiedades y subdivisiones:
objetos, grupos profundos y todas las posiciones presentes en listas.

- Se reutilizan los nombres y la estructura, **no** las medidas, tarifas,
  rutas, descripciones ni otros valores específicos de piezas existentes.
- Las nuevas cadenas comienzan vacías y los valores numéricos/booleanos
  comienzan como `null`, para no inventar datos técnicos.
- Los códigos originales no se modifican. El nuevo código se selecciona para
  completar sus campos en la tabla, y se guarda mediante **Guardar JSON**.
- Si dos códigos utilizan tipos incompatibles para el mismo campo, se prioriza
  el objeto anidado sobre la lista, y la lista sobre un valor simple. Esta
  regla evita perder subdivisiones, pero no equivale a una migración de tipos.

**Alcance:** se utilizan los códigos del archivo `DBFrameLogic.json`
seleccionado; una web no puede inspeccionar automáticamente todos los demás
archivos locales de una carpeta `D:\`.

## Cómo abrir y editar

1. Coloca `DBFrameLogic.json` en la ruta de Windows indicada.
2. Abre FrameLogic → **Configuración** → **Base de datos**.
3. Pulsa **Seleccionar JSON** y elige el archivo de la carpeta local.
4. En la cabecera general, pulsa el candado y luego **Aceptar** con
   usuario y contraseña vacíos.
5. Edita directamente las celdas, añade o elimina filas.
6. Pulsa **Guardar JSON**. Si tu navegador admite File System Access API
   y tiene permiso de escritura, el archivo local seleccionado se
   sobrescribe; en otros navegadores, el programa descargará una
   copia `DBFrameLogic.json` que debes mover manualmente a la carpeta.

La aplicación comprueba que el archivo no haya cambiado externamente
antes de sobrescribirlo y valida el código y tipos numéricos al guardar.

## Persistencia de ruta y límites del navegador

La ruta de referencia se guarda en `localStorage` bajo
`framelogic.catalog.source.v1`, para que aparezca al recargar la
misma web en el mismo navegador. Si el usuario había guardado una URL
personalizada, se conserva. La antigua URL predeterminada
`/data/framelogic-catalog.json` se sustituye en la interfaz por la nueva
ruta local.

**La ruta no es un permiso de disco.** En navegadores como Chrome/Edge
compatibles con File System Access API, al pulsar **Seleccionar JSON**,
FrameLogic almacena una referencia al archivo seleccionado en el IndexedDB
del mismo origen web; **no** guarda allí la contraseña ni el contenido JSON.

Al recargar la página o volver a abrir la ventana, intenta recuperar esa
referencia y consultar el permiso **solo de lectura**:
- **Permiso concedido:** carga automáticamente el contenido actual del archivo
  local, sin volver a seleccionarlo ni desbloquear el candado.
- **Permiso pendiente o caducado:** aparece **Autorizar acceso**.
  Al pulsarlo, el navegador puede pedir permiso para leer el archivo.
- **Referencia perdida, archivo movido o navegador incompatible:** sigue
  disponible **Seleccionar JSON** para elegirlo de nuevo.
- **Ruta diferente:** no se abre la referencia antigua. Cada navegador
  mantiene sus propios permisos y puede olvidarlos al borrar sus datos.

Las peticiones automáticas no solicitan permisos de escritura. Para sobrescribir
el archivo se necesita además abrir el candado de edición y pulsar
**Guardar JSON**, lo cual puede provocar otra solicitud de permiso.
La web nunca obtiene acceso arbitrario al disco `D:\` por escribir su ruta.

La ruta puede cambiar cuando SharePoint sincronice la carpeta local,
pero cada usuario deberá poder abrir ese archivo desde el equipo donde
ejecuta FrameLogic. No se promete sincronización multiusuario desde
el navegador, y el directorio de Windows no está accesible al servidor
Cloudflare Pages.

La URL pública `/data/framelogic-catalog.json` continúa siendo un recurso
estático de consulta, distinto del archivo local `DBFrameLogic.json`.
Para que varios usuarios editen una única base compartida de manera
segura se necesitará autenticación y autorización **en un servidor**,
versionado y control de concurrencia. No incluir contraseñas ni claves
de acceso a SharePoint en código frontend o en archivos JSON públicos.

Los códigos del catálogo todavía no se vinculan automáticamente a las
instancias o definiciones de piezas del modelo.
