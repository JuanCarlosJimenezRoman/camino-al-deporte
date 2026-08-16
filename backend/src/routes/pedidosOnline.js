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

// Quién administra los pedidos de la tienda en línea (origen TIENDA_ONLINE):
// pago por SPEI a la cuenta del negocio, aplicar descuentos, etc. — se
// queda solo para administración, igual que siempre.
const ROLES_PEDIDOS = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

// Quién puede capturar y operar un pedido MANUAL (llegó por WhatsApp,
// Instagram, etc. — ver Pedido.origen en schema.prisma): además de
// administración, también VENTAS, que es quien normalmente atiende esas
// conversaciones. VENTAS nunca ve ni toca un pedido con origen
// TIENDA_ONLINE (ver puedeGestionarPedido) — eso sigue siendo exclusivo de
// ROLES_PEDIDOS, sin cambios respecto al comportamiento anterior.
const ROLES_PEDIDOS_MANUAL = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];

function esAdminPedidos(rol) {
  return ROLES_PEDIDOS.includes(rol);
}

// Un pedido TIENDA_ONLINE solo lo puede gestionar administración, tal como
// era antes de que existieran los pedidos manuales. Un pedido de otro
// origen (manual) lo puede gestionar administración o VENTAS.
function puedeGestionarPedido(rol, pedido) {
  if (esAdminPedidos(rol)) return true;
  return ROLES_PEDIDOS_MANUAL.includes(rol) && pedido.origen !== 'TIENDA_ONLINE';
}

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
  creadoPor: { select: { nombre: true } },
};

// GET /pedidos-online?estado= - lista pedidos, más recientes primero.
// ADMIN_PRINCIPAL/DESARROLLO ven todos (tienda en línea + manuales); VENTAS
// solo ve los manuales (origen distinto de TIENDA_ONLINE) — los de la
// tienda en línea siguen siendo exclusivos de administración, igual que
// antes de que existiera este rol aquí.
router.get('/', requireAuth, requireRole(...ROLES_PEDIDOS_MANUAL), asyncHandler(async (req, res) => {
  const { estado } = req.query;
  const pedidos = await prisma.pedido.findMany({
    where: {
      ...(estado ? { estado: String(estado) } : {}),
      ...(esAdminPedidos(req.usuario.rol) ? {} : { origen: { not: 'TIENDA_ONLINE' } }),
    },
    include: PEDIDO_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(pedidos);
}));

// GET /pedidos-online/:id
router.get('/:id', requireAuth, requireRole(...ROLES_PEDIDOS_MANUAL), asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: PEDIDO_INCLUDE,
  });
  if (!pedido || !puedeGestionarPedido(req.usuario.rol, pedido)) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  res.json(pedido);
}));

// ---------------------------------------------------------------------------
// Pedidos manuales: alguien del negocio captura un pedido que llegó por otro
// canal (WhatsApp, Instagram, Facebook, teléfono) en vez del checkout de la
// tienda en línea. Reutiliza el mismo modelo Pedido — misma dirección de
// envío, mismo ciclo de estados — pero aquí el vendedor elige a mano de qué
// sucursal sale cada artículo y a qué precio (igual que en Apartados, ver
// routes/apartados.js), en vez de la asignación/precio automáticos que usa
// el checkout de la tienda en línea.
// ---------------------------------------------------------------------------

const itemManualSchema = z.object({
  varianteId: z.number().int(),
  proveedorId: z.number().int().nullable(),
  sucursalStockId: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
});

const pedidoManualSchema = z
  .object({
    origen: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TELEFONO', 'OTRO']),
    clienteId: z.number().int().optional(),
    clienteNuevo: z
      .object({
        nombre: z.string().min(1),
        telefono: z.string().min(1),
        email: z.string().optional(),
      })
      .optional(),
    items: z.array(itemManualSchema).min(1),
    destinatario: z.string().min(1),
    telefonoContacto: z.string().min(1),
    calle: z.string().min(1),
    numeroExt: z.string().min(1),
    numeroInt: z.string().optional(),
    colonia: z.string().min(1),
    municipio: z.string().min(1),
    estadoMx: z.string().min(1),
    codigoPostal: z.string().min(1),
    referencias: z.string().optional(),
    notas: z.string().optional(),
    costoEnvio: z.number().nonnegative().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
    cuentaTransferenciaId: z.number().int().optional(),
    // El vendedor ya confirmó que el dinero llegó (efectivo en mano, tarjeta
    // ya cobrada, o transferencia ya verificada por fuera) y quiere que el
    // pedido nazca PAGADO en vez de esperar el flujo normal de comprobante.
    marcarPagado: z.boolean().optional(),
  })
  .refine((d) => d.clienteId || d.clienteNuevo, {
    message: 'Indica un cliente existente (clienteId) o los datos de uno nuevo (clienteNuevo).',
    path: ['clienteId'],
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  });

const ORIGEN_LABEL = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TELEFONO: 'Teléfono',
  OTRO: 'otro canal',
};

