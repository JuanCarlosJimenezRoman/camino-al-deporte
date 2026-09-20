const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { notificarPedidoSucursal } = require('../utils/notificaciones');
const { verificarBajoStockYNotificar } = require('../utils/bajoStock');
const { generarTransferenciasPdf } = require('../utils/transferenciasPdf');
const { obtenerMarca } = require('../utils/ticketEstilo');
const { ZONA_NEGOCIO, inicioDiaNegocio, finDiaNegocio } = require('../utils/fechas');

const router = express.Router();

// Quién puede mover mercancía entre sucursales. VENTAS NO tiene acceso a
// esto: cuando un vendedor necesita algo que solo hay en otra sucursal, el
// flujo es apartarlo para el cliente (ver POST /apartados, que reserva
// stock en cualquier sucursal sin importar dónde se vende) — no crear una
// transferencia por su cuenta.
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
      proveedor: { select: { id: true, nombre: true } },
      solicitadoPor: { select: { nombre: true } },
      recibidoPor: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(transferencias);
}));

// GET /transferencias/reporte-pdf - reporte en PDF (con foto de cada
// producto) para mandar fuera del sistema. Se arma de UNO de estos dos:
//
//   ?lote=L-20260920-143015   todo lo que salió en un mismo "Enviar N
//                             traspasos" (TransferenciaInventario.loteFolio)
//   ?fecha=2026-09-20         todas las transferencias creadas ese día
//                             (día calendario en la zona del negocio, ver
//                             utils/fechas.js)
//
// Opcionales: ?sucursalId= (solo las que tengan esa sucursal de origen o
// destino, igual que el historial) y ?incluirCanceladas=1 (por defecto las
// canceladas NO entran: esa mercancía nunca salió). No incluye costos ni
// precios — es un documento externo.
//
// Mismos roles que el resto del módulo (ROLES_INVENTARIO).
const MAX_RENGLONES_REPORTE_PDF = 300;

const reporteQuerySchema = z
  .object({
    lote: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/, 'Lote inválido.').optional(),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
      .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f, {
        message: 'Fecha inválida.',
      })
      .optional(),
    sucursalId: z.coerce.number().int().positive().optional(),
    incluirCanceladas: z.enum(['0', '1']).optional(),
  })
  .refine((q) => Boolean(q.lote) !== Boolean(q.fecha), { message: 'Indica un lote o una fecha (solo uno de los dos).' });

