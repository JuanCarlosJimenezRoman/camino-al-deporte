# Arquitectura — Camino al Deporte

## Resumen

Sistema web responsivo (funciona en PC y celular vía navegador) para gestionar
inventarios y ventas de "Camino al Deporte", con acceso diferenciado por rol.

```
┌─────────────────┐        HTTPS/JSON        ┌──────────────────┐        ┌──────────────┐
│  Frontend        │ ───────────────────────► │  Backend API      │ ─────► │  PostgreSQL   │
│  Next.js (React) │ ◄─────────────────────── │  Node.js/Express  │ ◄───── │  (Render)     │
│  Vercel o Render │        JWT en header      │  Render Web Svc   │        └──────────────┘
└─────────────────┘                            └──────────────────┘
```

- **Backend**: Node.js + Express + Prisma ORM, desplegado como Web Service en
  Render (nuevo proyecto, separado de `mayoreo-facil`).
- **Base de datos**: PostgreSQL, como instancia nueva en Render (mismo patrón
  que ya usas en tu otro proyecto).
- **Frontend**: Next.js (React) con App Router, responsivo. Puede desplegarse
  en Render (Static Site / Web Service) o en Vercel — ambos funcionan bien con
  Next.js; Vercel suele ser más simple para este framework específico.
- **Autenticación**: JWT (JSON Web Token). El usuario hace login, recibe un
  token, y el frontend lo manda en cada request (`Authorization: Bearer ...`).

## Roles y permisos

| Rol | Productos | Inventario | Ventas | Apartados | Usuarios | Campos personalizados |
|---|---|---|---|---|---|---|
| ADMIN_PRINCIPAL | CRUD | CRUD | CRUD + cancelar, cualquier sucursal, historial global | CRUD, cualquier sucursal | CRUD | CRUD |
| DESARROLLO | CRUD | CRUD | CRUD + cancelar, cualquier sucursal, historial global | CRUD, cualquier sucursal | CRUD | CRUD |
| INVENTARIO | CRUD | CRUD | — | — | — | — |
| VENTAS | Solo lectura | Lectura de cualquier sucursal (para buscar/pedir), edición solo vía Inventario/Admin | Crear/ver, forzado a **su propia sucursal** | Crear/abonar/cancelar, forzado a su propia sucursal | — | — |
| CONSULTA | Solo lectura | Solo lectura (existencias) | — | — | — | — |

**Importante — VENTAS y su sucursal:** un usuario con rol VENTAS solo puede
registrar ventas y apartados desde la sucursal que tiene asignada
(`usuarios.sucursal_id`); esto se valida en el backend (`POST /ventas` y
`POST /apartados` ignoran cualquier `sucursalId` que mande el cliente y usan
siempre el del token), no solo en la interfaz. Sí puede **consultar** (sin
editar) la existencia de cualquier sucursal desde Inventario, para buscar un
modelo que no tiene y pedirlo si un cliente lo quiere.

La diferencia entre `ADMIN_PRINCIPAL` y `DESARROLLO` es organizativa, no
técnica: ambos tienen acceso total. `DESARROLLO` es para quien mantiene el
sistema (tú o quien te apoye a futuro) y puede crear **campos personalizados**
sin necesidad de tocar código (ver siguiente sección). Si prefieres que ambos
roles sean idénticos, se puede fusionar en uno solo más adelante.

## Clasificación de mercancía

Cada producto tiene: **marca**, **modelo** (opcional, depende de la marca) y
**categoría**. Cada producto puede tener múltiples **variantes** (una por
combinación de talla/color), cada una con su propio SKU y stock. Esto permite
que "Tenis Nike Air Max, talla 8" y "Tenis Nike Air Max, talla 9" sean
registros de stock independientes bajo el mismo producto.

Las tallas son un catálogo reutilizable con un `tipo` (calzado, ropa,
accesorio) para no mezclar selectores de talla de zapato con los de ropa.

## Campos personalizados (crecer el sistema sin tocar código)

En vez de que agregar un campo nuevo signifique una migración de base de
datos y un despliegue, los productos tienen una columna `atributosExtra`
(JSON flexible) y existe una tabla `campos_personalizados` donde el rol
DESARROLLO define qué campos existen (ej. "Género", "Material", tipo de dato,
opciones si es un select). El frontend puede leer esa tabla y renderizar el
formulario dinámicamente. Esto cubre el requisito de "agregar o modificar
campos a futuro" sin que cada cambio pequeño requiera intervención en código.
Si a futuro se necesita un campo que sí amerite estar indexado/filtrable de
forma nativa (no solo dentro del JSON), ese sí requiere una migración
tradicional — es la excepción, no la regla.

