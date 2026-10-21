
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');

async function autenticar(req, res, next) {
    const encabezado = req.headers.authorization;

    if (!encabezado || !encabezado.startsWith('Bearer ')) {
        return res.status(401).json({
            mensaje: 'Token de autenticación requerido'
        });
    }

    const token = encabezado.slice(7);
    let datosToken;

    try {
        datosToken = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ['HS256']
        });
    } catch (error) {
        return res.status(401).json({
            mensaje: 'Token inválido o vencido'
        });
    }

    if (!datosToken.sub || !ObjectId.isValid(datosToken.sub)) {
        return res.status(401).json({
            mensaje: 'Token inválido'
        });
    }

    try {
        const db = obtenerBD();

        const usuario = await db.collection('usuarios').findOne({
            _id: new ObjectId(datosToken.sub)
        });

        if (!usuario || !usuario.activo) {
            return res.status(401).json({
                mensaje: 'Usuario inexistente o inactivo'
            });
        }

        req.usuario = {
            id: usuario._id.toString(),
            nombre: usuario.nombre,
            username: usuario.username,
            rol: usuario.rol
        };

        next();

    } catch (error) {
        console.error('Error al autenticar:', error.message);

        return res.status(500).json({
            mensaje: 'Error interno del servidor'
        });
    }
}

function soloAdministrador(req, res, next) {
    if (req.usuario?.rol !== 'ADMINISTRADOR') {
        return res.status(403).json({
            mensaje: 'Acceso exclusivo para administradores'
        });
    }

    next();
}

module.exports = {
    autenticar,
    soloAdministrador
};
