
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const carpetasRoutes = require('./routes/carpetas.routes');
const archivosRoutes = require('./routes/archivos.routes');
const archivosEdicionRoutes = require('./routes/archivos.edicion.routes');
const archivosPapeleraRoutes = require('./routes/archivos.papelera.routes');
const carpetasPapeleraRoutes = require('./routes/carpetas.papelera.routes');
const compartidosRoutes = require('./routes/compartidos.routes');
const actividadesRoutes = require('./routes/actividades.routes');
const { prepararIndicesActividades } = require('./services/actividad.service');

const {
    conectarMongoDB,
    obtenerBD
} = require('./config/mongodb');

const {
    prepararIndices
} = require('./config/indices');

const app = express();

const PORT = Number(process.env.PORT) || 3000;

app.use(cors({
    origin: process.env.CLIENT_URL
}));

app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/carpetas', carpetasRoutes);
app.use('/api/archivos', archivosRoutes);
app.use('/api/archivos', archivosEdicionRoutes);
app.use('/api/archivos', archivosPapeleraRoutes);
app.use('/api/carpetas', carpetasPapeleraRoutes);
app.use('/api/compartidos', compartidosRoutes);
app.use('/api/actividades', actividadesRoutes);

app.get('/api/health', async (req, res) => {
    try {
        await obtenerBD().command({ ping: 1 });

        res.json({
            estado: 'OK',
            servidor: 'Express funcionando',
            baseDatos: 'MongoDB conectado'
        });

    } catch (error) {
        res.status(503).json({
            estado: 'ERROR',
            mensaje: 'MongoDB no está disponible'
        });
    }
});

async function iniciarServidor() {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('Falta configurar JWT_SECRET');
        }
        await conectarMongoDB();
        await prepararIndices();
        await prepararIndicesActividades();
        app.listen(PORT, '127.0.0.1', () => {
            console.log(
                `Servidor ejecutándose en http://localhost:${PORT}`
            );
        });

    } catch (error) {
        console.error(
            'Error al iniciar el servidor:',
            error.message
        );

        process.exit(1);
    }
}

iniciarServidor();