## Multi-sucursal / bodega

El catálogo (producto, variante, SKU, precio) es **global**: el mismo SKU
significa lo mismo en cualquier sucursal. El **stock es por sucursal**, vía
la tabla `existencias` (sucursal + variante → stock actual y mínimo). Esto
permite:

- Ver existencias de una sucursal específica o buscarlas en todas.
- Que cada usuario de rol INVENTARIO/VENTAS/CONSULTA tenga una sucursal
  "de casa" (`usuarios.sucursal_id`) que el frontend usa por defecto —
  ADMIN_PRINCIPAL/DESARROLLO no tienen sucursal fija y ven todas.
- Registrar ventas y movimientos de inventario (entrada/salida/ajuste)
  siempre atados a una sucursal concreta.

**Transferencias entre sucursales** (`transferencias_inventario`) siguen un
flujo de dos pasos, como en una operación real de bodega:

1. **Solicitada**: al crear la transferencia, el stock se descuenta de
   inmediato de la sucursal origen (la mercancía "sale" y queda en tránsito).
2. **Recibida**: alguien en la sucursal destino confirma la llegada
   (`POST /transferencias/:id/recibir`), y ahí se suma el stock al destino.
3. **Cancelada**: si se cancela antes de recibirse, el stock regresa al
   origen.

Este diseño evita que el stock "aparezca" en el destino antes de que la
mercancía físicamente llegue, y dejaría rastro si algo se pierde en el
camino (queda "SOLICITADA" indefinidamente, visible como pendiente).

## Modelo de datos (resumen)

- `roles`, `usuarios` (con `sucursal_id` opcional)
- `sucursales`
- `marcas`, `modelos`, `categorias`, `tallas`
- `productos`, `producto_variantes` (catálogo global: variante = talla/color + SKU)
- `existencias` (stock por sucursal + variante)
- `movimientos_inventario` (entradas, salidas, ajustes, ventas, devoluciones, transferencias, apartados)
- `transferencias_inventario` (mover mercancía entre sucursales)
- `ventas`, `venta_items` (atadas a una sucursal; con método de pago y comprobante)
- `cuentas_transferencia` (catálogo de cuentas propias donde se reciben transferencias)
- `clientes`, `apartados`, `apartado_items`, `apartado_pagos` (layaway)
- `campos_personalizados`

El esquema completo y comentado está en `backend/prisma/schema.prisma`.

## Ventas: métodos de pago, corte del día, historial y apartados

**Métodos de pago.** Cada venta (y cada abono de apartado) registra un
`metodoPago`: `EFECTIVO`, `TARJETA` o `TRANSFERENCIA`. Cuando es
transferencia, es obligatorio indicar a cuál de las `cuentas_transferencia`
del negocio llegó el pago y subir una foto del comprobante (se guarda en
Cloudinary, carpeta `camino-al-deporte/comprobantes`). Las cuentas de
transferencia se administran en Catálogos → "Cuentas de transferencia"
(solo ADMIN_PRINCIPAL/DESARROLLO las crean o editan; el resto de roles solo
las consulta al elegir cuenta en una venta).

**Corte del día** (`GET /ventas/corte-dia`) resume las ventas completadas de
una fecha: total general, desglose por método de pago, desglose por cuenta
de transferencia y ventas canceladas ese día (informativas, no se suman al
total). VENTAS solo ve el corte de su propia sucursal; admin puede ver una
sucursal específica o el corte global. *Limitación conocida v1*: el "día" se
calcula en UTC, no en la zona horaria del negocio — si esto causa que ventas
cercanas a medianoche caigan en el corte equivocado, se puede ajustar con un
offset de zona horaria.

**Historial de ventas** (`GET /ventas/historial`, solo ADMIN_PRINCIPAL/
DESARROLLO) permite filtrar por sucursal y rango de fechas, con un resumen
de total por sucursal además del listado detallado.

**Apartados (layaway).** Un cliente puede apartar uno o varios artículos
(`apartados` + `apartado_items`) dando o no un anticipo. Reglas clave:

