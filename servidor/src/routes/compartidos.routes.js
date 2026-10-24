'use strict';

const express = require('express');
const { ObjectId, GridFSBucket } = require('mongodb');
const { autenticar } = require('../middlewares/auth.middleware');
const { obtenerBD } = require('../config/mongodb');

const router = express.Router();
router.use(autenticar);
const esId = (id) => typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
const niveles = ['LECTURA', 'COMENTAR', 'EDICION'];
const peso = { LECTURA: 1, COMENTAR: 2, EDICION: 3 };
const tipos = ['archivo', 'carpeta'];
const oid = (x) => new ObjectId(String(x));

async function recurso(db, tipo, id) {
  if (!tipos.includes(tipo) || !esId(id)) return null;
  const c = tipo === 'archivo' ? 'documentos.files' : 'carpetas';
  const r = await db.collection(c).findOne({ _id: oid(id) });
  if (!r || (tipo === 'archivo' ? r.metadata?.enPapelera !== false : r.enPapelera !== false)) return null;
  return r;
}
function propietario(r, tipo) {
  return tipo === 'archivo' ? r.metadata?.propietarioId : r.propietarioId;
}

// Recibe el camino hasta la raiz, validando que ninguna carpeta intermedia
// esté eliminada. Sirve para heredar permisos de una carpeta a su contenido.
async function rutaCarpetas(db, idInicial, idPropietario) {
  const ids = [];
  const vistos = new Set();
  let actual = idInicial;
  for (let i = 0; actual && i < 100; i++) {
    const clave = String(actual);
    if (!esId(clave) || vistos.has(clave)) return null;
    vistos.add(clave);
    const c = await db.collection('carpetas').findOne({ _id: oid(clave), propietarioId: oid(idPropietario), enPapelera: false });
    if (!c) return null;
    ids.push(c._id);
    actual = c.padreId;
  }
  if (actual) return null;
  return ids;
}

async function autorizar(db, tipo, id, usuarioId) {
  const r = await recurso(db, tipo, id);
  if (!r) return null;
  const dueño = propietario(r, tipo);
  if (!dueño) return null;
  if (String(dueño) === String(usuarioId)) return { r, nivel: 'PROPIETARIO', dueño: oid(dueño) };
  const idsCarpetas = await rutaCarpetas(db,
    tipo === 'archivo' ? r.metadata?.carpetaId : r._id, dueño);
  if (idsCarpetas === null) return null;
  const alternativas = [
    { tipo, recursoId: r._id }
  ];
  for (const carpetaId of idsCarpetas) alternativas.push({ tipo: 'carpeta', recursoId: carpetaId });
  const permisos = await db.collection('permisos').find({
    propietarioId: oid(dueño), destinatarioId: oid(usuarioId),
    $or: alternativas
  }).toArray();
  if (!permisos.length) return null;
  permisos.sort((a,b) => (peso[b.nivel] || 0) - (peso[a.nivel] || 0));
  return { r, nivel: permisos[0].nivel, dueño: oid(dueño) };
}

async function darDetalle(db, permiso) {
  const r = await recurso(db, permiso.tipo, String(permiso.recursoId));
  if (!r) return null;
  const u = await db.collection('usuarios').findOne({ _id: permiso.destinatarioId }, { projection: { username: 1, nombre: 1 } });
  const propietarioUsuario = await db.collection('usuarios').findOne({ _id: permiso.propietarioId }, { projection: {username:1,nombre:1} });
  return {
    id: String(permiso._id), tipo: permiso.tipo, recursoId: String(permiso.recursoId),
    recursoNombre: permiso.tipo === 'archivo' ? r.filename : r.nombre,
    nivel: permiso.nivel, destinatario: u?.username ?? 'usuario-desconocido', propietario: propietarioUsuario?.username ?? 'usuario-desconocido',
    propietarioId: String(permiso.propietarioId), fecha: permiso.fechaActualizacion ?? permiso.fechaCreacion
  };
}

// Busqueda de destinatarios: autenticados, activos, distintos del usuario actual.
router.get('/usuarios', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json({ usuarios: [] });
  if (q.length > 60) return res.status(400).json({ mensaje: 'Busqueda demasiado larga' });

  try {
    // Escapar los caracteres especiales antes de construir el filtro MongoDB.
    const patron = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filtro = new RegExp(patron, 'i');
    const db = obtenerBD();
    const usuarios = await db.collection('usuarios')
      .find({
        activo: true,
        _id: { $ne: oid(req.usuario.id) },
        $or: [{ nombre: filtro }, { username: filtro }]
      })
      .project({ _id: 0, username: 1, nombre: 1 })
      .sort({ nombre: 1, username: 1 })
      .limit(8)
      .toArray();
    return res.json({ usuarios: usuarios.map(u => ({
      username: u.username,
      nombre: u.nombre || u.username
    })) });
  } catch (error) {
    console.error('Busqueda de usuarios:', error);
    return res.status(500).json({ mensaje: 'No se pudieron buscar usuarios' });
  }
});

