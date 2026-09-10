const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen } = require('../config/cloudinary');
const { verificarBajoStockYNotificar } = require('../utils/bajoStock');
const { generarComprobanteCambio } = require('../utils/cambioPdf');

const router = express.Router();

// ---------------------------------------------------------------------------
// Cambios de producto (no reembolsos en efectivo)
// ---------------------------------------------------------------------------
//
// Política de negocio (ver comentario junto a los modelos Cambio/CambioItem
// en schema.prisma, y docs/CAMBIOS_SALDO_A_FAVOR.md):
//  - Solo se cambia mercancía por mercancía o saldo a favor, nunca se
//    devuelve dinero en efectivo.
//  - Motivos válidos: DEFECTUOSO, NO_LE_GUSTO, NO_QUEDO.
//  - Hacer un cambio requiere identificar al cliente (registrado, mínimo
//    nombre y teléfono) — ver clienteId/clienteNuevo abajo.
//  - Un renglón (devuelto o entregado) puede ser un producto del catálogo
//    (varianteId) o uno no registrado (descripcionLibre) — nunca ambos. Un
//    renglón libre nunca mueve inventario (no hay Existencia que ajustar).
//  - Si el total devuelto es mayor al total nuevo, la diferencia se abona
//    como saldo a favor a la cuenta del cliente (Cliente.saldoFavor) — ya
//    no se rechaza el cambio ni se obliga a cubrirlo con más producto en la
//    misma visita. Ese saldo se puede gastar después en otro Cambio o en
//    una Venta (Venta.saldoAplicado).
//  - Si el total nuevo es mayor, el cliente paga la diferencia — con saldo
//    a favor que ya tuviera (saldoAplicado), con el método de pago normal
//    de una Venta, o una combinación de ambos.
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
  cliente: { select: { id: true, nombre: true, telefono: true, saldoFavor: true } },
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

