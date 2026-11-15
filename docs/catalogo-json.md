# Catálogo JSON de FrameLogic (v0.1.165)

La pestaña Configuración > Base de datos muestra un catálogo de códigos
y sus propiedades. Los campos son codigo, nombre, familia, ruta,
peso, longitud y tarifa. Los códigos son únicos, sin distinguir mayúsculas.

## Formato JSON (versión 1)

Un ejemplo de registro:

{
  "version": 1,
  "registros": [
    {
      "codigo": "REC3000",
      "nombre": "Perfil rectangular",
      "familia": "Perfiles",
      "ruta": "/piezas/REC3000.step",
      "peso": 18.5,
      "longitud": 3000,
      "tarifa": 41500
    }
  ]
}

Peso, longitud y tarifa son números no negativos, o null cuando no
se conocen. No se presupone unidad de medida ni moneda.

## Ruta del JSON

La URL pública predeterminada es /data/framelogic-catalog.json y permite
a todos ver los mismos datos publicados. También se puede utilizar una
URL HTTPS con CORS o seleccionar un archivo local por el diálogo del navegador.

La aplicación web no puede abrir una ruta local como C:\carpeta\datos.json
directamente: hace falta usar el selector. En navegadores compatibles con
File System Access, el administrador puede guardar en el mismo archivo
seleccionado, tras conceder los permisos.

## Modo administrador

Cuando el JSON no tiene configuración de edición, se puede definir
una contraseña de al menos 12 caracteres, que se conserva en el archivo
como verificador PBKDF2-SHA256 con sal aleatoria. No se escribe la
contraseña en texto plano.

El modo administrador desbloquea los campos para crear, modificar y
eliminar registros. Después de editar una ficha, pulsar Aplicar ficha,
y finalmente Guardar JSON para escribir el archivo local o descargar
la versión nueva. Se comprueba si el archivo fue modificado por otra
aplicación antes de sobrescribirlo.

IMPORTANTE: la contraseña en el JSON es solo un bloqueo de interfaz.
No es autorización del servidor ni impide cambios directos a alguien
que tenga permisos para escribir el archivo. Un JSON público con hash
también permite intentos de adivinar contraseñas offline. Usa una frase
de contraseña larga y única.

## Límite de edición compartida

Cloudflare Pages sirve la URL JSON como recurso estático. La aplicación
puede leer la misma URL para todos, pero NO puede sobrescribir el
contenido remoto solo porque alguien ingrese una contraseña.

Para publicar cambios, es necesario actualizar el archivo JSON en
el origen del sitio y redesplegarlo. Para edición simultánea realmente
compartida, una iteración posterior debe incorporar una API con
autenticación y autorización en el servidor, control de concurrencia
y un historial de modificaciones. Nunca se deben incluir claves
de administrador ni tokens de GitHub en código enviado al navegador.

Esta versión no enlaza todavía los códigos del catálogo con las
instancias del modelo. Esa relación se podrá agregar posteriormente.
