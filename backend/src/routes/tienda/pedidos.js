const express = require('express');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');
const { manejarSubidaImagen, manejarSubidaImagenes } = require('../../middleware/uploadImagen');
const { subirImagen } = require('../../config/cloudinary');

const router = express.Router();

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

const PEDIDO_INCLUDE = {
  items: {
    include: {
      variante: {
        include: {
          producto: { include: IMAGEN_PRINCIPAL_INCLUDE },
          talla: true,
        },
      },
      // Proveedor REAL del bucket del que se descontó este renglón (no el
      // proveedor "por defecto" de la variante) — aquí no hay cajero
      // eligiendo, se asigna con una regla automática al crear el pedido
      // (ver POST / más abajo), pero una vez asignado es el dato exacto.
      proveedor: { select: { id: true, nombre: true, telefono: true } },
      sucursalStock: { select: { nombre: true } },
    },
  },
  cuentaTransferencia: true,
  resena: { include: { fotos: true } },
};

// El pago ya no se cobra directo en la página (los clientes no se sentían
// seguros viendo la cuenta a transferir ahí mismo): en vez de eso se manda al
// cliente por WhatsApp con el proveedor. Si el pedido trae artículos de más
// de un proveedor, se junta todo en una sola conversación con el proveedor
// que más $ representa en ese pedido — no se reparte en varios chats.
function conProveedorPago(pedido) {
  if (!pedido) return pedido;
  const totales = new Map();
  for (const item of pedido.items || []) {
    const proveedor = item.proveedor;
    if (!proveedor) continue;
    const acumulado = totales.get(proveedor.id) || { proveedor, monto: 0 };
    acumulado.monto += Number(item.subtotal);
    totales.set(proveedor.id, acumulado);
  }
  let mejor = null;
  for (const t of totales.values()) {
    if (!mejor || t.monto > mejor.monto) mejor = t;
  }
  return { ...pedido, proveedorPago: mejor ? mejor.proveedor : null };
}

// El botón de WhatsApp del cliente usa el teléfono del proveedor si se pudo
// resolver uno; si no (proveedor sin teléfono, o el pedido no tiene un
// proveedor claro), cae al WhatsApp general de la tienda configurado en el
// dashboard (ver routes/configuracionTienda.js) — así el botón nunca
// desaparece por falta de un dato en un proveedor puntual.
async function conWhatsapp(pedido) {
  const conProveedor = conProveedorPago(pedido);
  const config = await prisma.configuracionTienda.findFirst();
  return { ...conProveedor, whatsappTienda: config?.whatsappTienda || null };
}
async function conWhatsappVarios(pedidos) {
  const config = await prisma.configuracionTienda.findFirst();
  return pedidos.map((p) => ({ ...conProveedorPago(p), whatsappTienda: config?.whatsappTienda || null }));
}

// GET /tienda/pedidos - pedidos del cliente autenticado
router.get('/', requireClienteAuth, asyncHandler(async (req, res) => {
  const pedidos = await prisma.pedido.findMany({
    where: { clienteId: req.cliente.id },
    include: PEDIDO_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(await conWhatsappVarios(pedidos));
}));

// GET /tienda/pedidos/:id - detalle, solo si es del cliente autenticado
router.get('/:id', requireClienteAuth, asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: PEDIDO_INCLUDE,
  });
  if (!pedido || pedido.clienteId !== req.cliente.id) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  res.json(await conWhatsapp(pedido));
}));

const itemSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
});

const pedidoSchema = z.object({
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
  items: z.array(itemSchema).min(1),
});

