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

## Modelo de datos (resumen)

- `roles`, `usuarios`
- `marcas`, `modelos`, `categorias`, `tallas`
- `productos`, `producto_variantes` (variante = talla/color con stock propio)
- `movimientos_inventario` (entradas, salidas, ajustes, ventas, devoluciones)
- `ventas`, `venta_items`
- `campos_personalizados`

El esquema completo y comentado está en `backend/prisma/schema.prisma`.

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
- Carga masiva de productos desde Excel/CSV.
- Fotos de producto (requeriría almacenamiento tipo S3/Cloudinary).
- Notificaciones de bajo stock (correo o WhatsApp).
- Multi-sucursal, si "Camino al deporte" llega a tener más de un punto de venta.
