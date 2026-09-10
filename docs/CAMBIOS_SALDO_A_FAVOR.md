# Cambios de producto — saldo a favor, cliente registrado y productos no registrados

> Documento de diseño. No implementado todavía. Escrito tras revisar el estado actual de
> `backend/src/routes/cambios.js`, `backend/prisma/schema.prisma` y
> `frontend/src/app/(admin)/dashboard/cambios/page.tsx`, y comparándolo contra los patrones que
> el sistema ya usa en Apartados (cliente) y Ventas (producto no registrado).

## 1. Qué cambia y por qué

Hoy el módulo de Cambios tiene una regla de negocio explícita (ver comentarios en la migración
`20260907090000_cambios_productos` y en `cambios.js`): si el producto nuevo vale menos que el
devuelto, **el cambio se rechaza por completo** hasta que el cliente se lleve más producto para
cubrir la diferencia en la misma visita. No existe ningún saldo pendiente ni reembolso.

Las decisiones de negocio confirmadas para este documento son:

1. **Sí se debe poder acumular saldo a favor del cliente**, y ese saldo debe poder usarse no
   solo en otro cambio futuro, sino **también como forma de pago en una venta normal**.
2. El saldo **no caduca**.
3. Para hacer un cambio, **el cliente se debe registrar** (mínimo nombre y teléfono) — ya no basta
   con el texto libre que se captura hoy.
4. Se debe poder cambiar **productos no registrados en el catálogo**, tanto del lado de lo que el
   cliente devuelve como de lo que se lleva.

El punto 1 es el que más superficie toca, porque implica que el saldo deja de ser un dato local
del módulo de Cambios y pasa a ser un atributo del **Cliente**, consultado y modificado también
desde Ventas.

Buena noticia: los puntos 3 y 4 no son ideas nuevas para este sistema — ya existen patrones
idénticos resueltos en otros módulos, y este documento propone reutilizarlos en vez de inventar
algo distinto:

- **Cliente registrado con alta rápida** → ya existe en `POST /apartados` (`clienteId` o
  `clienteNuevo`, con teléfono único para no duplicar) y en su UI (buscador + formulario de alta
  rápida en `apartados/page.tsx`, líneas ~1068-1320).
- **Producto no registrado en catálogo** → ya existe en `VentaItem` (`varianteId` opcional +
  `descripcionLibre`, con un `CHECK` en base de datos que obliga a usar uno u otro) y en su UI
  (`ventas/page.tsx`, líneas ~1300-1320, toggle "Producto no registrado en el catálogo").

## 2. Modelo de datos

### 2.1 `Cliente` — nuevo campo de saldo

```prisma
model Cliente {
  // ...campos existentes...
  saldoFavor Decimal @default(0) @map("saldo_favor") @db.Decimal(10, 2)
  movimientosSaldo MovimientoSaldoCliente[]
}
```

### 2.2 Nueva tabla `MovimientoSaldoCliente` (ledger, igual patrón que `MovimientoInventario`)

Igual que el inventario no se toca sin dejar rastro en `movimientos_inventario`, el saldo del
cliente no se debe tocar sin dejar rastro — si no, es imposible auditar por qué un cliente tiene
el saldo que tiene, o depurar un reclamo.

```prisma
enum TipoMovimientoSaldo {
  ABONO    // se generó saldo a favor (cambio con diferencia negativa)
  CONSUMO  // se usó saldo (pago de una venta, o de otro cambio)
  REVERSA  // se deshizo un abono o consumo anterior (cancelación)
}

model MovimientoSaldoCliente {
  id              Int      @id @default(autoincrement())
  clienteId       Int      @map("cliente_id")
  cliente         Cliente  @relation(fields: [clienteId], references: [id])
  tipo            TipoMovimientoSaldo
  monto           Decimal  @db.Decimal(10, 2) // siempre positivo; el signo lo da "tipo"
  saldoResultante Decimal  @map("saldo_resultante") @db.Decimal(10, 2)

  // Origen del movimiento — exactamente uno de los dos, o ninguno si es un
  // ajuste manual.
  cambioId  Int?    @map("cambio_id")
  cambio    Cambio? @relation(fields: [cambioId], references: [id])
  ventaId   Int?    @map("venta_id")
  venta     Venta?  @relation(fields: [ventaId], references: [id])

  usuarioId Int      @map("usuario_id")
  usuario   Usuario  @relation(fields: [usuarioId], references: [id])
  sucursalId Int     @map("sucursal_id")
  sucursal  Sucursal @relation(fields: [sucursalId], references: [id])
  notas     String?
  createdAt DateTime @default(now()) @map("created_at")

  @@map("movimientos_saldo_cliente")
}
```

