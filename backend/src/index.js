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

const app = express();

app.use(helmet());
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

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API Camino al Deporte escuchando en el puerto ${PORT}`);
});
