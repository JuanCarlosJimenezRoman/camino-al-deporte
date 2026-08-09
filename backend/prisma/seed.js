require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ROLES = [
  { nombre: 'ADMIN_PRINCIPAL', descripcion: 'Acceso total al sistema.' },
  { nombre: 'DESARROLLO', descripcion: 'Acceso total + gestión de campos personalizados.' },
  { nombre: 'INVENTARIO', descripcion: 'Gestiona productos y existencias.' },
  { nombre: 'VENTAS', descripcion: 'Registra ventas y consulta stock.' },
  { nombre: 'CONSULTA', descripcion: 'Solo lectura de existencias y precios.' },
];

async function main() {
  console.log('Creando roles...');
  for (const rol of ROLES) {
    await prisma.rol.upsert({
      where: { nombre: rol.nombre },
      update: {},
      create: rol,
    });
  }

  // La migración multi-sucursal ya crea "Sucursal Principal" para bases de
  // datos existentes. Este upsert es solo para instalaciones nuevas donde
  // corres el seed después de `migrate dev`/`migrate deploy` sin datos previos.
  console.log('Asegurando sucursal principal...');
  await prisma.sucursal.upsert({
    where: { codigo: 'PRINCIPAL' },
    update: {},
    create: { nombre: 'Sucursal Principal', codigo: 'PRINCIPAL', esBodegaCentral: true },
  });

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@caminoaldeporte.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'cambia-esta-password';
  const nombre = process.env.SEED_ADMIN_NOMBRE || 'Administrador Principal';

  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (!existente) {
    console.log(`Creando usuario administrador inicial: ${email}`);
    const adminRol = await prisma.rol.findUnique({ where: { nombre: 'ADMIN_PRINCIPAL' } });
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.usuario.create({
      data: { nombre, email, passwordHash, rolId: adminRol.id },
    });
    console.log('Usuario administrador creado. IMPORTANTE: cambia la contraseña después del primer login.');
  } else {
    console.log('El usuario administrador ya existe, no se modifica.');
  }

  // Tallas de ejemplo (calzado deportivo mexicano) - edítalas o agrega más
  // desde el panel una vez que el sistema esté corriendo.
  const tallasCalzado = ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11'];
  for (let i = 0; i < tallasCalzado.length; i++) {
    await prisma.talla.upsert({
      where: { valor_tipo: { valor: tallasCalzado[i], tipo: 'calzado' } },
      update: {},
      create: { valor: tallasCalzado[i], tipo: 'calzado', orden: i },
    });
  }

  const tallasRopa = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  for (let i = 0; i < tallasRopa.length; i++) {
    await prisma.talla.upsert({
      where: { valor_tipo: { valor: tallasRopa[i], tipo: 'ropa' } },
      update: {},
      create: { valor: tallasRopa[i], tipo: 'ropa', orden: i },
    });
  }

  console.log('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