// POST /tienda/pedidos - crea el pedido desde el carrito y reserva el stock
// de inmediato (mismo criterio que Apartados: así dos clientes no pueden
// "comprar" la misma última pieza mientras uno de los dos nunca paga). El
// cliente no elige sucursal: por cada artículo se busca automáticamente una
// sucursal con stock suficiente (se prefiere la bodega central; si ninguna
// sucursal por sí sola tiene suficiente, el pedido se rechaza — v1 no
// reparte un mismo renglón entre varias sucursales).
router.post('/', requireClienteAuth, asyncHandler(async (req, res) => {
  const parsed = pedidoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
  }
  const { items, ...direccion } = parsed.data;

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaTransferencia.findFirst({
        where: { activo: true, paraVentasOnline: true },
        orderBy: { id: 'asc' },
      });
      if (!cuenta) throw new Error('SIN_CUENTA_ONLINE');

      let total = 0;
      const itemsData = [];

      for (const item of items) {
        const variante = await tx.productoVariante.findUnique({
          where: { id: item.varianteId },
          include: {
            producto: true,
            existencias: { include: { sucursal: true } },
          },
        });
        if (!variante || !variante.activo || !variante.producto.activo) {
          throw new Error(`VARIANTE_NO_DISPONIBLE:${item.varianteId}`);
        }

        // No hay un cajero eligiendo aquí (el cliente compra solo), así que
        // el bucket de proveedor se asigna con una regla automática: primero
        // el proveedor "principal" de la variante, luego bodega central,
        // luego el que tenga más stock. v1 no reparte un mismo renglón entre
        // dos buckets/sucursales: un solo bucket tiene que alcanzar solo.
        const candidatas = variante.existencias
          .filter((e) => e.stockActual >= item.cantidad)
          .sort((a, b) => {
            const aPrincipal = a.proveedorId === variante.proveedorId ? 1 : 0;
            const bPrincipal = b.proveedorId === variante.proveedorId ? 1 : 0;
            if (aPrincipal !== bPrincipal) return bPrincipal - aPrincipal;
            const aCentral = a.sucursal.esBodegaCentral ? 1 : 0;
            const bCentral = b.sucursal.esBodegaCentral ? 1 : 0;
            if (aCentral !== bCentral) return bCentral - aCentral;
            return b.stockActual - a.stockActual;
          });
        if (candidatas.length === 0) throw new Error(`STOCK_INSUFICIENTE:${variante.sku}`);
        const elegida = candidatas[0];

        const precioUnitario = Number(variante.producto.precioVenta);
        const subtotal = precioUnitario * item.cantidad;
        total += subtotal;

        await tx.existencia.update({
          where: { id: elegida.id },
          data: { stockActual: { decrement: item.cantidad } },
        });

        itemsData.push({
          varianteId: item.varianteId,
          sucursalStockId: elegida.sucursalId,
          proveedorId: elegida.proveedorId,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal,
        });
      }

      const folio = `PED-${Date.now()}`;
      const referenciaPago = folio.replace('PED-', 'PED');

      const nuevo = await tx.pedido.create({
        data: {
          folio,
          clienteId: req.cliente.id,
          total,
          ...direccion,
          cuentaTransferenciaId: cuenta.id,
          referenciaPago,
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
            motivo: `Pedido en línea ${folio}`,
            pedidoId: nuevo.id,
            proveedorId: it.proveedorId,
          },
        });
      }

      return nuevo;
    });

    res.status(201).json(await conWhatsapp(pedido));
  } catch (err) {
    if (err.message === 'SIN_CUENTA_ONLINE') {
      return res.status(503).json({ error: 'La tienda en línea no tiene una cuenta de pago configurada todavía. Intenta más tarde.' });
    }
    if (err.message.startsWith('STOCK_INSUFICIENTE')) {
      return res.status(409).json({ error: `Sin existencias suficientes para el SKU ${err.message.split(':')[1]}.` });
    }
    if (err.message.startsWith('VARIANTE_NO_DISPONIBLE')) {
      return res.status(409).json({ error: 'Uno de los artículos del carrito ya no está disponible.' });
    }
    throw err;
  }
}));

// POST /tienda/pedidos/:id/comprobante - sube la foto del comprobante SPEI y
// pasa el pedido a EN_VALIDACION para que un empleado lo revise.
router.post(
  '/:id/comprobante',
  requireClienteAuth,
  manejarSubidaImagen('comprobante'),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido || pedido.clienteId !== req.cliente.id) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
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

    res.json(await conWhatsapp(actualizado));
  })
);