// POST /pedidos-online - captura un pedido manual (WhatsApp/Instagram/etc.).
// Descuenta el stock de inmediato, igual que un pedido de la tienda en línea
// o un apartado (así dos clientes no "compran" la misma última pieza).
// Acepta multipart/form-data con un campo de texto "datos" (JSON) y un
// archivo opcional "comprobante" (si ya se tiene la captura de pantalla que
// mandó el cliente por chat); también acepta JSON normal si no hay
// comprobante que subir todavía.
router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_PEDIDOS_MANUAL),
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

    const parsed = pedidoManualSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const { origen, clienteId, clienteNuevo, items, costoEnvio, metodoPago, cuentaTransferenciaId, marcarPagado, ...direccion } =
      parsed.data;

    if (metodoPago === 'TRANSFERENCIA') {
      const cuenta = await prisma.cuentaTransferencia.findUnique({ where: { id: cuentaTransferenciaId } });
      if (!cuenta || !cuenta.activo) {
        return res.status(400).json({ error: 'La cuenta de transferencia indicada no existe o está inactiva.' });
      }
    }

    // Subir el comprobante (si viene) antes de tocar inventario, igual que
    // en Apartados.
    let comprobanteUrl = null;
    let comprobantePublicId = null;
    if (req.file) {
      const subida = await subirImagen(req.file.buffer, 'comprobantes');
      comprobanteUrl = subida.url;
      comprobantePublicId = subida.publicId;
    }

    try {
      const pedido = await prisma.$transaction(async (tx) => {
        // Cliente: existente o alta rápida (evita duplicar por teléfono) —
        // mismo criterio que Apartados.
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

        let subtotalArticulos = 0;
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
          subtotalArticulos += subtotal;

          await tx.existencia.update({
            where: { id: existencia.id },
            data: { stockActual: { decrement: item.cantidad } },
          });

          itemsData.push({ ...item, subtotal });
        }

        const envio = costoEnvio || 0;
        const total = subtotalArticulos + envio;
        const folio = `PED-${Date.now()}`;
        const referenciaPago = folio.replace('PED-', 'PED');

        let estadoInicial = 'PENDIENTE_PAGO';
        if (marcarPagado) estadoInicial = 'PAGADO';
        else if (comprobanteUrl) estadoInicial = 'EN_VALIDACION';

        const nuevo = await tx.pedido.create({
          data: {
            folio,
            clienteId: cliente.id,
            origen,
            creadoPorId: req.usuario.id,
            metodoPago,
            estado: estadoInicial,
            total,
            costoEnvio: envio,
            ...direccion,
            cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? cuentaTransferenciaId : null,
            referenciaPago,
            comprobanteUrl,
            comprobantePublicId,
            comprobanteSubidoAt: comprobanteUrl ? new Date() : null,
            ...(estadoInicial === 'PAGADO' ? { validadoPorId: req.usuario.id, validadoAt: new Date() } : {}),
            items: { create: itemsData },
          },
          include: PEDIDO_INCLUDE,
        });

        for (const it of itemsData) {
          await tx.movimientoInventario.create({
            data: {
              sucursalId: it.sucursalStockId,
              varianteId: it.varianteId,
              tipo: 'PEDIDO_ONLINE',
              cantidad: -it.cantidad,
              motivo: `Pedido manual (${ORIGEN_LABEL[origen]}) ${folio}`,
              usuarioId: req.usuario.id,
              pedidoId: nuevo.id,
              proveedorId: it.proveedorId,
            },
          });
        }

        return nuevo;
      });

      // Best-effort y en segundo plano: la sucursal elegida por el vendedor
      // pudo haber quedado en o bajo su mínimo (ver utils/bajoStock.js).
      verificarBajoStockYNotificar(items.map((i) => ({ sucursalId: i.sucursalStockId, varianteId: i.varianteId }))).catch(
        (err) => console.error('Error verificando bajo stock tras el pedido manual:', err)
      );

      res.status(201).json(pedido);
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

// POST /pedidos-online/:id/comprobante - el vendedor sube (a nombre del
// cliente) la captura de la transferencia que le mandaron por WhatsApp/
// Instagram. Solo para pedidos manuales — uno de la tienda en línea sigue
// subiendo su comprobante desde la cuenta del cliente (ver POST
// /tienda/pedidos/:id/comprobante).
router.post(
  '/:id/comprobante',
  requireAuth,
  requireRole(...ROLES_PEDIDOS_MANUAL),
  manejarSubidaImagen('comprobante'),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.origen === 'TIENDA_ONLINE' || !puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    if (!['PENDIENTE_PAGO', 'EN_VALIDACION'].includes(pedido.estado)) {
      return res.status(409).json({ error: 'Este pedido ya no admite subir un comprobante.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Falta la foto del comprobante (campo "comprobante").' });
    }

    const subida = await subirImagen(req.file.buffer, 'comprobantes');

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        comprobanteUrl: subida.url,
        comprobantePublicId: subida.publicId,
        comprobanteSubidoAt: new Date(),
        comprobanteRechazadoMotivo: null,
        estado: 'EN_VALIDACION',
      },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

// POST /pedidos-online/:id/marcar-pagado - para un pedido manual pagado en
// efectivo/tarjeta, o una transferencia que el vendedor ya confirmó por su
// cuenta: salta directo a PAGADO sin pasar por el comprobante+validación de
// /:id/validar-pago (que sigue siendo el camino para SPEI a la cuenta del
// negocio). Solo para pedidos manuales.
router.post(
  '/:id/marcar-pagado',
  requireAuth,
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (pedido.origen === 'TIENDA_ONLINE' || !puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    if (!['PENDIENTE_PAGO', 'EN_VALIDACION'].includes(pedido.estado)) {
      return res.status(409).json({ error: 'Solo se puede marcar como pagado un pedido pendiente de pago.' });
    }

    const actualizado = await prisma.pedido.update({
      where: { id: pedido.id },
      data: { estado: 'PAGADO', validadoPorId: req.usuario.id, validadoAt: new Date() },
      include: PEDIDO_INCLUDE,
    });
    res.json(actualizado);
  })
);

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
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const parsed = validarPagoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
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
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const parsed = rechazoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Indica el motivo del rechazo.' });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
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
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const parsed = envioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
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
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
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
  requireRole(...ROLES_PEDIDOS_MANUAL),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: true },
    });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (!puedeGestionarPedido(req.usuario.rol, pedido)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
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
