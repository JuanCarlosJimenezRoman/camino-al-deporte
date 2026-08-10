const { PrismaClient } = require('@prisma/client');

// Cliente único de Prisma reutilizado en toda la app (evita agotar
// conexiones a PostgreSQL en cada request).
const prismaBase = new PrismaClient();

// El backend corre en el plan free de Render, cuya base de datos cierra
// conexiones que llevan un rato sin usarse (o se corta un instante al
// "despertar" el servicio tras estar dormido). Prisma no reconecta solo a
// mitad de una query: la primera que le toca una conexión muerta truena con
// P1017 ("Server has closed the connection") o P1001/P1002 (no se pudo
// alcanzar/abrir la conexión), aunque la base de datos esté perfectamente
// bien. Este extension reintenta UNA vez esas queries (con una pequeña
// espera) antes de darla por perdida — así un cliente no ve un 500 solo
// porque la conexión llevaba dormida un rato.
//
// Ojo: esto solo aplica a queries sueltas. Dentro de un `$transaction(...)`
// no tiene sentido reintentar una operación individual (la transacción
// completa ya se rompió si se cortó la conexión), así que ahí simplemente se
// deja fallar y el llamador debe reintentar la transacción completa si hace
// falta.
const CODIGOS_REINTENTABLES = new Set(['P1017', 'P1001', 'P1002']);

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const prisma = prismaBase.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      try {
        return await query(args);
      } catch (err) {
        if (!CODIGOS_REINTENTABLES.has(err.code)) throw err;
        console.warn(
          `Prisma: conexión cerrada por el servidor (${err.code}) en ${model}.${operation}, reintentando...`
        );
        await esperar(300);
        return query(args);
      }
    },
  },
});

module.exports = prisma;
