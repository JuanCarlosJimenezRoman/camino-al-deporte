const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién administra los pedidos de la tienda en línea. Por el momento VENTAS
// no tiene acceso (se le puede volver a dar más adelante si hace falta) —
// ver frontend/src/lib/auth.tsx, PERMISOS.pedidosOnline, mismo criterio.
const ROLES_PEDIDOS = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

// Manda la galería completa (solo url/color/esPrincipal) en vez de una sola
// foto: como una foto puede estar etiquetada para un color de variante
// específico, el frontend necesita verlas todas para elegir la que
// corresponde al color de cada línea del pedido, no solo la portada general.
const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: {
    orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
    select: { url: true, color: true, esPrincipal: true },
  },
};

// Datos completos del proveedor (incluida su cuenta bancaria): el empleado
// que valida el pago necesita verlos para saber a quién le llegó realmente
// la transferencia (ver POST /:id/validar-pago más abajo).
const PROVEEDOR_SELECT = {
  select: { id: true, nombre: true, contacto: true, telefono: true, banco: true, titular: true, numeroCuenta: true },
};

const PEDIDO_INCLUDE = {
  cliente: true,
  items: {
    include: {
      variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
      sucursalStock: { select: { id: true, nombre: true } },
      proveedor: PROVEEDOR_SELECT,
    },
  },
  cuentaTransferencia: true,
  validadoPor: { select: { nombre: true } },
  proveedorPagoConfirmado: PROVEEDOR_SELECT,
  resena: { include: { fotos: true } },
};

// GET /pedidos-online?estado= - lista todos los pedidos, más recientes primero
router.get('/', requireAuth, requireRole(...ROLES_PEDIDOS), asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const pedidos = await prisma.pedido.findMany({
    where: estado ? { estado: String(estado) } : undefined,
    include: PEDIDO_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(pedidos);
}));

// GET /pedidos-online/:id
router.get('/:id', requireAuth, requireRole(...ROLES_PEDIDOS), asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: PEDIDO_INCLUDE,
  });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  res.json(pedido);
}));

const validarPagoSchema = z.object({
  // A qué cuenta llegó la transferencia: null/omitido = la cuenta de la
  // tienda (cuentaTransferenciaId, fijada al crear el pedido); si se manda
  // un id, debe ser el de uno de los proveedores que aparecen en los
  // artículos de este pedido (se valida abajo).
  proveedorPagoConfirmadoId: z.number().int().nullable().optional(),
});

// POST /pedidos-online/:id/validar-pago - confirma manualmente que la
// transferencia SPEI llegó (comparando el comprobante subido contra el
// estado de cuenta real, a mano en v1 — ver docs/ARQUITECTURA.md). Además
// registra a qué cuenta llegó (tienda o proveedor), para que la
// conciliación de "Cuentas de proveedores" en Métodos de pago cuadre.
router.post(
  '/:id/validar-pago',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const parsed = validarPagoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'EN_VALIDACION') {
      return res.status(409).json({ error: 'Solo se puede validar el pago de un pedido en validación (con comprobante subido).' });
    }

    const proveedorId = parsed.data.proveedorPagoConfirmadoId;
    if (proveedorId != null) {
      const proveedoresDelPedido = new Set(pedido.items.map((it) => it.proveedorId).filter(Boolean));
      if (!proveedoresDelPedido.has(proveedorId)) {
        return res.status(400).json({ error: 'Ese proveedor no corresponde a los artículos de este pedido.' });
      }
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        estado: 'PAGADO',
        validadoPorId: req.usuario.id,
        validadoAt: new Date(),
        proveedorPagoConfirmadoId: proveedorId ?? null,
      },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

const rechazoSchema = z.object({ motivo: z.string().min(1) });

// POST /pedidos-online/:id/rechazar-comprobante - el comprobante no coincide
// (monto, cuenta, fecha, etc.); el pedido regresa a PENDIENTE_PAGO para que
// el cliente suba uno correcto. El stock sigue reservado.
router.post(
  '/:id/rechazar-comprobante',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const parsed = rechazoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Indica el motivo del rechazo.' });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'EN_VALIDACION') {
      return res.status(409).json({ error: 'Solo se puede rechazar el comprobante de un pedido en validación.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { estado: 'PENDIENTE_PAGO', comprobanteRechazadoMotivo: parsed.data.motivo },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

const envioSchema = z.object({
  paqueteria: z.string().optional(),
  numeroGuia: z.string().optional(),
});

// POST /pedidos-online/:id/marcar-enviado
router.post(
  '/:id/marcar-enviado',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const parsed = envioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'PAGADO') {
      return res.status(409).json({ error: 'Solo se puede marcar como enviado un pedido ya pagado.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { estado: 'ENVIADO', enviadoAt: new Date(), ...parsed.data },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

// POST /pedidos-online/:id/marcar-recibido - por si el cliente no confirma
// desde su cuenta (ej. lo recogió en tienda) y el negocio necesita cerrar el
// pedido de todos modos.
router.post(
  '/:id/marcar-recibido',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'ENVIADO') {
      return res.status(409).json({ error: 'Solo se puede marcar como recibido un pedido ya enviado.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { estado: 'RECIBIDO', recibidoAt: new Date() },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

// POST /pedidos-online/:id/cancelar - solo antes de ENVIADO; regresa el
// stock reservado a la sucursal de donde salió. Cancelar un pedido ya
// enviado/recibido requeriría un flujo de devolución que no existe todavía
// (ver docs/ARQUITECTURA.md, igual que con Apartados).
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: true },
    });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!['PENDIENTE_PAGO', 'EN_VALIDACION', 'PAGADO'].includes(pedido.estado)) {
      return res.status(409).json({ error: 'Este pedido ya no se puede cancelar (ya fue enviado o recibido).' });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      for (const item of pedido.items) {
        const existencia = await tx.existencia.findFirst({
          where: { sucursalId: item.sucursalStockId, varianteId: item.varianteId, proveedorId: item.proveedorId },
        });
        if (existencia) {
          await tx.existencia.update({
            where: { id: existencia.id },
            data: { stockActual: { increment: item.cantidad } },
          });
        } else {
          await tx.existencia.create({
            data: {
              sucursalId: item.sucursalStockId,
              varianteId: item.varianteId,
              proveedorId: item.proveedorId,
              stockActual: item.cantidad,
              stockMinimo: 0,
            },
          });
        }
        await tx.movimientoInventario.create({
          data: {
            sucursalId: item.sucursalStockId,
            varianteId: item.varianteId,
            tipo: 'DEVOLUCION',
            cantidad: item.cantidad,
            motivo: `Cancelación pedido ${pedido.folio}`,
            usuarioId: req.usuario.id,
            pedidoId: pedido.id,
            proveedorId: item.proveedorId,
          },
        });
      }

      return tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'CANCELADO' }, include: PEDIDO_INCLUDE });
    });

    res.json(actualizado);
  })
);

module.exports = router;