// POST /tienda/pedidos/:id/confirmar-recibido - el cliente confirma que ya
// le llegó el pedido.
router.post('/:id/confirmar-recibido', requireClienteAuth, asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
  if (!pedido || pedido.clienteId !== req.cliente.id) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  if (pedido.estado !== 'ENVIADO') {
    return res.status(409).json({ error: 'Solo se puede confirmar la recepción de un pedido que ya fue enviado.' });
  }

  const actualizado = await prisma.pedido.update({
    where: { id: pedido.id },
    data: { estado: 'RECIBIDO', recibidoAt: new Date() },
    include: PEDIDO_INCLUDE,
  });
  res.json(await conWhatsapp(actualizado));
}));

const resenaSchema = z.object({
  calificacionProducto: z.coerce.number().int().min(1).max(5),
  calificacionEnvio: z.coerce.number().int().min(1).max(5),
  comentario: z.string().optional(),
});

// POST /tienda/pedidos/:id/resena - el cliente califica producto y envío,
// con fotos opcionales del paquete recibido. Solo una vez el pedido está
// RECIBIDO, y solo una reseña por pedido (la tabla lo obliga con un índice
// único en pedido_id). multipart/form-data: "datos" (JSON) + hasta 6 fotos
// bajo el campo "fotos".
router.post(
  '/:id/resena',
  requireClienteAuth,
  manejarSubidaImagenes('fotos', 6),
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({
      where: { id: Number(req.params.id) },
      include: { resena: true },
    });
    if (!pedido || pedido.clienteId !== req.cliente.id) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    if (pedido.estado !== 'RECIBIDO') {
      return res.status(409).json({ error: 'Solo se puede calificar un pedido ya recibido.' });
    }
    if (pedido.resena) {
      return res.status(409).json({ error: 'Ya calificaste este pedido.' });
    }

    let body = req.body;
    if (req.is('multipart/form-data')) {
      try {
        body = JSON.parse(req.body.datos || '{}');
      } catch {
        return res.status(400).json({ error: 'El campo "datos" debe ser un JSON válido.' });
      }
    }

    const parsed = resenaSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }

    const archivos = req.files || [];
    const subidas = await Promise.all(archivos.map((f) => subirImagen(f.buffer, 'resenas')));

    await prisma.pedidoResena.create({
      data: {
        pedidoId: pedido.id,
        calificacionProducto: parsed.data.calificacionProducto,
        calificacionEnvio: parsed.data.calificacionEnvio,
        comentario: parsed.data.comentario || undefined,
        fotos: { create: subidas.map((s) => ({ url: s.url, publicId: s.publicId })) },
      },
    });

    const actualizado = await prisma.pedido.findUnique({ where: { id: pedido.id }, include: PEDIDO_INCLUDE });
    res.status(201).json(await conWhatsapp(actualizado));
  })
);

// POST /tienda/pedidos/:id/cancelar - el cliente cancela mientras siga
// PENDIENTE_PAGO (antes de subir comprobante); regresa el stock reservado.
// Una vez subido el comprobante, cancelar ya lo maneja el negocio
// (POST /pedidos-online/:id/cancelar) para no perder el rastro de un pago
// que ya podría estar en camino.
router.post('/:id/cancelar', requireClienteAuth, asyncHandler(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: { items: true },
  });
  if (!pedido || pedido.clienteId !== req.cliente.id) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  if (pedido.estado !== 'PENDIENTE_PAGO') {
    return res.status(409).json({ error: 'Este pedido ya no se puede cancelar directamente; contacta a la tienda.' });
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
          motivo: `Cancelación pedido ${pedido.folio} (por el cliente)`,
          pedidoId: pedido.id,
          proveedorId: item.proveedorId,
        },
      });
    }

    return tx.pedido.update({ where: { id: pedido.id }, data: { estado: 'CANCELADO' }, include: PEDIDO_INCLUDE });
  });

  res.json(await conWhatsapp(actualizado));
}));

module.exports = router;
