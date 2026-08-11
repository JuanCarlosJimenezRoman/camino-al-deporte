const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen } = require('../config/cloudinary');

const router = express.Router();

const ROLES_APARTADOS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

// Manda la galería completa (solo url/color/esPrincipal) en vez de una sola
// foto: como una foto puede estar etiquetada para un color de variante
// específico, el frontend necesita verlas todas para elegir la que
// corresponde al color de cada artículo apartado, no solo la portada general.
const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: {
    orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
    select: { url: true, color: true, esPrincipal: true },
  },
};

function esAdmin(rol) {
  return ['ADMIN_PRINCIPAL', 'DESARROLLO'].includes(rol);
}

// Mismo criterio que en ventas: VENTAS solo opera sobre la sucursal donde
// atiende (aunque los artículos del apartado puedan salir físicamente de
// otra sucursal, ver ApartadoItem.sucursalStockId). Admin puede elegir.
function resolverSucursalVentaId(req, solicitada) {
  if (esAdmin(req.usuario.rol)) return solicitada;
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    throw err;
  }
  return req.usuario.sucursalId;
}

function calcularSaldo(apartado) {
  const pagado = (apartado.pagos || []).reduce((acc, p) => acc + Number(p.monto), 0);
  return { pagado, saldoPendiente: Number(apartado.total) - pagado };
}

