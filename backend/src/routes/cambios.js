const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen } = require('../config/cloudinary');
const { verificarBajoStockYNotificar } = require('../utils/bajoStock');

const router = express.Router();

// ---------------------------------------------------------------------------
// Cambios de producto (no reembolsos)
// ---------------------------------------------------------------------------
//
// Política de negocio (ver comentario junto a los modelos Cambio/CambioItem
// en schema.prisma):
//  - Solo se cambia mercancía por mercancía, nunca se devuelve dinero.
//  - Motivos válidos: DEFECTUOSO, NO_LE_GUSTO, NO_QUEDO.
//  - Si el total devuelto es mayor al total nuevo, el saldo a favor del
//    cliente se debe cubrir con más producto EN LA MISMA VISITA — el
//    servidor rechaza el cambio si, ya sumado todo, sigue quedando saldo a
//    favor (diferencia negativa). No existe ningún saldo/vale pendiente.
//  - Si el total nuevo es mayor, el cliente paga la diferencia (mismo
//    mecanismo de método de pago que una Venta).
//
// Mismos roles que operan el punto de venta (ver ROLES_VENTAS en
// routes/ventas.js): quien puede vender puede hacer un cambio.
const ROLES_CAMBIOS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

// Mismo criterio que resolverSucursalId en routes/ventas.js: ADMIN/DESARROLLO
// pueden registrar/consultar cambios de cualquier sucursal (la que manden),
// VENTAS siempre queda forzado a la suya.
function resolverSucursalId(req, sucursalIdSolicitada) {
  if (esAdmin(req.usuario.rol)) return sucursalIdSolicitada;
  if (!req.usuario.sucursalId) {
    const err = new Error('SIN_SUCURSAL_ASIGNADA');
    err.status = 400;
    throw err;
  }
  return req.usuario.sucursalId;
}

const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: {
    orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
    select: { url: true, color: true, esPrincipal: true },
  },
};

const CAMBIO_INCLUDE = {
  items: {
    include: {
      variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
      proveedor: { select: { id: true, nombre: true } },
    },
    orderBy: { id: 'asc' },
  },
  usuario: { select: { nombre: true } },
  sucursal: { select: { id: true, nombre: true } },
  cuentaTransferencia: { select: { nombre: true } },
  ventaOrigen: { select: { id: true, folio: true } },
};

// GET /cambios - listado (mismo criterio que GET /ventas: VENTAS ve los
// cambios que ella misma registró, ADMIN/DESARROLLO ven todo, con filtro
// opcional ?sucursalId=).
router.get(
  '/',
  requireAuth,
  requireRole(...ROLES_CAMBIOS),
  asyncHandler(async (req, res) => {
    const { sucursalId } = req.query;
    const cambios = await prisma.cambio.findMany({
      where: {
        ...(esAdmin(req.usuario.rol) ? {} : { usuarioId: req.usuario.id }),
        ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
      },
      include: CAMBIO_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(cambios);
  })
);

const motivoEnum = z.enum(['DEFECTUOSO', 'NO_LE_GUSTO', 'NO_QUEDO']);

const itemDevueltoSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  // Lo que el cliente pagó originalmente por este artículo — no se asume
  // igual al precio de venta actual del producto (pudo cambiar desde
  // entonces), así que se captura explícito en vez de recalcularlo.
  precioUnitario: z.number().nonnegative(),
  proveedorId: z.number().int().optional(),
  motivo: motivoEnum,
  motivoDetalle: z.string().trim().max(300).optional(),
});

const itemNuevoSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
  proveedorId: z.number().int().optional(),
});

const cambioSchema = z
  .object({
    sucursalId: z.number().int().optional(),
    // Venta de la que proviene el producto devuelto — opcional, para poder
    // registrar cambios de ventas de mostrador sin folio a la mano.
    ventaOrigenId: z.number().int().optional(),
    cliente: z.string().trim().max(200).optional(),
    clienteTelefono: z.string().trim().optional(),
    notas: z.string().trim().max(500).optional(),
    itemsDevueltos: z.array(itemDevueltoSchema).min(1, 'Agrega al menos un producto que el cliente devuelve.'),
    itemsNuevos: z.array(itemNuevoSchema).min(1, 'Agrega al menos un producto nuevo que se lleva el cliente.'),
    // Solo aplica cuando el total nuevo es mayor al devuelto (el cliente
    // paga la diferencia) — si el cambio queda exacto o a favor del
    // cliente, el servidor ignora estos campos.
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
    cuentaTransferenciaId: z.number().int().optional(),
    efectivoRecibido: z.number().nonnegative().optional(),
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  });

