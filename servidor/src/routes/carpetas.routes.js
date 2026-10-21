
const express = require('express');
const { ObjectId } = require('mongodb');

const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(autenticar);

// Crear carpeta
router.post('/', async (req, res) => {
    try {
        const { nombre, padreId = null } = req.body || {};

        if (
            typeof nombre !== 'string' ||
            !nombre.trim() ||
            nombre.trim().length > 100
        ) {
            return res.status(400).json({
                mensaje: 'Nombre de carpeta inválido'
            });
        }

        const db = obtenerBD();
        const carpetas = db.collection('carpetas');

        const propietarioId = new ObjectId(req.usuario.id);

        let carpetaPadre = null;
        let ancestros = [];

        if (padreId !== null) {
            if (
                typeof padreId !== 'string' ||
                !/^[a-fA-F0-9]{24}$/.test(padreId)
            ) {
                return res.status(400).json({
                    mensaje: 'ID de carpeta padre inválido'
                });
            }

            carpetaPadre = await carpetas.findOne({
                _id: new ObjectId(padreId),
                propietarioId,
                enPapelera: false
            });

            if (!carpetaPadre) {
                return res.status(404).json({
                    mensaje: 'Carpeta padre no encontrada'
                });
            }

            ancestros = [
                ...carpetaPadre.ancestros,
                carpetaPadre._id
            ];
        }

        const nuevaCarpeta = {
            nombre: nombre.trim(),
            propietarioId,
            padreId: carpetaPadre?._id ?? null,
            ancestros,
            enPapelera: false,
            fechaCreacion: new Date(),
            fechaActualizacion: new Date()
        };

        const resultado = await carpetas.insertOne(nuevaCarpeta);

        return res.status(201).json({
            mensaje: 'Carpeta creada correctamente',
            carpeta: {
                _id: resultado.insertedId,
                ...nuevaCarpeta
            }
        });

    } catch (error) {
        console.error('Error al crear carpeta:', error);

        return res.status(500).json({
            mensaje: 'Error al crear carpeta'
        });
    }
});

// Consultar carpetas de un nivel
router.get('/', async (req, res) => {
    try {
        const db = obtenerBD();

        const propietarioId = new ObjectId(req.usuario.id);
        const padreId = req.query.padreId ?? null;

        if (
            padreId !== null &&
            (typeof padreId !== 'string' ||
             !/^[a-fA-F0-9]{24}$/.test(padreId))
        ) {
            return res.status(400).json({
                mensaje: 'ID de carpeta padre inválido'
            });
        }

        const filtro = {
            propietarioId,
            padreId: padreId ? new ObjectId(padreId) : null,
            enPapelera: false
        };

        const carpetas = await db.collection('carpetas')
            .find(filtro)
            .sort({ nombre: 1 })
            .toArray();

        return res.json({
            total: carpetas.length,
            carpetas
        });

    } catch (error) {
        console.error('Error al consultar carpetas:', error);

        return res.status(500).json({
            mensaje: 'Error al consultar carpetas'
        });
    }
});

module.exports = router;