### 2.3 `Cambio` — cliente registrado obligatorio

Se reemplazan los campos de texto libre por una relación real:

```prisma
model Cambio {
  // ...
  clienteId Int      @map("cliente_id")   // antes: cliente String?, clienteTelefono String?
  cliente   Cliente  @relation(fields: [clienteId], references: [id])
  // ...
  movimientosSaldo MovimientoSaldoCliente[]
}
```

`clienteId` queda **NOT NULL** — es justo el punto 3 de arriba. La migración de datos existentes
tiene que decidir qué hacer con los cambios ya registrados que solo tienen texto libre (ver
sección 5, "datos existentes").

### 2.4 `CambioItem` — producto no registrado, en ambos lados

Mismo patrón que `VentaItem`:

```prisma
model CambioItem {
  // ...
  varianteId       Int?              @map("variante_id")     // antes: Int (obligatorio)
  variante         ProductoVariante? @relation(fields: [varianteId], references: [id])
  descripcionLibre String?           @map("descripcion_libre")
  // ...
}
```

Con el mismo `CHECK` a nivel de base de datos que ya usa `venta_items`:

```sql
ALTER TABLE "cambio_items" ADD CONSTRAINT "cambio_items_variante_o_libre_check"
  CHECK (
    ("variante_id" IS NOT NULL AND "descripcion_libre" IS NULL)
    OR
    ("variante_id" IS NULL AND "descripcion_libre" IS NOT NULL)
  );
```

Reglas derivadas de esto (a documentar igual que se documentó en la migración de
`venta_items_libres`):

- Un renglón **DEVUELTO** libre (el cliente trae algo que no está en el catálogo) nunca puede
  "reingresar" a existencias — no hay `ProductoVariante` al cual sumarle stock. `reingresado` se
  fuerza a `false` sin importar el `motivo`, y no se genera `MovimientoInventario`.
- Un renglón **ENTREGADO** libre (se le da al cliente algo que no está en el catálogo) tampoco
  descuenta ninguna `Existencia` ni genera movimiento — igual que ya pasa en Ventas. No hay forma
  de validar "stock insuficiente" para este caso porque no hay stock que consultar; el cajero es
  responsable de que exista físicamente.
- `proveedorId` en un renglón libre queda igual que en `VentaItem`: opcional y solo informativo.

### 2.5 `Venta` — cliente opcional + saldo aplicado

```prisma
model Venta {
  // ...
  clienteId      Int?     @map("cliente_id")   // opcional: sigue habiendo clientes de mostrador sin registrar
  cliente        Cliente? @relation(fields: [clienteId], references: [id])
  saldoAplicado  Decimal  @default(0) @map("saldo_aplicado") @db.Decimal(10, 2)
  movimientosSaldo MovimientoSaldoCliente[]
  // los campos cliente/clienteTelefono de texto libre se conservan para
  // ventas sin cliente registrado (igual que hoy)
}
```

`saldoAplicado` se resta del total a cobrar; el resto (si lo hay) se paga con el método de pago
normal (efectivo/tarjeta/transferencia) exactamente igual que hoy. Es decir, **no es un método de
pago nuevo**, es un descuento previo al método de pago — así una venta puede pagarse mitad con
saldo, mitad en efectivo, sin inventar un quinto `MetodoPago`.

## 3. Backend

### 3.1 `cambios.js`

- El schema de validación (`cambioSchema`) cambia `cliente`/`clienteTelefono` por el mismo patrón
  que `apartadoSchema` en `apartados.js`: acepta `clienteId` **o** `clienteNuevo: { nombre,
  telefono, email? }`, con `.refine()` exigiendo que venga uno de los dos. Dentro de la
  transacción se busca por `clienteId`, o se busca/crea por `telefono` (igual que
  `apartados.js` líneas ~305-314, reutilizable casi textual).
