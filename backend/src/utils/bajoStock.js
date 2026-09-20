// Notificaciones automáticas de bajo stock.
//
// Se llama DESPUÉS de que la transacción que movió el stock ya se guardó
// (venta, apartado, pedido en línea, transferencia o movimiento manual de
// inventario) — es un efecto secundario best-effort, igual criterio que el
// ticket digital de ventas.js: si algo falla aquí, la operación que movió el
// stock YA quedó registrada correctamente, esto nunca debe tumbar esa
// respuesta.
//
// Por cada (sucursal, variante) que pudo haber quedado baja, revisa el total
// de existencias (sumando todos los proveedores, igual que GET
// /inventario/bajo-stock) contra el stockMinimo configurado, y si aplica:
//   1. crea una notificación in-app para cada destinatario (tabla
//      `notificaciones`, igual mecanismo que utils/notificaciones.js).
//   2. deja esa misma notificación lista para el CORREO, pero NO lo manda aquí:
//      utils/resumenBajoStock.js junta lo pendiente y manda un solo correo por
//      persona (antes se mandaba uno por producto y un traspaso de 9 productos
//      llenaba la bandeja). Si el producto llegó a 0 piezas (`emailUrgente`),
//      el correo sale a los pocos minutos; si solo está "bajo", va en el
//      resumen diario.
//
// Destinatarios: ADMIN_PRINCIPAL/DESARROLLO (visibilidad total del negocio)
// más el personal INVENTARIO/VENTAS de esa sucursal específica (son quienes
// pueden reabastecerla o necesitan saber que se está agotando). No es
// configurable desde la UI todavía — ver docs/ARQUITECTURA.md.
//
// Anti-spam: en vez de agregar una relación aparte, se aprovecha que
// Notificacion.tipo es texto libre (ver schema.prisma) para codificar una
// clave estable `BAJO_STOCK:<varianteId>:<sucursalId>` y no volver a avisar
// el mismo par variante+sucursal si ya se avisó en las últimas 24 horas —
// así una racha de varias ventas seguidas del mismo producto agotándose no
// manda una notificación (ni un correo) por cada una. Excepción: si antes
// solo estaba "bajo" y ahora se AGOTÓ, sí se avisa de nuevo (es más grave, y
// el aviso de agotado no debe quedar callado por uno previo de "bajo").
// Limitación conocida: si en ese mismo día se restablece el stock y vuelve a
// bajar, no se re-notifica hasta que pase la ventana de 24h.
//
// Solo aplica a variantes con stockMinimo > 0 configurado (ver PUT
// /inventario/minimo): sin una política de reorden explícita, no hay "bajo"
// que avisar — así productos que nunca se les puso mínimo no generan ruido.

const prisma = require('../db');

const VENTANA_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ sucursalId: number|null|undefined, varianteId: number|null|undefined }[]} cambios
 *   Pares (sucursal, variante) que acaban de perder stock. Se deduplican
 *   internamente — no pasa nada si el mismo par se repite (p. ej. dos
 *   renglones del mismo producto en una venta).
 */
async function verificarBajoStockYNotificar(cambios) {
  const unicos = new Map();
  for (const c of cambios || []) {
    if (!c || !c.sucursalId || !c.varianteId) continue;
    unicos.set(`${c.sucursalId}:${c.varianteId}`, c);
  }

  for (const { sucursalId, varianteId } of unicos.values()) {
    try {
      await procesarUno(sucursalId, varianteId);
    } catch (err) {
      console.error(`Error verificando bajo stock (sucursal ${sucursalId}, variante ${varianteId}):`, err);
    }
  }
}

// "Nike Air Force 1 (27/Blanco)": nombre + talla/color, como se ve en las
// notificaciones y en el correo. `variante` debe traer producto.nombre y talla.valor.
function nombreProductoVariante(variante) {
  const detalleTallaColor = [variante.talla?.valor, variante.color].filter(Boolean).join('/');
  return `${variante.producto.nombre}${detalleTallaColor ? ` (${detalleTallaColor})` : ''}`;
}

async function procesarUno(sucursalId, varianteId) {
  const existencias = await prisma.existencia.findMany({ where: { sucursalId, varianteId } });
  if (existencias.length === 0) return;

  const stockActual = existencias.reduce((s, e) => s + e.stockActual, 0);
  const stockMinimo = existencias.reduce((m, e) => Math.max(m, e.stockMinimo), 0);
  if (stockMinimo <= 0) return; // sin política de reorden configurada para esta talla/sucursal
  if (stockActual > stockMinimo) return; // no está bajo

  const agotado = stockActual <= 0;
  const claveTipo = `BAJO_STOCK:${varianteId}:${sucursalId}`;
  const yaAvisado = await prisma.notificacion.findFirst({
    where: {
      tipo: claveTipo,
      createdAt: { gte: new Date(Date.now() - VENTANA_COOLDOWN_MS) },
      // Un aviso previo de "bajo" no silencia el de "agotado".
      ...(agotado ? { emailUrgente: true } : {}),
    },
    select: { id: true },
  });
  if (yaAvisado) return;

  const [variante, sucursal] = await Promise.all([
    prisma.productoVariante.findUnique({
      where: { id: varianteId },
      include: { producto: { select: { nombre: true } }, talla: { select: { valor: true } } },
    }),
    prisma.sucursal.findUnique({ where: { id: sucursalId }, select: { nombre: true } }),
  ]);
  if (!variante || !sucursal) return;

  const destinatarios = await prisma.usuario.findMany({
    where: {
      activo: true,
      OR: [
        { rol: { nombre: { in: ['ADMIN_PRINCIPAL', 'DESARROLLO'] } } },
        { sucursalId, rol: { nombre: { in: ['INVENTARIO', 'VENTAS'] } } },
      ],
    },
    select: { id: true, nombre: true, email: true },
  });
  if (destinatarios.length === 0) return;

  const nombreProducto = nombreProductoVariante(variante);
  const titulo = `${agotado ? 'Agotado' : 'Stock bajo'} — ${nombreProducto}`;
  const mensaje =
    `Quedan ${stockActual} pieza(s) en ${sucursal.nombre} (mínimo configurado: ${stockMinimo}). ` +
    `SKU ${variante.sku}.`;

  await prisma.notificacion.createMany({
    data: destinatarios.map((u) => ({
      usuarioId: u.id,
      tipo: claveTipo,
      titulo,
      mensaje,
      emailUrgente: agotado,
    })),
  });
  // El correo lo manda utils/resumenBajoStock.js (agrupado), no esta función.
}

module.exports = { verificarBajoStockYNotificar, nombreProductoVariante };