// Conceder o modificar acceso de un destinatario por username.
router.post('/', async (req, res) => {
  const { tipo, recursoId, username, nivel } = req.body || {};
  if (!tipos.includes(tipo) || !esId(recursoId) || typeof username !== 'string' || !niveles.includes(nivel)) {
    return res.status(400).json({ mensaje: 'Indica tipo, recursoId, username y nivel valido' });
  }
  try {
    const db = obtenerBD();
    const r = await recurso(db, tipo, recursoId);
    if (!r || String(propietario(r,tipo)) !== req.usuario.id) return res.status(404).json({ mensaje: 'Recurso propio no encontrado' });
    const nombre = username.trim();
    const u = await db.collection('usuarios').findOne({ username: nombre, activo: true });
    if (!u || String(u._id) === req.usuario.id) return res.status(400).json({ mensaje: 'Destinatario inexistente, inactivo o igual al propietario' });
    const llave = {
      tipo, recursoId: oid(recursoId), propietarioId: oid(req.usuario.id), destinatarioId: u._id
    };
    // Índice único para evitar invitaciones duplicadas bajo solicitudes simultáneas.
    await db.collection('permisos').createIndex({tipo:1,recursoId:1,destinatarioId:1}, {unique:true, name:'permiso_unico'});
    await db.collection('permisos').updateOne(llave, {
      $set: { nivel, fechaActualizacion: new Date() },
      $setOnInsert: { fechaCreacion: new Date() }
    }, { upsert: true });
    return res.json({ mensaje: 'Permiso guardado correctamente', usuario: u.username, nivel });
  } catch(e) {
    console.error('Compartir:', e);
    return res.status(e.code === 11000 ? 409 : 500).json({ mensaje: 'No fue posible guardar el permiso' });
  }
});

router.get('/otorgados', async (req,res) => {
  try {
    const db = obtenerBD();
    const p = await db.collection('permisos').find({ propietarioId: oid(req.usuario.id) }).sort({ fechaActualizacion: -1 }).toArray();
    const detalles = (await Promise.all(p.map(x => darDetalle(db,x)))).filter(Boolean);
    return res.json({ total: detalles.length, permisos: detalles });
  } catch(e) { console.error(e); return res.status(500).json({mensaje:'No se pudieron consultar los permisos'}); }
});
router.get('/recibidos', async (req,res) => {
  try {
    const db = obtenerBD();
    const p = await db.collection('permisos').find({ destinatarioId: oid(req.usuario.id) }).sort({ fechaActualizacion: -1 }).toArray();
    const detalles = (await Promise.all(p.map(x => darDetalle(db,x)))).filter(Boolean);
    return res.json({ total: detalles.length, permisos: detalles });
  } catch(e) { console.error(e); return res.status(500).json({mensaje:'No se pudieron consultar los recursos'}); }
});

router.patch('/permisos/:id', async (req,res) => {
  if (!esId(req.params.id) || !niveles.includes(req.body?.nivel)) return res.status(400).json({mensaje:'ID o nivel invalido'});
  const x = await obtenerBD().collection('permisos').updateOne({ _id: oid(req.params.id), propietarioId: oid(req.usuario.id) }, { $set: {nivel:req.body.nivel, fechaActualizacion:new Date()} });
  return res.status(x.matchedCount ? 200 : 404).json({mensaje:x.matchedCount ? 'Permiso actualizado' : 'Permiso inexistente'});
});
router.delete('/permisos/:id', async (req,res) => {
  if (!esId(req.params.id)) return res.status(400).json({mensaje:'ID invalido'});
  const x = await obtenerBD().collection('permisos').deleteOne({ _id: oid(req.params.id), propietarioId: oid(req.usuario.id) });
  return res.status(x.deletedCount ? 200 : 404).json({mensaje:x.deletedCount ? 'Permiso revocado' : 'Permiso inexistente'});
});

// Listar una carpeta compartida y sus hijos. No permite acceder sin permiso.
router.get('/carpetas/:id/contenido', async (req,res) => {
  if (!esId(req.params.id)) return res.status(400).json({mensaje:'ID invalido'});
  try {
    const db = obtenerBD();
    const acceso = await autorizar(db,'carpeta',req.params.id,req.usuario.id);
    if (!acceso) return res.status(403).json({mensaje:'No tienes acceso a esta carpeta'});
    const propietarioId = acceso.dueño;
    const pid = oid(req.params.id);
    const carpetas = await db.collection('carpetas').find({propietarioId, padreId: {$in: [pid, pid.toString()]}, enPapelera: false}).project({_id:1,nombre:1}).toArray();
    const archivos = await db.collection('documentos.files').find({'metadata.propietarioId':propietarioId,'metadata.carpetaId':{$in:[pid,pid.toString()]},'metadata.enPapelera':false}).project({_id:1,filename:1,length:1}).toArray();
    return res.json({ carpeta: {id:req.params.id,nombre:acceso.r.nombre}, nivel:acceso.nivel, carpetas, archivos });
  } catch(e) { console.error(e); return res.status(500).json({mensaje:'Error al consultar contenido compartido'}); }
});

