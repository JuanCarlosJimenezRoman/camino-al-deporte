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

  // Tallas de calzado segmentadas por categoría de edad/público, como en
  // Nike/marcas deportivas (TD = bebé, PS = preescolar, GS = escolar, WMNS =
  // mujer, MENS = hombre) — en vez de un solo tipo genérico "calzado". Cada
  // combinación (tipo, valor) es un renglón propio del catálogo de tallas,
  // así que un mismo número (ej. "22") puede existir en más de una
  // categoría (GS 22 y WMNS 22 no son la misma fila). Edítalas o agrega más
  // desde Catálogos → Tallas una vez que el sistema esté corriendo.
  function rangoTallas(desde, hasta, paso = 0.5) {
    const valores = [];
    for (let v = desde; v <= hasta + 1e-9; v += paso) {
      valores.push(Number(v.toFixed(1)).toString());
    }
    return valores;
  }

  const TALLAS_CALZADO = [
    { tipo: 'TD', valores: rangoTallas(8, 13) }, // Toddler/bebé, ~1-4 años
    { tipo: 'PS', valores: rangoTallas(13.5, 19.5) }, // Preschool/preescolar, ~4-7 años
    { tipo: 'GS', valores: rangoTallas(20, 25) }, // Grade School/escolar, ~7-12 años
    { tipo: 'WMNS', valores: rangoTallas(22, 28) }, // Women's/mujer, adulto
    { tipo: 'MENS', valores: rangoTallas(25, 32) }, // Men's/hombre, adulto
  ];

  for (const grupo of TALLAS_CALZADO) {
    for (let i = 0; i < grupo.valores.length; i++) {
      await prisma.talla.upsert({
        where: { valor_tipo: { valor: grupo.valores[i], tipo: grupo.tipo } },
        update: {},
        create: { valor: grupo.valores[i], tipo: grupo.tipo, orden: i },
      });
    }
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
