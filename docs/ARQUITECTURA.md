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

`GET /productos` está paginado (`?page=`, `?limit=`, tope 100 por página;
responde `{ data, total, page, totalPages }`) — con el catálogo creciendo a
cientos de productos, cada uno con sus variantes/existencias/imágenes, traer
todo de una sola vez era lento tanto para la base de datos como para el
navegador. El listado de Productos usa esto para mostrar 30 a la vez con
botones Anterior/Siguiente; el dashboard de inicio pide `?limit=1` para leer
solo el total en vez de descargar el catálogo completo nada más para
contarlo.

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

Mientras no exista la pantalla de administración de `campos_personalizados`,
Productos → "Editar" ya deja llenar `atributosExtra` directamente como pares
clave/valor libres (sin tipo ni validación) — junto con precio de
compra/venta, descripción, marca, modelo y categoría del producto. Todos
estos campos extra son opcionales.

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
- `productos`, `producto_variantes` (catálogo global: variante = talla/color + SKU de fábrica + código interno único — ver sección "SKU de fábrica vs. código interno")
- `existencias` (stock por sucursal + variante + **proveedor**: un mismo talla/sucursal puede tener varios renglones, uno por cada proveedor que la ha surtido — ver sección de Proveedores)
- `movimientos_inventario` (entradas, salidas, ajustes, ventas, devoluciones, transferencias, apartados)
- `transferencias_inventario` (mover mercancía entre sucursales)
- `ventas`, `venta_items` (atadas a una sucursal; con método de pago y comprobante)
- `cuentas_transferencia` (catálogo de cuentas propias donde se reciben transferencias)
- `clientes` (también cuentas de la tienda en línea, ver más abajo), `apartados`, `apartado_items`, `apartado_pagos` (layaway)
- `pedidos`, `pedido_items` (tienda en línea, pago único por SPEI)
- `proveedores`, `pagos_proveedor` (quién surte cada mercancía y los pagos que se les hace)
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

## Proveedores: clasificación de mercancía, stock separado y pagos

El negocio compra a varios proveedores (hoy 3) que en ocasiones surten el
mismo producto, a veces en una talla distinta y a veces en la misma talla en
ocasiones distintas. El proveedor se rastrea en tres niveles:

- **`producto_variantes.proveedor_id`**: proveedor "principal" o por defecto
  de ese SKU — el que normalmente lo surte. Se asigna al crear el producto,
  al agregar una talla nueva, o inline en la tabla de Productos/Inventario.
  Es solo clasificación/referencia; no es de aquí de donde sale el stock al
  vender.
- **`existencias.proveedor_id`** — **el stock en sí está separado por
  proveedor.** Antes había un solo número de stock por talla+sucursal; ahora
  cada proveedor que ha surtido esa talla en esa sucursal tiene su propio
  renglón con su propio `stockActual` (`@@unique([sucursalId, varianteId,
  proveedorId])`). Si Proveedor A y Proveedor B surten la talla 26 del mismo
  modelo en la misma sucursal, son dos renglones de `existencias`, no uno
  solo — nunca se suman entre sí a nivel de base de datos (si acaso, se
  suman al vuelo para mostrar un total en pantalla). `proveedor_id` puede ser
  `NULL`: es el bucket "sin clasificar" (stock cargado antes de esta función,
  o conteos donde no importa el origen). Como Postgres no trata dos `NULL`
  como iguales en un índice único normal, hay dos índices parciales
  (`existencias_sucursal_variante_proveedor_key` para buckets clasificados,
  `existencias_sucursal_variante_sin_proveedor_key` para el bucket sin
  proveedor) en vez de uno solo — ver
  `prisma/migrations/20260813090000_stock_por_proveedor`.
- **`movimientos_inventario.proveedor_id`**: de qué bucket salió/entró cada
  movimiento puntual (entrada, salida, ajuste, venta, apartado, transferencia,
  pedido en línea, devolución). Ya no es opcional-solo-en-ENTRADA como al
  principio: como el stock vive partido por proveedor, todo movimiento tiene
  que decir explícitamente a qué bucket toca (puede ser `null` = bucket sin
  proveedor, pero el campo se manda siempre).

Los tres campos son opcionales a nivel de FK (`ON DELETE SET NULL`): borrar
un proveedor no borra el historial, solo desasocia la referencia.

