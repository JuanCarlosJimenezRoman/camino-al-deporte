// Genera las notificaciones in-app de una transferencia/pedido recién
// solicitado. Se llama dentro de la misma transacción que la crea (ver
// routes/transferencias.js) para que, si algo falla después, no queden
// notificaciones huérfanas de un pedido que nunca se guardó.
//
// Destinatarios: ADMIN_PRINCIPAL/DESARROLLO (visibilidad total del negocio),
// más el personal de la sucursal que tiene el stock (tiene que prepararlo y
// enviarlo) y el de la sucursal que lo pidió (por si alguien más ahí, aparte
// de quien lo solicitó, necesita saber que va en camino). No se notifica dos
// veces a quien lo solicitó.
//
// `solicitante` es req.usuario (el payload del JWT: { id, email, rol,
// sucursalId }) — no trae el nombre, así que se busca aquí.
async function notificarPedidoSucursal(tx, transferencia, solicitante) {
  const destinatarios = await tx.usuario.findMany({
    where: {
      activo: true,
      OR: [
        { rol: { nombre: { in: ['ADMIN_PRINCIPAL', 'DESARROLLO'] } } },
        { sucursalId: transferencia.sucursalOrigenId },
        { sucursalId: transferencia.sucursalDestinoId },
      ],
    },
    select: { id: true },
  });

  const idsUnicos = Array.from(new Set(destinatarios.map((u) => u.id))).filter((id) => id !== solicitante.id);
  if (idsUnicos.length === 0) return;

  const [usuarioSolicitante, sucursalOrigen, sucursalDestino] = await Promise.all([
    tx.usuario.findUnique({ where: { id: solicitante.id }, select: { nombre: true } }),
    tx.sucursal.findUnique({ where: { id: transferencia.sucursalOrigenId } }),
    tx.sucursal.findUnique({ where: { id: transferencia.sucursalDestinoId } }),
  ]);

  const titulo = `Pedido entre sucursales — ${transferencia.folio}`;
  const mensaje =
    `${usuarioSolicitante?.nombre ?? 'Alguien'} pidió ${transferencia.cantidad} pieza(s) de ` +
    `${sucursalOrigen?.nombre ?? 'una sucursal'} hacia ${sucursalDestino?.nombre ?? 'otra sucursal'}.`;

  await tx.notificacion.createMany({
    data: idsUnicos.map((usuarioId) => ({
      usuarioId,
      tipo: 'TRANSFERENCIA_SOLICITADA',
      titulo,
      mensaje,
      transferenciaId: transferencia.id,
    })),
  });
}

// Igual que arriba, pero para un apartado cuyo stock se reservó (total o
// parcialmente) en una sucursal distinta a la que atendió al cliente — ver
// POST /apartados. Un mismo apartado puede tener artículos de varias
// sucursales de stock distintas; `sucursalesStockIds` ya viene deduplicado
// desde el caller con las que de verdad son remotas (no la de venta).
//
// `solicitante` es req.usuario (el payload del JWT), igual que en
// notificarPedidoSucursal.
async function notificarApartadoOtraSucursal(tx, apartado, sucursalesStockIds, solicitante) {
  if (sucursalesStockIds.length === 0) return;

  const destinatarios = await tx.usuario.findMany({
    where: {
      activo: true,
      OR: [
        { rol: { nombre: { in: ['ADMIN_PRINCIPAL', 'DESARROLLO'] } } },
        { sucursalId: { in: sucursalesStockIds } },
        { sucursalId: apartado.sucursalVentaId },
      ],
    },
    select: { id: true },
  });

  const idsUnicos = Array.from(new Set(destinatarios.map((u) => u.id))).filter((id) => id !== solicitante.id);
  if (idsUnicos.length === 0) return;

  const [usuarioSolicitante, sucursalVenta, sucursalesStock] = await Promise.all([
    tx.usuario.findUnique({ where: { id: solicitante.id }, select: { nombre: true } }),
    tx.sucursal.findUnique({ where: { id: apartado.sucursalVentaId } }),
    tx.sucursal.findMany({ where: { id: { in: sucursalesStockIds } } }),
  ]);

  const nombresStock = sucursalesStock.map((s) => s.nombre).join(', ') || 'otra sucursal';
  const titulo = `Apartado con stock de otra sucursal — ${apartado.folio}`;
  const mensaje =
    `${usuarioSolicitante?.nombre ?? 'Alguien'} apartó mercancía de ${nombresStock} ` +
    `para un cliente atendido en ${sucursalVenta?.nombre ?? 'otra sucursal'}.`;

  await tx.notificacion.createMany({
    data: idsUnicos.map((usuarioId) => ({
      usuarioId,
      tipo: 'APARTADO_OTRA_SUCURSAL',
      titulo,
      mensaje,
      apartadoId: apartado.id,
    })),
  });
}

module.exports = { notificarPedidoSucursal, notificarApartadoOtraSucursal };
