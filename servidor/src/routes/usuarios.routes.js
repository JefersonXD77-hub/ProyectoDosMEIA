
const express = require('express');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

const { obtenerBD } = require('../config/mongodb');
const { registrarActividadSegura } = require('../services/actividad.service');

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

        await registrarActividadSegura({
            usuarioId: req.usuario.id,
            accion: 'USUARIO_CREADO',
            tipoRecurso: 'usuario',
            recursoId: resultado.insertedId,
            recursoNombre: nuevoUsuario.username,
            detalles: { rol: nuevoUsuario.rol }
        });

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

// MEIA_BLOQUE18: activar o desactivar usuarios, solo administración.
router.patch('/:id/estado', autenticar, soloAdministrador, async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body || {};
  if (!/^[a-fA-F0-9]{24}$/.test(id) || typeof activo !== 'boolean') {
    return res.status(400).json({ mensaje: 'Identificador o estado inválido' });
  }
  if (!activo && id === req.usuario.id) {
    return res.status(403).json({ mensaje: 'No puedes desactivar tu cuenta' });
  }
  try {
    const usuarios = obtenerBD().collection('usuarios');
    const _id = new ObjectId(id);
    const usuario = await usuarios.findOne({ _id });
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    if (!activo && usuario.rol === 'ADMINISTRADOR') {
      const administradores = await usuarios.countDocuments({ rol: 'ADMINISTRADOR', activo: true });
      if (administradores <= 1) {
        return res.status(409).json({ mensaje: 'Debe existir un administrador activo' });
      }
    }
    if (usuario.activo !== activo) {
      await usuarios.updateOne({ _id }, { $set: { activo, fechaActualizacion: new Date() } });
      await registrarActividadSegura({
        usuarioId: req.usuario.id, accion: activo ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
        tipoRecurso: 'usuario', recursoId: _id, recursoNombre: usuario.username,
        detalles: { activoAnterior: usuario.activo, activoNuevo: activo }
      });
    }
    return res.json({ mensaje: activo ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente',
      usuario: { id, username: usuario.username, activo } });
  } catch (error) {
    console.error('Estado de usuario:', error.message);
    return res.status(500).json({ mensaje: 'Error al modificar el usuario' });
  }
});

module.exports = router;
