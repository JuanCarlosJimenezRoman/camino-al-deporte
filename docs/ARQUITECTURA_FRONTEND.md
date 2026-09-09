# Arquitectura del frontend — propuesta de reestructuración

> Este documento complementa `docs/ARQUITECTURA.md` (que cubre el sistema completo)
> enfocándose solo en cómo organizar el código del frontend para que crecer el
> sistema (nuevas pantallas, nuevos campos, nuevos roles) no vuelva a significar
> archivos de 1000+ líneas donde un cambio pequeño puede romper algo que no se ve
> a simple vista.

## 1. Diagnóstico

El frontend es Next.js 14 (App Router) + TypeScript en modo `strict`, sin
librería de manejo de estado ni de *data fetching* (no hay React Query, no hay
Zustand/Redux): todo el estado vive en `useState`/`useEffect` dentro de cada
página, más algunos `Context` para cosas globales (`auth.tsx`, `carrito.tsx`,
`favoritos.tsx`, `branchContext.tsx`, `themeContext.tsx`).

Los archivos más grandes del proyecto son, casi todos, pantallas del dashboard:

| Archivo | Líneas | `useState` |
|---|---|---|
| `dashboard/ventas/page.tsx` | 1843 | 44 |
| `dashboard/envios/page.tsx` | 1797 | 42 |
| `dashboard/apartados/page.tsx` | 1573 | 53 |
| `dashboard/productos/page.tsx` | 1322 | 41 |
| `dashboard/productos/[id]/page.tsx` | 1305 | — |
| `dashboard/reportes/page.tsx` | 1036 | — |
| `dashboard/cambios/page.tsx` | 1016 | — |

Revisando `ventas/page.tsx` como ejemplo representativo, un solo archivo
contiene: 11 `interface` de dominio (Sucursal, Venta, VentaItem, Existencia,
ProductoAgrupado...), funciones auxiliares puras (`agruparPorProducto`,
`construirTicketTexto`, `formatearTelefonoWhatsapp`, `billetesSugeridos`),
dos componentes de UI completos definidos ahí mismo (`SelectorCantidad`,
`TarjetaProductoGrid`), y luego el componente de página con sus 44 estados y
toda la lógica de carrito, descuentos, apartados y ticket. Ese patrón se
repite en las demás pantallas grandes.

Esto no es "código mal escrito" — es lo esperable cuando un proyecto crece
funcionalidad sobre funcionalidad dentro del mismo archivo sin pausar a
reorganizar. El problema práctico es el que ya identificaste: todo lo de una
pantalla está acoplado en un solo lugar, así que (a) es difícil tocar una
parte sin arriesgar otra, (b) nada de eso se puede probar ni reutilizar por
separado, y (c) el archivo es tan grande que cuesta trabajo ubicar dónde vive
cada cosa.

## 2. Modelos/controladores/vistas sí aplica en frontend — con otros nombres

La idea de separar por responsabilidad (que ya usas en el backend con
`routes/`, `middleware/`, `utils/`, y el esquema de Prisma como "modelo") tiene
un equivalente directo en el frontend. La tabla de abajo es la traducción:

| Backend (ya lo tienes) | Frontend (equivalente) | Qué hace |
|---|---|---|
| Modelo (`schema.prisma`) | `types.ts` por dominio | Define la forma de los datos (`Venta`, `Producto`, `Existencia`...) |
| Ruta (`routes/ventas.js`) | `page.tsx` (en `app/`) | Punto de entrada; decide qué se muestra en esa URL |
| Controlador (lógica dentro de la ruta) | Hook de dominio (`useVentas.ts`) | Orquesta: pide datos, guarda estado, expone acciones |
| `utils/` (funciones puras) | `utils.ts` por dominio | Cálculos y formateo sin estado: armar el texto del ticket, calcular descuento |
| Llamada a la base de datos (Prisma) | `api.ts` por dominio | Funciones con nombre que llaman a `lib/api.ts` (`listarVentas()`, `crearVenta()`) en vez de `api('/ventas...')` suelto |
| Vista (respuesta JSON) | Componentes en `components/` | Solo reciben props y pintan UI, sin saber de dónde salieron los datos |

La diferencia con el backend es que en frontend esto no se organiza por
"capa técnica" (todos los modelos juntos, todos los controladores juntos),
sino **por dominio/feature** (todo lo de "ventas" junto, todo lo de
"productos" junto). Es la forma que mejor combina con Next.js App Router,
porque cada pantalla ya vive en su propia carpeta de rutas.

## 3. Estructura de carpetas propuesta

```
src/
  app/                        # SOLO enrutamiento — páginas "delgadas"
    (admin)/dashboard/ventas/page.tsx   -> importa y renderiza <VentasPage /> desde features/ventas
    (admin)/dashboard/productos/...
    (store)/tienda/...

  features/                   # NUEVO — un folder por dominio de negocio
    ventas/
      components/             # SelectorCantidad.tsx, TarjetaProductoGrid.tsx, CarritoPanel.tsx, TicketModal.tsx...
      hooks/                  # useVentas.ts, useCarrito.ts, useBusquedaExistencias.ts
      api.ts                  # listarVentas, crearVenta, cancelarVenta (usa lib/api.ts por debajo)
      types.ts                # Venta, VentaItem, ItemCarrito...
      utils.ts                # construirTicketTexto, formatearTelefonoWhatsapp, billetesSugeridos
    productos/
      components/  hooks/  api.ts  types.ts  utils.ts
    inventario/
    apartados/
    envios/
    reportes/
    ...

  components/                 # Compartido ENTRE dominios (no se mueve nada de aquí)
    ui/                       # ya existe — primitivas de diseño (button, dialog, tabs...)
    admin/                    # ya existe — chrome del panel (Sidebar, Topbar, NotificacionesBell)
    store/                    # ya existe — chrome de la tienda

  lib/                        # Infraestructura transversal (ya existe, se mantiene)
    api.ts                    # el wrapper fetch central — no cambia
    auth.tsx  authCliente.tsx  branchContext.tsx  carrito.tsx  themeContext.tsx

  types/                      # SOLO para entidades usadas por 3+ features (Sucursal, Usuario, Rol)
  hooks/                      # SOLO hooks genéricos reutilizables (useDebounce, usePaginacion) — no de negocio
```