- El stock se **descuenta de inmediato** al crear el apartado (igual que una
  venta), desde la sucursal donde físicamente está cada artículo
  (`apartado_items.sucursal_stock_id`) — que puede ser distinta de la
  sucursal donde se atiende al cliente (`apartados.sucursal_venta_id`). Esto
  permite apartar algo que está en otra sucursal para que el cliente no se
  lo lleve otro comprador mientras junta el dinero.
- **No se crea ninguna transferencia automática.** Si el artículo apartado
  está en otra sucursal, moverlo físicamente sigue siendo un paso manual con
  el módulo de Transferencias, cuando llegue el momento de entregarlo.
- Los abonos (`apartado_pagos`) se registran uno por uno, cada uno con su
  propio método de pago y comprobante si aplica. El saldo pendiente se
  calcula al vuelo (`total - suma de pagos`), nunca se guarda cacheado, para
  evitar que se desincronice.
- Si el saldo llega a 0, el apartado pasa a `LIQUIDADO` automáticamente.
- Cancelar un apartado (`CANCELADO`) solo es posible si sigue `ACTIVO`, y
  regresa el stock reservado a la sucursal de donde salió. Los pagos ya
  recibidos no se reembolsan automáticamente — el registro queda como
  referencia de cuánto se le debe devolver al cliente si aplica.
- La pantalla de Apartados también muestra un resumen de "clientes con
  adeudo" (suma del saldo pendiente de sus apartados activos).

## Importar/exportar productos por Excel

En Productos → "Importar / exportar Excel". Cada fila del Excel es una
variante (una combinación talla/color con su propio SKU); varias filas con
el mismo nombre+marca se agrupan como el mismo producto. Obligatorio por
fila: `nombre`, `marca`, `categoria`, `sku` — todo lo demás (modelo,
descripción, precios, talla, color, stock inicial) es opcional. La carga de
stock inicial es opcional a propósito: los ajustes de inventario "de verdad"
(entradas, salidas, conteos) tienen su propio flujo en Inventario, con su
propio registro en `movimientos_inventario`; el Excel es solo para
registrar productos rápido, no para llevar el control fino del stock.

Comportamiento al importar:
- Si el SKU de una fila ya existe en el sistema, esa fila se omite (no se
  sobreescribe nada).
- Si la marca/categoría/talla que trae la fila no existen todavía, se crean
  solas.
- Si el nombre+marca de una fila coincide con un producto que ya existe, no
  se duplica: se le agrega la variante nueva (por ejemplo, para dar de alta
  una talla nueva de un producto que ya tenías).
- Antes de escribir nada en la base de datos hay una vista previa
  (`POST /productos/importar-excel/vista-previa`) que valida todo el
  archivo y muestra fila por fila qué se va a crear, qué se omite y por qué.
  Solo al confirmar (eligiendo la sucursal donde cargar el stock inicial) se
  escribe de verdad (`POST /productos/importar-excel/confirmar`).

## Por qué esta pila tecnológica

- **PostgreSQL**: ya lo pediste explícitamente y ya tienes experiencia con él
  en Render.
- **Node.js/Express**: mismo lenguaje/runtime que tu proyecto `mayoreo-facil`,
  así que la curva de aprendizaje para mantenerlo es mínima si tú o alguien de
  tu equipo toca el código a futuro.
- **Prisma**: capa sobre PostgreSQL que genera migraciones automáticamente y
  hace el código más legible que SQL crudo — importante porque el rol
  DESARROLLO va a tocar el esquema con cierta frecuencia.
- **Next.js/React**: framework de frontend más usado actualmente, con muy
  buena compatibilidad con Vercel (creado por el mismo equipo) y también
  desplegable en Render.

## Próximos pasos sugeridos (no incluidos en este scaffold inicial)

- Reportes/dashboards de ventas (por periodo, por vendedor, por producto).
- Notificaciones de bajo stock (correo o WhatsApp).
- Actualización masiva de precios por Excel (hoy la importación solo crea,
  no actualiza, productos existentes — ver sección de importar/exportar).
- Corte del día en la zona horaria del negocio en vez de UTC (ver limitación
  conocida arriba).
- Reembolso/registro del dinero devuelto al cancelar un apartado con abonos
  ya pagados (hoy queda solo como referencia, sin flujo dedicado).
