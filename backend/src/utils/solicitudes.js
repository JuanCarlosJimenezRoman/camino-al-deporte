const prisma = require('../db');

// El rol INVENTARIO no puede aplicar directamente ciertas acciones sensibles
// (desactivar catálogos, editar/desactivar proveedores): en vez de aplicar el
// cambio, se registra como SolicitudPermiso pendiente para que
// ADMIN_PRINCIPAL/DESARROLLO la apruebe o rechace (ver routes/solicitudes.js).
//
// Devuelve el objeto que el endpoint debe mandar como respuesta (202, no se
// aplicó nada todavía).
async function crearSolicitud({ tipo, accion, entidadId, entidadNombre, datosCambio, motivo, solicitadoPorId }) {
  const solicitud = await prisma.solicitudPermiso.create({
    data: {
      tipo,
      accion,
      entidadId,
      entidadNombre: entidadNombre || null,
      datosCambio: datosCambio && Object.keys(datosCambio).length > 0 ? datosCambio : undefined,
      motivo: motivo || null,
      solicitadoPorId,
    },
  });

  return {
    pendiente: true,
    mensaje: 'Esta acción requiere aprobación del administrador. Se envió tu solicitud.',
    solicitud,
  };
}

module.exports = { crearSolicitud };