router.get('/reporte-pdf', requireAuth, requireRole(...ROLES_INVENTARIO), asyncHandler(async (req, res) => {
  const parsed = reporteQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Parámetros inválidos.' });
  }
  const { lote, fecha, sucursalId, incluirCanceladas } = parsed.data;

  const transferencias = await prisma.transferenciaInventario.findMany({
    where: {
      ...(lote ? { loteFolio: lote } : { createdAt: { gte: inicioDiaNegocio(fecha), lte: finDiaNegocio(fecha) } }),
      ...(sucursalId ? { OR: [{ sucursalOrigenId: sucursalId }, { sucursalDestinoId: sucursalId }] } : {}),
      ...(incluirCanceladas === '1' ? {} : { estado: { not: 'CANCELADA' } }),
    },
    include: {
      variante: {
        include: {
          talla: true,
          producto: {
            select: {
              id: true,
              nombre: true,
              marca: { select: { nombre: true } },
              imagenes: { select: { url: true, color: true, esPrincipal: true, orden: true }, orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }] },
            },
          },
        },
      },
      sucursalOrigen: { select: { id: true, nombre: true } },
      sucursalDestino: { select: { id: true, nombre: true } },
      solicitadoPor: { select: { nombre: true } },
      recibidoPor: { select: { nombre: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_RENGLONES_REPORTE_PDF + 1,
  });

  if (transferencias.length === 0) {
    return res.status(404).json({
      error: lote
        ? 'No se encontraron transferencias para ese lote.'
        : 'No hay transferencias ese día con los filtros elegidos.',
    });
  }
  if (transferencias.length > MAX_RENGLONES_REPORTE_PDF) {
    return res.status(400).json({
      error: `El reporte tiene más de ${MAX_RENGLONES_REPORTE_PDF} renglones. Filtra por sucursal o elige un lote.`,
    });
  }

  const fechaLarga = (d, opciones = {}) =>
    new Date(d).toLocaleDateString('es-MX', { timeZone: ZONA_NEGOCIO, day: 'numeric', month: 'long', year: 'numeric', ...opciones });

  const partes = [];
  if (lote) {
    partes.push(`Lote ${lote}`, `Enviado el ${fechaLarga(transferencias[0].createdAt)}`);
  } else {
    partes.push(`Día: ${fechaLarga(`${fecha}T12:00:00Z`, { timeZone: 'UTC', weekday: 'long' })}`);
  }
  if (sucursalId) {
    const t = transferencias[0];
    const nombre = t.sucursalOrigen.id === sucursalId ? t.sucursalOrigen.nombre : t.sucursalDestino.nombre;
    partes.push(`Sucursal: ${nombre}`);
  }

  const marca = await obtenerMarca();
  const buffer = await generarTransferenciasPdf(transferencias, { marca, filtrosTexto: partes.join('  ·  ') });

  const nombreArchivo = lote ? `transferencias-lote-${lote}.pdf` : `transferencias-${fecha}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
}));

const crearSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  sucursalOrigenId: z.number().int(),
  sucursalDestinoId: z.number().int(),
  notas: z.string().optional(),
  // De qué bucket de proveedor sale el stock en el origen (null = "sin
  // proveedor"). Obligatorio: hay que decir siempre de cuál cuando la talla
  // tiene stock repartido en más de un proveedor en esa sucursal.
  proveedorId: z.number().int().nullable(),
  // Folio de lote compartido por todas las transferencias de un mismo
  // "Enviar N traspasos" (lo genera el frontend, una vez por envío). Opcional:
  // sin él la transferencia funciona igual, solo no entra a reportes por lote.
  loteFolio: z.string().regex(/^L-[A-Za-z0-9-]{4,40}$/, 'Folio de lote inválido.').optional(),
});

// POST /transferencias - solicita el envío: descuenta stock del origen de inmediato
// (queda "en camino") y crea el registro en estado SOLICITADA. El stock del
// destino solo sube cuando alguien confirma la recepción (POST /:id/recibir).
router.post('/', requireAuth, requireRole(...ROLES_INVENTARIO), asyncHandler(async (req, res) => {
  const parsed = crearSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { varianteId, cantidad, sucursalOrigenId, sucursalDestinoId, notas, proveedorId, loteFolio } = parsed.data;

  if (sucursalOrigenId === sucursalDestinoId) {
    return res.status(400).json({ error: 'La sucursal de origen y destino no pueden ser la misma.' });
  }

  try {
    const transferencia = await prisma.$transaction(async (tx) => {
      const existenciaOrigen = await tx.existencia.findFirst({
        where: { sucursalId: sucursalOrigenId, varianteId, proveedorId },
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
          proveedorId,
          notas,
          loteFolio,
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
          proveedorId,
        },
      });

      await notificarPedidoSucursal(tx, nueva, req.usuario);

      return nueva;
    });

    // Best-effort y en segundo plano: la sucursal de origen pudo haber
    // quedado en o bajo el mínimo de esta variante (ver utils/bajoStock.js).
    verificarBajoStockYNotificar([{ sucursalId: sucursalOrigenId, varianteId }]).catch((err) =>
      console.error('Error verificando bajo stock tras la transferencia:', err)
    );

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

        const existenciaDestino = await tx.existencia.findFirst({
          where: {
            sucursalId: transferencia.sucursalDestinoId,
            varianteId: transferencia.varianteId,
            proveedorId: transferencia.proveedorId,
          },
        });
        if (existenciaDestino) {
          await tx.existencia.update({
            where: { id: existenciaDestino.id },
            data: { stockActual: { increment: transferencia.cantidad } },
          });
        } else {
          await tx.existencia.create({
            data: {
              sucursalId: transferencia.sucursalDestinoId,
              varianteId: transferencia.varianteId,
              proveedorId: transferencia.proveedorId,
              stockActual: transferencia.cantidad,
              stockMinimo: 0,
            },
          });
        }

        await tx.movimientoInventario.create({
          data: {
            sucursalId: transferencia.sucursalDestinoId,
            varianteId: transferencia.varianteId,
            tipo: 'TRANSFERENCIA_ENTRADA',
            cantidad: transferencia.cantidad,
            motivo: `Recepción transferencia ${transferencia.folio}`,
            usuarioId: req.usuario.id,
            transferenciaId: transferencia.id,
            proveedorId: transferencia.proveedorId,
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

        const existenciaOrigen = await tx.existencia.findFirst({
          where: {
            sucursalId: transferencia.sucursalOrigenId,
            varianteId: transferencia.varianteId,
            proveedorId: transferencia.proveedorId,
          },
        });
        if (existenciaOrigen) {
          await tx.existencia.update({
            where: { id: existenciaOrigen.id },
            data: { stockActual: { increment: transferencia.cantidad } },
          });
        } else {
          await tx.existencia.create({
            data: {
              sucursalId: transferencia.sucursalOrigenId,
              varianteId: transferencia.varianteId,
              proveedorId: transferencia.proveedorId,
              stockActual: transferencia.cantidad,
              stockMinimo: 0,
            },
          });
        }

        await tx.movimientoInventario.create({
          data: {
            sucursalId: transferencia.sucursalOrigenId,
            varianteId: transferencia.varianteId,
            tipo: 'AJUSTE',
            cantidad: transferencia.cantidad,
            motivo: `Cancelación transferencia ${transferencia.folio}`,
            usuarioId: req.usuario.id,
            transferenciaId: transferencia.id,
            proveedorId: transferencia.proveedorId,
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
