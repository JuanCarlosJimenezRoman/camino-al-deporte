/**
 * Middleware de autorización por rol.
 * Uso: router.post('/productos', requireAuth, requireRole('ADMIN_PRINCIPAL', 'DESARROLLO', 'INVENTARIO'), handler)
 *
 * Matriz de permisos de referencia (ver docs/ARQUITECTURA.md):
 *  - ADMIN_PRINCIPAL: acceso total.
 *  - DESARROLLO: acceso total + gestión de campos personalizados.
 *  - INVENTARIO: CRUD de productos/variantes, movimientos de inventario. No gestiona usuarios.
 *  - VENTAS: crea ventas, consulta stock. No edita catálogo ni inventario.
 *  - CONSULTA: solo lectura de existencias y precios.
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado.', code: 'AUTH_REQUIRED' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    }
    next();
  };
}

module.exports = { requireRole };
