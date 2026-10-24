'use strict';

const express = require('express');
const { ObjectId, GridFSBucket } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');
const { registrarActividadSegura } = require('../services/actividad.service');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(autenticar);

function esId(valor) {
    return typeof valor === 'string' && /^[0-9a-fA-F]{24}$/.test(valor);
}

function idsEquivalentes(ids) {
    return [...ids, ...ids.map(id => id.toString())];
}

// Usa tanto ObjectId como string para tolerar carpetas creadas con
// versiones anteriores del proyecto.
async function obtenerSubarbol(coleccion, propietarioId, raizId) {
    const carpetas = await coleccion.find({
        propietarioId,
        $or: [
            { _id: raizId },
            { ancestros: { $in: [raizId, raizId.toString()] } }
        ]
    }, { projection: { _id: 1 } }).toArray();

    return carpetas.map(c => c._id);
}

// GET /api/carpetas/papelera - solo las carpetas que iniciaron
// una eliminacion; sus subcarpetas se incluyen al restaurar la raiz.
router.get('/papelera', async (req, res) => {
    try {
        const propietarioId = new ObjectId(req.usuario.id);
        const carpetas = await obtenerBD().collection('carpetas').find({
            propietarioId,
            enPapelera: true,
            $expr: { $eq: ['$papeleraLoteId', '$_id'] }
        }).sort({ fechaEliminacion: -1 }).toArray();

        return res.json({ total: carpetas.length, carpetas });
    } catch (error) {
        console.error('Error al consultar papelera de carpetas:', error);
        return res.status(500).json({ mensaje: 'No se pudo consultar la papelera de carpetas' });
    }
});

// DELETE /api/carpetas/:id - envia la jerarquia completa a papelera.
router.delete('/:id', async (req, res) => {
    if (!esId(req.params.id)) {
        return res.status(400).json({ mensaje: 'ID de carpeta invalido' });
    }

    try {
        const db = obtenerBD();
        const carpetas = db.collection('carpetas');
        const archivos = db.collection('documentos.files');
        const propietarioId = new ObjectId(req.usuario.id);
        const raizId = new ObjectId(req.params.id);
        const raiz = await carpetas.findOne({ _id: raizId, propietarioId, enPapelera: false });

        if (!raiz) {
            return res.status(404).json({ mensaje: 'Carpeta no encontrada o ya eliminada' });
        }

        const ids = await obtenerSubarbol(carpetas, propietarioId, raizId);
        const ahora = new Date();

        // Solo se marca lo que aun estaba activo. Los recursos que ya
        // pertenecian a otra operacion de papelera conservan su lote.
        const resultadoCarpetas = await carpetas.updateMany({
            _id: { $in: ids }, propietarioId, enPapelera: false
        }, {
            $set: {
                enPapelera: true,
                papeleraLoteId: raizId,
                fechaEliminacion: ahora,
                fechaActualizacion: ahora
            }
        });

        const resultadoArchivos = await archivos.updateMany({
            'metadata.propietarioId': propietarioId,
            'metadata.carpetaId': { $in: idsEquivalentes(ids) },
            'metadata.enPapelera': false
        }, {
            $set: {
                'metadata.enPapelera': true,
                'metadata.papeleraLoteId': raizId,
                'metadata.fechaEliminacion': ahora,
                'metadata.fechaActualizacion': ahora
            }
        });

        await registrarActividadSegura({
            usuarioId: req.usuario.id,
            accion: 'CARPETA_PAPELERA',
            tipoRecurso: 'carpeta',
            recursoId: raiz._id,
            recursoNombre: raiz.nombre,
            detalles: {
                carpetasAfectadas: resultadoCarpetas.modifiedCount,
                archivosAfectados: resultadoArchivos.modifiedCount
            }
        });
        return res.json({
            mensaje: 'Carpeta y contenido enviados a la papelera',
            carpetasAfectadas: resultadoCarpetas.modifiedCount,
            archivosAfectados: resultadoArchivos.modifiedCount
        });
    } catch (error) {
        console.error('Error al eliminar carpeta:', error);
        return res.status(500).json({ mensaje: 'No se pudo enviar la carpeta a papelera' });
    }
});