// POST /cambios - registra un cambio de producto y ajusta inventario de la
// sucursal en la misma transacción.
//
// Se envía como multipart/form-data (igual que POST /ventas):
//  - campo de texto "datos": JSON con el cuerpo descrito en cambioSchema.
//  - campo de archivo "comprobante": solo si metodoPago = TRANSFERENCIA Y
//    el cambio termina con diferencia > 0 (el cliente paga esa diferencia).
router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_CAMBIOS),
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

    const parsed = cambioSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const {
      ventaOrigenId,
      cliente,
      clienteTelefono,
      notas,
      itemsDevueltos,
      itemsNuevos,
      metodoPago,
      cuentaTransferenciaId,
      efectivoRecibido,
    } = parsed.data;

    let sucursalId;
    try {
      sucursalId = resolverSucursalId(req, parsed.data.sucursalId);
    } catch (err) {
      if (err.message === 'SIN_SUCURSAL_ASIGNADA') {
        return res.status(400).json({
          error: 'Tu usuario no tiene una sucursal asignada. Pide a un administrador que te asigne una para poder registrar cambios.',
        });
      }
      throw err;
    }
    if (!sucursalId) {
      return res.status(400).json({ error: 'sucursalId es requerido.' });
    }

    if (ventaOrigenId) {
      const ventaOrigen = await prisma.venta.findUnique({ where: { id: ventaOrigenId } });
      if (!ventaOrigen) {
        return res.status(400).json({ error: 'La venta de origen indicada no existe.' });
      }
    }

    // El método de pago de la diferencia (si la llega a haber) se resuelve
    // hasta dentro de la transacción, una vez sumados los renglones — pero
    // la cuenta de transferencia y el comprobante se validan/suben aquí
    // fuera, igual que en POST /ventas, porque subir a Cloudinary no puede
    // ir dentro de una transacción de base de datos. Si al final el cambio
    // no requiere pago (diferencia <= 0), esto simplemente no se usa.
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
      const cambio = await prisma.$transaction(async (tx) => {
        let totalDevueltoCentavos = 0;
        const devueltosData = [];
        // Solo los renglones que sí vuelven a existencias vendibles generan
        // movimiento de inventario (ver CambioItem.reingresado) — un
        // producto DEFECTUOSO nunca tocó Existencia, así que tampoco hay
        // nada que mover ahí.
        const movimientosEntrada = [];

        for (const item of itemsDevueltos) {
          const variante = await tx.productoVariante.findUnique({ where: { id: item.varianteId } });
          if (!variante) throw new Error(`VARIANTE_NO_ENCONTRADA:${item.varianteId}`);

          const subtotalCentavos = Math.round(item.cantidad * item.precioUnitario * 100);
          totalDevueltoCentavos += subtotalCentavos;

          const reingresado = item.motivo !== 'DEFECTUOSO';
          if (reingresado) {
            const existencia = await tx.existencia.findFirst({
              where: { sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId ?? null },
            });
            if (existencia) {
              await tx.existencia.update({
                where: { id: existencia.id },
                data: { stockActual: { increment: item.cantidad } },
              });
            } else {
              await tx.existencia.create({
                data: {
                  sucursalId,
                  varianteId: item.varianteId,
                  proveedorId: item.proveedorId ?? null,
                  stockActual: item.cantidad,
                  stockMinimo: 0,
                },
              });
            }
            movimientosEntrada.push({ varianteId: item.varianteId, cantidad: item.cantidad, proveedorId: item.proveedorId ?? null });
          }

          devueltosData.push({
            direccion: 'DEVUELTO',
            varianteId: item.varianteId,
            proveedorId: item.proveedorId ?? null,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: subtotalCentavos / 100,
            motivo: item.motivo,
            motivoDetalle: item.motivoDetalle || null,
            reingresado,
          });
        }

        let totalNuevoCentavos = 0;
        const nuevosData = [];
        const movimientosSalida = [];

        for (const item of itemsNuevos) {
          const existencia = await tx.existencia.findFirst({
            where: { sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId ?? null },
            include: { variante: true },
          });
          if (!existencia) throw new Error(`SIN_EXISTENCIA:${item.varianteId}`);
          if (existencia.stockActual < item.cantidad) {
            throw new Error(`STOCK_INSUFICIENTE:${existencia.variante.sku}`);
          }

          const subtotalCentavos = Math.round(item.cantidad * item.precioUnitario * 100);
          totalNuevoCentavos += subtotalCentavos;

          await tx.existencia.update({
            where: { id: existencia.id },
            data: { stockActual: { decrement: item.cantidad } },
          });
          movimientosSalida.push({ varianteId: item.varianteId, cantidad: item.cantidad, proveedorId: item.proveedorId ?? null });

          nuevosData.push({
            direccion: 'ENTREGADO',
            varianteId: item.varianteId,
            proveedorId: item.proveedorId ?? null,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: subtotalCentavos / 100,
          });
        }

        // diferencia = totalNuevo - totalDevuelto. Negativa = saldo a favor
        // del cliente sin cubrir todavía: por política de negocio esto NO
        // se puede guardar, el cambio se rechaza completo (nada de lo de
        // arriba queda aplicado, al estar todo dentro de la transacción) y
        // el cajero debe agregar más producto antes de reintentar.
        const diferenciaCentavos = totalNuevoCentavos - totalDevueltoCentavos;
        if (diferenciaCentavos < 0) {
          throw new Error(`SALDO_A_FAVOR_PENDIENTE:${(Math.abs(diferenciaCentavos) / 100).toFixed(2)}`);
        }

        let metodoPagoFinal = null;
        let cuentaTransferenciaIdFinal = null;
        let comprobanteUrlFinal = null;
        let comprobantePublicIdFinal = null;
        let efectivoRecibidoFinal = null;

        if (diferenciaCentavos > 0) {
          metodoPagoFinal = metodoPago;
          if (metodoPagoFinal === 'TRANSFERENCIA') {
            cuentaTransferenciaIdFinal = cuentaTransferenciaId;
            comprobanteUrlFinal = comprobanteUrl;
            comprobantePublicIdFinal = comprobantePublicId;
          }
          if (metodoPagoFinal === 'EFECTIVO' && efectivoRecibido !== undefined) {
            const efectivoCentavos = Math.round(efectivoRecibido * 100);
            if (efectivoCentavos < diferenciaCentavos) {
              throw new Error(`EFECTIVO_INSUFICIENTE:${((diferenciaCentavos - efectivoCentavos) / 100).toFixed(2)}`);
            }
            efectivoRecibidoFinal = efectivoRecibido;
          }
        }

        const folio = `C-${Date.now()}`;

        const creado = await tx.cambio.create({
          data: {
            folio,
            sucursalId,
            usuarioId: req.usuario.id,
            ventaOrigenId: ventaOrigenId ?? null,
            cliente: cliente || null,
            clienteTelefono: clienteTelefono || null,
            totalDevuelto: totalDevueltoCentavos / 100,
            totalNuevo: totalNuevoCentavos / 100,
            diferencia: diferenciaCentavos / 100,
            metodoPago: metodoPagoFinal,
            cuentaTransferenciaId: cuentaTransferenciaIdFinal,
            comprobanteUrl: comprobanteUrlFinal,
            comprobantePublicId: comprobantePublicIdFinal,
            efectivoRecibido: efectivoRecibidoFinal,
            notas: notas || null,
            items: { create: [...devueltosData, ...nuevosData] },
          },
        });

        // Los movimientos de inventario se crean hasta ahora porque
        // necesitan el id del cambio ya generado (para trazabilidad, ver
        // MovimientoInventario.cambioId).
        for (const m of movimientosEntrada) {
          await tx.movimientoInventario.create({
            data: {
              sucursalId,
              varianteId: m.varianteId,
              tipo: 'CAMBIO_ENTRADA',
              cantidad: m.cantidad,
              motivo: `Cambio ${creado.folio} - producto devuelto por el cliente`,
              usuarioId: req.usuario.id,
              proveedorId: m.proveedorId,
              cambioId: creado.id,
            },
          });
        }
        for (const m of movimientosSalida) {
          await tx.movimientoInventario.create({
            data: {
              sucursalId,
              varianteId: m.varianteId,
              tipo: 'CAMBIO_SALIDA',
              cantidad: -m.cantidad,
              motivo: `Cambio ${creado.folio} - producto nuevo entregado`,
              usuarioId: req.usuario.id,
              proveedorId: m.proveedorId,
              cambioId: creado.id,
            },
          });
        }

        return tx.cambio.findUnique({ where: { id: creado.id }, include: CAMBIO_INCLUDE });
      });

      // Best-effort, en segundo plano: si alguna variante nueva entregada
      // quedó en o bajo su mínimo, avisa a quien le toca reabastecerla
      // (mismo mecanismo que POST /ventas) — nunca debe tumbar el registro
      // del cambio si algo aquí falla.
      verificarBajoStockYNotificar(
        itemsNuevos.map((i) => ({ sucursalId, varianteId: i.varianteId }))
      ).catch((err) => console.error('Error verificando bajo stock tras el cambio:', err));

      res.status(201).json(cambio);
    } catch (err) {
      if (err.message.startsWith('VARIANTE_NO_ENCONTRADA')) {
        return res.status(409).json({ error: 'Una de las variantes devueltas no existe.' });
      }
      if (err.message.startsWith('SIN_EXISTENCIA')) {
        return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en esta sucursal.' });
      }
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
      }
      if (err.message.startsWith('SALDO_A_FAVOR_PENDIENTE')) {
        return res.status(400).json({
          error: `Todavía queda un saldo a favor del cliente de $${err.message.split(':')[1]}. Agrega otro producto para cubrirlo antes de terminar el cambio — no se pueden hacer reembolsos.`,
          code: 'SALDO_A_FAVOR_PENDIENTE',
        });
      }
      if (err.message.startsWith('EFECTIVO_INSUFICIENTE')) {
        return res.status(400).json({ error: `El efectivo recibido no alcanza. Faltan $${err.message.split(':')[1]}.` });
      }
      throw err;
    }
  })
);

