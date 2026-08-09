const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Quién puede mover mercancía entre sucursales.
const ROLES_INVENTARIO = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'];

// GET /transferencias - lista, filtrable por sucursal (origen o destino) y estado
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { sucursalId, estado } = req.query;

  const transferencias = await prisma.transferenciaInventario.findMany({
    where: {
      ...(estado ? { estado: String(estado) } : {}),
      ...(sucursalId
        ? {
            OR: [
              { sucursalOrigenId: Number(sucursalId) },
              { sucursalDestinoId: Number(sucursalId) },
            ],
          }
        : {}),
    },
    include: {
      variante: { include: { producto: true, talla: true } },
      sucursalOrigen: true,
      sucursalDestino: true,
      solicitadoPor: { select: { nombre: true } },
      recibidoPor: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(transferencias);
}));

const crearSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  sucursalOrigenId: z.number().int(),
  sucursalDestinoId: z.number().int(),
  notas: z.string().optional(),
});

// POST /transferencias - solicita el envío: descuenta stock del origen de inmediato
// (queda "en camino") y crea el registro en estado SOLICITADA. El stock del
// destino solo sube cuando alguien confirma la recepción (POST /:id/recibir).
router.post('/', requireAuth, requireRole(...ROLES_INVENTARIO), asyncHandler(async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { varianteId, cantidad, sucursalOrigenId, sucursalDestinoId, notas } = parsed.data;

  if (sucursalOrigenId === sucursalDestinoId) {
    return res.status(400).json({ error: 'La sucursal de origen y destino no pueden ser la misma.' });
  }

  try {
    const transferencia = await prisma.$transaction(async (tx) => {
      const existenciaOrigen = await tx.existencia.findUnique({
        where: { sucursalId_varianteId: { sucursalId: sucursalOrigenId, varianteId } },
      });
      if (!existenciaOrigen || existenciaOrigen.stockActual < cantidad) {
        throw new Error('STOCK_INSUFICIENTE');
      }

      await tx.existencia.update({
        where: { id: existenciaOrigen.id },
        data: { stockActual: { decrement: cantidad } },
      });

      const folio = `T-${Date.now()}`;

      const nueva = await tx.transferenciaInventario.create({
        data: {
          folio,
          varianteId,
          cantidad,
          sucursalOrigenId,
          sucursalDestinoId,
          notas,
          solicitadoPorId: req.usuario.id,
        },
      });

      await tx.movimientoInventario.create({
        data: {
          sucursalId: sucursalOrigenId,
          varianteId,
          tipo: 'TRANSFERENCIA_SALIDA',
          cantidad: -cantidad,
          motivo: `Transferencia ${folio} hacia sucursal ${sucursalDestinoId}`,
          usuarioId: req.usuario.id,
          transferenciaId: nueva.id,
        },
      });

      return nueva;
    });

    res.status(201).json(transferencia);
  } catch (err) {
    if (err.message === 'STOCK_INSUFICIENTE') {
      return res.status(409).json({ error: 'Stock insuficiente en la sucursal de origen.' });
    }
    throw err;
  }
}));

// POST /transferencias/:id/recibir - confirma la llegada: suma stock al destino
router.post(
  '/:id/recibir',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const resultado = await prisma
      .$transaction(async (tx) => {
        const transferencia = await tx.transferenciaInventario.findUnique({ where: { id } });
        if (!transferencia) throw new Error('NO_ENCONTRADA');
        if (transferencia.estado !== 'SOLICITADA') throw new Error('ESTADO_INVALIDO');

        await tx.existencia.upsert({
          where: {
            sucursalId_varianteId: {
              sucursalId: transferencia.sucursalDestinoId,
              varianteId: transferencia.varianteId,
            },
          },
          update: { stockActual: { increment: transferencia.cantidad } },
          create: {
            sucursalId: transferencia.sucursalDestinoId,
            varianteId: transferencia.varianteId,
            stockActual: transferencia.cantidad,
            stockMinimo: 0,
          },
        });

        await tx.movimientoInventario.create({
          data: {
            sucursalId: transferencia.sucursalDestinoId,
            varianteId: transferencia.varianteId,
            tipo: 'TRANSFERENCIA_ENTRADA',
            cantidad: transferencia.cantidad,
            motivo: `Recepción transferencia ${transferencia.folio}`,
            usuarioId: req.usuario.id,
            transferenciaId: transferencia.id,
          },
        });

        return tx.transferenciaInventario.update({
          where: { id },
          data: { estado: 'RECIBIDA', recibidoPorId: req.usuario.id, recibidoAt: new Date() },
        });
      })
      .catch((err) => {
        if (err.message === 'NO_ENCONTRADA') return { error: 'NO_ENCONTRADA' };
        if (err.message === 'ESTADO_INVALIDO') return { error: 'ESTADO_INVALIDO' };
        throw err;
      });

    if (resultado.error === 'NO_ENCONTRADA') return res.status(404).json({ error: 'Transferencia no encontrada.' });
    if (resultado.error === 'ESTADO_INVALIDO') {
      return res.status(409).json({ error: 'Esta transferencia ya fue recibida o cancelada.' });
    }

    res.json(resultado);
  })
);

// POST /transferencias/:id/cancelar - si aún no se recibió, regresa el stock al origen
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_INVENTARIO),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const resultado = await prisma
      .$transaction(async (tx) => {
        const transferencia = await tx.transferenciaInventario.findUnique({ where: { id } });
        if (!transferencia) throw new Error('NO_ENCONTRADA');
        if (transferencia.estado !== 'SOLICITADA') throw new Error('ESTADO_INVALIDO');

        await tx.existencia.upsert({
          where: {
            sucursalId_varianteId: {
              sucursalId: transferencia.sucursalOrigenId,
              varianteId: transferencia.varianteId,
            },
          },
          update: { stockActual: { increment: transferencia.cantidad } },
          create: {
            sucursalId: transferencia.sucursalOrigenId,
            varianteId: transferencia.varianteId,
            stockActual: transferencia.cantidad,
            stockMinimo: 0,
          },
        });

        await tx.movimientoInventario.create({
          data: {
            sucursalId: transferencia.sucursalOrigenId,
            varianteId: transferencia.varianteId,
            tipo: 'AJUSTE',
            cantidad: transferencia.cantidad,
            motivo: `Cancelación transferencia ${transferencia.folio}`,
            usuarioId: req.usuario.id,
            transferenciaId: transferencia.id,
          },
        });

        return tx.transferenciaInventario.update({ where: { id }, data: { estado: 'CANCELADA' } });
      })
      .catch((err) => {
        if (err.message === 'NO_ENCONTRADA') return { error: 'NO_ENCONTRADA' };
        if (err.message === 'ESTADO_INVALIDO') return { error: 'ESTADO_INVALIDO' };
        throw err;
      });

    if (resultado.error === 'NO_ENCONTRADA') return res.status(404).json({ error: 'Transferencia no encontrada.' });
    if (resultado.error === 'ESTADO_INVALIDO') {
      return res.status(409).json({ error: 'Esta transferencia ya fue recibida o cancelada.' });
    }

    res.json(resultado);
  })
);

module.exports = router;