// PATCH /api/carpetas/:id/restaurar - restaura solo los recursos
// marcados por esa eliminacion. No revive archivos eliminados antes.
router.patch('/:id/restaurar', async (req, res) => {
    if (!esId(req.params.id)) {
        return res.status(400).json({ mensaje: 'ID de carpeta invalido' });
    }

    try {
        const db = obtenerBD();
        const carpetas = db.collection('carpetas');
        const archivos = db.collection('documentos.files');
        const propietarioId = new ObjectId(req.usuario.id);
        const raizId = new ObjectId(req.params.id);

        const raiz = await carpetas.findOne({
            _id: raizId, propietarioId,
            enPapelera: true,
            papeleraLoteId: raizId
        });

        if (!raiz) {
            return res.status(404).json({ mensaje: 'Carpeta no encontrada en papelera' });
        }

        // No mover automaticamente carpetas, pues eso obligaria a
        // recalcular ancestros de toda la jerarquia.
        if (raiz.padreId) {
            const idPadre = raiz.padreId.toString();
            if (!esId(idPadre)) {
                return res.status(409).json({ mensaje: 'Referencia del padre invalida' });
            }
            const padre = await carpetas.findOne({
                _id: new ObjectId(idPadre),
                propietarioId,
                enPapelera: false
            });
            if (!padre) {
                return res.status(409).json({
                    mensaje: 'Restaura primero la carpeta padre para conservar la jerarquia'
                });
            }
        }

        const ahora = new Date();
        const resultadoCarpetas = await carpetas.updateMany({
            propietarioId, enPapelera: true, papeleraLoteId: raizId
        }, {
            $set: { enPapelera: false, fechaRestauracion: ahora, fechaActualizacion: ahora },
            $unset: { papeleraLoteId: '', fechaEliminacion: '' }
        });

        const resultadoArchivos = await archivos.updateMany({
            'metadata.propietarioId': propietarioId,
            'metadata.enPapelera': true,
            'metadata.papeleraLoteId': raizId
        }, {
            $set: {
                'metadata.enPapelera': false,
                'metadata.fechaRestauracion': ahora,
                'metadata.fechaActualizacion': ahora
            },
            $unset: {
                'metadata.papeleraLoteId': '',
                'metadata.fechaEliminacion': ''
            }
        });

        await registrarActividadSegura({
            usuarioId: req.usuario.id,
            accion: 'CARPETA_RESTAURADA',
            tipoRecurso: 'carpeta',
            recursoId: raiz._id,
            recursoNombre: raiz.nombre,
            detalles: {
                carpetasRestauradas: resultadoCarpetas.modifiedCount,
                archivosRestaurados: resultadoArchivos.modifiedCount
            }
        });
        return res.json({
            mensaje: 'Carpeta y contenido restaurados',
            carpetasRestauradas: resultadoCarpetas.modifiedCount,
            archivosRestaurados: resultadoArchivos.modifiedCount
        });
    } catch (error) {
        console.error('Error al restaurar carpeta:', error);
        return res.status(500).json({ mensaje: 'No se pudo restaurar la carpeta' });
    }
});

// DELETE /api/carpetas/:id/permanente - elimina el contenido de
// todas las subcarpetas, incluidas las que ya estaban en papelera.
router.delete('/:id/permanente', async (req, res) => {
    if (!esId(req.params.id)) {
        return res.status(400).json({ mensaje: 'ID de carpeta invalido' });
    }

    try {
        const db = obtenerBD();
        const carpetas = db.collection('carpetas');
        const archivos = db.collection('documentos.files');
        const propietarioId = new ObjectId(req.usuario.id);
        const raizId = new ObjectId(req.params.id);

        const raiz = await carpetas.findOne({
            _id: raizId, propietarioId,
            enPapelera: true,
            papeleraLoteId: raizId
        });
        if (!raiz) {
            return res.status(404).json({ mensaje: 'Carpeta no encontrada en papelera' });
        }

        const ids = await obtenerSubarbol(carpetas, propietarioId, raizId);
        const documentos = await archivos.find({
            'metadata.propietarioId': propietarioId,
            'metadata.carpetaId': { $in: idsEquivalentes(ids) }
        }, { projection: { _id: 1 } }).toArray();

        const bucket = new GridFSBucket(db, { bucketName: 'documentos' });
        // Borra primero los archivos. Si alguna operacion falla, la
        // carpeta permanece en papelera y puede reintentarse.
        for (const documento of documentos) {
            await bucket.delete(documento._id);
        }

        const resultado = await carpetas.deleteMany({
            _id: { $in: ids }, propietarioId, enPapelera: true
        });

        await registrarActividadSegura({
            usuarioId: req.usuario.id,
            accion: 'CARPETA_ELIMINADA_PERMANENTE',
            tipoRecurso: 'carpeta',
            recursoId: raiz._id,
            recursoNombre: raiz.nombre,
            detalles: {
                carpetasEliminadas: resultado.deletedCount,
                archivosEliminados: documentos.length
            }
        });
        return res.json({
            mensaje: 'Carpeta y contenido eliminados definitivamente',
            carpetasEliminadas: resultado.deletedCount,
            archivosEliminados: documentos.length
        });
    } catch (error) {
        console.error('Error en eliminacion definitiva de carpeta:', error);
        return res.status(500).json({ mensaje: 'No se pudo completar la eliminacion definitiva' });
    }
});

module.exports = router;