- `itemDevueltoSchema` / `itemNuevoSchema`: `varianteId` pasa a opcional, se agrega
  `descripcionLibre`, y un `.refine()` idéntico al de `ventaItemSchema` en `ventas.js` (línea 475)
  que exige exactamente uno de los dos.
- El bloque que hoy hace `throw new Error('SALDO_A_FAVOR_PENDIENTE:...')` cuando
  `diferenciaCentavos < 0` se reemplaza por:
  1. Incrementar `cliente.saldoFavor` en `Math.abs(diferenciaCentavos) / 100`.
  2. Crear un `MovimientoSaldoCliente` (`tipo: 'ABONO'`, `cambioId`, `saldoResultante` = nuevo
     saldo del cliente).
  3. El `Cambio` se guarda igual que hoy, con `diferencia` negativa (así queda registrado en el
     propio cambio cuánto saldo generó, sin tener que ir a buscarlo al ledger).
- Punto abierto para cuando se implemente (no bloqueante, pero vale la pena decidirlo entonces):
  ¿se permite que un cliente use saldo **que ya tenía de antes** para cubrir una diferencia
  positiva dentro de este mismo cambio (en vez de solo pagar en efectivo/tarjeta)? Por simetría
  con Ventas, lo natural es que sí — se sugiere agregar un `saldoAplicado` opcional también en
  `cambioSchema`, con la misma validación que en Ventas.
- `POST /cambios/:id/cancelar`: si el cambio había generado un `ABONO` de saldo, cancelar debe
  revertirlo — crear un `MovimientoSaldoCliente` tipo `REVERSA` y decrementar
  `cliente.saldoFavor`. Igual que ya existe `STOCK_INSUFICIENTE_CANCELAR` para inventario (no se
  puede cancelar si el producto devuelto ya se vendió a alguien más), aquí hace falta un guard
  simétrico: **no se puede cancelar si el cliente ya gastó ese saldo** (`saldoFavor` actual <
  monto que había abonado ese cambio) — el endpoint debe rechazarlo con un mensaje claro en vez
  de dejar el saldo en negativo.

### 3.2 `ventas.js`

- Igual que `cambios.js`, se agrega `clienteId` / `clienteNuevo` opcional (a diferencia de
  Cambios, en Ventas sigue habiendo clientes de mostrador sin registrar — solo se pide si el
  cajero decide capturarlo, típicamente porque el cliente quiere usar su saldo o porque se quiere
  llevar historial).
- Se agrega `saldoAplicado` opcional. Dentro de la transacción: validar que no exceda
  `cliente.saldoFavor` en ese momento (relectura dentro de la transacción para evitar condición de
  carrera si el cliente lo gasta dos veces casi al mismo tiempo), decrementarlo, crear
  `MovimientoSaldoCliente` tipo `CONSUMO` con `ventaId`, y restar ese monto del total que se cobra
  por el método de pago normal.
- Cancelar una venta que aplicó saldo debe regresarlo al cliente (`REVERSA`), con el mismo tipo de
  guard que en cambios si el cliente ya volvió a gastarlo.

### 3.3 `clientes.js`

- `GET /clientes/:id` ya regresa el detalle de un cliente con sus apartados — se le agrega
  `saldoFavor` (ya viene solo, es un campo del modelo) y opcionalmente sus últimos
  `movimientosSaldo` (para que el cajero pueda explicarle al cliente de dónde salió su saldo).
- No se requieren endpoints nuevos: la búsqueda (`GET /clientes?q=`) y alta rápida ya existen y se
  reutilizan tal cual.

### 3.4 PDF del cambio (nuevo)

Se agrega `backend/src/utils/cambioPdf.js`, calcado de `apartadoPdf.js`/`ticketPdf.js` (mismo uso
de PDFKit, misma paleta/estilo del ticket ya definida en `ticketEstilo.js`), y un endpoint
`GET /cambios/:id/pdf`. Contenido sugerido:

- Folio del cambio, sucursal, fecha, quién atendió.
- Cliente: nombre y teléfono (ya obligatorios con el punto 3).
- Venta de origen (folio), si aplica.
- Tabla de productos devueltos: nombre/SKU o descripción libre, talla si aplica, cantidad, precio,
  motivo.
- Tabla de productos entregados: mismo formato.
- Totales: total devuelto, total nuevo, diferencia.
- Si la diferencia se pagó: método de pago y monto.
- Si la diferencia generó saldo a favor: monto generado **y el saldo total resultante del
  cliente**, para que quede constancia impresa de cuánto tiene disponible.
