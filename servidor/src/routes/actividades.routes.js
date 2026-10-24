'use strict';

const express = require('express');
const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');

const router = express.Router();

function convertirId(valor) {
  return typeof valor === 'string' && /^[0-9a-fA-F]{24}$/.test(valor)
    ? new ObjectId(valor)
    : null;
}

function fechaUTC(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const valor = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha
    ? valor
    : null;
}

// GET /api/actividades?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&accion=ARCHIVO_SUBIDO
// Admin: todas las actividades, o filtra por usuarioId. Usuario normal: solo las propias.
router.get('/', autenticar, async (req, res) => {
  try {
    const admin = req.usuario?.rol === 'ADMINISTRADOR';
    const idSesion = convertirId(req.usuario?.id);
    if (!idSesion) return res.status(401).json({ mensaje: 'Sesión inválida' });

    const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
    const limite = req.query.limite === undefined ? 20 : Number(req.query.limite);
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000 ||
        !Number.isInteger(limite) || limite < 1 || limite > 100) {
      return res.status(400).json({ mensaje: 'Página o límite inválido (límite: 1 a 100)' });
    }

    const filtro = {};
    if (!admin) {
      if (req.query.usuarioId && String(req.query.usuarioId) !== String(req.usuario.id)) {
        return res.status(403).json({ mensaje: 'No puedes consultar el historial de otro usuario' });
      }
      filtro.usuarioId = idSesion;
    } else if (req.query.usuarioId) {
      const usuarioId = convertirId(req.query.usuarioId);
      if (!usuarioId) return res.status(400).json({ mensaje: 'usuarioId inválido' });
      filtro.usuarioId = usuarioId;
    }

    if (req.query.accion) {
      if (typeof req.query.accion !== 'string' || !/^[A-Z][A-Z0-9_]{2,79}$/.test(req.query.accion)) {
        return res.status(400).json({ mensaje: 'Acción inválida' });
      }
      filtro.accion = req.query.accion;
    }

    if (req.query.tipoRecurso) {
      const tipos = ['archivo', 'carpeta', 'usuario', 'permiso', 'comentario', 'sistema'];
      if (!tipos.includes(req.query.tipoRecurso)) {
        return res.status(400).json({ mensaje: 'Tipo de recurso inválido' });
      }
      filtro.tipoRecurso = req.query.tipoRecurso;
    }

    if (req.query.recursoId) {
      const recursoId = convertirId(req.query.recursoId);
      if (!recursoId) return res.status(400).json({ mensaje: 'recursoId inválido' });
      filtro.recursoId = recursoId;
    }

    const desde = req.query.desde === undefined ? null : fechaUTC(req.query.desde);
    const hasta = req.query.hasta === undefined ? null : fechaUTC(req.query.hasta);
    if ((req.query.desde && !desde) || (req.query.hasta && !hasta)) {
      return res.status(400).json({ mensaje: 'Utiliza fechas válidas YYYY-MM-DD' });
    }
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ mensaje: 'La fecha inicial supera a la final' });
    }
    if (desde || hasta) {
      filtro.fecha = {};
      if (desde) filtro.fecha.$gte = desde;
      if (hasta) {
        const siguienteDia = new Date(hasta);
        siguienteDia.setUTCDate(siguienteDia.getUTCDate() + 1);
        filtro.fecha.$lt = siguienteDia;
      }
    }

    const db = obtenerBD();
    const coleccion = db.collection('actividades');
    const [total, actividades] = await Promise.all([
      coleccion.countDocuments(filtro),
      coleccion.find(filtro).sort({ fecha: -1, _id: -1 })
        .skip((pagina - 1) * limite).limit(limite).toArray()
    ]);

    const ids = [...new Set(actividades.map(a => String(a.usuarioId)))].map(x => new ObjectId(x));
    const usuarios = ids.length
      ? await db.collection('usuarios').find({ _id: { $in: ids } })
        .project({ nombre: 1, username: 1 }).toArray()
      : [];
    const mapaUsuarios = new Map(usuarios.map(u => [String(u._id), {
      nombre: u.nombre,
      username: u.username
    }]));

    return res.json({
      total,
      pagina,
      limite,
      paginas: Math.ceil(total / limite),
      actividades: actividades.map(a => ({
        ...a,
        usuario: mapaUsuarios.get(String(a.usuarioId)) ?? null
      }))
    });
  } catch (error) {
    console.error('Error al consultar actividades:', error.message);
    return res.status(500).json({ mensaje: 'Error al consultar el historial' });
  }
});

module.exports = router;
