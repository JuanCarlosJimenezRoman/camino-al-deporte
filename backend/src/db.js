const { PrismaClient } = require('@prisma/client');

// Cliente único de Prisma reutilizado en toda la app (evita agotar
// conexiones a PostgreSQL en cada request).
const prisma = new PrismaClient();

module.exports = prisma;
