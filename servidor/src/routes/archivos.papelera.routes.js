
const express = require('express');
const { ObjectId, GridFSBucket } = require('mongodb');

const { obtenerBD } = require('../config/mongodb');
const {
    autenticar
} = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas las rutas requieren un JWT valido
router.use(autenticar);

function validarId(id) {
    return typeof id === 'string' &&
        /^[a-fA-F0-9]{24}$/.test(id);
}

function obtenerBucket(db) {
    return new GridFSBucket(db, {
        bucketName: 'documentos'
    });
}

function filtroArchivo(req, enPapelera) {
    return {
        _id: new ObjectId(req.params.id),
        'metadata.propietarioId':
            new ObjectId(req.usuario.id),
        'metadata.enPapelera': enPapelera
    };
}

// GET /api/archivos/papelera
// Consultar archivos enviados a la papelera
router.get('/papelera', async (req, res) => {
    try {
        const db = obtenerBD();

        const archivos = await db
            .collection('documentos.files')
            .find({
                'metadata.propietarioId':
                    new ObjectId(req.usuario.id),
                'metadata.enPapelera': true
            })
            .sort({
                'metadata.fechaEliminacion': -1
            })
            .toArray();

        return res.json({
            total: archivos.length,
            archivos
        });

    } catch (error) {
        console.error('Error al consultar papelera:', error);

        return res.status(500).json({
            mensaje: 'No se pudo consultar la papelera'
        });
    }
});

// DELETE /api/archivos/:id
// Eliminacion logica: conserva el archivo en GridFS
router.delete('/:id', async (req, res) => {
    try {
        if (!validarId(req.params.id)) {
            return res.status(400).json({
                mensaje: 'Identificador invalido'
            });
        }

        const db = obtenerBD();

        const resultado = await db
            .collection('documentos.files')
            .updateOne(
                filtroArchivo(req, false),
                {
                    $set: {
                        'metadata.enPapelera': true,
                        'metadata.fechaEliminacion': new Date(),
                        'metadata.fechaActualizacion': new Date()
                    }
                }
            );

        if (resultado.matchedCount === 0) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado'
            });
        }

        return res.json({
            mensaje: 'Archivo enviado a la papelera'
        });

    } catch (error) {
        console.error('Error al eliminar:', error);

        return res.status(500).json({
            mensaje: 'No se pudo enviar a papelera'
        });
    }
});

// PATCH /api/archivos/:id/restaurar
// Recuperar un archivo de la papelera
router.patch('/:id/restaurar', async (req, res) => {
    try {
        if (!validarId(req.params.id)) {
            return res.status(400).json({
                mensaje: 'Identificador invalido'
            });
        }

        const db = obtenerBD();
        const coleccion = db.collection('documentos.files');

        const filtro = filtroArchivo(req, true);

        const archivo = await coleccion.findOne(filtro);

        if (!archivo) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado en papelera'
            });
        }

        let carpetaDestino = null;
        const carpetaOriginal =
            archivo.metadata?.carpetaId ?? null;

        // Restaurar en su carpeta original si sigue existiendo
        if (carpetaOriginal) {
            const carpeta = await db
                .collection('carpetas')
                .findOne({
                    _id: carpetaOriginal,
                    propietarioId:
                        new ObjectId(req.usuario.id),
                    enPapelera: false
                });

            if (carpeta) {
                carpetaDestino = carpetaOriginal;
            }
        }

        // Si la carpeta original no existe,
        // restaurar el archivo en la raiz
        const resultado = await coleccion.updateOne(
            filtro,
            {
                $set: {
                    'metadata.enPapelera': false,
                    'metadata.carpetaId': carpetaDestino,
                    'metadata.fechaRestauracion': new Date(),
                    'metadata.fechaActualizacion': new Date()
                },
                $unset: {
                    'metadata.fechaEliminacion': ''
                }
            }
        );

        if (resultado.matchedCount === 0) {
            return res.status(409).json({
                mensaje: 'El archivo cambio durante la operacion'
            });
        }

        return res.json({
            mensaje: 'Archivo restaurado correctamente',
            archivo: {
                id: archivo._id,
                nombre: archivo.filename,
                carpetaId: carpetaDestino
            }
        });

    } catch (error) {
        console.error('Error al restaurar:', error);

        return res.status(500).json({
            mensaje: 'No se pudo restaurar el archivo'
        });
    }
});

// DELETE /api/archivos/:id/permanente
// Eliminar definitivamente el contenido y los metadatos
router.delete('/:id/permanente', async (req, res) => {
    try {
        if (!validarId(req.params.id)) {
            return res.status(400).json({
                mensaje: 'Identificador invalido'
            });
        }

        const db = obtenerBD();

        const archivo = await db
            .collection('documentos.files')
            .findOne(filtroArchivo(req, true));

        if (!archivo) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado en papelera'
            });
        }

        const bucket = obtenerBucket(db);

        await bucket.delete(archivo._id);

        return res.json({
            mensaje: 'Archivo eliminado definitivamente'
        });

    } catch (error) {
        console.error('Error en eliminacion permanente:', error);

        return res.status(500).json({
            mensaje: 'No se pudo eliminar definitivamente'
        });
    }
});

module.exports = router;
