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
  descuentoAplicadoPor: { select: { nombre: true } },
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

// ---------------------------------------------------------------------------
// Descuento manual post-pedido: para modelos puntuales que el negocio decide
// descontar DESPUÉS de que el cliente ya armó su pedido, confirmándoselo por
// WhatsApp antes de que haga la transferencia (chat manual, mismo mecanismo
// de click-to-chat que ya se usa para el pago — ver conWhatsapp en
// routes/tienda/pedidos.js). Solo se puede activar/quitar mientras el
// pedido sigue PENDIENTE_PAGO: una vez que el cliente ya subió su
// comprobante (EN_VALIDACION o después), el monto ya quedó fijo y no debe
// moverse solo, para no desajustar lo que el cliente ya transfirió.
// ---------------------------------------------------------------------------

const descuentoManualSchema = z.object({
  tipoDescuento: z.enum(['PORCENTAJE', 'MONTO']),
  valor: z.number().positive(),
  notas: z.string().optional(),
});

function calcularTotalPedido(pedido, descuentoManualMonto) {
  const subtotal = pedido.items.reduce((acc, it) => acc + Number(it.subtotal), 0);
  const total = subtotal + Number(pedido.costoEnvio) - Number(pedido.cuponDescuento || 0) - descuentoManualMonto;
  return Math.max(0, Math.round(total * 100) / 100);
}

// POST /pedidos-online/:id/aplicar-descuento - activa (o edita) el
// descuento manual de este pedido y recalcula el total. No manda nada por
// WhatsApp automáticamente: el negocio se lo confirma al cliente a mano y
// luego marca esa confirmación con POST /:id/confirmar-descuento-whatsapp.
router.post(
  '/:id/aplicar-descuento',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const parsed = descuentoManualSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    if (parsed.data.tipoDescuento === 'PORCENTAJE' && parsed.data.valor > 100) {
      return res.status(400).json({ error: 'Un descuento por porcentaje no puede ser mayor a 100.' });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'PENDIENTE_PAGO') {
      return res.status(409).json({
        error: 'Solo se puede activar un descuento mientras el pedido está pendiente de pago (antes de que el cliente transfiera).',
      });
    }

    const subtotal = pedido.items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const disponibleParaDescuento = subtotal + Number(pedido.costoEnvio) - Number(pedido.cuponDescuento || 0);

    let descuentoManualMonto =
      parsed.data.tipoDescuento === 'PORCENTAJE'
        ? disponibleParaDescuento * (parsed.data.valor / 100)
        : parsed.data.valor;
    descuentoManualMonto = Math.max(0, Math.min(descuentoManualMonto, disponibleParaDescuento));
    descuentoManualMonto = Math.round(descuentoManualMonto * 100) / 100;

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        descuentoManualTipo: parsed.data.tipoDescuento,
        descuentoManualValor: parsed.data.valor,
        descuentoManualMonto,
        descuentoManualNotas: parsed.data.notas || null,
        // Cada vez que se activa/edita el descuento hay que volver a
        // confirmárselo al cliente, así que se reinicia esta bandera.
        descuentoConfirmadoWhatsapp: false,
        descuentoAplicadoPorId: req.usuario.id,
        descuentoAplicadoAt: new Date(),
        total: calcularTotalPedido(pedido, descuentoManualMonto),
      },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

// POST /pedidos-online/:id/quitar-descuento
router.post(
  '/:id/quitar-descuento',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.estado !== 'PENDIENTE_PAGO') {
      return res.status(409).json({ error: 'Solo se puede quitar el descuento mientras el pedido está pendiente de pago.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        descuentoManualTipo: null,
        descuentoManualValor: null,
        descuentoManualMonto: 0,
        descuentoManualNotas: null,
        descuentoConfirmadoWhatsapp: false,
        descuentoAplicadoPorId: null,
        descuentoAplicadoAt: null,
        total: calcularTotalPedido(pedido, 0),
      },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

// POST /pedidos-online/:id/confirmar-descuento-whatsapp - registro
// informativo de que ya se le avisó el descuento al cliente por WhatsApp
// (chat manual); no cambia ningún monto por sí solo.
router.post(
  '/:id/confirmar-descuento-whatsapp',
  requireAuth,
  requireRole(...ROLES_PEDIDOS),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!pedido.descuentoManualMonto || Number(pedido.descuentoManualMonto) <= 0) {
      return res.status(409).json({ error: 'Este pedido no tiene un descuento activo para confirmar.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { descuentoConfirmadoWhatsapp: true },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

module.exports = router;
