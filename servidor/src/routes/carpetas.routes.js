const express = require('express');
const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');
const { registrarActividadSegura } = require('../services/actividad.service');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(autenticar);

// Crear carpeta
router.post('/', async (req, res) => {
  try {
    const { nombre, padreId = null } = req.body || {};
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100) {
      return res.status(400).json({ mensaje: 'Nombre de carpeta inválido' });
    }
    const db = obtenerBD();
    const carpetas = db.collection('carpetas');
    const propietarioId = new ObjectId(req.usuario.id);
    let carpetaPadre = null;
    let ancestros = [];
    if (padreId !== null) {
      if (typeof padreId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(padreId)) {
        return res.status(400).json({ mensaje: 'ID de carpeta padre inválido' });
      }
      carpetaPadre = await carpetas.findOne({ _id: new ObjectId(padreId), propietarioId, enPapelera: false });
      if (!carpetaPadre) return res.status(404).json({ mensaje: 'Carpeta padre no encontrada' });
      if (!Array.isArray(carpetaPadre.ancestros)) return res.status(409).json({ mensaje: 'Jerarquía de carpeta inválida' });
      ancestros = [...carpetaPadre.ancestros, carpetaPadre._id];
    }
    const nuevaCarpeta = {
      nombre: nombre.trim(), propietarioId, padreId: carpetaPadre?._id ?? null,
      ancestros, enPapelera: false, fechaCreacion: new Date(), fechaActualizacion: new Date()
    };
    const resultado = await carpetas.insertOne(nuevaCarpeta);
    await registrarActividadSegura({
      usuarioId: req.usuario.id, accion: 'CARPETA_CREADA', tipoRecurso: 'carpeta',
      recursoId: resultado.insertedId, recursoNombre: nuevaCarpeta.nombre,
      detalles: { padreId: String(nuevaCarpeta.padreId ?? '') }
    });
    return res.status(201).json({ mensaje: 'Carpeta creada correctamente', carpeta: { _id: resultado.insertedId, ...nuevaCarpeta } });
  } catch (error) {
    console.error('Error al crear carpeta:', error);
    return res.status(500).json({ mensaje: 'Error al crear carpeta' });
  }
});

// Consultar carpetas de un nivel
router.get('/', async (req, res) => {
  try {
    const propietarioId = new ObjectId(req.usuario.id);
    const padreId = req.query.padreId ?? null;
    if (padreId !== null && (typeof padreId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(padreId))) {
      return res.status(400).json({ mensaje: 'ID de carpeta padre inválido' });
    }
    const carpetas = await obtenerBD().collection('carpetas').find({
      propietarioId, padreId: padreId ? new ObjectId(padreId) : null, enPapelera: false
    }).sort({ nombre: 1 }).toArray();
    return res.json({ total: carpetas.length, carpetas });
  } catch (error) {
    console.error('Error al consultar carpetas:', error);
    return res.status(500).json({ mensaje: 'Error al consultar carpetas' });
  }
});