// POST /cambios/:id/cancelar - deshace un cambio ya registrado y revierte
// el inventario exactamente al estado anterior (mismo criterio que POST
// /ventas/:id/cancelar).
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const cambioId = Number(req.params.id);

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const c = await tx.cambio.findUnique({ where: { id: cambioId }, include: { items: true } });
        if (!c) throw new Error('CAMBIO_NO_ENCONTRADO');
        if (c.estado === 'CANCELADO') return c;

        for (const item of c.items) {
          if (item.direccion === 'ENTREGADO') {
            // Se le entregó al cliente: al cancelar, ese producto regresa a
            // existencias vendibles (se asume que también regresa físico).
            const existencia = await tx.existencia.findFirst({
              where: { sucursalId: c.sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId },
            });
            if (existencia) {
              await tx.existencia.update({
                where: { id: existencia.id },
                data: { stockActual: { increment: item.cantidad } },
              });
            } else {
              await tx.existencia.create({
                data: {
                  sucursalId: c.sucursalId,
                  varianteId: item.varianteId,
                  proveedorId: item.proveedorId,
                  stockActual: item.cantidad,
                  stockMinimo: 0,
                },
              });
            }
            await tx.movimientoInventario.create({
              data: {
                sucursalId: c.sucursalId,
                varianteId: item.varianteId,
                tipo: 'DEVOLUCION',
                cantidad: item.cantidad,
                motivo: `Cancelación cambio ${c.folio}`,
                usuarioId: req.usuario.id,
                proveedorId: item.proveedorId,
                cambioId: c.id,
              },
            });
          } else if (item.direccion === 'DEVUELTO' && item.reingresado) {
            // Había vuelto a existencias vendibles: al cancelar el cambio
            // se le regresa físicamente al cliente, así que sale de nuevo.
            const existencia = await tx.existencia.findFirst({
              where: { sucursalId: c.sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId },
            });
            if (!existencia || existencia.stockActual < item.cantidad) {
              throw new Error(`STOCK_INSUFICIENTE_CANCELAR:${item.varianteId}`);
            }
            await tx.existencia.update({
              where: { id: existencia.id },
              data: { stockActual: { decrement: item.cantidad } },
            });
            await tx.movimientoInventario.create({
              data: {
                sucursalId: c.sucursalId,
                varianteId: item.varianteId,
                tipo: 'AJUSTE',
                cantidad: -item.cantidad,
                motivo: `Cancelación cambio ${c.folio}`,
                usuarioId: req.usuario.id,
                proveedorId: item.proveedorId,
                cambioId: c.id,
              },
            });
          }
          // DEVUELTO con reingresado = false (defectuoso): nunca tocó
          // existencias, no hay nada que revertir en inventario.
        }

        return tx.cambio.update({ where: { id: cambioId }, data: { estado: 'CANCELADO' }, include: CAMBIO_INCLUDE });
      });

      if (!resultado) return res.status(404).json({ error: 'Cambio no encontrado.' });
      res.json(resultado);
    } catch (err) {
      if (err.message === 'CAMBIO_NO_ENCONTRADO') {
        return res.status(404).json({ error: 'Cambio no encontrado.' });
      }
      if (err.message.startsWith('STOCK_INSUFICIENTE_CANCELAR')) {
        return res.status(409).json({
          error:
            'No se puede cancelar: no queda suficiente stock del producto que el cliente había devuelto (probablemente ya se vendió a alguien más).',
        });
      }
      throw err;
    }
  })
);

module.exports = router;