- Espacio de firma del cliente (igual que ya suelen llevar los tickets de apartado), como
  respaldo de que aceptó la política de "no reembolsos en efectivo, solo saldo o producto".

## 4. Frontend

### 4.1 `cambios/page.tsx`

- Se reemplazan los dos `Input` de texto libre de cliente (líneas ~599-603) por el mismo
  componente de búsqueda + alta rápida que ya existe en `apartados/page.tsx` (buscar por
  nombre/teléfono, seleccionar de resultados, o capturar nombre+teléfono+email de un cliente
  nuevo). Se vuelve obligatorio para poder enviar el formulario.
- Se muestra el `saldoFavor` actual del cliente seleccionado junto a sus datos, antes de armar el
  cambio (para que el cajero sepa si ya trae saldo disponible de antes).
- Tanto en "Producto(s) que devuelve el cliente" como en "Producto(s) que se lleva el cliente" se
  agrega el mismo toggle "Producto no registrado en el catálogo" que ya existe en
  `ventas/page.tsx` (nombre/descripción libre + precio, sin buscador de inventario).
- El bloque que hoy muestra "Queda un saldo a favor del cliente... agrega otro producto" (línea
  ~858) deja de ser un bloqueo — pasa a ser informativo: "Este cambio generará $X de saldo a
  favor para el cliente", y el botón de completar el cambio queda habilitado igual.
- Se agrega un botón "Descargar PDF" en cada renglón del historial de cambios (tabla al final de
  la página).

### 4.2 `ventas/page.tsx`

- Se agrega selector de cliente opcional (mismo componente reutilizado).
- Cuando hay cliente seleccionado y tiene `saldoFavor > 0`, aparece la opción de aplicar
  todo/parte de su saldo antes de elegir el método de pago del restante.

### 4.3 Pantalla de Clientes (no existe hoy)

Hoy no hay `frontend/src/app/(admin)/dashboard/clientes/page.tsx` — los clientes solo se ven/crean
desde dentro de Apartados. Con un saldo a favor que ahora se puede gastar en cualquier venta, vale
la pena tener una pantalla propia de Clientes (lista con búsqueda, detalle con historial de
apartados **y** de movimientos de saldo) para que un administrador pueda auditar o hacer un ajuste
manual de saldo si hace falta. Se puede resolver con el mismo patrón de tabla que ya usan
`usuarios/page.tsx` o `proveedores/page.tsx`. Esto no es indispensable para que las 4 cosas pedidas
funcionen, pero sin esta pantalla el único lugar donde se ve el saldo de un cliente sería el PDF
del cambio o el momento de venderle — se sugiere incluirlo en el mismo trabajo para que el saldo
no quede "invisible" para el negocio.

## 5. Migraciones y datos existentes

Los cambios registrados hoy tienen `cliente`/`clienteTelefono` como texto libre y pueden estar
vacíos. Al volver `clienteId` obligatorio, la migración necesita decidir qué hacer con esas filas
históricas — opciones, de más a menos simple:

1. Crear un cliente genérico "Sin registrar (histórico)" y apuntar ahí todos los cambios antiguos
   que no tengan con qué matchear un cliente real.
2. Intentar hacer *match* por teléfono contra la tabla `clientes` ya existente (puede que ya
   exista el cliente por haber hecho un apartado antes) y crear uno nuevo solo para los que no
   den match.

Se recomienda la opción 2 (mejor calidad de datos), con la opción 1 como *fallback* para los que
de verdad no tengan teléfono capturado.

## 6. Orden sugerido de implementación

1. Migración de base de datos (secciones 2.1–2.5) + backfill de datos existentes (sección 5).
2. Backend de `cambios.js` (cliente obligatorio, producto libre, saldo a favor al generarse,
   reversa al cancelar).
3. PDF del cambio.
4. Frontend de `cambios/page.tsx`.
5. Backend + frontend de `ventas.js` (aplicar saldo como pago).
6. Pantalla de Clientes (opcional pero recomendada, sección 4.3).

Cada punto es funcional por sí solo y no rompe lo anterior, así que se puede parar después de
cualquiera de ellos si se quiere probar en producción por etapas.
