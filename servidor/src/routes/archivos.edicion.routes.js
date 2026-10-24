
const express = require('express');
const { ObjectId } = require('mongodb');

const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las operaciones requieren autenticacion
router.use(autenticar);

// Validar identificadores de MongoDB
function idValido(valor) {
    return (
        typeof valor === 'string' &&
        /^[a-fA-F0-9]{24}$/.test(valor)
    );
}

// PATCH /api/archivos/:id
router.patch('/:id', async (req, res) => {
    try {
        const idArchivo = req.params.id;
        const propietarioId = new ObjectId(req.usuario.id);

        if (!idValido(idArchivo)) {
            return res.status(400).json({
                mensaje: 'Identificador de archivo invalido'
            });
        }

        const datos = req.body;

        if (
            !datos ||
            typeof datos !== 'object' ||
            Array.isArray(datos)
        ) {
            return res.status(400).json({
                mensaje: 'Se requiere un cuerpo JSON valido'
            });
        }

        const cambiarNombre =
            Object.prototype.hasOwnProperty.call(
                datos, 'nombre'
            );

        const cambiarCarpeta =
            Object.prototype.hasOwnProperty.call(
                datos, 'carpetaId'
            );

        if (!cambiarNombre && !cambiarCarpeta) {
            return res.status(400).json({
                mensaje: 'Indica nombre o carpetaId'
            });
        }

        const db = obtenerBD();
        const coleccion = db.collection('documentos.files');

        const filtro = {
            _id: new ObjectId(idArchivo),
            'metadata.propietarioId': propietarioId,
            'metadata.enPapelera': false
        };

        // Comprobar propiedad del archivo
        const archivo = await coleccion.findOne(filtro);

        if (!archivo) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado'
            });
        }

        const cambios = {};

        // RENOMBRAR
        if (cambiarNombre) {
            if (typeof datos.nombre !== 'string') {
                return res.status(400).json({
                    mensaje: 'El nombre debe ser texto'
                });
            }

            const nombre = datos.nombre.trim();

            const nombrePermitido =
                /^[^\\/:*?"<>|\u0000-\u001F]{1,150}\.(txt|md)$/i;

            if (!nombrePermitido.test(nombre)) {
                return res.status(400).json({
                    mensaje: 'Nombre invalido. Usa .txt o .md'
                });
            }

            cambios.filename = nombre;

            cambios['metadata.tipo'] =
                nombre.toLowerCase().endsWith('.md')
                    ? '.md'
                    : '.txt';
        }

        // MOVER
        if (cambiarCarpeta) {
            let carpetaDestino = null;

            if (datos.carpetaId !== null) {
                if (!idValido(datos.carpetaId)) {
                    return res.status(400).json({
                        mensaje: 'Carpeta destino invalida'
                    });
                }

                carpetaDestino = new ObjectId(
                    datos.carpetaId
                );

                // Verificar que la carpeta exista,
                // sea propia y no este en papelera
                const carpeta = await db
                    .collection('carpetas')
                    .findOne({
                        _id: carpetaDestino,
                        propietarioId,
                        enPapelera: false
                    });

                if (!carpeta) {
                    return res.status(404).json({
                        mensaje: 'Carpeta destino no encontrada'
                    });
                }
            }

            cambios['metadata.carpetaId'] =
                carpetaDestino;
        }

        cambios['metadata.fechaActualizacion'] =
            new Date();

        const resultado = await coleccion.updateOne(
            filtro,
            { $set: cambios }
        );

        if (resultado.matchedCount === 0) {
            return res.status(404).json({
                mensaje: 'El archivo ya no esta disponible'
            });
        }

        const actualizado = await coleccion.findOne(
            filtro
        );

        return res.json({
            mensaje: 'Archivo actualizado correctamente',
            archivo: {
                id: actualizado._id,
                nombre: actualizado.filename,
                carpetaId:
                    actualizado.metadata.carpetaId,
                fechaActualizacion:
                    actualizado.metadata.fechaActualizacion
            }
        });

    } catch (error) {
        console.error(
            'Error al actualizar archivo:',
            error
        );

        return res.status(500).json({
            mensaje: 'Error interno al actualizar archivo'
        });
    }
});

module.exports = router;
