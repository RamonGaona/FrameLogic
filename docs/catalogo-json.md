# Catálogo JSON universal de FrameLogic (v0.1.167)

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

**Recordar la ruta no equivale a tener permiso de lectura o escritura.**
Una página web no puede abrir automáticamente `D:\...` tras refrescar:
hay que volver a seleccionar el archivo cuando el navegador lo requiera.
El selector de archivos compatible puede recordar la última carpeta.

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
