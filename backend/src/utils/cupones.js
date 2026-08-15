// Lógica compartida para validar y calcular el descuento de un cupón de
// código, usada tanto por la vista previa (POST /tienda/cupones/validar)
// como por la creación real del pedido (POST /tienda/pedidos) — así las dos
// nunca se desincronizan en qué reglas aplican.
//
// Un cupón SOLO descuenta los renglones del carrito cuyo producto esté en
// CuponProducto (ver comentario en schema.prisma). Si ninguno de los
// productos del carrito está en la lista del cupón, se rechaza por
// completo — no se descuenta "lo que sí aplica y ya", porque normalmente el
// cliente esperaría que el cupón cubra lo que trae en el carrito.

const CODIGOS_ERROR = {
  CUPON_NO_ENCONTRADO: 'Ese código de cupón no existe o ya no está activo.',
  CUPON_NO_VIGENTE: 'Ese cupón todavía no está vigente.',
  CUPON_VENCIDO: 'Ese cupón ya venció.',
  CUPON_NO_APLICA: 'Ese cupón no aplica a los productos que tienes en el carrito.',
  CUPON_AGOTADO: 'Ese cupón ya alcanzó su límite de usos.',
  CUPON_LIMITE_CLIENTE: 'Ya usaste ese cupón el máximo de veces permitido.',
};

// `tx` puede ser el cliente de Prisma normal o una transacción — ambos
// exponen los mismos métodos .cupon / .cuponUso.
async function buscarCupon(tx, codigoCrudo) {
  const codigo = String(codigoCrudo || '').trim().toUpperCase();
  if (!codigo) return { error: 'CUPON_NO_ENCONTRADO' };

  const cupon = await tx.cupon.findUnique({
    where: { codigo },
    include: { productos: { select: { productoId: true } } },
  });
  if (!cupon || !cupon.activo) return { error: 'CUPON_NO_ENCONTRADO' };

  const ahora = new Date();
  if (cupon.fechaInicio && ahora < cupon.fechaInicio) return { error: 'CUPON_NO_VIGENTE' };
  if (cupon.fechaFin && ahora > cupon.fechaFin) return { error: 'CUPON_VENCIDO' };

  return { cupon };
}

// `items` = [{ productoId, cantidad, precioUnitario }] tal cual se van a
// guardar en PedidoItem (o su preview desde el carrito). `clienteId` es
// opcional en la vista previa sin sesión, pero en la práctica siempre hay
// cliente autenticado en checkout.
async function calcularDescuentoCupon(tx, cupon, items, clienteId) {
  const idsProductosCupon = new Set(cupon.productos.map((p) => p.productoId));
  const itemsAplicables = items.filter((it) => idsProductosCupon.has(it.productoId));

  if (itemsAplicables.length === 0) {
    return { error: 'CUPON_NO_APLICA' };
  }

  const subtotalAplicable = itemsAplicables.reduce((acc, it) => acc + it.precioUnitario * it.cantidad, 0);

  if (cupon.montoMinimo != null && subtotalAplicable < Number(cupon.montoMinimo)) {
    return {
      error: 'CUPON_MONTO_MINIMO',
      mensaje: `Este cupón requiere una compra mínima de $${Number(cupon.montoMinimo).toFixed(2)} en los productos participantes.`,
    };
  }

  if (cupon.usosMaximos != null) {
    const totalUsos = await tx.cuponUso.count({ where: { cuponId: cupon.id } });
    if (totalUsos >= cupon.usosMaximos) return { error: 'CUPON_AGOTADO' };
  }

  if (cupon.usosPorCliente != null && clienteId) {
    const usosCliente = await tx.cuponUso.count({ where: { cuponId: cupon.id, clienteId } });
    if (usosCliente >= cupon.usosPorCliente) return { error: 'CUPON_LIMITE_CLIENTE' };
  }

  let montoDescuento =
    cupon.tipoDescuento === 'PORCENTAJE' ? subtotalAplicable * (Number(cupon.valor) / 100) : Number(cupon.valor);
  montoDescuento = Math.max(0, Math.min(montoDescuento, subtotalAplicable));
  montoDescuento = Math.round(montoDescuento * 100) / 100;

  return { montoDescuento, subtotalAplicable };
}

function mensajeError(codigo) {
  return CODIGOS_ERROR[codigo] || 'No se pudo aplicar el cupón.';
}

module.exports = { buscarCupon, calcularDescuentoCupon, mensajeError };
