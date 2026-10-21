
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                mensaje: 'Usuario y contraseña requeridos'
            });
        }

        // Buscar usuario en MongoDB
        const db = obtenerBD();

        const usuario = await db.collection('usuarios')
            .findOne({ username: username.trim() });

        if (!usuario || !usuario.activo) {
            return res.status(401).json({
                mensaje: 'Credenciales incorrectas'
            });
        }

        // Comparar contraseña con su hash
        const passwordValida = await bcrypt.compare(
            password,
            usuario.passwordHash
        );

        if (!passwordValida) {
            return res.status(401).json({
                mensaje: 'Credenciales incorrectas'
            });
        }

        // Generar token de autenticación
        const token = jwt.sign(
            {
                sub: usuario._id.toString(),
                rol: usuario.rol
            },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        return res.json({
            mensaje: 'Inicio de sesión exitoso',
            token,
            usuario: {
                id: usuario._id,
                nombre: usuario.nombre,
                username: usuario.username,
                rol: usuario.rol
            }
        });

    } catch (error) {
        console.error('Error de autenticación:', error);

        return res.status(500).json({
            mensaje: 'Error interno del servidor'
        });
    }
});
router.get('/me', autenticar, (req, res) => {
    res.json({
        mensaje: 'Usuario autenticado correctamente',
        usuario: req.usuario
    });
});
module.exports = router;
