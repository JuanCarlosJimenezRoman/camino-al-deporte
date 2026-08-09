/**
 * Envuelve un handler async de Express para que cualquier error (por
 * ejemplo, un error de Prisma) se pase a next(err) en vez de generar una
 * "unhandled promise rejection".
 *
 * IMPORTANTE: Express 4 (el que usa este proyecto) NO captura automáticamente
 * los errores lanzados dentro de handlers async. Sin este wrapper, un error
 * cualquiera (una tabla que no existe, una consulta inválida, etc.) tumba
 * TODO el proceso de Node en vez de responder con un 500 al cliente. Por eso
 * todas las rutas de este proyecto usan asyncHandler(...).
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
