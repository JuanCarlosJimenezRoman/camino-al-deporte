# Ticket digital automático por WhatsApp — guía de configuración

Esta guía es para conectar tu número real de WhatsApp Business a la API de Meta (WhatsApp Business Platform / Cloud API), para que el ticket digital se mande solo al registrar una venta, sin que el cajero tenga que abrir WhatsApp.

**Mientras no termines esta configuración, el sistema sigue funcionando igual que antes**: al registrar la venta aparece el botón "Enviar ticket por WhatsApp" para mandarlo a mano. No se rompe nada por avanzar esto poco a poco.

## Antes de empezar

- No necesitas dar de alta un número nuevo. Vas a conectar tu número actual de WhatsApp Business y, si Meta te ofrece la opción de "coexistencia" al conectarlo, puedes seguir usando la app normal en tu celular al mismo tiempo (para hablar con clientes tú mismo). Si no te aparece esa opción en el asistente, la alternativa es usar un número secundario solo para los tickets automáticos.
- Es gratis mandar mensajes de plantilla categoría "utilidad" en volumen bajo, cuestan centavos de peso por mensaje (no dólares). No hay cuota mensual si conectas directo con Meta (sin pasar por un proveedor intermediario).
- Vas a necesitar acceso a tu cuenta de Meta Business Manager. Si nunca la has usado, el primer paso te la crea.

## Paso 1 — Meta Business Manager

1. Entra a [business.facebook.com](https://business.facebook.com) y crea tu negocio si todavía no tienes uno (nombre del negocio, tu nombre, correo).
2. Verifica el negocio si Meta te lo pide (puede pedir datos fiscales o un documento — no siempre es obligatorio para empezar a probar).

## Paso 2 — Crear la app y agregar WhatsApp

1. Entra a [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app**.
2. Tipo de app: **Negocio** (Business). Asócialo a tu Business Manager del paso 1.
3. Dentro de la app, agrega el producto **WhatsApp**.
4. Meta te manda al **Administrador de WhatsApp** (WhatsApp Manager), donde vas a conectar el número.

## Paso 3 — Conectar tu número (con coexistencia si aparece)

1. En WhatsApp Manager, elige **Agregar número de teléfono**.
2. Captura el número que ya usas en la app de WhatsApp Business.
3. Durante el proceso, busca la opción de **mantener la app de WhatsApp Business activa** (coexistencia). Si aparece, actívala — así no pierdes tu forma de contestar mensajes a mano.
4. Verifica el número (Meta manda un código por SMS o llamada).
5. Una vez conectado, anota el **Phone Number ID** (número largo, no es el teléfono) — está en WhatsApp Manager → tu número → **Detalles de la API** o en el panel "API Setup" de la app. Lo vas a necesitar en el paso 6.

## Paso 4 — Token de acceso permanente

Un token temporal de prueba caduca en 24 horas, así que hay que crear uno permanente:

1. En Meta Business Manager → **Configuración del negocio** → **Usuarios** → **Usuarios del sistema**.
2. Crea un usuario del sistema (ej. "camino-al-deporte-api"), rol: **Administrador**.
3. Asígnale la app de WhatsApp que creaste en el paso 2, con permiso de control total.
4. Genera un token para ese usuario del sistema, con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Marca que **no expire**.
5. Copia ese token — solo se muestra una vez. Guárdalo en un lugar seguro (lo vas a pegar en Render en el paso 7).

## Paso 5 — Crear y aprobar la plantilla del ticket

Meta obliga a usar una "plantilla" pre-aprobada porque el negocio manda el mensaje primero (el cliente no te escribió antes).

1. En WhatsApp Manager → **Plantillas de mensajes** → **Crear plantilla**.
2. Nombre: `ticket_digital_compra` (tiene que ser exactamente así, o el que pongas en `WHATSAPP_TICKET_TEMPLATE_NAME`).
3. Categoría: **Utilidad** (Utility).
4. Idioma: **Español (MX)**.
5. Cuerpo del mensaje — copia esto exactamente, incluyendo las variables `{{1}}` a `{{5}}`:

   ```
   🧾 Ticket de compra - Camino al Deporte

   Folio: {{1}}
   Sucursal: {{2}}
   Artículos: {{3}}
   Total: ${{4}} MXN
   Método de pago: {{5}}

   ¡Gracias por tu compra! Cualquier duda, contáctanos por este WhatsApp.
   ```

6. Cuando Meta te pida un ejemplo para cada variable, usa algo como: `V-1723500000`, `Sucursal Centro`, `Tenis Runner Pro (26/Negro) x1`, `899.00`, `Efectivo`.
7. Envía a revisión. Normalmente Meta aprueba en minutos, a veces hasta 24 horas. Si la rechaza, casi siempre es por el texto — ajusta y reenvía.

## Paso 6 — Configurar el sistema

Ya con el Phone Number ID (paso 3) y el token (paso 4):

1. En el dashboard del sistema, ve a **Sucursales**, elige la sucursal, y pega el Phone Number ID en el campo "WhatsApp Cloud API — Phone Number ID". Si por ahora solo tienes un número para todo el negocio, pégalo en **Métodos de pago** en el campo del mismo nombre (sirve como respaldo general).
2. En Render (o donde tengas el backend), agrega estas variables de entorno:

   ```
   WHATSAPP_ACCESS_TOKEN=<el token del paso 4>
   WHATSAPP_TICKET_TEMPLATE_NAME=ticket_digital_compra
   WHATSAPP_TICKET_TEMPLATE_LANG=es_MX
   ```

3. Aplica la migración nueva de la base de datos (`npx prisma migrate deploy`, o se aplica sola si tu `start` de Render ya la corre).
4. Reinicia el backend para que tome las variables nuevas.

## Paso 7 — Probar

Registra una venta de prueba con tu propio teléfono como "cliente". Si todo quedó bien conectado, te debería llegar el ticket por WhatsApp automáticamente y el sistema mostrará "Ticket enviado automáticamente por WhatsApp" en vez del botón manual.

Si no llega, revisa en los logs del backend el mensaje de error que devuelve Meta (queda guardado en `ticketDigital.error` en la respuesta de la venta) — casi siempre dice exactamente qué falta (plantilla no aprobada todavía, número no verificado, token sin permisos, etc.).