// GET /apartados?estado=&clienteId= - VENTAS solo ve los de su sucursal;
// admin ve todos o filtra por sucursalId.
router.get('/', requireAuth, requireRole(...ROLES_APARTADOS), asyncHandler(async (req, res) => {
  const { estado, clienteId, sucursalId } = req.query;

  const where = {
    ...(estado ? { estado: String(estado) } : {}),
    ...(clienteId ? { clienteId: Number(clienteId) } : {}),
  };
  if (esAdmin(req.usuario.rol)) {
    if (sucursalId) where.sucursalVentaId = Number(sucursalId);
  } else {
    where.sucursalVentaId = req.usuario.sucursalId;
  }

  const apartados = await prisma.apartado.findMany({
    where,
    include: {
      cliente: true,
      sucursalVenta: { select: { nombre: true } },
      items: {
        include: {
          variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
          sucursalStock: { select: { nombre: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
      pagos: true,
      creadoPor: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(apartados.map((a) => ({ ...a, ...calcularSaldo(a) })));
}));

// GET /apartados/:id - detalle con saldo
router.get('/:id', requireAuth, requireRole(...ROLES_APARTADOS), asyncHandler(async (req, res) => {
  const apartado = await prisma.apartado.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: true,
      sucursalVenta: { select: { nombre: true } },
      items: {
        include: {
          variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
          sucursalStock: { select: { nombre: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
      pagos: { include: { cuentaTransferencia: { select: { nombre: true } }, registradoPor: { select: { nombre: true } } } },
      creadoPor: { select: { nombre: true } },
    },
  });
  if (!apartado) return res.status(404).json({ error: 'Apartado no encontrado.' });
  if (!esAdmin(req.usuario.rol) && apartado.sucursalVentaId !== req.usuario.sucursalId) {
    return res.status(403).json({ error: 'No tienes permiso para ver este apartado.' });
  }

  res.json({ ...apartado, ...calcularSaldo(apartado) });
}));

const apartadoItemSchema = z.object({
  varianteId: z.number().int(),
  sucursalStockId: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
  // De qué proveedor se reserva el stock (null = bucket "sin proveedor"),
  // obligatorio por la misma razón que en Ventas.
  proveedorId: z.number().int().nullable(),
});

const anticipoSchema = z.object({
  monto: z.number().positive(),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  cuentaTransferenciaId: z.number().int().optional(),
});

const apartadoSchema = z
  .object({
    clienteId: z.number().int().optional(),
    clienteNuevo: z
      .object({
        nombre: z.string().min(1),
        telefono: z.string().min(1),
        email: z.string().optional(),
      })
      .optional(),
    sucursalVentaId: z.number().int().optional(),
    fechaLimite: z.string().optional(),
    notas: z.string().optional(),
    items: z.array(apartadoItemSchema).min(1),
    anticipo: anticipoSchema.optional(),
  })
  .refine((d) => d.clienteId || d.clienteNuevo, {
    message: 'Indica un cliente existente (clienteId) o los datos de uno nuevo (clienteNuevo).',
    path: ['clienteId'],
  })
  .refine((d) => !d.anticipo || d.anticipo.metodoPago !== 'TRANSFERENCIA' || !!d.anticipo.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el anticipo es por transferencia.',
    path: ['anticipo', 'cuentaTransferenciaId'],
  });

// POST /apartados - crea el apartado y descuenta de inmediato el stock de
// cada artículo (en la sucursal donde físicamente está, sea la misma
// sucursal que atiende o no). No se genera ninguna transferencia automática:
// si el artículo está en otra sucursal, mover la mercancía físicamente se
// sigue haciendo a mano con el módulo de Transferencias cuando se vaya a
// entregar. Si el apartado se cancela, el stock se devuelve a donde salió.
//
// Igual que en ventas: acepta multipart/form-data con un campo de texto
// "datos" (JSON) y un archivo opcional "comprobante" (solo si el anticipo es
// por transferencia); también acepta JSON normal si no hay anticipo o el
// anticipo no es por transferencia.
router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_APARTADOS),
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

    const parsed = apartadoSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { clienteId, clienteNuevo, fechaLimite, notas, items, anticipo } = parsed.data;

    let sucursalVentaId;
    try {
      sucursalVentaId = resolverSucursalVentaId(req, parsed.data.sucursalVentaId);
    } catch (err) {
      if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
        return res.status(400).json({
          error: 'Tu usuario no tiene una sucursal asignada. Pide a un administrador que te asigne una.',
        });
      }
      throw err;
    }
    if (!sucursalVentaId) return res.status(400).json({ error: 'sucursalVentaId es requerido.' });

    // Validar cuenta + comprobante del anticipo, si aplica, antes de tocar inventario.
    let comprobanteUrl = null;
    let comprobantePublicId = null;
    if (anticipo && anticipo.metodoPago === 'TRANSFERENCIA') {
      const cuenta = await prisma.cuentaTransferencia.findUnique({ where: { id: anticipo.cuentaTransferenciaId } });
      if (!cuenta || !cuenta.activo) {
        return res.status(400).json({ error: 'La cuenta de transferencia indicada no existe o está inactiva.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Falta la foto del comprobante del anticipo (campo "comprobante").' });
      }
      const subida = await subirImagen(req.file.buffer, 'comprobantes');
      comprobanteUrl = subida.url;
      comprobantePublicId = subida.publicId;
    }

    try {
      const apartado = await prisma.$transaction(async (tx) => {
        // Cliente: existente o alta rápida (evita duplicar por teléfono).
        let cliente;
        if (clienteId) {
          cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!cliente) throw new Error('CLIENTE_NO_ENCONTRADO');
        } else {
          cliente = await tx.cliente.findUnique({ where: { telefono: clienteNuevo.telefono } });
          if (!cliente) {
            cliente = await tx.cliente.create({
              data: { nombre: clienteNuevo.nombre, telefono: clienteNuevo.telefono, email: clienteNuevo.email || undefined },
            });
          }
        }

        let total = 0;
        const itemsData = [];

        for (const item of items) {
          const existencia = await tx.existencia.findFirst({
            where: { sucursalId: item.sucursalStockId, varianteId: item.varianteId, proveedorId: item.proveedorId },
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
              sucursalId: item.sucursalStockId,
              varianteId: item.varianteId,
              tipo: 'APARTADO',
              cantidad: -item.cantidad,
              motivo: 'Apartado de cliente',
              usuarioId: req.usuario.id,
              proveedorId: item.proveedorId,
            },
          });

          itemsData.push(item);
        }

        const folio = `AP-${Date.now()}`;
        const pagoInicial = anticipo ? Math.min(anticipo.monto, total) : 0;
        const estadoInicial = pagoInicial >= total && total > 0 ? 'LIQUIDADO' : 'ACTIVO';

        return tx.apartado.create({
          data: {
            folio,
            clienteId: cliente.id,
            sucursalVentaId,
            total,
            estado: estadoInicial,
            fechaLimite: fechaLimite ? new Date(fechaLimite) : undefined,
            notas,
            creadoPorId: req.usuario.id,
            items: { create: itemsData.map((i) => ({ ...i, subtotal: i.cantidad * i.precioUnitario })) },
            ...(anticipo
              ? {
                  pagos: {
                    create: {
                      monto: anticipo.monto,
                      metodoPago: anticipo.metodoPago,
                      cuentaTransferenciaId: anticipo.metodoPago === 'TRANSFERENCIA' ? anticipo.cuentaTransferenciaId : null,
                      comprobanteUrl,
                      comprobantePublicId,
                      registradoPorId: req.usuario.id,
                    },
                  },
                }
              : {}),
          },
          include: {
            cliente: true,
            items: {
              include: {
                variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
                proveedor: { select: { id: true, nombre: true } },
              },
            },
            pagos: true,
          },
        });
      });

      res.status(201).json({ ...apartado, ...calcularSaldo(apartado) });
    } catch (err) {
      if (err.message === 'CLIENTE_NO_ENCONTRADO') return res.status(404).json({ error: 'Cliente no encontrado.' });
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
      }
      if (err.message.startsWith('SIN_EXISTENCIA')) {
        return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en la sucursal indicada.' });
      }
      throw err;
    }
  })
);

