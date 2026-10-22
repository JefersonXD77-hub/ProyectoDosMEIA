
const express = require('express');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');

const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(autenticar);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        cb(null, /\.(txt|md)$/i.test(file.originalname));
    }
});

function obtenerBucket(db) {
    return new GridFSBucket(db, {
        bucketName: 'documentos'
    });
}

function convertirId(valor) {
    if (valor == null || valor === '') return null;

    if (
        typeof valor !== 'string' ||
        !/^[a-fA-F0-9]{24}$/.test(valor)
    ) {
        throw new Error('ID inválido');
    }

    return new ObjectId(valor);
}

// POST /api/archivos
router.post('/', (req, res, next) => {
    upload.single('archivo')(req, res, error => {
        if (error) {
            return res.status(
                error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
            ).json({
                mensaje: 'Archivo inválido o demasiado grande'
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                mensaje: 'Selecciona un archivo .txt o .md'
            });
        }

        let carpetaId;

        try {
            carpetaId = convertirId(req.body.carpetaId);
        } catch {
            return res.status(400).json({
                mensaje: 'ID de carpeta inválido'
            });
        }

        const db = obtenerBD();
        const propietarioId = new ObjectId(req.usuario.id);

        if (carpetaId) {
            const carpeta = await db.collection('carpetas').findOne({
                _id: carpetaId,
                propietarioId,
                enPapelera: false
            });

            if (!carpeta) {
                return res.status(404).json({
                    mensaje: 'Carpeta no encontrada'
                });
            }
        }

        const nombre = path.win32.basename(
            path.posix.basename(req.file.originalname)
        );

        const bucket = obtenerBucket(db);

        const stream = bucket.openUploadStream(nombre, {
            metadata: {
                propietarioId,
                carpetaId,
                enPapelera: false,
                tipo: path.extname(nombre).toLowerCase()
            }
        });

        await pipeline(
            Readable.from(req.file.buffer),
            stream
        );

        return res.status(201).json({
            mensaje: 'Archivo almacenado correctamente',
            archivo: {
                id: stream.id,
                nombre,
                tamano: req.file.size,
                carpetaId
            }
        });

    } catch (error) {
        console.error('Error al subir archivo:', error);

        return res.status(500).json({
            mensaje: 'No se pudo almacenar el archivo'
        });
    }
});

// GET /api/archivos
router.get('/', async (req, res) => {
    let carpetaId;

    try {
        carpetaId = convertirId(req.query.carpetaId);
    } catch {
        return res.status(400).json({
            mensaje: 'ID de carpeta inválido'
        });
    }

    try {
        const db = obtenerBD();

        const archivos = await db.collection('documentos.files')
            .find({
                'metadata.propietarioId': new ObjectId(req.usuario.id),
                'metadata.carpetaId': carpetaId,
                'metadata.enPapelera': false
            })
            .sort({ uploadDate: -1 })
            .toArray();

        return res.json({
            total: archivos.length,
            archivos
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            mensaje: 'Error al consultar archivos'
        });
    }
});

// GET /api/archivos/:id/descargar
router.get('/:id/descargar', async (req, res) => {
    let id;

    try {
        id = convertirId(req.params.id);
        if (!id) throw new Error('ID requerido');
    } catch {
        return res.status(400).json({
            mensaje: 'ID de archivo inválido'
        });
    }

    try {
        const db = obtenerBD();

        const archivo = await db.collection('documentos.files')
            .findOne({
                _id: id,
                'metadata.propietarioId': new ObjectId(req.usuario.id),
                'metadata.enPapelera': false
            });

        if (!archivo) {
            return res.status(404).json({
                mensaje: 'Archivo no encontrado'
            });
        }

        const bucket = obtenerBucket(db);

        res.setHeader(
            'Content-Type',
            'application/octet-stream'
        );

        res.setHeader(
            'Content-Disposition',
            `attachment; filename*=UTF-8''${encodeURIComponent(archivo.filename)}`
        );

        await pipeline(bucket.openDownloadStream(id), res);

    } catch (error) {
        console.error('Error al descargar:', error);

        if (!res.headersSent) {
            return res.status(500).json({
                mensaje: 'No se pudo descargar el archivo'
            });
        }

        res.destroy(error);
    }
});

module.exports = router;