**De cuál bucket se descuenta al vender/apartar/transferir.** Cuando una
talla tiene stock de un solo proveedor, no hay nada que decidir. Cuando tiene
de más de uno, la regla depende de si hay una persona operando o no:

- **Ventas, Apartados, Transferencias e Inventario (entrada/salida manual)**:
  selección manual. El selector de producto en cada pantalla no lista un
  renglón por talla, sino un renglón por **(talla, proveedor)** — por
  ejemplo "Tenis Runner (27) — SKU-123 — Distribuidora Uno — stock: 4" y
  "Tenis Runner (27) — SKU-123 — Distribuidora Dos — stock: 2" aparecen como
  dos opciones distintas. Quien vende/aparta/transfiere elige el renglón
  correcto y ese `proveedorId` viaja con la operación (`venta_items`,
  `apartado_items` y `transferencias_inventario` ahora tienen su propio
  `proveedor_id`, independiente del proveedor "principal" de la variante).
  Si se cancela una venta/apartado/transferencia, el stock regresa al mismo
  bucket de donde salió.
- **Tienda en línea (`POST /tienda/pedidos`)**: regla automática, porque ahí
  no hay un cajero decidiendo — compra el cliente solo. Se descuenta primero
  del bucket del proveedor "principal" de la variante; si no alcanza, del
  bucket con más stock disponible (dentro de eso, se sigue prefiriendo la
  bodega central, igual que antes). v1 sigue sin repartir un mismo renglón
  entre dos buckets o dos sucursales: uno solo tiene que alcanzar. El
  proveedor asignado a cada `pedido_items` con esta regla es también el que
  se usa para decidir a qué número de WhatsApp se manda el pedido a pagar
  (ver sección de Tienda en línea) — es más preciso que el proveedor
  "principal" de la variante porque refleja de dónde salió el stock de
  verdad, no solo la clasificación general del SKU.