// POST /apartados/:id/pagos - registrar un abono. Igual que arriba, acepta
// multipart (datos + comprobante) o JSON normal si no es transferencia.
router.post(
  '/:id/pagos',
  requireAuth,
  requireRole(...ROLES_APARTADOS),
  manejarSubidaImagen('comprobante'),
  asyncHandler(async (req, res) => {
    const apartadoId = Number(req.params.id);

    let body = req.body;
    if (req.is('multipart/form-data')) {
      try {
        body = JSON.parse(req.body.datos || '{}');
      } catch {
        return res.status(400).json({ error: 'El campo "datos" debe ser un JSON válido.' });
      }
    }

    const pagoSchema = anticipoSchema; // { monto, metodoPago, cuentaTransferenciaId? }
    const parsed = pagoSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { monto, metodoPago, cuentaTransferenciaId } = parsed.data;
    if (metodoPago === 'TRANSFERENCIA' && !cuentaTransferenciaId) {
      return res.status(400).json({ error: 'cuentaTransferenciaId es requerido cuando el pago es por transferencia.' });
    }

    const apartado = await prisma.apartado.findUnique({ where: { id: apartadoId }, include: { pagos: true } });
    if (!apartado) return res.status(404).json({ error: 'Apartado no encontrado.' });
    if (!esAdmin(req.usuario.rol) && apartado.sucursalVentaId !== req.usuario.sucursalId) {
      return res.status(403).json({ error: 'No tienes permiso para registrar pagos en este apartado.' });
    }
    if (apartado.estado === 'CANCELADO') {
      return res.status(409).json({ error: 'Este apartado está cancelado, no admite más pagos.' });
    }
    if (apartado.estado === 'LIQUIDADO') {
      return res.status(409).json({ error: 'Este apartado ya está liquidado.' });
    }

    const { saldoPendiente } = calcularSaldo(apartado);
    if (monto > saldoPendiente + 0.0001) {
      return res.status(400).json({ error: `El abono ($${monto}) es mayor al saldo pendiente ($${saldoPendiente.toFixed(2)}).` });
    }

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

    const resultado = await prisma.$transaction(async (tx) => {
      const pago = await tx.apartadoPago.create({
        data: {
          apartadoId,
          monto,
          metodoPago,
          cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? cuentaTransferenciaId : null,
          comprobanteUrl,
          comprobantePublicId,
          registradoPorId: req.usuario.id,
        },
      });

      const nuevoSaldo = saldoPendiente - monto;
      if (nuevoSaldo <= 0.0001) {
        await tx.apartado.update({ where: { id: apartadoId }, data: { estado: 'LIQUIDADO' } });
      }

      return tx.apartado.findUnique({
        where: { id: apartadoId },
        include: {
          cliente: true,
          items: { include: { variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } } } },
          pagos: true,
        },
      });
    });

    res.status(201).json({ ...resultado, ...calcularSaldo(resultado) });
  })
);

// POST /apartados/:id/cancelar - solo si sigue ACTIVO; regresa el stock a
// cada sucursal de donde salió. Los pagos ya recibidos NO se reembolsan
// automáticamente aquí (eso se maneja aparte, en efectivo/físico con el
// cliente) — el registro queda como referencia de cuánto se le debe devolver.
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_APARTADOS),
  asyncHandler(async (req, res) => {
    const apartadoId = Number(req.params.id);

    const apartado = await prisma.apartado.findUnique({ where: { id: apartadoId }, include: { items: true } });
    if (!apartado) return res.status(404).json({ error: 'Apartado no encontrado.' });
    if (!esAdmin(req.usuario.rol) && apartado.sucursalVentaId !== req.usuario.sucursalId) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar este apartado.' });
    }
    if (apartado.estado !== 'ACTIVO') {
      return res.status(409).json({ error: 'Solo se pueden cancelar apartados activos.' });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      for (const item of apartado.items) {
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
            motivo: `Cancelación apartado ${apartado.folio}`,
            usuarioId: req.usuario.id,
            proveedorId: item.proveedorId,
          },
        });
      }

      return tx.apartado.update({ where: { id: apartadoId }, data: { estado: 'CANCELADO' } });
    });

    res.json(actualizado);
  })
);

module.exports = router;
