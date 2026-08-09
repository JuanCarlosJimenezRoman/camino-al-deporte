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

| Rol | Productos | Inventario | Ventas | Usuarios | Campos personalizados |
|---|---|---|---|---|---|
| ADMIN_PRINCIPAL | CRUD | CRUD | CRUD + cancelar | CRUD | CRUD |
| DESARROLLO | CRUD | CRUD | CRUD + cancelar | CRUD | CRUD |
| INVENTARIO | CRUD | CRUD | — | — | — |
| VENTAS | Solo lectura | Solo lectura | Crear/ver propias | — | — |
| CONSULTA | Solo lectura | Solo lectura (existencias) | — | — | — |

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
- `movimientos_inventario` (entradas, salidas, ajustes, ventas, devoluciones, transferencias)
- `transferencias_inventario` (mover mercancía entre sucursales)
- `ventas`, `venta_items` (atadas a una sucursal)
- `campos_personalizados`

El esquema completo y comentado está en `backend/prisma/schema.prisma`.

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

- Reportes/dashboards de ventas (por periodo, por vendedor, por producto, por sucursal).
- Notificaciones de bajo stock (correo o WhatsApp).
- Restringir a nivel API (no solo en el frontend) que un usuario con
  sucursal asignada solo pueda operar sobre esa sucursal.
- Actualización masiva de precios por Excel (hoy la importación solo crea,
  no actualiza, productos existentes — ver sección de importar/exportar).
