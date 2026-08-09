const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen } = require('../config/cloudinary');

const router = express.Router();

const ROLES_VENTAS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

// Solo la foto principal del producto (o la primera si no hay ninguna
// marcada como principal), para mostrar una miniatura en las listas de
// ventas sin mandar la galería completa.
const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1 },
};

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

/**
 * Resuelve desde qué sucursal se puede vender/consultar según el rol:
 *  - ADMIN_PRINCIPAL/DESARROLLO: pueden operar sobre cualquier sucursal
 *    (la que manden en la petición).
 *  - VENTAS (y cualquier otro rol no admin): siempre se fuerza a su propia
 *    sucursal asignada, sin importar qué mande el cliente. Así evitamos que
 *    un vendedor registre una venta "desde" otra sucursal manipulando la
 *    petición.
 * Lanza un error con mensaje SIN_SUCURSAL_ASIGNADA si el usuario no admin
 * no tiene sucursal asignada.
 */
function resolverSucursalId(req, sucursalIdSolicitada) {
  if (esAdmin(req.usuario.rol)) return sucursalIdSolicitada;
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    err.status = 400;
    throw err;
  }
  return req.usuario.sucursalId;
}

// GET /ventas - listar ventas (admin/desarrollo ven todo; ventas ve las propias)
// Filtro opcional ?sucursalId=
router.get('/', requireAuth, requireRole(...ROLES_VENTAS), asyncHandler(async (req, res) => {
  const { sucursalId } = req.query;

  const ventas = await prisma.venta.findMany({
    where: {
      ...(esAdmin(req.usuario.rol) ? {} : { usuarioId: req.usuario.id }),
      ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
    },
    include: {
      items: { include: { variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } } } },
      usuario: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
      cuentaTransferencia: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(ventas);
}));

// GET /ventas/corte-dia - resumen de caja de un día (por defecto hoy) para
// cuadrar efectivo/tarjeta/transferencia. VENTAS solo ve su propia sucursal;
// ADMIN/DESARROLLO pueden ver una sucursal específica o el corte global.
// Nota v1: el "día" se calcula en UTC (00:00 a 23:59:59 UTC de la fecha
// indicada). Si el negocio opera en una zona horaria distinta a UTC, las
// ventas cercanas a medianoche local pueden caer en el corte del día
// siguiente/anterior; si esto causa problemas se puede ajustar el offset.
router.get('/corte-dia', requireAuth, requireRole(...ROLES_VENTAS), asyncHandler(async (req, res) => {
  let sucursalId;
  if (esAdmin(req.usuario.rol)) {
    sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : undefined;
  } else {
    if (!req.usuario.sucursalId) {
      return res.status(400).json({ error: 'Tu usuario no tiene una sucursal asignada.' });
    }
    sucursalId = req.usuario.sucursalId;
  }

  const fechaStr = req.query.fecha ? String(req.query.fecha) : new Date().toISOString().slice(0, 10);
  const inicio = new Date(`${fechaStr}T00:00:00.000Z`);
  const fin = new Date(`${fechaStr}T23:59:59.999Z`);
  if (Number.isNaN(inicio.getTime())) {
    return res.status(400).json({ error: 'fecha inválida, usa formato YYYY-MM-DD.' });
  }

  const [completadas, canceladas] = await Promise.all([
    prisma.venta.findMany({
      where: {
        estado: 'COMPLETADA',
        createdAt: { gte: inicio, lte: fin },
        ...(sucursalId ? { sucursalId } : {}),
      },
      include: {
        sucursal: { select: { nombre: true } },
        cuentaTransferencia: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.venta.findMany({
      where: {
        estado: 'CANCELADA',
        createdAt: { gte: inicio, lte: fin },
        ...(sucursalId ? { sucursalId } : {}),
      },
      select: { id: true, folio: true, total: true },
    }),
  ]);

  const porMetodoPago = { EFECTIVO: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  const porCuenta = {};
  let totalGeneral = 0;

  for (const v of completadas) {
    const monto = Number(v.total);
    totalGeneral += monto;
    porMetodoPago[v.metodoPago] = (porMetodoPago[v.metodoPago] || 0) + monto;
    if (v.metodoPago === 'TRANSFERENCIA' && v.cuentaTransferencia) {
      const clave = v.cuentaTransferencia.nombre;
      porCuenta[clave] = (porCuenta[clave] || 0) + monto;
    }
  }

  res.json({
    fecha: fechaStr,
    sucursalId: sucursalId || null,
    totalVentas: completadas.length,
    totalGeneral,
    porMetodoPago,
    porCuentaTransferencia: porCuenta,
    canceladas: {
      cantidad: canceladas.length,
      total: canceladas.reduce((acc, v) => acc + Number(v.total), 0),
    },
    ventas: completadas,
  });
}));

// GET /ventas/historial - historial con filtros de fecha, solo para
// administración. Sin sucursalId devuelve el histórico global; con
// sucursalId, el de esa sucursal.
router.get(
  '/historial',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const { sucursalId, fechaInicio, fechaFin, estado } = req.query;

    const where = {
      ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
      ...(estado ? { estado: String(estado) } : {}),
    };
    if (fechaInicio || fechaFin) {
      where.createdAt = {};
      if (fechaInicio) where.createdAt.gte = new Date(`${fechaInicio}T00:00:00.000Z`);
      if (fechaFin) where.createdAt.lte = new Date(`${fechaFin}T23:59:59.999Z`);
    }

    const ventas = await prisma.venta.findMany({
      where,
      include: {
        items: { include: { variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } } } },
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        cuentaTransferencia: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const resumenPorSucursal = {};
    let totalGeneral = 0;
    for (const v of ventas) {
      if (v.estado !== 'COMPLETADA') continue;
      const monto = Number(v.total);
      totalGeneral += monto;
      const clave = v.sucursal?.nombre || `Sucursal ${v.sucursalId}`;
      if (!resumenPorSucursal[clave]) resumenPorSucursal[clave] = { cantidad: 0, total: 0 };
      resumenPorSucursal[clave].cantidad += 1;
      resumenPorSucursal[clave].total += monto;
    }

    res.json({
      ventas,
      resumen: { totalGeneral, porSucursal: resumenPorSucursal },
    });
  })
);

const ventaItemSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
});

const ventaSchema = z
  .object({
    sucursalId: z.number().int().optional(),
    cliente: z.string().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
    cuentaTransferenciaId: z.number().int().optional(),
    items: z.array(ventaItemSchema).min(1),
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  });

// POST /ventas - registrar una venta y descontar inventario de esa sucursal
// en la misma transacción.
//
// Se envía como multipart/form-data:
//  - campo de texto "datos": JSON con { sucursalId, cliente, metodoPago,
//    cuentaTransferenciaId, items }.
//  - campo de archivo "comprobante": foto del comprobante, obligatoria solo
//    cuando metodoPago = TRANSFERENCIA.
// Si no hay comprobante que subir (efectivo/tarjeta), también se acepta el
// body como JSON normal (application/json) sin necesidad de multipart.
router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_VENTAS),
  manejarSubidaImagen('comprobante'),
  asyncHandler(async (req, res) => {
    let body = req.body;
    if (req.is('multipart/form-data')) {
      try {
        body = JSON.parse(req.body.datos || '{}');
      } catch {
        return res.status(400).json({ error: 'El campo "datos" debe ser un JSON válido.' });
      }
    }

    const parsed = ventaSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { cliente, metodoPago, cuentaTransferenciaId, items } = parsed.data;

    let sucursalId;
    try {
      sucursalId = resolverSucursalId(req, parsed.data.sucursalId);
    } catch (err) {
      if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
        return res.status(400).json({
          error: 'Tu usuario no tiene una sucursal asignada. Pide a un administrador que te asigne una para poder vender.',
        });
      }
      throw err;
    }
    if (!sucursalId) {
      return res.status(400).json({ error: 'sucursalId es requerido.' });
    }

    // Validar cuenta de transferencia y, si aplica, subir el comprobante.
    let comprobanteUrl = null;
    let comprobantePublicId = null;
    if (metodoPago === 'TRANSFERENCIA') {
      const cuenta = await prisma.cuentaTransferencia.findUnique({ where: { id: cuentaTransferenciaId } });
      if (!cuenta || !cuenta.activo) {
        return res.status(400).json({ error: 'La cuenta de transferencia indicada no existe o está inactiva.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Falta la foto del comprobante (campo "comprobante").' });
      }
      const subida = await subirImagen(req.file.buffer, 'comprobantes');
      comprobanteUrl = subida.url;
      comprobantePublicId = subida.publicId;
    }

    try {
      const venta = await prisma.$transaction(async (tx) => {
        let total = 0;
        const itemsData = [];

        for (const item of items) {
          const existencia = await tx.existencia.findUnique({
            where: { sucursalId_varianteId: { sucursalId, varianteId: item.varianteId } },
            include: { variante: true },
          });
          if (!existencia) throw new Error(`SIN_EXISTENCIA:${item.varianteId}`);
          if (existencia.stockActual < item.cantidad) {
            throw new Error(`STOCK_INSUFICIENTE:${existencia.variante.sku}`);
          }

          const subtotal = item.cantidad * item.precioUnitario;
          total += subtotal;

          await tx.existencia.update({
            where: { id: existencia.id },
            data: { stockActual: { decrement: item.cantidad } },
          });

          await tx.movimientoInventario.create({
            data: {
              sucursalId,
              varianteId: item.varianteId,
              tipo: 'VENTA',
              cantidad: -item.cantidad,
              motivo: 'Venta',
              usuarioId: req.usuario.id,
            },
          });

          itemsData.push({ ...item, subtotal });
        }

        const folio = `V-${Date.now()}`;

        return tx.venta.create({
          data: {
            folio,
            sucursalId,
            usuarioId: req.usuario.id,
            cliente,
            metodoPago,
            cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? cuentaTransferenciaId : null,
            comprobanteUrl,
            comprobantePublicId,
            total,
            items: { create: itemsData },
          },
          include: { items: true, cuentaTransferencia: { select: { nombre: true } } },
        });
      });

      res.status(201).json(venta);
    } catch (err) {
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
      }
      if (err.message.startsWith('SIN_EXISTENCIA')) {
        return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en esta sucursal.' });
      }
      throw err;
    }
  })
);