**Consultar el stock por proveedor.** `GET /inventario/existencias` ya no
regresa un renglón por variante: regresa un renglón por (variante,
proveedor). Una variante que todavía no tiene ningún movimiento en esa
sucursal sigue apareciendo con un renglón placeholder en 0, etiquetado con el
proveedor "por defecto" que se le haya asignado en Productos (no con "Sin
proveedor" a secas) — así la pantalla es consistente entre sucursales en vez
de mostrar un proveedor distinto según en cuál ya se registró stock.
`?proveedorId=` filtra a los renglones donde ese proveedor ya tiene stock ahí
MÁS las variantes que lo tienen como proveedor por defecto aunque todavía
estén en 0 — si solo mostrara stock ya cargado, un proveedor recién asignado
a una variante "desaparecía" del filtro hasta que alguien le registrara una
entrada. `GET /inventario/bajo-stock` sí suma todos los buckets de una
variante — el mínimo de reorden es una política por talla+sucursal, no por
proveedor — y compara el total contra el mínimo más alto que tenga cualquiera
de sus buckets (`PUT /inventario/minimo` aplica el mismo mínimo a todos los
buckets existentes de esa talla+sucursal).

**Ojo con la entrada de stock sin elegir proveedor.** El selector de "+
Entrada" en Inventario ahora preselecciona el proveedor por defecto de la
variante (antes arrancaba siempre en "Sin proveedor" y, si no se cambiaba a
mano, el stock quedaba cargado a un bucket sin proveedor aunque la variante sí
tuviera uno asignado en Productos — eso hacía que ese proveedor "no
apareciera" al filtrar Inventario por él, aunque en Productos sí se viera
asignado). Sigue siendo posible elegir "Sin proveedor" a propósito si aplica.
Stock que ya haya quedado mal clasificado por esto de antes hay que
corregirlo a mano (Salida del bucket incorrecto + Entrada al proveedor
correcto).

**Rutas de catálogo de proveedores** (`backend/src/routes/proveedores.js`,
roles ADMIN_PRINCIPAL/DESARROLLO/INVENTARIO para crear, editar y registrar
pagos; cualquier rol autenticado puede listar):

- `GET /proveedores` (`?todas=1` incluye inactivos), `POST /proveedores`,
  `PUT /proveedores/:id` — catálogo del proveedor: nombre, contacto,
  teléfono y **datos bancarios** (`banco`, `titular`, `numeroCuenta`) para
  saber a qué cuenta transferirle según a quién se le está pagando.
- `GET /proveedores/:id` — detalle con las variantes que surte y su
  historial de pagos, más el total pagado acumulado.
- `GET /proveedores/pagos` — historial global de pagos a proveedores, con
  filtros por proveedor y rango de fechas.
- `POST /proveedores/:id/pagos` — registra un pago al proveedor (monto,
  método de pago, concepto y comprobante si es transferencia). Sigue el
  mismo patrón multipart que ventas/apartados: campo `datos` (JSON) +
  archivo opcional `comprobante`, subido a Cloudinary
  (`camino-al-deporte/comprobantes`).
- `PUT /productos/:id/variantes/:varianteId` — permite cambiar el proveedor
  "principal" (u otros campos) de una variante ya creada, y
  `POST /productos/:id/variantes` para agregar una talla nueva a un producto
  que ya existe, sin tener que recrearlo ni pasar por el importador de Excel.

**Dónde se ve en el frontend:**

- Catálogos → **Proveedores**: alta/edición del proveedor y sus datos
  bancarios, lista de variantes que surte, historial de pagos y un
  mini-formulario para registrar un pago nuevo.
- **Productos**: selector de proveedor "principal" al crear variantes
  nuevas, selector inline por variante ya existente, y botón "+ Agregar
  talla" en la vista de variantes de cada producto.
- **Inventario**: filtro por proveedor, desglose de stock por proveedor
  dentro de cada talla, mini-formulario de proveedor al registrar una
  entrada, y selector de proveedor al registrar una salida cuando la talla
  tiene stock de más de uno (obligatorio en ese caso).
- **Ventas, Apartados, Transferencias**: el selector de producto muestra un
  renglón por (talla, proveedor) en vez de uno por talla, para poder elegir
  de cuál bucket sale la mercancía.

## Tienda en línea: catálogo público, cuentas de cliente y pedidos por SPEI

Además de la venta de mostrador y los apartados, el sistema tiene una tienda
en línea de cara al cliente: ve el catálogo, crea su cuenta, arma un pedido y
lo paga por transferencia SPEI a una cuenta del negocio subiendo su
comprobante. Vive en las mismas rutas del backend (`/tienda/...`) y en la
misma base de datos que el resto del sistema — no hay un segundo backend ni
una segunda base de datos.

**Cuentas de cliente.** Son un tipo de sesión totalmente aparte de
`usuarios` (empleados): usan la tabla `clientes` con un `password_hash`
propio y su propio JWT (`POST /tienda/auth/registro`, `POST
/tienda/auth/login`, `GET /tienda/auth/me`), verificado por el middleware
`requireClienteAuth` en vez de `requireAuth`. Si alguien ya tenía un registro
en `clientes` por haber hecho un apartado en tienda física (sin contraseña),
registrarse con el mismo correo o teléfono "reclama" esa cuenta en vez de
duplicarla, para que vea su historial junto con sus pedidos en línea.

**Catálogo público** (`GET /tienda/productos`, `GET /tienda/productos/:id`)
no requiere sesión y solo muestra productos activos con existencia mayor a
cero, sumando el stock de todas las sucursales — al cliente no le importa de
cuál sucursal sale, eso lo decide el backend al crear el pedido.

**Crear un pedido** (`POST /tienda/pedidos`, requiere sesión de cliente)
reserva el stock de inmediato, igual que un Apartado: por cada artículo
busca automáticamente una sucursal con existencia suficiente (prefiriendo la
bodega central) y descuenta ahí. El cliente no elige sucursal. Si ninguna
sucursal por sí sola tiene suficiente para un renglón, el pedido se rechaza
(v1 no reparte un mismo renglón entre varias sucursales). Al crearse, el
pedido queda en `PENDIENTE_PAGO` con una `referenciaPago` y, internamente,
sigue guardando la cuenta bancaria propia (`cuentaTransferencia`, la primera
cuenta activa marcada `paraVentasOnline`) por si se necesita como referencia
administrativa — pero **ya no se le muestra al cliente en la página**.

**Pago por WhatsApp, no por cuenta en frío.** Mostrarle al cliente la CLABE
directo en la página no generaba confianza, así que en vez de eso el detalle
del pedido (`frontend/src/app/tienda/pedidos/[id]/page.tsx`) ofrece un botón
"Continuar por WhatsApp" que abre un chat pre-cargado (artículos, total,
referencia y dirección de envío) con el **proveedor** correspondiente al
pedido — es él quien le pasa los datos de pago por chat, lo cual también deja
rastro de la conversación. El backend calcula a qué proveedor mandarlo a
partir de `PedidoItem.proveedorId` — el proveedor del bucket de stock del que
realmente se descontó cada renglón (ver regla automática en la sección de
Proveedores), no el proveedor "principal" de la variante, para que sea exacto
incluso si ese SKU normalmente lo surte alguien más pero este pedido en
particular se surtió de otro bucket. `GET/POST /tienda/pedidos*` devuelve un
campo calculado `proveedorPago` con el proveedor cuya suma de subtotales es
la mayor en ese pedido — si todos los artículos son del mismo proveedor no
hay ambigüedad, y si el pedido mezcla varios, se manda un solo chat con el
que más peso tiene en $ (no se reparte en varias conversaciones). El número
se toma de `Proveedor.telefono`; si son 10 dígitos sin código de país se
asume México y se antepone `52` para el enlace `wa.me`. Si ningún artículo
tiene proveedor asignado, no hay botón y se le pide al cliente que contacte a
la tienda directamente.

**Verificación del pago — manual en v1.** El mockup original de este
proyecto contemplaba un match automático contra el banco (monto, cuenta,
fecha). Eso requeriría contratar una integración bancaria (por ejemplo STP,
Belvo o Fintoc) que hoy no existe, así que v1 usa revisión manual: el cliente
sube su comprobante (`POST /tienda/pedidos/:id/comprobante`, pasa a
`EN_VALIDACION`) — típicamente después de que el proveedor se lo pide por el
mismo WhatsApp — y alguien de VENTAS/ADMIN lo compara contra el estado de
cuenta real y lo aprueba (`POST /pedidos-online/:id/validar-pago` → `PAGADO`)
o lo rechaza con motivo (`POST /pedidos-online/:id/rechazar-comprobante` →
vuelve a `PENDIENTE_PAGO` para que el cliente suba uno correcto; el stock
sigue reservado mientras tanto). Si más adelante se contrata una integración
bancaria, ese match automático reemplazaría solo este paso manual — el resto
del flujo (reserva de stock, estados, envío) no cambia.

**Ciclo de vida de un pedido:**

```
PENDIENTE_PAGO → EN_VALIDACION → PAGADO → ENVIADO → RECIBIDO
      ↓                ↓
  CANCELADO        (rechazo: vuelve a PENDIENTE_PAGO)
```

- `CANCELADO`: el cliente puede cancelar su propio pedido solo mientras sigue
  `PENDIENTE_PAGO` (`POST /tienda/pedidos/:id/cancelar`); el negocio puede
  cancelarlo en cualquier estado anterior a `ENVIADO`
  (`POST /pedidos-online/:id/cancelar`). En ambos casos el stock reservado
  regresa a la sucursal de donde salió. Cancelar un pedido ya enviado o
  recibido requeriría un flujo de devolución que no existe todavía (misma
  limitación que hoy tienen los Apartados).
- `ENVIADO`: lo marca el negocio (`POST /pedidos-online/:id/marcar-enviado`),
  opcionalmente con paquetería y número de guía.
- `RECIBIDO`: lo confirma el cliente desde su cuenta
  (`POST /tienda/pedidos/:id/confirmar-recibido`) o, si no lo hace (por
  ejemplo, lo recogió en tienda), el negocio puede cerrarlo de todos modos
  (`POST /pedidos-online/:id/marcar-recibido`).

**Trazabilidad de inventario.** Cada pedido genera movimientos de inventario
con `tipo: PEDIDO_ONLINE` (al crearse) o `DEVOLUCION` (al cancelarse),
igual que ventas/apartados/transferencias. Estos movimientos no los hace
ningún empleado — por eso `movimientos_inventario.usuario_id` ahora es
opcional (antes era obligatorio); solo lo generado por acciones de un
cliente en la tienda en línea queda sin usuario y con `pedido_id` en su
lugar.

**Roles.** Quién administra pedidos en línea (validar pago, marcar enviado,
cancelar) son los mismos roles que ya operan ventas/apartados:
ADMIN_PRINCIPAL, DESARROLLO, VENTAS.

## SKU de fábrica vs. código interno

El SKU que traen los productos de fábrica —sobre todo en calzado— no es un
identificador por talla: viene por **lote de tallas** (ej. un SKU cubre del
23 al 25.5 cm y otro del 26 al 32 cm), así que el mismo texto se repite a
propósito entre varias variantes del mismo producto. Por eso
`producto_variantes.sku` **no es único** en la base de datos — nunca lo tuvo
que ser para que el sistema funcione, porque cada variante ya se identifica
sin ambigüedad por su `id` interno, y esa es la clave que usan de verdad
`movimientos_inventario`, `venta_items`, `apartado_items`, etc. (nunca el
texto del SKU).

Para tener también un identificador legible y garantizado único por talla
(útil si más adelante quieres etiquetar o escanear cada talla por separado
en bodega), cada variante recibe automáticamente un
**`codigoInterno`** al crearse — este sí es único de verdad
(`@unique`) — generado a partir de `SKU-TALLA-COLOR` en mayúsculas y sin
espacios (`backend/src/utils/codigoInterno.js`), con un sufijo numérico
(`-2`, `-3`...) si ese mismo texto ya existiera. Una vez asignado no cambia
aunque después se edite el SKU/talla de la variante — es un identificador
estable, no una vista calculada. Se genera en los tres lugares donde se crea
una variante: alta de producto, "+ Agregar talla" y la importación por
Excel.

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
- La fila que se omite por duplicada ya **no** se decide por el SKU (el
  mismo SKU de fábrica puede repetirse legítimamente entre varias filas del
  mismo producto — ver sección anterior). Se omite cuando la combinación
  real **producto (nombre+marca) + talla + color** ya existe, sea porque ya
  estaba en el sistema de antes o porque se repite dentro del mismo archivo.
  El motivo mostrado en la vista previa distingue ambos casos.
- Si la marca/categoría/talla que trae la fila no existen todavía, se crean
  solas — incluida la combinación `(talla, tipo_talla)`: si en la columna
  `tipo_talla` pones un código que no está en el catálogo (ver sección de
  tallas segmentadas más abajo: `TD`/`PS`/`GS`/`WMNS`/`MENS` para calzado,
  `ropa` para ropa), se crea una categoría nueva con ese nombre tal cual. Si
  se deja en blanco, la talla queda con tipo `"general"` — para calzado
  conviene siempre llenarlo con el código correcto en vez de dejarlo así.
- Si el nombre+marca de una fila coincide con un producto que ya existe, no
  se duplica: se le agrega la variante nueva (por ejemplo, para dar de alta
  una talla nueva de un producto que ya tenías, aunque comparta SKU con otra
  talla ya existente).
- Antes de escribir nada en la base de datos hay una vista previa
  (`POST /productos/importar-excel/vista-previa`) que valida todo el
  archivo y muestra fila por fila qué se va a crear, qué se omite y por qué.
  Solo al confirmar (eligiendo la sucursal donde cargar el stock inicial) se
  escribe de verdad (`POST /productos/importar-excel/confirmar`).

*Nota:* si importaste productos con este sistema **antes** de este cambio,
es posible que algunas tallas se hayan omitido por error (el sistema viejo
sí trataba el SKU repetido como duplicado). Vale la pena revisar tus
productos de calzado en Productos → "Ver variantes" y usar "+ Agregar talla"
para completar las que falten, o volver a correr el Excel: ahora sí las
agregará en vez de saltárselas.

## Tallas de calzado segmentadas por categoría (TD/PS/GS/WMNS/MENS)

En vez de un solo tipo genérico `"calzado"`, las tallas de calzado se
catalogan por categoría de edad/público, como hacen las marcas deportivas:

| tipo (código) | Significado             | Tallas aprox. MX | Edad aprox. |
| -------------- | ------------------------ | ----------------: | ----------- |
| `TD`           | Toddler / bebé            | 8–13 MX            | 1–4 años    |
| `PS`           | Preschool / preescolar    | 13.5–19.5 MX        | 4–7 años    |
| `GS`           | Grade School / escolar    | 20–25 MX            | 7–12 años   |
| `WMNS`         | Women's / mujer           | 22–28 MX            | Adulto      |
| `MENS`         | Men's / hombre            | 25–32 MX            | Adulto      |

Cada una es un `tipo` distinto de `Talla` (el campo sigue siendo texto libre,
no un enum — se pueden agregar más categorías desde Catálogos → Tallas si
hace falta). Como la unicidad es `(valor, tipo)`, un mismo número puede
existir en más de una categoría a la vez (ej. "22" en `GS` y en `WMNS` son
dos renglones distintos del catálogo, no se pisan). `backend/prisma/seed.js`
puebla las 5 categorías de fábrica; el rango de cada una se puede editar ahí
o agregar tallas sueltas después a mano.

En el frontend, cualquier lugar que antes asumía `talla.tipo === 'calzado'`
(la guía de tallas de la tienda en línea, `tienda/productos/[id]/page.tsx`)
ahora detecta "es calzado" como *"tipo distinto de `ropa`"*, para no depender
de los códigos exactos.

## Fotos de producto: subida en lote por SKU y fotos por color

Las fotos (`ProductoImagen`, tabla `producto_imagenes`) son parte de la
galería de un producto (`Producto`), no de una variante puntual — un
producto normalmente comparte las mismas fotos entre todas sus tallas. La
excepción son los modelos donde el color cambia mucho el aspecto del
producto (por ejemplo modelos "By You"/custom, donde el mismo producto tiene
variantes de colores muy distintos entre sí): para esos casos, cada foto
puede llevar un `color` opcional (el texto exacto de un color de variante de
ese producto). `color = null` es una foto "general", válida como respaldo
para cualquier color que no tenga la suya propia. Al elegir qué foto mostrar
(`imagenPrincipal()` en `frontend/src/components/ProductoThumb.tsx`), se
prioriza una foto etiquetada con el color de la variante en cuestión; si no
hay ninguna, cae a la portada general del producto.

**Subida en lote por SKU** (Productos → "Subir fotos por SKU",
`POST /productos/fotos-por-sku`): pensada para subir de un jalón una carpeta
local de fotos etiquetadas con el SKU de fábrica en el nombre del archivo
(`112441113-13.jpg`). Busca las variantes con ese SKU y agrupa por
combinación **producto + color**:
- Si hay una sola combinación, sube la foto directo y la etiqueta con ese
  color automáticamente (o sin color, si esa combinación no tiene uno).
- Si hay más de una (el mismo SKU repetido entre distintos productos, o
  entre distintos colores dentro del mismo producto — pasa sobre todo en
  modelos "By You" custom), no se adivina: responde 409 con la lista de
  opciones `{ productoId, productoNombre, color }` y el frontend muestra un
  selector para resolverlo a mano, subiendo con
  `POST /productos/:id/imagenes` (campo `color` opcional) directamente a la
  combinación elegida.

**Edición manual** (Productos → "Fotos", `GaleriaFotos.tsx`): al subir una
foto a mano se puede elegir a qué color pertenece (o dejarla general); cada
foto ya subida se puede recolorear con
`PUT /productos/:id/imagenes/:imagenId` sin tener que borrarla y resubirla.

**Listados que muestran miniatura por color de variante** (Inventario,
Ventas, Apartados, pedidos en línea): antes solo se mandaba la foto
principal del producto (`take: 1`); ahora se manda la galería completa
(`{ url, color, esPrincipal }`, sin `publicId` ni fechas) para que el
frontend pueda elegir la foto que corresponde al color de cada renglón —
importante porque desde que el stock se separó por proveedor cada fila ya es
por variante concreta (talla+color), no por producto genérico.

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
- Verificación automática del pago SPEI de pedidos en línea contra el banco
  (hoy es manual, ver sección de tienda en línea); requeriría contratar una
  integración bancaria (STP, Belvo, Fintoc, etc.).
- Liberar automáticamente el stock reservado de pedidos que se quedan en
  `PENDIENTE_PAGO` mucho tiempo sin comprobante (hoy solo se libera si el
  cliente o el negocio cancelan a mano).
- Devolución/reembolso de un pedido ya `ENVIADO`/`RECIBIDO` (hoy solo se
  puede cancelar antes de enviarse, misma limitación que Apartados).