// GET /cambios/:id/pdf - genera (al vuelo, no se guarda) el comprobante en
// PDF del cambio, con el desglose de lo devuelto/entregado y el resultado
// (pagó diferencia o se le generó saldo a favor). Mismo criterio de
// visibilidad que el listado: VENTAS solo puede descargar los cambios que
// ella misma registró.
router.get(
  '/:id/pdf',
  requireAuth,
  requireRole(...ROLES_CAMBIOS),
  asyncHandler(async (req, res) => {
    const cambioId = Number(req.params.id);
    const cambio = await prisma.cambio.findUnique({
      where: { id: cambioId },
      include: { ...CAMBIO_INCLUDE, movimientosSaldo: true },
    });
    if (!cambio) return res.status(404).json({ error: 'Cambio no encontrado.' });
    if (!esAdmin(req.usuario.rol) && cambio.usuarioId !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este cambio.' });
    }
    const pdfBuffer = await generarComprobanteCambio(cambio);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="cambio-${cambio.folio}.pdf"`);
    res.send(pdfBuffer);
  })
);

const motivoEnum = z.enum(['DEFECTUOSO', 'NO_LE_GUSTO', 'NO_QUEDO']);

const itemDevueltoSchema = z
  .object({
    varianteId: z.number().int().optional(),
    // Producto que el cliente trae y NO está dado de alta en el catálogo
    // (ej. lo compró en otro lado, o antes de usar este sistema) — ver
    // migración 20260910090000_saldo_favor_cliente.
    descripcionLibre: z
      .string()
      .trim()
      .min(3, 'Describe qué producto devuelve el cliente (mínimo 3 caracteres).')
      .max(200)
      .optional(),
    cantidad: z.number().int().positive(),
    // Lo que el cliente pagó originalmente por este artículo — no se asume
    // igual al precio de venta actual del producto (pudo cambiar desde
    // entonces), así que se captura explícito en vez de recalcularlo.
    precioUnitario: z.number().nonnegative(),
    proveedorId: z.number().int().optional(),
    motivo: motivoEnum,
    motivoDetalle: z.string().trim().max(300).optional(),
  })
  .refine((d) => !!d.varianteId !== !!d.descripcionLibre, {
    message:
      'Cada renglón devuelto debe traer varianteId (producto del catálogo) o descripcionLibre (producto no registrado), pero no ambos.',
    path: ['varianteId'],
  });

const itemNuevoSchema = z
  .object({
    varianteId: z.number().int().optional(),
    // Producto que se le entrega al cliente y NO está dado de alta en el
    // catálogo (ej. una pieza única, algo de otra marca). Nunca descuenta
    // inventario — el cajero responde por que exista físico.
    descripcionLibre: z
      .string()
      .trim()
      .min(3, 'Describe qué producto se lleva el cliente (mínimo 3 caracteres).')
      .max(200)
      .optional(),
    cantidad: z.number().int().positive(),
    precioUnitario: z.number().nonnegative(),
    proveedorId: z.number().int().optional(),
  })
  .refine((d) => !!d.varianteId !== !!d.descripcionLibre, {
    message:
      'Cada renglón nuevo debe traer varianteId (producto del catálogo) o descripcionLibre (producto no registrado), pero no ambos.',
    path: ['varianteId'],
  });

const cambioSchema = z
  .object({
    sucursalId: z.number().int().optional(),
    // Venta de la que proviene el producto devuelto — opcional, para poder
    // registrar cambios de ventas de mostrador sin folio a la mano.
    ventaOrigenId: z.number().int().optional(),
    // Cliente obligatorio (ver POST /cambios más abajo): existente o alta
    // rápida, mismo patrón que POST /apartados.
    clienteId: z.number().int().optional(),
    clienteNuevo: z
      .object({
        nombre: z.string().min(1),
        telefono: z.string().min(1),
        email: z.string().optional(),
      })
      .optional(),
    notas: z.string().trim().max(500).optional(),
    itemsDevueltos: z.array(itemDevueltoSchema).min(1, 'Agrega al menos un producto que el cliente devuelve.'),
    itemsNuevos: z.array(itemNuevoSchema).min(1, 'Agrega al menos un producto nuevo que se lleva el cliente.'),
    // Cuánto de la diferencia a favor de la tienda (cuando el producto
    // nuevo vale más) se cubre con saldo a favor que el cliente ya tuviera
    // de antes — el resto, si queda algo, se paga con metodoPago igual que
    // antes. Si el cambio queda exacto o a favor del cliente, se ignora.
    saldoAplicado: z.number().nonnegative().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
    cuentaTransferenciaId: z.number().int().optional(),
    efectivoRecibido: z.number().nonnegative().optional(),
  })
  .refine((d) => d.clienteId || d.clienteNuevo, {
    message: 'Indica un cliente existente (clienteId) o los datos de uno nuevo (clienteNuevo) — es obligatorio para hacer un cambio.',
    path: ['clienteId'],
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  });

// POST /cambios - registra un cambio de producto y ajusta inventario/saldo
// de la sucursal y del cliente en la misma transacción.
//
// Se envía como multipart/form-data (igual que POST /ventas):
//  - campo de texto "datos": JSON con el cuerpo descrito en cambioSchema.
//  - campo de archivo "comprobante": solo si metodoPago = TRANSFERENCIA Y el
//    cambio termina con algo por pagar por transferencia después de aplicar
//    saldo a favor (si el saldo cubre todo, no hace falta).
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
      clienteId,
      clienteNuevo,
      notas,
      itemsDevueltos,
      itemsNuevos,
      saldoAplicado,
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

    // Igual que en POST /ventas: subir a Cloudinary no puede ir dentro de
    // una transacción de base de datos, así que se hace aquí afuera. Si al
    // final el cambio se cubre completo con saldo a favor, esto simplemente
    // no se usa.
    let comprobanteUrl = null;
    let comprobantePublicId = null;
    if (metodoPago === 'TRANSFERENCIA') {
      const cuenta = await prisma.cuentaTransferencia.findUnique({ where: { id: cuentaTransferenciaId } });
      if (!cuenta || !cuenta.activo) {
        return res.status(400).json({ error: 'La cuenta de transferencia indicada no existe o está inactiva.' });
      }
      if (req.file) {
        const subida = await subirImagen(req.file.buffer, 'comprobantes');
        comprobanteUrl = subida.url;
        comprobantePublicId = subida.publicId;
      }
    }

    try {
      const cambio = await prisma.$transaction(async (tx) => {
        // Cliente: existente o alta rápida (evita duplicar por teléfono) —
        // obligatorio para poder hacer un cambio.
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

        let totalDevueltoCentavos = 0;
        const devueltosData = [];
        // Solo los renglones que sí vuelven a existencias vendibles generan
        // movimiento de inventario (ver CambioItem.reingresado) — un
        // producto DEFECTUOSO, o uno que no está en el catálogo, nunca
        // tocó/toca Existencia, así que tampoco hay nada que mover ahí.
        const movimientosEntrada = [];

        for (const item of itemsDevueltos) {
          const subtotalCentavos = Math.round(item.cantidad * item.precioUnitario * 100);
          totalDevueltoCentavos += subtotalCentavos;

          if (item.varianteId) {
            const variante = await tx.productoVariante.findUnique({ where: { id: item.varianteId } });
            if (!variante) throw new Error(`VARIANTE_NO_ENCONTRADA:${item.varianteId}`);

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
          } else {
            // Producto no registrado en el catálogo: no hay ProductoVariante
            // ni Existencia de por medio, así que nunca "reingresa" a
            // inventario sin importar el motivo.
            devueltosData.push({
              direccion: 'DEVUELTO',
              descripcionLibre: item.descripcionLibre,
              proveedorId: item.proveedorId ?? null,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: subtotalCentavos / 100,
              motivo: item.motivo,
              motivoDetalle: item.motivoDetalle || null,
              reingresado: false,
            });
          }
        }

        let totalNuevoCentavos = 0;
        const nuevosData = [];
        const movimientosSalida = [];

        for (const item of itemsNuevos) {
          const subtotalCentavos = Math.round(item.cantidad * item.precioUnitario * 100);
          totalNuevoCentavos += subtotalCentavos;

          if (item.varianteId) {
            const existencia = await tx.existencia.findFirst({
              where: { sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId ?? null },
              include: { variante: true },
            });
            if (!existencia) throw new Error(`SIN_EXISTENCIA:${item.varianteId}`);
            if (existencia.stockActual < item.cantidad) {
              throw new Error(`STOCK_INSUFICIENTE:${existencia.variante.sku}`);
            }

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
          } else {
            // Producto no registrado: se le entrega al cliente sin
            // descontar ninguna Existencia (mismo criterio que un renglón
            // libre en Ventas) — el cajero responde por que exista físico.
            nuevosData.push({
              direccion: 'ENTREGADO',
              descripcionLibre: item.descripcionLibre,
              proveedorId: item.proveedorId ?? null,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: subtotalCentavos / 100,
            });
          }
        }

        // diferencia = totalNuevo - totalDevuelto.
        const diferenciaCentavos = totalNuevoCentavos - totalDevueltoCentavos;

        let metodoPagoFinal = null;
        let cuentaTransferenciaIdFinal = null;
        let comprobanteUrlFinal = null;
        let comprobantePublicIdFinal = null;
        let efectivoRecibidoFinal = null;
        let saldoAplicadoFinal = 0;
        let saldoGeneradoCentavos = 0;
        let saldoClienteResultante = Number(cliente.saldoFavor);

        if (diferenciaCentavos < 0) {
          // El producto nuevo vale menos: la diferencia se abona como saldo
          // a favor del cliente — ya no se rechaza el cambio.
          saldoGeneradoCentavos = Math.abs(diferenciaCentavos);
          saldoClienteResultante = Number(cliente.saldoFavor) + saldoGeneradoCentavos / 100;
          await tx.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: saldoClienteResultante } });
        } else if (diferenciaCentavos > 0) {
          // El producto nuevo vale más: primero se cubre con saldo a favor
          // que el cliente ya tuviera (si mandó saldoAplicado), y lo que
          // falte se paga con el método de pago normal.
          const saldoDisponibleCentavos = Math.round(Number(cliente.saldoFavor) * 100);
          const saldoSolicitadoCentavos = Math.round((saldoAplicado ?? 0) * 100);
          if (saldoSolicitadoCentavos > saldoDisponibleCentavos) {
            throw new Error(`SALDO_INSUFICIENTE:${(saldoDisponibleCentavos / 100).toFixed(2)}`);
          }
          const aplicadoCentavos = Math.min(saldoSolicitadoCentavos, diferenciaCentavos);
          if (aplicadoCentavos > 0) {
            saldoAplicadoFinal = aplicadoCentavos / 100;
            saldoClienteResultante = Number(cliente.saldoFavor) - saldoAplicadoFinal;
            await tx.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: saldoClienteResultante } });
          }

          const restanteCentavos = diferenciaCentavos - aplicadoCentavos;
          if (restanteCentavos > 0) {
            metodoPagoFinal = metodoPago;
            if (metodoPagoFinal === 'TRANSFERENCIA') {
              if (!comprobanteUrl) {
                throw new Error('FALTA_COMPROBANTE');
              }
              cuentaTransferenciaIdFinal = cuentaTransferenciaId;
              comprobanteUrlFinal = comprobanteUrl;
              comprobantePublicIdFinal = comprobantePublicId;
            }
            if (metodoPagoFinal === 'EFECTIVO' && efectivoRecibido !== undefined) {
              const efectivoCentavos = Math.round(efectivoRecibido * 100);
              if (efectivoCentavos < restanteCentavos) {
                throw new Error(`EFECTIVO_INSUFICIENTE:${((restanteCentavos - efectivoCentavos) / 100).toFixed(2)}`);
              }
              efectivoRecibidoFinal = efectivoRecibido;
            }
          }
        }

        const folio = `C-${Date.now()}`;

        const creado = await tx.cambio.create({
          data: {
            folio,
            sucursalId,
            usuarioId: req.usuario.id,
            ventaOrigenId: ventaOrigenId ?? null,
            clienteId: cliente.id,
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

        // Movimientos de saldo (ledger, ver MovimientoSaldoCliente) — se
        // crean hasta ahora porque necesitan el id del cambio ya generado.
        if (saldoGeneradoCentavos > 0) {
          await tx.movimientoSaldoCliente.create({
            data: {
              clienteId: cliente.id,
              tipo: 'ABONO',
              monto: saldoGeneradoCentavos / 100,
              saldoResultante: saldoClienteResultante,
              cambioId: creado.id,
              usuarioId: req.usuario.id,
              sucursalId,
              notas: `Cambio ${creado.folio}: producto nuevo valió menos que el devuelto.`,
            },
          });
        }
        if (saldoAplicadoFinal > 0) {
          await tx.movimientoSaldoCliente.create({
            data: {
              clienteId: cliente.id,
              tipo: 'CONSUMO',
              monto: saldoAplicadoFinal,
              saldoResultante: saldoClienteResultante,
              cambioId: creado.id,
              usuarioId: req.usuario.id,
              sucursalId,
              notas: `Cambio ${creado.folio}: saldo a favor aplicado para cubrir la diferencia.`,
            },
          });
        }

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
      // del cambio si algo aquí falla. Los renglones libres (sin varianteId)
      // no aplican, no hay nada que reabastecer.
      verificarBajoStockYNotificar(
        itemsNuevos.filter((i) => i.varianteId).map((i) => ({ sucursalId, varianteId: i.varianteId }))
      ).catch((err) => console.error('Error verificando bajo stock tras el cambio:', err));

      res.status(201).json(cambio);
    } catch (err) {
      if (err.message === 'CLIENTE_NO_ENCONTRADO') {
        return res.status(404).json({ error: 'Cliente no encontrado.' });
      }
      if (err.message.startsWith('VARIANTE_NO_ENCONTRADA')) {
        return res.status(409).json({ error: 'Una de las variantes devueltas no existe.' });
      }
      if (err.message.startsWith('SIN_EXISTENCIA')) {
        return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en esta sucursal.' });
      }
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
      }
      if (err.message.startsWith('SALDO_INSUFICIENTE')) {
        return res.status(400).json({
          error: `El cliente solo tiene $${err.message.split(':')[1]} de saldo a favor disponible.`,
        });
      }
      if (err.message === 'FALTA_COMPROBANTE') {
        return res.status(400).json({ error: 'Falta la foto del comprobante (campo "comprobante").' });
      }
      if (err.message.startsWith('EFECTIVO_INSUFICIENTE')) {
        return res.status(400).json({ error: `El efectivo recibido no alcanza. Faltan $${err.message.split(':')[1]}.` });
      }
      throw err;
    }
  })
);

// POST /cambios/:id/cancelar - deshace un cambio ya registrado y revierte
// el inventario y el saldo a favor del cliente exactamente al estado
// anterior (mismo criterio que POST /ventas/:id/cancelar).
router.post(
  '/:id/cancelar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const cambioId = Number(req.params.id);

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const c = await tx.cambio.findUnique({
          where: { id: cambioId },
          include: { items: true, movimientosSaldo: true },
        });
        if (!c) throw new Error('CAMBIO_NO_ENCONTRADO');
        if (c.estado === 'CANCELADO') return c;

        // Si el cambio generó saldo a favor (ABONO) o gastó saldo que el
        // cliente ya tenía (CONSUMO), hay que revertirlo — pero solo si el
        // cliente todavía tiene ese saldo disponible (si ya se lo gastó en
        // otra compra, no se puede cancelar sin más).
        for (const mov of c.movimientosSaldo) {
          if (mov.tipo === 'ABONO') {
            const cliente = await tx.cliente.findUnique({ where: { id: mov.clienteId } });
            if (Number(cliente.saldoFavor) < Number(mov.monto)) {
              throw new Error('SALDO_YA_USADO_NO_CANCELABLE');
            }
            const nuevoSaldo = Number(cliente.saldoFavor) - Number(mov.monto);
            await tx.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: nuevoSaldo } });
            await tx.movimientoSaldoCliente.create({
              data: {
                clienteId: cliente.id,
                tipo: 'REVERSA',
                monto: mov.monto,
                saldoResultante: nuevoSaldo,
                cambioId: c.id,
                usuarioId: req.usuario.id,
                sucursalId: c.sucursalId,
                notas: `Cancelación cambio ${c.folio}: revierte saldo a favor generado.`,
              },
            });
          } else if (mov.tipo === 'CONSUMO') {
            const cliente = await tx.cliente.findUnique({ where: { id: mov.clienteId } });
            const nuevoSaldo = Number(cliente.saldoFavor) + Number(mov.monto);
            await tx.cliente.update({ where: { id: cliente.id }, data: { saldoFavor: nuevoSaldo } });
            await tx.movimientoSaldoCliente.create({
              data: {
                clienteId: cliente.id,
                tipo: 'REVERSA',
                monto: mov.monto,
                saldoResultante: nuevoSaldo,
                cambioId: c.id,
                usuarioId: req.usuario.id,
                sucursalId: c.sucursalId,
                notas: `Cancelación cambio ${c.folio}: regresa saldo a favor que se había usado.`,
              },
            });
          }
        }

        for (const item of c.items) {
          if (item.direccion === 'ENTREGADO') {
            if (!item.varianteId) continue; // producto libre: nunca tocó inventario
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
            if (!item.varianteId) continue; // producto libre: nunca tocó inventario
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
          // DEVUELTO con reingresado = false (defectuoso, o producto libre):
          // nunca tocó inventario, no hay nada que revertir ahí.
        }

        return tx.cambio.update({ where: { id: cambioId }, data: { estado: 'CANCELADO' }, include: CAMBIO_INCLUDE });
      });

      if (!resultado) return res.status(404).json({ error: 'Cambio no encontrado.' });
      res.json(resultado);
    } catch (err) {
      if (err.message === 'CAMBIO_NO_ENCONTRADO') {
        return res.status(404).json({ error: 'Cambio no encontrado.' });
      }
      if (err.message === 'SALDO_YA_USADO_NO_CANCELABLE') {
        return res.status(409).json({
          error: 'No se puede cancelar: el cliente ya gastó el saldo a favor que generó este cambio.',
        });
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
