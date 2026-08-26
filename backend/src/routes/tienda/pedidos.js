const express = require('express');
const { z } = require('zod');
const prisma = require('../../db');
const { requireClienteAuth } = require('../../middleware/authCliente');
const { asyncHandler } = require('../../utils/asyncHandler');
const { manejarSubidaImagen, manejarSubidaImagenes } = require('../../middleware/uploadImagen');
const { subirImagen } = require('../../config/cloudinary');
const { buscarCupon, calcularDescuentoCupon, mensajeError } = require('../../utils/cupones');
const { verificarBajoStockYNotificar } = require('../../utils/bajoStock');

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
      sucursalStock: { select: { nombre: true } },
    },
  },
  cuentaTransferencia: true,
  resena: { include: { fotos: true } },
};

// El pago ya no se cobra directo en la página (los clientes no se sentían
// seguros viendo la cuenta a transferir ahí mismo): en vez de eso se manda al
// cliente por WhatsApp. Antes se prefería el teléfono del proveedor del
// pedido y solo se caía al WhatsApp general de la tienda si no había uno
// capturado; ahora TODOS los pedidos en línea usan siempre el WhatsApp
// principal de la tienda (configurado en el dashboard, ver
// routes/configuracionTienda.js), sin importar el proveedor — así el
// cliente siempre habla con el mismo número.
async function conWhatsapp(pedido) {
  if (!pedido) return pedido;
  const config = await prisma.configuracionTienda.findFirst();
  return { ...pedido, whatsappTienda: config?.whatsappTienda || null };
}
async function conWhatsappVarios(pedidos) {
  const config = await prisma.configuracionTienda.findFirst();
  return pedidos.map((p) => ({ ...p, whatsappTienda: config?.whatsappTienda || null }));
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
  // Código de cupón, opcional — validado con las mismas reglas que POST
  // /tienda/cupones/validar (ver utils/cupones.js). Si no aplica a ningún
  // producto del carrito, está vencido, agotado, etc., todo el pedido se
  // rechaza con un mensaje claro en vez de crearse sin el descuento.
  cuponCodigo: z.string().optional(),
  // Envío dinámico dentro de Oaxaca (opcional — ver
  // ConfiguracionTienda.envioDinamicoActivo y GET /tienda/envios/cotizar):
  // uno de los tarifaId que devolvió esa cotización, elegido por el cliente
  // en el checkout. Si no se manda (o el flag está apagado), el pedido usa
  // el costo de envío fijo de siempre — nunca se bloquea la compra por
  // esto.
  tarifaEnvioId: z.number().int().optional(),
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
  const { items, cuponCodigo, tarifaEnvioId, ...direccion } = parsed.data;

  // La sucursal de la que sale el stock de cada artículo se elige AUTOMÁTICO
  // dentro de la transacción (ver comentario del modelo Pedido en
  // schema.prisma) — no se sabe de antemano. Se va llenando aquí para poder
  // revisar bajo stock después de que la transacción confirme (ver
  // utils/bajoStock.js), sin depender de la forma del include de la
  // respuesta.
  const cambiosStock = [];

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaTransferencia.findFirst({
        where: { activo: true, paraVentasOnline: true },
        orderBy: { id: 'asc' },
      });
      if (!cuenta) throw new Error('SIN_CUENTA_ONLINE');

      // Costo de envío: fijo por default (se copia tal cual esté configurado
      // en este momento, para que si el negocio lo cambia después, este
      // pedido conserve el monto con el que se cobró) — o, si
      // envioDinamicoActivo está prendido y el cliente eligió una opción de
      // envío local dentro de Oaxaca (ver GET /tienda/envios/cotizar), el
      // precio de esa tarifa. Nunca se confía en un precio mandado por el
      // cliente: siempre se vuelve a leer la tarifa de la base de datos por
      // su id. Si el flag está apagado, o no se mandó tarifaEnvioId, o la
      // tarifa ya no existe/está inactiva, cae de vuelta al costo fijo —
      // igual que el criterio ya aprobado para cuando un destino no tiene
      // cobertura: nunca se bloquea la compra por esto.
      const config = await tx.configuracionTienda.findFirst();
      let costoEnvio = Number(config?.costoEnvio || 0);
      let envioV2 = {};

      if (config?.envioDinamicoActivo && tarifaEnvioId) {
        const tarifa = await tx.tarifaEnvio.findUnique({
          where: { id: tarifaEnvioId },
          include: {
            coberturaEnvio: {
              include: {
                rutaEnvio: { include: { sucursalOrigen: true, transportista: true } },
                puntoEntrega: true,
              },
            },
          },
        });
        if (tarifa?.activo && tarifa.coberturaEnvio.activo) {
          const cobertura = tarifa.coberturaEnvio;
          const ruta = cobertura.rutaEnvio;
          costoEnvio = Number(tarifa.precioCliente);
          envioV2 = {
            tipoEnvio: 'TRANSPORTE_LOCAL',
            destinoEnvioId: cobertura.destinoEnvioId,
            coberturaEnvioId: cobertura.id,
            rutaEnvioId: ruta.id,
            transportistaId: ruta.transportistaId,
            sucursalDespachoId: ruta.sucursalOrigenId,
            puntoEntregaId: cobertura.puntoEntregaId,
            tipoEntrega: cobertura.tipoEntrega,
            tamanoPaquete: tarifa.tamano,
            tarifaEnvioId: tarifa.id,
            costoEnvioReal: tarifa.costoReal,
            puntoEntregaTexto: cobertura.puntoEntrega
              ? `${cobertura.puntoEntrega.nombre}${cobertura.puntoEntrega.direccion ? ` — ${cobertura.puntoEntrega.direccion}` : ''}`
              : null,
          };
        }
      }

      let total = 0;
      const itemsData = [];
      // Copia ligera de cada renglón (con el producto al que pertenece) solo
      // para poder validar/calcular el cupón más abajo, sin volver a
      // consultar las variantes.
      const itemsParaCupon = [];

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
        cambiosStock.push({ sucursalId: elegida.sucursalId, varianteId: item.varianteId });

        itemsData.push({
          varianteId: item.varianteId,
          sucursalStockId: elegida.sucursalId,
          proveedorId: elegida.proveedorId,
          cantidad: item.cantidad,
          precioUnitario,
          subtotal,
        });
        itemsParaCupon.push({ productoId: variante.producto.id, cantidad: item.cantidad, precioUnitario });
      }

      // Cupón de código, opcional: se valida contra los mismos productos del
      // carrito recién armado. Si el código no aplica/está vencido/agotado,
      // se rechaza el pedido completo con un mensaje claro (mejor que
      // crearlo silenciosamente sin el descuento que el cliente esperaba).
      let cuponAplicado = null;
      let cuponDescuento = 0;
      if (cuponCodigo && cuponCodigo.trim()) {
        const { cupon, error: errorBusqueda } = await buscarCupon(tx, cuponCodigo);
        if (errorBusqueda) throw new Error(`CUPON:${mensajeError(errorBusqueda)}`);

        const resultado = await calcularDescuentoCupon(tx, cupon, itemsParaCupon, req.cliente.id);
        if (resultado.error) {
          throw new Error(`CUPON:${resultado.mensaje || mensajeError(resultado.error)}`);
        }
        cuponAplicado = cupon;
        cuponDescuento = resultado.montoDescuento;
      }

      total += costoEnvio - cuponDescuento;

      const folio = `PED-${Date.now()}`;
      const referenciaPago = folio.replace('PED-', 'PED');

      const nuevo = await tx.pedido.create({
        data: {
          folio,
          clienteId: req.cliente.id,
          total,
          costoEnvio,
          ...direccion,
          ...envioV2,
          cuentaTransferenciaId: cuenta.id,
          referenciaPago,
          items: { create: itemsData },
          ...(cuponAplicado
            ? { cuponId: cuponAplicado.id, cuponCodigo: cuponAplicado.codigo, cuponDescuento }
            : {}),
        },
        include: PEDIDO_INCLUDE,
      });

      if (cuponAplicado) {
        await tx.cuponUso.create({
          data: {
            cuponId: cuponAplicado.id,
            clienteId: req.cliente.id,
            pedidoId: nuevo.id,
            montoDescontado: cuponDescuento,
          },
        });
      }

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

    // Best-effort y en segundo plano: alguna sucursal elegida automáticamente
    // pudo haber quedado en o bajo el mínimo (ver utils/bajoStock.js).
    verificarBajoStockYNotificar(cambiosStock).catch((err) =>
      console.error('Error verificando bajo stock tras el pedido en línea:', err)
    );

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
    if (err.message.startsWith('CUPON:')) {
      return res.status(400).json({ error: err.message.slice('CUPON:'.length) });
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