Reglas para que esto no se vuelva otro caos:

- **Una página de `app/` no debería pasar de ~30-50 líneas.** Si crece, es
  señal de que algo debería vivir en `features/<dominio>/components/`.
- **Nada entra a `types/` o `hooks/` (los de la raíz, no los de cada
  feature) hasta que lo necesiten de verdad 2 o más dominios distintos.**
  Evita recrear un archivo gigante "de todo" con otro nombre.
- Un componente/hook/función solo se mueve de `features/x/` a
  `components/` o `lib/` compartidos **cuando ya se está repitiendo**, no
  antes ("regla de las 2 veces": la primera vez que se repite algo, ahí sí
  se extrae).

## 4. Plan incremental — sin parar el desarrollo ni arriesgar producción

Esto se puede (y conviene) hacer pantalla por pantalla, no de un jalón. El
backend no se toca en ningún momento de este plan. Por cada pantalla, en
este orden:

1. **Tipos → `types.ts`**: sacar las `interface`/`type` del archivo y
   ponerlas en `features/<dominio>/types.ts`. Cero riesgo, es solo mover
   código, TypeScript avisa si algo quedó importado mal.
2. **Funciones puras → `utils.ts`**: las funciones que no usan `useState`
   ni hooks (formateo, cálculos, armar texto de ticket/WhatsApp). También
   bajo riesgo y automáticamente queda probable con un test unitario si
   más adelante se quiere.
3. **Llamadas a la API → `api.ts`**: convertir `api('/ventas?...')` sueltos
   dentro del componente en funciones con nombre (`listarVentas(params)`)
   que viven en `features/ventas/api.ts` y usan `lib/api.ts` por debajo.
   Esto no cambia el comportamiento, solo le pone nombre a cada llamada.
4. **Subcomponentes → `components/`**: sacar `SelectorCantidad`,
   `TarjetaProductoGrid`, etc. a sus propios archivos, recibiendo por props
   lo que antes tomaban del closure de la página.
5. **Estado y orquestación → un hook (`useVentas.ts`, etc.)**: al final,
   cuando ya no queda mezcla de tipos/utils/api/subcomponentes en medio, el
   `page.tsx` se reduce a: llamar al hook, pasar los datos a los
   componentes, y ya.

Después de cada paso: `npm run build` (o al menos `tsc --noEmit`) para que
TypeScript confirme que nada quedó desconectado, probar la pantalla a mano
en `npm run dev`, y hacer un commit separado por paso (ya usas Git con buen
historial de commits chicos — seguir así). Si algo se rompe, el commit
anterior es el punto de retorno inmediato, sin tener que revertir una
reescritura completa de la pantalla.

**Por dónde empezar:** no por la más grande. Sugiero un piloto en una
pantalla mediana como `usuarios/page.tsx` (300 líneas) o
`sucursales/page.tsx` (255 líneas) para validar el patrón y las carpetas con
poco riesgo, y ya con el patrón probado, aplicarlo a las grandes (`ventas`,
`envios`, `apartados`, `productos`) que son las que más se van a beneficiar.

## 5. Opcional / fase 2: una librería de *data fetching*

Buena parte de los 40-50 `useState` por pantalla son en realidad variantes
del mismo patrón repetido a mano: `cargando`, `error`, la lista de datos, y
un `useEffect` que hace el fetch. Herramientas como **TanStack Query**
(`@tanstack/react-query`) reemplazan ese patrón por un hook (`useQuery`) que
ya trae loading/error/caché/reintentos resueltos, reduciendo justo el tipo
de bug que preocupa ("que la app falle si algo no quedó bien implementado
en el momento"), porque ese manejo de errores queda centralizado en un solo
lugar en vez de reescrito en cada pantalla.

No es necesario para reorganizar carpetas — es un cambio aparte, más
profundo, y conviene evaluarlo **después** de tener el paso 3 anterior
(`api.ts` por dominio) ya hecho, porque esas funciones con nombre son
exactamente lo que `useQuery`/`useMutation` necesitan para conectarse.

## 6. Qué NO cambia con esto

- El backend (Express, Prisma, rutas) no se toca.
- `lib/api.ts` (el wrapper de fetch) se mantiene igual, solo se le llama
  desde funciones con nombre en vez de con la ruta escrita a mano en cada
  pantalla.
- El sistema de diseño (`components/ui/`) no se mueve ni se reorganiza.
- No implica reescribir lógica de negocio ni cambiar el comportamiento de
  ninguna pantalla — es una reorganización de dónde vive el código, no de
  qué hace.

## 7. Siguientes pasos posibles

1. Crear el esqueleto vacío de `features/` (carpetas + archivos base) para
   los dominios existentes, sin mover nada todavía.
2. Hacer la migración piloto completa de una pantalla mediana
   (`usuarios/page.tsx` o `sucursales/page.tsx`) como ejemplo de principio a
   fin, siguiendo los 5 pasos de la sección 4.
3. Con el patrón validado, ir migrando el resto pantalla por pantalla
   (empezando por las más grandes: ventas, envíos, apartados, productos).
