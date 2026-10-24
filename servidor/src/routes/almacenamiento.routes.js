'use strict';
const express = require('express');
const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(autenticar);

// Cuota lógica informativa. No representa el almacenamiento físico de MongoDB
// y no limita subidas. Se puede configurar con MEIA_CUOTA_MB.
const cuotaMb = Number(process.env.MEIA_CUOTA_MB || 10);
const CUOTA_POR_USUARIO = Number.isFinite(cuotaMb) && cuotaMb > 0
  ? Math.floor(cuotaMb * 1024 * 1024) : 10 * 1024 * 1024;

router.get('/', async (req, res) => {
  try {
    const db = obtenerBD();
    const idSolicitado = req.query.usuarioId;
    const esAdmin = req.usuario.rol === 'ADMINISTRADOR';
    if (idSolicitado && (typeof idSolicitado !== 'string' || !/^[a-f\d]{24}$/i.test(idSolicitado))) {
      return res.status(400).json({ mensaje: 'ID de usuario inválido' });
    }
    if (idSolicitado && !esAdmin && idSolicitado !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'No puedes consultar el espacio de otros usuarios' });
    }

    const usuarioId = idSolicitado || (esAdmin ? null : req.usuario.id);
    if (usuarioId) {
      const existe = await db.collection('usuarios').findOne({ _id: new ObjectId(usuarioId) }, { projection: { _id: 1 } });
      if (!existe) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // Busca los buckets GridFS (por defecto fs.files, aunque el proyecto puede
    // usar archivos.files). GridFS deja el archivo físico en la papelera hasta
    // que se elimina permanentemente, por eso se incluye en el espacio usado.
    const colecciones = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map(c => c.name).filter(n => n.endsWith('.files'));
    let utilizado = 0;
    let totalArchivosAlmacenados = 0;
    for (const nombre of colecciones) {
      const filtro = usuarioId ? {
        'metadata.propietarioId': { $in: [new ObjectId(usuarioId), usuarioId] }
      } : {};
      const [resultado] = await db.collection(nombre).aggregate([
        { $match: filtro },
        { $group: { _id: null, bytes: { $sum: '$length' }, archivos: { $sum: 1 } } }
      ]).toArray();
      utilizado += resultado?.bytes || 0;
      totalArchivosAlmacenados += resultado?.archivos || 0;
    }

    const usuariosConCuota = usuarioId ? 1 : await db.collection('usuarios').countDocuments({ activo: true });
    const asignado = usuariosConCuota * CUOTA_POR_USUARIO;
    const disponible = Math.max(0, asignado - utilizado);
    const porcentajeUso = asignado > 0 ? Number((utilizado * 100 / asignado).toFixed(2)) : 0;
    return res.json({
      alcance: usuarioId ? 'usuario' : 'global',
      asignado, utilizado, disponible, porcentajeUso,
      cuotaPorUsuario: CUOTA_POR_USUARIO, usuariosConCuota,
      totalArchivosAlmacenados
    });
  } catch (error) {
    console.error('Error en almacenamiento:', error);
    return res.status(500).json({ mensaje: 'No fue posible calcular el almacenamiento' });
  }
});
module.exports = router;