router.get('/archivos/:id/descargar', async (req,res) => {
  if (!esId(req.params.id)) return res.status(400).json({mensaje:'ID invalido'});
  try {
    const db = obtenerBD();
    const acceso = await autorizar(db,'archivo',req.params.id,req.usuario.id);
    if (!acceso) return res.status(403).json({mensaje:'No autorizado para descargar'});
    const nombre = acceso.r.filename;
    res.setHeader('Content-Type', nombre.toLowerCase().endsWith('.md') ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    const stream = new GridFSBucket(db,{bucketName:'documentos'}).openDownloadStream(acceso.r._id);
    stream.on('error', e => { console.error('Descarga compartida:',e); if (!res.headersSent) res.status(500).json({mensaje:'Fallo la descarga'}); else res.destroy(e); });
    stream.pipe(res);
  } catch(e) { console.error(e); if (!res.headersSent) return res.status(500).json({mensaje:'Error de descarga'}); }
});

// Edicion permitida: renombrar el recurso; mover y eliminar ajenos no están habilitados.
router.patch('/:tipo/:id/renombrar', async (req,res) => {
  const {tipo,id} = req.params;
  if (!tipos.includes(tipo) || !esId(id) || typeof req.body?.nombre !== 'string') return res.status(400).json({mensaje:'Datos invalidos'});
  let nombre = req.body.nombre.trim();
  const valido = tipo==='archivo' ? /^[^\\/:*?"<>|\u0000-\u001F]{1,150}\.(txt|md)$/i.test(nombre) : nombre.length>0 && nombre.length<=150 && !/[\\/:*?"<>|\u0000-\u001F]/.test(nombre);
  if (!valido) return res.status(400).json({mensaje:'Nombre no permitido'});
  try {
    const db = obtenerBD();
    const acc = await autorizar(db,tipo,id,req.usuario.id);
    if (!acc || !['PROPIETARIO','EDICION'].includes(acc.nivel)) return res.status(403).json({mensaje:'Requiere permiso de edicion'});
    if (tipo==='archivo') await db.collection('documentos.files').updateOne({_id:oid(id), 'metadata.enPapelera':false},{$set:{filename:nombre,'metadata.tipo':nombre.toLowerCase().endsWith('.md')?'.md':'.txt','metadata.fechaActualizacion':new Date()}});
    else await db.collection('carpetas').updateOne({_id:oid(id), enPapelera:false},{$set:{nombre,fechaActualizacion:new Date()}});
    return res.json({mensaje:'Recurso renombrado correctamente'});
  } catch(e) { console.error(e); return res.status(500).json({mensaje:'No se pudo renombrar'}); }
});

router.get('/comentarios/:tipo/:id', async(req,res) => {
  if (!tipos.includes(req.params.tipo) || !esId(req.params.id)) return res.status(400).json({mensaje:'Datos invalidos'});
  const db = obtenerBD();
  const acc = await autorizar(db,req.params.tipo,req.params.id,req.usuario.id);
  if (!acc) return res.status(403).json({mensaje:'No autorizado'});
  const comentarios = await db.collection('comentarios')
    .find({ tipo: req.params.tipo, recursoId: oid(req.params.id) })
    .sort({ fechaCreacion: -1 }).limit(100).toArray();

  // Resolver los autores en una consulta, sin revelar contraseñas ni datos privados.
  const autoresIds = [...new Set(comentarios
    .map(c => String(c.autorId || ''))
    .filter(esId))].map(oid);
  const usuarios = autoresIds.length
    ? await db.collection('usuarios').find(
        { _id: { $in: autoresIds } },
        { projection: { username: 1 } }
      ).toArray()
    : [];
  const nombres = new Map(usuarios.map(u => [String(u._id), u.username]));
  return res.json({
    comentarios: comentarios.map(c => ({
      texto: c.texto,
      fechaCreacion: c.fechaCreacion,
      autor: nombres.get(String(c.autorId)) || 'Usuario desconocido'
    }))
  });
});
router.post('/comentarios', async(req,res) => {
  const { tipo, recursoId, texto } = req.body || {};
  if (!tipos.includes(tipo) || !esId(recursoId) || typeof texto !== 'string' || !texto.trim() || texto.length>1000) return res.status(400).json({mensaje:'Comentario invalido'});
  const db = obtenerBD();
  const acc = await autorizar(db,tipo,recursoId,req.usuario.id);
  if (!acc || !['PROPIETARIO','COMENTAR','EDICION'].includes(acc.nivel)) return res.status(403).json({mensaje:'No tienes permiso para comentar'});
  const x = await db.collection('comentarios').insertOne({tipo,recursoId:oid(recursoId),autorId:oid(req.usuario.id),texto:texto.trim(),fechaCreacion:new Date()});
  return res.status(201).json({mensaje:'Comentario registrado', id:x.insertedId});
});
module.exports = router;
