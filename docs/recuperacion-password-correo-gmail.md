# Recuperación de contraseña por correo (Gmail) — guía de configuración

Esta guía es para conectar una cuenta de Gmail que mande el código de "olvidé mi contraseña" a los clientes de la tienda en línea por correo. Es el canal **principal** de este flujo: no depende de que Meta apruebe ninguna plantilla de WhatsApp, así que funciona desde el primer día y es gratis.

**Mientras no termines esta configuración, el sistema sigue funcionando**: `/tienda/auth/olvide-password` siempre responde igual (por diseño, para no revelar si un correo existe), solo que no llega el código hasta que conectes la cuenta de Gmail.

## Antes de empezar

- Puedes usar tu cuenta de Gmail actual o crear una nueva solo para esto (por ejemplo `caminoaldeporte.notificaciones@gmail.com`) — lo segundo es más limpio si no quieres mezclar tu correo personal con los envíos del sistema.
- Gmail permite enviar hasta ~500 correos al día por esta vía, de sobra para este flujo.
- No necesitas tu contraseña normal de Gmail: se usa una "contraseña de aplicación" aparte, que se puede revocar en cualquier momento sin afectar tu cuenta.

## Paso 1 — Activar la verificación en dos pasos

Las contraseñas de aplicación solo están disponibles si la cuenta tiene activada la verificación en dos pasos.

1. Entra a [myaccount.google.com/security](https://myaccount.google.com/security).
2. Si "Verificación en 2 pasos" aparece desactivada, actívala (te pide tu número de teléfono para mandarte un código).

## Paso 2 — Generar la contraseña de aplicación

1. Entra a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
2. Ponle un nombre que la identifique, por ejemplo `Camino al Deporte backend`.
3. Genera la contraseña. Google te muestra 16 caracteres — cópialos, solo se muestran una vez.

## Paso 3 — Configurar el sistema

En Render (o donde tengas el backend), agrega estas variables de entorno:

```
EMAIL_USER=tu-cuenta@gmail.com
EMAIL_APP_PASSWORD=<los 16 caracteres del paso 2, sin espacios>
EMAIL_FROM_NOMBRE=Camino al Deporte
```

Reinicia el backend para que tome las variables nuevas (y para que instale `nodemailer`, la librería nueva que manda los correos).

## Paso 4 — Probar

Desde `/tienda/recuperar`, pide el código con tu propio correo. Deberías recibirlo en segundos, con el remitente `Camino al Deporte <tu-cuenta@gmail.com>`.

Si no llega: revisa la carpeta de spam primero (es normal las primeras veces, antes de que tu dirección tenga historial). Si sigue sin llegar, revisa los logs del backend (Render) — ahí queda impreso el error exacto (`Error enviando correo de recuperación de contraseña:`), la causa más común es la contraseña de aplicación mal copiada (con espacios) o la verificación en dos pasos desactivada.

## Nota sobre WhatsApp

El sistema también intenta mandar el mismo código por WhatsApp si esa integración llega a estar configurada más adelante (ver `docs/whatsapp-recuperacion-password-otp.md`) — los dos canales son independientes, uno puede estar activo sin el otro y no se pisan.