// Renombrar o mover una carpeta propia sin crear ciclos en la jerarquía.
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(400).json({ mensaje: 'ID de carpeta inválido' });
  }
  const cambios = req.body;
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
    return res.status(400).json({ mensaje: 'Cambios inválidos' });
  }
  const llaves = Object.keys(cambios);
  if (llaves.length !== 1 || !['nombre', 'padreId'].includes(llaves[0])) {
    return res.status(400).json({ mensaje: 'Indica únicamente nombre o padreId' });
  }
  const esRenombrado = llaves[0] === 'nombre';
  if (esRenombrado) {
    if (typeof cambios.nombre !== 'string' || !cambios.nombre.trim() || cambios.nombre.trim().length > 100) {
      return res.status(400).json({ mensaje: 'Nombre de carpeta inválido (máximo 100 caracteres)' });
    }
  } else if (cambios.padreId !== null &&
    (typeof cambios.padreId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(cambios.padreId))) {
    return res.status(400).json({ mensaje: 'ID de destino inválido' });
  }

  try {
    const carpetas = obtenerBD().collection('carpetas');
    const propietarioId = new ObjectId(req.usuario.id);
    const carpetaId = new ObjectId(id);
    const carpeta = await carpetas.findOne({ _id: carpetaId, propietarioId, enPapelera: false });
    if (!carpeta) return res.status(404).json({ mensaje: 'Carpeta no encontrada' });
    if (!Array.isArray(carpeta.ancestros)) return res.status(409).json({ mensaje: 'Jerarquía de la carpeta incompleta' });

    const ahora = new Date();
    if (esRenombrado) {
      const nombre = cambios.nombre.trim();
      if (nombre === carpeta.nombre) return res.json({ mensaje: 'La carpeta ya tiene ese nombre' });
      await carpetas.updateOne({ _id: carpetaId, propietarioId, enPapelera: false },
        { $set: { nombre, fechaActualizacion: ahora } });
      await registrarActividadSegura({
        usuarioId: req.usuario.id, accion: 'CARPETA_RENOMBRADA', tipoRecurso: 'carpeta',
        recursoId: carpetaId, recursoNombre: nombre,
        detalles: { nombreAnterior: carpeta.nombre }
      });
      return res.json({ mensaje: 'Carpeta renombrada correctamente', carpeta: { id, nombre } });
    }

    const nuevoPadreId = cambios.padreId === null ? null : new ObjectId(cambios.padreId);
    if ((carpeta.padreId?.toString() ?? null) === (nuevoPadreId?.toString() ?? null)) {
      return res.status(409).json({ mensaje: 'La carpeta ya está en esa ubicación' });
    }
    if (nuevoPadreId && nuevoPadreId.equals(carpetaId)) {
      return res.status(400).json({ mensaje: 'No puedes mover una carpeta dentro de sí misma' });
    }

    let destino = null;
    if (nuevoPadreId) {
      destino = await carpetas.findOne({ _id: nuevoPadreId, propietarioId, enPapelera: false });
      if (!destino) return res.status(404).json({ mensaje: 'Carpeta de destino no encontrada' });
      if (!Array.isArray(destino.ancestros)) return res.status(409).json({ mensaje: 'Jerarquía de destino incompleta' });
      if (destino.ancestros.some(a => a.toString() === id)) {
        return res.status(409).json({ mensaje: 'No se puede mover una carpeta dentro de sus descendientes' });
      }
    }

    // Los archivos mantienen metadata.carpetaId: no cambia el ID de su carpeta directa.
    // Se modifica el prefijo de ancestros de la carpeta y de todos sus descendientes.
    const nuevaRuta = destino ? [...destino.ancestros, destino._id] : [];
    const longitudPrefijoAntiguo = carpeta.ancestros.length;
    const resultado = await carpetas.updateMany(
      { propietarioId, $or: [{ _id: carpetaId }, { ancestros: carpetaId }] },
      [{ $set: {
        ancestros: { $concatArrays: [
          { $literal: nuevaRuta },
          { $slice: ['$ancestros', longitudPrefijoAntiguo, { $max: [1, { $subtract: [{ $size: '$ancestros' }, longitudPrefijoAntiguo] }] }] }
        ] },
        padreId: { $cond: [{ $eq: ['$_id', carpetaId] }, { $literal: nuevoPadreId }, '$padreId'] },
        fechaActualizacion: ahora
      } }]
    );
    await registrarActividadSegura({
      usuarioId: req.usuario.id, accion: 'CARPETA_MOVIDA', tipoRecurso: 'carpeta',
      recursoId: carpetaId, recursoNombre: carpeta.nombre,
      detalles: { padreAnterior: String(carpeta.padreId ?? ''), padreDestino: String(nuevoPadreId ?? ''), carpetasActualizadas: resultado.modifiedCount }
    });
    return res.json({ mensaje: 'Carpeta y jerarquía movidas correctamente',
      carpeta: { id, nombre: carpeta.nombre, padreId: nuevoPadreId },
      carpetasActualizadas: resultado.modifiedCount });
  } catch (error) {
    console.error('Error al actualizar carpeta:', error);
    return res.status(500).json({ mensaje: 'No fue posible actualizar la carpeta' });
  }
});

module.exports = router;