// POST /ventas/:id/cancelar - cancela y repone inventario en la sucursal donde se vendió
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const ventaId = Number(req.params.id);

    const venta = await prisma
      .$transaction(async (tx) => {
        const v = await tx.venta.findUnique({ where: { id: ventaId }, include: { items: true } });
        if (!v) throw new Error('VENTA_NO_ENCONTRADA');
        if (v.estado === 'CANCELADA') return v;

        for (const item of v.items) {
          await tx.existencia.upsert({
            where: { sucursalId_varianteId: { sucursalId: v.sucursalId, varianteId: item.varianteId } },
            update: { stockActual: { increment: item.cantidad } },
            create: {
              sucursalId: v.sucursalId,
              varianteId: item.varianteId,
              stockActual: item.cantidad,
              stockMinimo: 0,
            },
          });
          await tx.movimientoInventario.create({
            data: {
              sucursalId: v.sucursalId,
              varianteId: item.varianteId,
              tipo: 'DEVOLUCION',
              cantidad: item.cantidad,
              motivo: `Cancelación venta ${v.folio}`,
              usuarioId: req.usuario.id,
            },
          });
        }

        return tx.venta.update({ where: { id: ventaId }, data: { estado: 'CANCELADA' } });
      })
      .catch((err) => {
        if (err.message === 'VENTA_NO_ENCONTRADA') return null;
        throw err;
      });

    if (!venta) return res.status(404).json({ error: 'Venta no encontrada.' });
    res.json(venta);
  })
);

module.exports = router;
