const express = require('express');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { asyncHandler } = require('../utils/asyncHandler');
const { manejarSubidaImagen } = require('../middleware/uploadImagen');
const { subirImagen, subirPdf } = require('../config/cloudinary');
const { enviarTicketVenta } = require('../config/whatsapp');
const { generarTicketPdf } = require('../utils/ticketPdf');
const { verificarBajoStockYNotificar } = require('../utils/bajoStock');
const { inicioDiaNegocio, finDiaNegocio, hoyNegocioStr } = require('../utils/fechas');

const router = express.Router();

const ROLES_VENTAS = ['ADMIN_PRINCIPAL', 'DESARROLLO', 'VENTAS'];
const ROLES_ADMIN = ['ADMIN_PRINCIPAL', 'DESARROLLO'];

// Manda la galería completa (solo url/color/esPrincipal) en vez de una sola
// foto: como una foto puede estar etiquetada para un color de variante
// específico, el frontend necesita verlas todas para elegir la que
// corresponde al color de cada línea de venta, no solo la portada general.
const IMAGEN_PRINCIPAL_INCLUDE = {
  imagenes: {
    orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
    select: { url: true, color: true, esPrincipal: true },
  },
};

function esAdmin(rol) {
  return ROLES_ADMIN.includes(rol);
}

// El ticket digital se manda al cliente por WhatsApp con el mismo mecanismo
// de click-to-chat que ya se usa en pedidos en línea (ver
// routes/tienda/pedidos.js): no hay envío automático desde el servidor, es
// el cajero quien abre un link con el mensaje ya armado y lo manda desde el
// WhatsApp de la sucursal. El número que se muestra como "contacto" dentro
// del ticket prioriza el WhatsApp propio de la sucursal (Sucursal.telefono)
// — útil si en el futuro cada sucursal tiene su propio número — y cae al
// WhatsApp general configurado en el dashboard (configuracionTienda) si esa
// sucursal no tiene uno capturado, para que el ticket nunca se quede sin un
// número de contacto.
// Igual que conWhatsappContacto, pero además resuelve con qué "Phone
// Number ID" de WhatsApp Business Platform hay que mandar el ticket
// automático por API (ver config/whatsapp.js) — mismo criterio de respaldo:
// primero el de la sucursal, si no tiene, el general de la tienda. Junta
// las dos resoluciones en una sola consulta a configuracionTienda para no
// repetirla.
async function resolverWhatsappVenta(venta) {
  const faltaSucursal = !venta.sucursal?.telefono || !venta.sucursal?.whatsappPhoneNumberId;
  const config = faltaSucursal ? await prisma.configuracionTienda.findFirst() : null;
  return {
    whatsappContacto: venta.sucursal?.telefono || config?.whatsappTienda || null,
    whatsappPhoneNumberId: venta.sucursal?.whatsappPhoneNumberId || config?.whatsappPhoneNumberId || null,
  };
}

