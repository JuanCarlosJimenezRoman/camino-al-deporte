const jwt = require('jsonwebtoken');

/**
 * Igual que requireAuth (middleware/auth.js) pero para cuentas de clientes de
 * la tienda en línea, que son un tipo de sesión totalmente distinto al de
 * los empleados (usuarios.js): no tienen rol ni sucursal, solo pueden ver y
 * operar sus propios pedidos.
 *
 * El token lleva { id, email, tipo: 'cliente' }. Se exige tipo === 'cliente'
 * para que un token de empleado nunca sirva en /tienda/* ni viceversa, aun
 * cuando ambos se firman con el mismo JWT_SECRET.
 */
function requireClienteAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'No autenticado. Falta el token.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.tipo !== 'cliente') {
      return res.status(401).json({ error: 'Token inválido para esta sección.' });
    }
    req.cliente = payload; // { id, email, nombre, tipo: 'cliente' }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

module.exports = { requireClienteAuth };
