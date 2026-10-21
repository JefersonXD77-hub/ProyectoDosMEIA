
const express = require('express');
const bcrypt = require('bcryptjs');

const { obtenerBD } = require('../config/mongodb');

const {
    autenticar,
    soloAdministrador
} = require('../middlewares/auth.middleware');

const router = express.Router();

// Consultar todos los usuarios (Administrador)
router.get('/', autenticar, soloAdministrador, async (req, res) => {
    try {
        const db = obtenerBD();

        const usuarios = await db.collection('usuarios')
            .find({}, {
                projection: {
                    passwordHash: 0
                }
            })
            .sort({ nombre: 1 })
            .toArray();

        return res.json({
            total: usuarios.length,
            usuarios
        });

    } catch (error) {
        console.error(error.message);

        return res.status(500).json({
            mensaje: 'Error al consultar usuarios'
        });
    }
});

// Crear un usuario (Administrador)
router.post('/', autenticar, soloAdministrador, async (req, res) => {
    try {
        const { nombre, username, password, rol } = req.body || {};

        if (
            typeof nombre !== 'string' ||
            typeof username !== 'string' ||
            typeof password !== 'string' ||
            !nombre.trim() ||
            !username.trim() ||
            password.length < 5
        ) {
            return res.status(400).json({
                mensaje: 'Datos inválidos o contraseña demasiado corta'
            });
        }

        const rolAsignado = rol || 'USUARIO';

        if (!['USUARIO', 'ADMINISTRADOR'].includes(rolAsignado)) {
            return res.status(400).json({
                mensaje: 'Rol no válido'
            });
        }

        const db = obtenerBD();
        const usuarios = db.collection('usuarios');

        const usernameNormalizado = username.trim().toLowerCase();

        if (!/^[a-z0-9_]{3,30}$/.test(usernameNormalizado)) {
            return res.status(400).json({
                mensaje: 'Username inválido: utiliza de 3 a 30 letras, números o guiones bajos'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const nuevoUsuario = {
            nombre: nombre.trim(),
            username: usernameNormalizado,
            passwordHash,
            rol: rolAsignado,
            activo: true,
            fechaCreacion: new Date(),
            fechaActualizacion: new Date()
        };

        const resultado = await usuarios.insertOne(nuevoUsuario);

        return res.status(201).json({
            mensaje: 'Usuario creado correctamente',
            usuario: {
                id: resultado.insertedId,
                nombre: nuevoUsuario.nombre,
                username: nuevoUsuario.username,
                rol: nuevoUsuario.rol,
                activo: nuevoUsuario.activo
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                mensaje: 'El nombre de usuario ya existe'
            });
        }

        console.error(error.message);

        return res.status(500).json({
            mensaje: 'Error al crear usuario'
        });
    }
});

module.exports = router;