async function conWhatsappContactoVarios(ventas) {
  // Igual que resolverWhatsappVenta: esto es solo para mostrar el número de
  // contacto en la lista/historial, nunca debe tumbar la consulta si algo
  // falla al leer la configuración general (p.ej. una migración pendiente).
  let config = null;
  try {
    config = await prisma.configuracionTienda.findFirst();
  } catch (err) {
    console.error('Error leyendo configuración de la tienda (WhatsApp):', err);
  }
  return ventas.map((v) => ({
    ...v,
    whatsappContacto: v.sucursal?.telefono || config?.whatsappTienda || null,
  }));
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
      items: {
        include: {
          variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
      usuario: { select: { nombre: true } },
      sucursal: { select: { nombre: true, telefono: true } },
      cuentaTransferencia: { select: { nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(await conWhatsappContactoVarios(ventas));
}));

// GET /ventas/corte-dia - resumen de caja de un día (por defecto hoy) para
// cuadrar efectivo/tarjeta/transferencia. VENTAS solo ve su propia sucursal;
// ADMIN/DESARROLLO pueden ver una sucursal específica o el corte global.
// El "día" se calcula en horario de México (America/Mexico_City, ver
// utils/fechas.js), no en UTC: así una venta hecha a las 8pm cae en el
// corte del mismo día, no en el del día siguiente.
// Agrupa los renglones vendidos del día por producto + proveedor (el mismo
// producto puede haberse vendido de dos proveedores distintos ese día si su
// stock está repartido entre ambos) para el desglose "Productos vendidos"
// del corte del día. Incluye una foto representativa del producto.
function calcularProductosVendidos(ventas) {
  const mapa = new Map();
  for (const venta of ventas) {
    // item.subtotal SIEMPRE es cantidad*precioUnitario "de lista", sin
    // descuento (ver POST /ventas): el descuento libre que capturó el
    // cajero se resta una sola vez del total de la VENTA completa, no de
    // cada renglón por separado. Si aquí solo sumáramos item.subtotal tal
    // cual, una venta con descuento inflaría el total de este desglose por
    // encima de lo que en realidad se cobró (y de "Total general" arriba,
    // que sí usa venta.total). Se prorratea el descuento entre los
    // renglones según su peso en el subtotal de esa venta — mismo criterio
    // que ya usa el reporte general (ver reportes.js calcularDesglose,
    // donde queda la misma limitación documentada).
    const subtotalVenta = venta.items.reduce((acc, it) => acc + Number(it.subtotal), 0);
    const factor = subtotalVenta > 0 ? Number(venta.total) / subtotalVenta : 1;
    for (const item of venta.items) {
      const producto = item.variante?.producto;
      if (!producto) continue;
      const proveedorId = item.proveedorId ?? null;
      const clave = `${producto.id}-${proveedorId ?? 'sin-proveedor'}`;
      const actual = mapa.get(clave) || {
        productoId: producto.id,
        nombre: producto.nombre,
        imagenUrl: producto.imagenes?.[0]?.url || null,
        proveedorId,
        proveedorNombre: item.proveedor?.nombre || 'Sin proveedor',
        cantidad: 0,
        total: 0,
      };
      actual.cantidad += item.cantidad;
      actual.total += Number(item.subtotal) * factor;
      mapa.set(clave, actual);
    }
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

// Mismo desglose que arriba pero sumado por proveedor (sin importar el
// producto) — para el total de caja "esto es lo que le corresponde a cada
// proveedor" del corte del día. Se arma a partir de productosVendidos en vez
// de volver a recorrer las ventas, para no repetir la agregación.
function calcularPorProveedor(productosVendidos) {
  const mapa = new Map();
  for (const p of productosVendidos) {
    const clave = p.proveedorId ?? 'sin-proveedor';
    const actual = mapa.get(clave) || {
      proveedorId: p.proveedorId,
      proveedorNombre: p.proveedorNombre,
      cantidad: 0,
      total: 0,
    };
    actual.cantidad += p.cantidad;
    actual.total += p.total;
    mapa.set(clave, actual);
  }
  return [...mapa.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

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

  const fechaStr = req.query.fecha ? String(req.query.fecha) : hoyNegocioStr();
  const inicio = inicioDiaNegocio(fechaStr);
  const fin = finDiaNegocio(fechaStr);
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
        // Se necesita el detalle de artículos para armar el desglose de
        // "Productos vendidos" de abajo (producto + proveedor + una foto
        // representativa), no solo el total de la venta.
        items: {
          select: {
            cantidad: true,
            subtotal: true,
            proveedorId: true,
            proveedor: { select: { id: true, nombre: true } },
            variante: {
              select: {
                producto: {
                  select: {
                    id: true,
                    nombre: true,
                    // Solo la foto principal (o la primera si no hay
                    // ninguna marcada), no la galería completa: aquí solo se
                    // muestra una miniatura, no hace falta elegir por color
                    // como en el punto de venta.
                    imagenes: {
                      orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }],
                      select: { url: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
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

  const productosVendidos = calcularProductosVendidos(completadas);

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
    productosVendidos,
    porProveedor: calcularPorProveedor(productosVendidos),
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
      // Horario de México, no UTC (ver utils/fechas.js) — mismo criterio
      // que /corte-dia.
      if (fechaInicio) where.createdAt.gte = inicioDiaNegocio(String(fechaInicio));
      if (fechaFin) where.createdAt.lte = finDiaNegocio(String(fechaFin));
    }

    const ventas = await prisma.venta.findMany({
      where,
      include: {
        items: {
        include: {
          variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
        usuario: { select: { nombre: true } },
        sucursal: { select: { nombre: true, telefono: true } },
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
      ventas: await conWhatsappContactoVarios(ventas),
      resumen: { totalGeneral, porSucursal: resumenPorSucursal },
    });
  })
);

const ventaItemSchema = z.object({
  varianteId: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
  // De qué proveedor sale el stock vendido (null = bucket "sin proveedor").
  // Es obligatorio mandarlo explícitamente: como el stock ahora se separa
  // por proveedor, el punto de venta debe decir siempre de cuál se descuenta
  // cuando una talla tiene stock de más de uno.
  proveedorId: z.number().int().nullable(),
});

const ventaSchema = z
  .object({
    sucursalId: z.number().int().optional(),
    cliente: z.string().optional(),
    // Teléfono del cliente, opcional: solo se pide para poder mandarle el
    // ticket digital por WhatsApp al terminar la venta. Sin él, la venta se
    // registra igual, solo que no se ofrece el botón de enviar ticket.
    clienteTelefono: z.string().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']).default('EFECTIVO'),
    cuentaTransferenciaId: z.number().int().optional(),
    // Efectivo que el cliente entregó — solo tiene sentido con EFECTIVO, se
    // usa nada más para calcular y guardar el cambio dado (se muestra en el
    // ticket digital).
    efectivoRecibido: z.number().nonnegative().optional(),
    // Descuento libre que el vendedor puede capturar al cobrar (opcional).
    // descuentoValor es el % o el monto tal cual lo tecleó el cajero, según
    // descuentoTipo — el monto real en pesos (descuentoMonto) lo calcula y
    // valida el servidor, nunca se confía en lo que mande el cliente.
    descuentoTipo: z.enum(['PORCENTAJE', 'MONTO']).optional(),
    descuentoValor: z.number().nonnegative().optional(),
    descuentoMotivo: z.string().optional(),
    items: z.array(ventaItemSchema).min(1),
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  })
  .refine((d) => !d.descuentoTipo || (d.descuentoValor !== undefined && d.descuentoValor > 0), {
    message: 'descuentoValor es requerido y debe ser mayor a 0 cuando se manda descuentoTipo.',
    path: ['descuentoValor'],
  })
  .refine((d) => d.descuentoTipo !== 'PORCENTAJE' || (d.descuentoValor ?? 0) <= 100, {
    message: 'El descuento por porcentaje no puede ser mayor a 100.',
    path: ['descuentoValor'],
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
    const {
      cliente,
      clienteTelefono,
      metodoPago,
      cuentaTransferenciaId,
      efectivoRecibido,
      descuentoTipo,
      descuentoValor,
      descuentoMotivo,
      items,
    } = parsed.data;

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
      // Detalle de cada artículo (nombre + talla/color, cantidad, precio,
      // subtotal) para armar la tabla del PDF del ticket — se junta aquí
      // porque es donde ya se resuelve cada existencia.
      const itemsParaTicket = [];

      const venta = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const itemsData = [];

        for (const item of items) {
          const existencia = await tx.existencia.findFirst({
            where: { sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId },
            include: { variante: { include: { producto: true, talla: true } } },
          });
          if (!existencia) throw new Error(`SIN_EXISTENCIA:${item.varianteId}`);
          if (existencia.stockActual < item.cantidad) {
            throw new Error(`STOCK_INSUFICIENTE:${existencia.variante.sku}`);
          }

          const subtotalItem = item.cantidad * item.precioUnitario;
          subtotal += subtotalItem;

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
              proveedorId: item.proveedorId,
            },
          });

          const detalle = [existencia.variante.talla?.valor, existencia.variante.color].filter(Boolean).join('/');
          itemsParaTicket.push({
            descripcion: `${existencia.variante.producto.nombre}${detalle ? ` (${detalle})` : ''}`,
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
            subtotal: subtotalItem,
          });

          itemsData.push({ ...item, subtotal: subtotalItem });
        }

        // Descuento libre que capturó el cajero (opcional): el monto real
        // en pesos SIEMPRE se calcula aquí a partir del subtotal ya
        // validado, nunca se confía en un "descuentoMonto" mandado por el
        // cliente — y nunca puede dejar el total en negativo.
        let descuentoMonto = 0;
        if (descuentoTipo === 'PORCENTAJE') {
          descuentoMonto = subtotal * ((descuentoValor ?? 0) / 100);
        } else if (descuentoTipo === 'MONTO') {
          descuentoMonto = descuentoValor ?? 0;
        }
        descuentoMonto = Math.min(descuentoMonto, subtotal);
        const total = subtotal - descuentoMonto;

        if (metodoPago === 'EFECTIVO' && efectivoRecibido !== undefined && efectivoRecibido < total) {
          throw new Error(`EFECTIVO_INSUFICIENTE:${(total - efectivoRecibido).toFixed(2)}`);
        }

        const folio = `V-${Date.now()}`;

        return tx.venta.create({
          data: {
            folio,
            sucursalId,
            usuarioId: req.usuario.id,
            cliente,
            clienteTelefono,
            metodoPago,
            cuentaTransferenciaId: metodoPago === 'TRANSFERENCIA' ? cuentaTransferenciaId : null,
            comprobanteUrl,
            comprobantePublicId,
            total,
            descuentoTipo: descuentoTipo ?? null,
            descuentoValor: descuentoTipo ? descuentoValor : null,
            descuentoMonto,
            descuentoMotivo: descuentoTipo ? descuentoMotivo || null : null,
            efectivoRecibido: metodoPago === 'EFECTIVO' && efectivoRecibido !== undefined ? efectivoRecibido : null,
            items: { create: itemsData },
          },
          include: {
            // Igual que en GET / y GET /historial: el frontend arma el texto
            // del ticket (construirTicketTexto) leyendo variante/producto/
            // talla de cada renglón justo con la respuesta de este POST, sin
            // volver a pedir la venta. Si aquí solo viniera "items: true"
            // (sin esta relación anidada), esos campos salen undefined y el
            // frontend truena al armar el ticket — pero SOLO cuando sí hay
            // teléfono de cliente capturado, porque solo entonces arma el
            // link del ticket (con teléfono vacío se salta ese paso).
            items: {
              include: {
                variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
                proveedor: { select: { id: true, nombre: true } },
              },
            },
            cuentaTransferencia: { select: { nombre: true } },
            sucursal: { select: { nombre: true, telefono: true, whatsappPhoneNumberId: true } },
            // Vendedor que registró la venta, para mostrarlo en el ticket
            // digital.
            usuario: { select: { nombre: true } },
          },
        });
      });

      // Best-effort y en segundo plano (no se espera aquí): si alguna de las
      // variantes vendidas quedó en o bajo su mínimo, avisa a quien le toca
      // reabastecerla (ver utils/bajoStock.js). No debe agregar latencia al
      // cajero ni tumbar la venta si algo falla.
      verificarBajoStockYNotificar(items.map((i) => ({ sucursalId, varianteId: i.varianteId }))).catch((err) =>
        console.error('Error verificando bajo stock tras la venta:', err)
      );

      // A partir de aquí la venta YA quedó registrada (la transacción de
      // arriba ya se guardó en la base de datos y ya se descontó el stock).
      // Todo lo que sigue es "extra" para el ticket digital — si algo de
      // esto falla, la venta NO debe reportarse como error al cajero, solo
      // se pierde el envío/generación automática del ticket. Por eso todo
      // este bloque va envuelto en su propio try/catch, que nunca deja que
      // un error aquí se propague al catch general de la ruta.
      let whatsappContacto = null;
      let whatsappPhoneNumberId = null;
      let ticketPdfUrl = null;
      let ticketDigital = { enviado: false, error: 'SIN_TELEFONO' };
      try {
        ({ whatsappContacto, whatsappPhoneNumberId } = await resolverWhatsappVenta(venta));

        // Genera el PDF del ticket y lo sube a Cloudinary — best-effort: si
        // algo falla aquí (Cloudinary caído, PDF/ZIP no habilitado en la
        // cuenta, etc.) la venta ya quedó registrada de todas formas, solo no
        // habrá ticket en PDF para esta venta. Se guarda en la venta para
        // poder reabrirlo/reenviarlo después desde el historial.
        let ticketPdfError = null;
        try {
          const pdfBuffer = await generarTicketPdf(venta, itemsParaTicket, whatsappContacto);
          const subida = await subirPdf(pdfBuffer, 'tickets');
          ticketPdfUrl = subida.url;
          await prisma.venta.update({
            where: { id: venta.id },
            data: { ticketPdfUrl: subida.url, ticketPdfPublicId: subida.publicId },
          });
        } catch (err) {
          ticketPdfError = err.message;
          console.error('Error generando/subiendo el PDF del ticket:', err);
        }

        // Envío automático por WhatsApp Business Platform, solo si el cliente
        // dejó su teléfono, ya se generó el PDF, y hay un Phone Number ID
        // configurado (sucursal o tienda). Si algo de esto falta, o si Meta
        // rechaza el envío, no se cae la venta — el frontend sigue ofreciendo
        // el link manual de wa.me y/o el PDF para mandar a mano.
        if (clienteTelefono) {
          ticketDigital = ticketPdfUrl
            ? await enviarTicketVenta({
                phoneNumberId: whatsappPhoneNumberId,
                telefonoCliente: clienteTelefono,
                folio: venta.folio,
                pdfUrl: ticketPdfUrl,
              })
            : { enviado: false, error: ticketPdfError || 'SIN_PDF' };
        }
      } catch (err) {
        console.error('Error preparando el ticket digital (la venta ya se registró):', err);
        ticketDigital = { enviado: false, error: 'ERROR_TICKET_DIGITAL' };
      }

      res.status(201).json({ ...venta, whatsappContacto, ticketDigital, ticketPdfUrl });
    } catch (err) {
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${err.message.split(':')[1]}.` });
      }
      if (err.message.startsWith('SIN_EXISTENCIA')) {
        return res.status(409).json({ error: 'Esa variante no tiene existencia registrada en esta sucursal.' });
      }
      if (err.message.startsWith('EFECTIVO_INSUFICIENTE')) {
        return res.status(400).json({ error: `El efectivo recibido no alcanza. Faltan $${err.message.split(':')[1]}.` });
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
          const existencia = await tx.existencia.findFirst({
            where: { sucursalId: v.sucursalId, varianteId: item.varianteId, proveedorId: item.proveedorId },
          });
          if (existencia) {
            await tx.existencia.update({
              where: { id: existencia.id },
              data: { stockActual: { increment: item.cantidad } },
            });
          } else {
            await tx.existencia.create({
              data: {
                sucursalId: v.sucursalId,
                varianteId: item.varianteId,
                proveedorId: item.proveedorId,
                stockActual: item.cantidad,
                stockMinimo: 0,
              },
            });
          }
          await tx.movimientoInventario.create({
            data: {
              sucursalId: v.sucursalId,
              varianteId: item.varianteId,
              tipo: 'DEVOLUCION',
              cantidad: item.cantidad,
              motivo: `Cancelación venta ${v.folio}`,
              usuarioId: req.usuario.id,
              proveedorId: item.proveedorId,
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

// ---------------------------------------------------------------------------
// Edición de una venta ya registrada (solo ADMIN_PRINCIPAL/DESARROLLO).
// ---------------------------------------------------------------------------
//
// A diferencia de cancelar (que revierte la venta completa), esto corrige
// datos capturados mal SIN deshacer la venta: el caso típico es un artículo
// que se descontó del proveedor equivocado (dos proveedores surten la misma
// talla) y hay que reasignarlo al correcto, pero también sirve para
// corregir cliente, método de pago, cuenta de transferencia, descuento,
// cantidad o precio unitario de un renglón.
//
// Fuera de alcance a propósito (más riesgoso, mejor cancelar y volver a
// vender si hace falta): cambiar la sucursal de la venta, agregar/quitar
// renglones, o cambiar a qué variante (producto/talla/color) pertenece un
// renglón ya existente.

const ventaEdicionItemSchema = z.object({
  id: z.number().int(),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().nonnegative(),
  proveedorId: z.number().int().nullable(),
});

const ventaEdicionSchema = z
  .object({
    // Por qué se corrige — queda en el registro de auditoría (VentaEdicion),
    // no es solo un campo de UI.
    motivo: z.string().trim().min(5, 'Escribe un motivo de al menos 5 caracteres.'),
    cliente: z.string().nullable().optional(),
    clienteTelefono: z.string().nullable().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
    cuentaTransferenciaId: z.number().int().nullable().optional(),
    descuentoTipo: z.enum(['PORCENTAJE', 'MONTO']).nullable(),
    descuentoValor: z.number().nonnegative().nullable(),
    descuentoMotivo: z.string().nullable().optional(),
    items: z.array(ventaEdicionItemSchema).min(1),
  })
  .refine((d) => d.metodoPago !== 'TRANSFERENCIA' || !!d.cuentaTransferenciaId, {
    message: 'cuentaTransferenciaId es requerido cuando el método de pago es transferencia.',
    path: ['cuentaTransferenciaId'],
  })
  .refine((d) => !d.descuentoTipo || (d.descuentoValor !== null && d.descuentoValor !== undefined && d.descuentoValor > 0), {
    message: 'descuentoValor es requerido y debe ser mayor a 0 cuando se manda descuentoTipo.',
    path: ['descuentoValor'],
  })
  .refine((d) => d.descuentoTipo !== 'PORCENTAJE' || (d.descuentoValor ?? 0) <= 100, {
    message: 'El descuento por porcentaje no puede ser mayor a 100.',
    path: ['descuentoValor'],
  });

// Suma (o resta, con delta negativo) stock al bucket sucursal+variante+
// proveedor, creándolo si no existía. A diferencia de una venta nueva, aquí
// SÍ se permite que quede en negativo cuando se está reasignando el
// proveedor correcto de un artículo (ver el bloque de items más abajo) — el
// llamador decide si eso amerita una advertencia.
async function ajustarExistencia(tx, sucursalId, varianteId, proveedorId, delta) {
  return tx.existencia.upsert({
    where: { sucursalId_varianteId_proveedorId: { sucursalId, varianteId, proveedorId } },
    update: { stockActual: { increment: delta } },
    create: { sucursalId, varianteId, proveedorId, stockActual: delta, stockMinimo: 0 },
  });
}

// PATCH /ventas/:id/editar - corrige una venta COMPLETADA ya registrada.
router.patch(
  '/:id/editar',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const ventaId = Number(req.params.id);
    const parsed = ventaEdicionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos inválidos.', detalles: parsed.error.flatten() });
    }
    const datos = parsed.data;

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const ventaActual = await tx.venta.findUnique({ where: { id: ventaId }, include: { items: true } });
        if (!ventaActual) throw new Error('VENTA_NO_ENCONTRADA');
        if (ventaActual.estado !== 'COMPLETADA') throw new Error('VENTA_NO_EDITABLE');

        const itemsPorId = new Map(ventaActual.items.map((it) => [it.id, it]));
        if (datos.items.length !== ventaActual.items.length || datos.items.some((it) => !itemsPorId.has(it.id))) {
          throw new Error('ITEMS_INVALIDOS');
        }

        if (datos.metodoPago === 'TRANSFERENCIA' && datos.cuentaTransferenciaId) {
          const cuenta = await tx.cuentaTransferencia.findUnique({ where: { id: datos.cuentaTransferenciaId } });
          if (!cuenta || !cuenta.activo) throw new Error('CUENTA_TRANSFERENCIA_INVALIDA');
        }

        const advertencias = [];
        const cambiosItems = [];
        let subtotal = 0;

        for (const nuevo of datos.items) {
          const anterior = itemsPorId.get(nuevo.id);
          const proveedorCambio = anterior.proveedorId !== nuevo.proveedorId;
          const cantidadCambio = anterior.cantidad !== nuevo.cantidad;

          if (proveedorCambio) {
            // Se regresa TODO lo vendido al proveedor anterior (siempre
            // seguro: es stock que ya se había descontado de ahí) y se
            // descuenta del proveedor correcto. La pieza física ya salió
            // del negocio en el momento de la venta original — esto solo
            // corrige bajo qué proveedor debió quedar contabilizada, así
            // que NO se bloquea por falta de stock en el proveedor nuevo
            // (si su bucket no tenía suficiente registrado, probablemente
            // su entrada tampoco se capturó bien; se avisa, no se bloquea).
            await ajustarExistencia(tx, ventaActual.sucursalId, anterior.varianteId, anterior.proveedorId, anterior.cantidad);
            await tx.movimientoInventario.create({
              data: {
                sucursalId: ventaActual.sucursalId,
                varianteId: anterior.varianteId,
                tipo: 'DEVOLUCION',
                cantidad: anterior.cantidad,
                motivo: `Corrección venta ${ventaActual.folio}: se quita del proveedor anterior`,
                usuarioId: req.usuario.id,
                proveedorId: anterior.proveedorId,
              },
            });

            const existenciaNueva = await ajustarExistencia(
              tx,
              ventaActual.sucursalId,
              anterior.varianteId,
              nuevo.proveedorId,
              -nuevo.cantidad
            );
            await tx.movimientoInventario.create({
              data: {
                sucursalId: ventaActual.sucursalId,
                varianteId: anterior.varianteId,
                tipo: 'VENTA',
                cantidad: -nuevo.cantidad,
                motivo: `Corrección venta ${ventaActual.folio}: se asigna al proveedor correcto`,
                usuarioId: req.usuario.id,
                proveedorId: nuevo.proveedorId,
              },
            });
            if (existenciaNueva.stockActual < 0) {
              advertencias.push(
                `La variante #${anterior.varianteId} quedó con stock negativo (${existenciaNueva.stockActual}) para el proveedor asignado en esta sucursal — probablemente su entrada de inventario tampoco estaba bien registrada.`
              );
            }
          } else if (cantidadCambio) {
            // Mismo proveedor, solo cambia cuánto se vendió: si aumenta, sí
            // se valida que haya stock suficiente (es, en los hechos,
            // vender más unidades); si disminuye, se regresa la diferencia.
            const delta = nuevo.cantidad - anterior.cantidad;
            if (delta > 0) {
              const existencia = await tx.existencia.findFirst({
                where: { sucursalId: ventaActual.sucursalId, varianteId: anterior.varianteId, proveedorId: anterior.proveedorId },
              });
              if (!existencia || existencia.stockActual < delta) {
                throw new Error(`STOCK_INSUFICIENTE:${anterior.varianteId}`);
              }
            }
            await ajustarExistencia(tx, ventaActual.sucursalId, anterior.varianteId, anterior.proveedorId, -delta);
            await tx.movimientoInventario.create({
              data: {
                sucursalId: ventaActual.sucursalId,
                varianteId: anterior.varianteId,
                tipo: delta > 0 ? 'VENTA' : 'DEVOLUCION',
                cantidad: -delta,
                motivo: `Corrección venta ${ventaActual.folio}: ajuste de cantidad`,
                usuarioId: req.usuario.id,
                proveedorId: anterior.proveedorId,
              },
            });
          }

          const subtotalItem = nuevo.cantidad * nuevo.precioUnitario;
          subtotal += subtotalItem;

          if (proveedorCambio || cantidadCambio || Number(anterior.precioUnitario) !== nuevo.precioUnitario) {
            cambiosItems.push({
              itemId: nuevo.id,
              varianteId: anterior.varianteId,
              antes: {
                cantidad: anterior.cantidad,
                precioUnitario: Number(anterior.precioUnitario),
                proveedorId: anterior.proveedorId,
              },
              despues: { cantidad: nuevo.cantidad, precioUnitario: nuevo.precioUnitario, proveedorId: nuevo.proveedorId },
            });
          }

          await tx.ventaItem.update({
            where: { id: nuevo.id },
            data: {
              cantidad: nuevo.cantidad,
              precioUnitario: nuevo.precioUnitario,
              subtotal: subtotalItem,
              proveedorId: nuevo.proveedorId,
            },
          });
        }

        let descuentoMonto = 0;
        if (datos.descuentoTipo === 'PORCENTAJE') {
          descuentoMonto = subtotal * ((datos.descuentoValor ?? 0) / 100);
        } else if (datos.descuentoTipo === 'MONTO') {
          descuentoMonto = datos.descuentoValor ?? 0;
        }
        descuentoMonto = Math.min(descuentoMonto, subtotal);
        const total = subtotal - descuentoMonto;

        // Snapshot antes/después a nivel de venta, solo de lo que sí
        // cambió, para el registro de auditoría.
        const cambiosVenta = {};
        const compararCampo = (campo, antes, despues) => {
          if (antes !== despues) cambiosVenta[campo] = { antes, despues };
        };
        const cuentaTransferenciaIdNueva = datos.metodoPago === 'TRANSFERENCIA' ? datos.cuentaTransferenciaId ?? null : null;
        const descuentoValorNuevo = datos.descuentoTipo ? datos.descuentoValor ?? null : null;
        const descuentoMotivoNuevo = datos.descuentoTipo ? datos.descuentoMotivo || null : null;
        compararCampo('cliente', ventaActual.cliente ?? null, datos.cliente ?? null);
        compararCampo('clienteTelefono', ventaActual.clienteTelefono ?? null, datos.clienteTelefono ?? null);
        compararCampo('metodoPago', ventaActual.metodoPago, datos.metodoPago);
        compararCampo('cuentaTransferenciaId', ventaActual.cuentaTransferenciaId ?? null, cuentaTransferenciaIdNueva);
        compararCampo('descuentoTipo', ventaActual.descuentoTipo ?? null, datos.descuentoTipo ?? null);
        compararCampo(
          'descuentoValor',
          ventaActual.descuentoValor !== null ? Number(ventaActual.descuentoValor) : null,
          descuentoValorNuevo
        );
        compararCampo('descuentoMotivo', ventaActual.descuentoMotivo ?? null, descuentoMotivoNuevo);
        compararCampo('total', Number(ventaActual.total), total);

        const ventaActualizada = await tx.venta.update({
          where: { id: ventaId },
          data: {
            cliente: datos.cliente ?? null,
            clienteTelefono: datos.clienteTelefono ?? null,
            metodoPago: datos.metodoPago,
            cuentaTransferenciaId: cuentaTransferenciaIdNueva,
            descuentoTipo: datos.descuentoTipo,
            descuentoValor: descuentoValorNuevo,
            descuentoMonto,
            descuentoMotivo: descuentoMotivoNuevo,
            total,
          },
          include: {
            items: {
              include: {
                variante: { include: { producto: { include: IMAGEN_PRINCIPAL_INCLUDE }, talla: true } },
                proveedor: { select: { id: true, nombre: true } },
              },
            },
            cuentaTransferencia: { select: { nombre: true } },
            sucursal: { select: { nombre: true } },
            usuario: { select: { nombre: true } },
          },
        });

        await tx.ventaEdicion.create({
          data: {
            ventaId,
            usuarioId: req.usuario.id,
            motivo: datos.motivo,
            cambios: { venta: cambiosVenta, items: cambiosItems, advertencias },
          },
        });

        return { venta: ventaActualizada, advertencias, varianteIdsTocados: cambiosItems.map((c) => c.varianteId) };
      });

      // Best-effort y en segundo plano, igual criterio que POST /ventas: si
      // alguna variante tocada por la corrección quedó en o bajo su
      // mínimo, avisa a quien reabastece. Nunca debe tumbar la respuesta.
      verificarBajoStockYNotificar(
        resultado.varianteIdsTocados.map((varianteId) => ({ sucursalId: resultado.venta.sucursalId, varianteId }))
      ).catch((err) => console.error('Error verificando bajo stock tras editar venta:', err));

      res.json({ venta: resultado.venta, advertencias: resultado.advertencias });
    } catch (err) {
      if (err.message === 'VENTA_NO_ENCONTRADA') return res.status(404).json({ error: 'Venta no encontrada.' });
      if (err.message === 'VENTA_NO_EDITABLE') {
        return res.status(400).json({ error: 'Solo se pueden editar ventas completadas (no canceladas).' });
      }
      if (err.message === 'ITEMS_INVALIDOS') {
        return res.status(400).json({ error: 'La lista de artículos no coincide con los de la venta original.' });
      }
      if (err.message === 'CUENTA_TRANSFERENCIA_INVALIDA') {
        return res.status(400).json({ error: 'La cuenta de transferencia indicada no existe o está inactiva.' });
      }
      if (err.message.startsWith('STOCK_INSUFICIENTE')) {
        return res.status(409).json({ error: 'No hay stock suficiente para aumentar la cantidad de ese artículo.' });
      }
      throw err;
    }
  })
);

// GET /ventas/:id/ediciones - historial de correcciones hechas a una venta.
router.get(
  '/:id/ediciones',
  requireAuth,
  requireRole(...ROLES_ADMIN),
  asyncHandler(async (req, res) => {
    const ventaId = Number(req.params.id);
    const ediciones = await prisma.ventaEdicion.findMany({
      where: { ventaId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(ediciones);
  })
);

module.exports = router;
