require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const catalogosRoutes = require('./routes/catalogos');
const productosRoutes = require('./routes/productos');
const inventarioRoutes = require('./routes/inventario');
const ventasRoutes = require('./routes/ventas');
const sucursalesRoutes = require('./routes/sucursales');
const transferenciasRoutes = require('./routes/transferencias');
const clientesRoutes = require('./routes/clientes');
const apartadosRoutes = require('./routes/apartados');
const proveedoresRoutes = require('./routes/proveedores');
const pedidosOnlineRoutes = require('./routes/pedidosOnline');
const configuracionTiendaRoutes = require('./routes/configuracionTienda');
const resenasRoutes = require('./routes/resenas');
const solicitudesRoutes = require('./routes/solicitudes');
const notificacionesRoutes = require('./routes/notificaciones');
const tiendaAuthRoutes = require('./routes/tienda/auth');
const tiendaCatalogoRoutes = require('./routes/tienda/catalogo');
const tiendaPedidosRoutes = require('./routes/tienda/pedidos');
const tiendaResenasRoutes = require('./routes/tienda/resenas');
const tiendaConfiguracionRoutes = require('./routes/tienda/configuracion');

const app = express();

app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);
// Helmet 7 no incluye Permissions-Policy en su bundle por defecto (se quitó
// del core tras el retiro de Feature-Policy), así que se agrega a mano.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/catalogos', catalogosRoutes);
app.use('/productos', productosRoutes);
app.use('/inventario', inventarioRoutes);
app.use('/ventas', ventasRoutes);
app.use('/sucursales', sucursalesRoutes);
app.use('/transferencias', transferenciasRoutes);
app.use('/clientes', clientesRoutes);
app.use('/apartados', apartadosRoutes);
app.use('/proveedores', proveedoresRoutes);
app.use('/pedidos-online', pedidosOnlineRoutes);
app.use('/configuracion-tienda', configuracionTiendaRoutes);
app.use('/resenas', resenasRoutes);
app.use('/solicitudes', solicitudesRoutes);
app.use('/notificaciones', notificacionesRoutes);

// Tienda en línea (cara al cliente): catálogo público + cuenta + pedidos.
app.use('/tienda/auth', tiendaAuthRoutes);
app.use('/tienda/productos', tiendaCatalogoRoutes);
app.use('/tienda/pedidos', tiendaPedidosRoutes);
app.use('/tienda/resenas', tiendaResenasRoutes);
app.use('/tienda/configuracion', tiendaConfiguracionRoutes);

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Red de seguridad: si algo async se escapa sin pasar por asyncHandler,
// que quede registrado en logs en vez de tumbar el proceso completo.
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API Camino al Deporte escuchando en el puerto ${PORT}`);
});
