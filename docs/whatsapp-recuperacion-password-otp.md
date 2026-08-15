# Recuperación de contraseña por WhatsApp (Authentication) — guía de configuración

Esta guía es para dar de alta en Meta la plantilla del código de "olvidé mi contraseña" que usan los clientes de la tienda en línea. Es categoría **Authentication** (no "Utility" como la del ticket) porque Meta clasifica así cualquier mensaje que sirva para verificar identidad o restablecer una contraseña — y esa categoría tiene un formato fijo, sin texto libre ni links.

**Mientras no termines esta configuración, el sistema sigue funcionando**: `/tienda/auth/olvide-password` siempre responde igual (por diseño, para no revelar si un correo existe), solo que no llega el código por WhatsApp hasta que la plantilla esté aprobada.

## Antes de empezar

- No repites nada de Meta Business Manager, la app ni el token: es la misma conexión que ya usas para el ticket digital (ver `docs/whatsapp-api-ticket-digital.md`). Solo falta la plantilla nueva.
- **Requisito extra de la categoría Authentication**: tu cuenta de WhatsApp Business necesita tener completada la verificación de negocio de Meta, y un mínimo de conversaciones iniciadas por el negocio al día. Si tu cuenta no cumple, Meta no te va a dejar crear o aprobar la plantilla (verás un error de permisos) — eso es un requisito de la cuenta, no algo que se arregle ajustando el sistema.

## Paso 1 — Crear la plantilla

1. En WhatsApp Manager → **Plantillas de mensajes** → **Crear plantilla**.
2. Categoría: **Autenticación**.
3. Nombre: `recuperar_password_cliente` (tiene que ser exacto, o el que pongas en `WHATSAPP_RESET_TEMPLATE_NAME`).
4. Idioma: **Español (MX)**.

## Paso 2 — Configurar el contenido

A diferencia de la plantilla del ticket, aquí Meta arma el texto por ti con un formato fijo — no hay campo de "cuerpo del mensaje" libre:

1. **Tipo de entrega del código**: elige **Copiar código** (Copy Code). La otra opción, "Autocompletar en un toque", solo funciona integrada a una app nativa de Android (necesita el nombre del paquete y la firma de la app) — no aplica aquí.
2. **Recomendación de seguridad**: actívala. Agrega automáticamente la línea "Por tu seguridad, no compartas este código".
3. **Vencimiento del código**: actívalo y pon **10 minutos** — para que coincida con lo que ya está configurado en el sistema (`CODIGO_VIGENCIA_MIN` en `routes/tienda/auth.js`).
4. Meta arma el cuerpo solo, algo como: *"{{1}} es tu código de verificación."*
5. Texto del botón: puedes dejar "Copiar código" o el texto que Meta sugiera en español.

## Paso 3 — Enviar a revisión

Igual que con la del ticket: normalmente la aprueba en minutos, a veces tarda hasta 24 horas.

## Paso 4 — Confirmar las variables en el sistema

Si usaste el nombre exacto del paso 1, no necesitas tocar nada (el sistema ya trae ese valor por default). Si le pusiste otro nombre o idioma, agrega en Render:

```
WHATSAPP_RESET_TEMPLATE_NAME=recuperar_password_cliente
WHATSAPP_RESET_TEMPLATE_LANG=es_MX
```

## Paso 5 — Probar

Desde `/tienda/recuperar`, pide el código con tu propio correo (el que use tu cuenta de prueba) y con tu teléfono como cliente. Deberías recibir el mensaje con el código de 6 dígitos por WhatsApp casi de inmediato.

Si no llega: revisa los logs del backend (Render). Ahí queda impreso el error exacto que regresa Meta (`Error enviando WhatsApp de recuperación de contraseña:`) — la respuesta que ve el cliente en pantalla siempre es la misma por diseño (no delata si el correo existe ni si el envío falló), así que el detalle real solo se ve en el log del servidor. Las causas más comunes: plantilla todavía no aprobada, cuenta sin verificación de negocio completada, o `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_RESET_TEMPLATE_NAME` mal capturados.
