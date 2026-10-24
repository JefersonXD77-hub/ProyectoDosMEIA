'use strict';

// Bloque 16: consultas de agregación sobre las colecciones existentes.
// Requiere el middleware de autenticación: jamás acepta un usuarioId ajeno
// para sesiones que no sean administradoras.
const express = require('express');
const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');
const { autenticar } = require('../middlewares/auth.middleware');
const router = express.Router();
router.use(autenticar);

const idValido = v => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);
const oid = v => new ObjectId(v);
const dateUTC = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00.000Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? d : null;
};

function contexto(req) {
  const admin = req.usuario?.rol === 'ADMINISTRADOR';
  if (!idValido(req.usuario?.id)) throw new Error('Sesión inválida');
  let usuarioId = admin ? null : oid(req.usuario.id);
  if (req.query.usuarioId !== undefined && req.query.usuarioId !== '') {
    if (!idValido(req.query.usuarioId)) throw new Error('usuarioId inválido');
    if (!admin && req.query.usuarioId !== req.usuario.id) {
      const err = new Error('No puedes consultar otros usuarios'); err.status = 403; throw err;
    }
    usuarioId = oid(req.query.usuarioId);
  }
  const desde = req.query.desde ? dateUTC(req.query.desde) : null;
  const hasta = req.query.hasta ? dateUTC(req.query.hasta) : null;
  if ((req.query.desde && !desde) || (req.query.hasta && !hasta) || (desde && hasta && desde > hasta)) {
    throw new Error('Rango de fechas inválido; usa YYYY-MM-DD');
  }
  const finExclusivo = hasta ? new Date(hasta.getTime() + 86400000) : null;
  return { admin, usuarioId, desde, finExclusivo };
}
function rangoFecha(c, campo) {
  if (!c.desde && !c.finExclusivo) return {};
  return { [campo]: { ...(c.desde ? { $gte: c.desde } : {}), ...(c.finExclusivo ? { $lt: c.finExclusivo } : {}) } };
}
function archivosMatch(c) {
  return { 'metadata.enPapelera': false,
    ...(c.usuarioId ? { 'metadata.propietarioId': c.usuarioId } : {}),
    ...rangoFecha(c, 'uploadDate') };
}
function actividadesMatch(c) {
  return { ...(c.usuarioId ? { usuarioId: c.usuarioId } : {}), ...rangoFecha(c, 'fecha') };
}
function permisosMatch(c, campo='propietarioId') {
  return c.usuarioId ? { [campo]: c.usuarioId } : {};
}
function unirUsuario() {
  return [{ $lookup: { from:'usuarios', localField:'_id', foreignField:'_id', as:'usuario' } },
    { $unwind: { path:'$usuario', preserveNullAndEmptyArrays:true } }];
}
const nombreUsuario = { $ifNull: ['$usuario.nombre', 'Usuario no disponible'] };

// Endpoint auxiliar: los usuarios normales NO pueden enumerar todas las cuentas.
router.get('/usuarios', async (req, res) => {
  if (req.usuario?.rol !== 'ADMINISTRADOR') return res.status(403).json({ mensaje:'Solo administradores' });
  try {
    const usuarios = await obtenerBD().collection('usuarios').find({}, { projection:{ nombre:1, username:1, activo:1 } }).sort({nombre:1}).limit(500).toArray();
    return res.json({ usuarios: usuarios.map(u => ({ id:String(u._id), nombre:u.nombre, username:u.username, activo:u.activo })) });
  } catch(e) { console.error(e); return res.status(500).json({ mensaje:'Error al consultar usuarios' }); }
});

// Búsqueda y filtros: solo documentos del propietario, salvo administrador.
// La búsqueda no incorpora recursos ajenos compartidos; estos se consultan en /compartidos.
router.get('/buscar', async (req, res) => {
  let c;
  try { c = contexto(req); } catch(e) { return res.status(e.status || 400).json({mensaje:e.message}); }
  const q = String(req.query.q ?? '').trim();
  const tipo = String(req.query.tipo ?? 'todos');
  const extension = String(req.query.extension ?? 'todas');
  const orden = String(req.query.orden ?? 'recientes');
  const pagina = req.query.pagina === undefined ? 1 : Number(req.query.pagina);
  const limite = req.query.limite === undefined ? 20 : Number(req.query.limite);
  if (q.length > 80 || !['todos','archivo','carpeta'].includes(tipo) ||
      !['todas','.txt','.md'].includes(extension) || !['recientes','antiguos','nombre'].includes(orden) ||
      !Number.isInteger(pagina) || pagina < 1 || pagina > 100000 ||
      !Number.isInteger(limite) || limite < 1 || limite > 100) {
    return res.status(400).json({mensaje:'Filtros de búsqueda inválidos'});
  }
  const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  // Regex escapada: el usuario no puede introducir patrones MongoDB arbitrarios.
  const f = { ...archivosMatch(c) };
  const d = { enPapelera:false,
    ...(c.usuarioId ? { propietarioId:c.usuarioId } : {}), ...rangoFecha(c,'fechaCreacion') };
  if (rx) { f.filename = rx; d.nombre = rx; }
  if (extension !== 'todas') f.filename = new RegExp('\\' + extension + '$','i');
  if (extension !== 'todas' && rx) f.$and = [{filename:rx},{filename:new RegExp('\\' + extension + '$','i')}];

  const archivos = [
    { $match: f },
    { $project: { _id:1, tipo:{ $literal:'archivo' }, nombre:'$filename', fecha:'$uploadDate', tamano:'$length',
      propietarioId:'$metadata.propietarioId', carpetaId:'$metadata.carpetaId',
      esPropio:{ $eq:['$metadata.propietarioId',oid(req.usuario.id)] } } }
  ];
  const carpetas = [
    { $match:d },
    { $project: { _id:1, tipo:{ $literal:'carpeta' }, nombre:'$nombre', fecha:'$fechaCreacion',
      propietarioId:'$propietarioId', carpetaId:'$padreId' } }
  ];
  let pipeline = tipo === 'carpeta' ? carpetas : archivos;
  if (tipo === 'todos' && extension === 'todas') {
    pipeline = [...archivos, { $unionWith: { coll:'carpetas', pipeline:carpetas } }];
  }
  if (tipo === 'carpeta' && extension !== 'todas') pipeline = [{ $match:{ _id:null } }];
  const sort = orden === 'nombre' ? { nombre:1, _id:1 } : { fecha: orden==='recientes' ? -1 : 1, _id:1 };
  pipeline.push({ $facet: {
    conteo:[{ $count:'total' }],
    resultados:[{ $sort:sort },{ $skip:(pagina-1)*limite },{ $limit:limite }]
  }});
  try {
    const datos = (await obtenerBD().collection(tipo === 'carpeta' ? 'carpetas' : 'documentos.files')
      .aggregate(pipeline).toArray())[0];
    const total = datos.conteo[0]?.total ?? 0;
    return res.json({ total, pagina, paginas:Math.ceil(total/limite), resultados:datos.resultados });
  } catch(e) { console.error('Búsqueda:',e); return res.status(500).json({mensaje:'Error al buscar recursos'}); }
});

router.get('/resumen', async(req, res) => {
  let c;
  try { c = contexto(req); } catch(e) { return res.status(e.status || 400).json({mensaje:e.message}); }
  const db = obtenerBD();
  const matchArch = archivosMatch(c);
  const matchAct = actividadesMatch(c);
  const matchOtorg = permisosMatch(c);
  const matchRecib = permisosMatch(c, 'destinatarioId');
  const tipoCalculado = { $toLower: { $ifNull: ['$metadata.tipo',
    { $concat: ['.', { $arrayElemAt: [{ $split: ['$filename','.'] }, -1] }] }] } };
  const pArch = db.collection('documentos.files');
  const pAct = db.collection('actividades');
  const pPerm = db.collection('permisos');
  try {
    // No hay cálculos estadísticos en Angular: group, lookup y dateToString se ejecutan en MongoDB.
    const [ totalArchivos, totalActividades, totalPermisos, archivosPorTipo,
      archivosPorFecha, archivosMasOperados, usuariosMasArchivos, usuariosMasCompartidos,
      archivosMasCompartidos, otorgados, recibidos, historialUsuario,
      operacionesPorTipo, operacionesPorPeriodo, accionesPrincipales, archivosNuncaCompartidos, carpetasMasArchivos ] = await Promise.all([
      pArch.countDocuments(matchArch),
      pAct.countDocuments(matchAct),
      pPerm.countDocuments(matchOtorg),
      pArch.aggregate([{ $match:matchArch }, { $group:{ _id:tipoCalculado, cantidad:{ $sum:1 } } },
        { $project:{ _id:0, tipo:'$_id',cantidad:1 } },{ $sort:{cantidad:-1} }]).toArray(),
      pArch.aggregate([{ $match:matchArch },{ $sort:{uploadDate:-1} },{ $limit:100 },
        { $lookup:{from:'usuarios',localField:'metadata.propietarioId',foreignField:'_id',as:'u'} },
        { $project:{ _id:0, id:{ $toString:'$_id' }, nombre:'$filename',fecha:'$uploadDate',
          usuario:{ $ifNull:[{ $arrayElemAt:['$u.nombre',0] },'Desconocido'] },tamano:'$length'} }]).toArray(),
      pAct.aggregate([{ $match:{...matchAct,tipoRecurso:'archivo',recursoId:{$type:'objectId'}} },
        { $sort:{ fecha:-1 } },
        { $group:{_id:'$recursoId',operaciones:{$sum:1},nombre:{$first:'$recursoNombre'}} },
        { $sort:{operaciones:-1} },{ $limit:10 },
        { $project:{_id:0,id:{$toString:'$_id'},nombre:1,operaciones:1} }]).toArray(),
      pArch.aggregate([{ $match:matchArch },{ $group:{_id:'$metadata.propietarioId',cantidad:{$sum:1}} },
        { $sort:{cantidad:-1} },{ $limit:10 },...unirUsuario(),
        { $project:{_id:0,id:{$toString:'$_id'},nombre:nombreUsuario,
          username:'$usuario.username',cantidad:1} }]).toArray(),
      pPerm.aggregate([{ $match:matchOtorg },{ $group:{_id:{propietarioId:'$propietarioId',tipo:'$tipo',recursoId:'$recursoId'},
        permisos:{$sum:1}} },{ $group:{_id:'$_id.propietarioId', recursos:{$sum:1},destinatarios:{$sum:'$permisos'}} },
        { $sort:{recursos:-1} },{ $limit:10 },...unirUsuario(),
        { $project:{_id:0,id:{$toString:'$_id'},nombre:nombreUsuario,recursos:1,destinatarios:1} }]).toArray(),
      pPerm.aggregate([{ $match:{...matchOtorg,tipo:'archivo'} },
        { $group:{_id:'$recursoId',usuarios:{$addToSet:'$destinatarioId'}} },
        { $lookup:{from:'documentos.files',localField:'_id',foreignField:'_id',as:'archivo'} },
        { $unwind:'$archivo' },{ $match:{'archivo.metadata.enPapelera':false} },
        { $project:{_id:0,id:{$toString:'$_id'},nombre:'$archivo.filename',cantidad:{$size:'$usuarios'}} },
        { $sort:{cantidad:-1} },{ $limit:10 }]).toArray(),
      pPerm.aggregate([{ $match:matchOtorg },{ $sort:{fechaActualizacion:-1} },{ $limit:100 },
        { $lookup:{from:'usuarios',localField:'destinatarioId',foreignField:'_id',as:'dest'} },
        { $project:{_id:0,id:{$toString:'$_id'},tipo:1,nivel:1,
          recursoId:{$toString:'$recursoId'},destinatario:{$ifNull:[{$arrayElemAt:['$dest.username',0]},'Desconocido']},
          fecha:'$fechaActualizacion'} }]).toArray(),
      pPerm.aggregate([{ $match:matchRecib },{ $sort:{fechaActualizacion:-1} },{ $limit:100 },
        { $lookup:{from:'usuarios',localField:'propietarioId',foreignField:'_id',as:'dueno'} },
        { $project:{_id:0,id:{$toString:'$_id'},tipo:1,nivel:1,
          recursoId:{$toString:'$recursoId'},destinatario:{$ifNull:[{$arrayElemAt:['$dueno.username',0]},'Desconocido']},
          fecha:'$fechaActualizacion'} }]).toArray(),
      pAct.aggregate([{ $match:matchAct },{ $sort:{fecha:-1} },{ $limit:50 },
        { $lookup:{from:'usuarios',localField:'usuarioId',foreignField:'_id',as:'u'} },
        { $project:{_id:0,accion:1,fecha:1, tipoRecurso:1, recursoNombre:1,
          usuario:{$ifNull:[{$arrayElemAt:['$u.nombre',0]},'Desconocido']} } }]).toArray(),
      pAct.aggregate([{ $match:matchAct },{ $group:{_id:'$tipoRecurso',cantidad:{$sum:1}} },
        { $project:{_id:0,tipo:'$_id',cantidad:1} },{ $sort:{cantidad:-1} }]).toArray(),
      pAct.aggregate([{ $match:matchAct },{ $group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$fecha',timezone:'UTC'}},cantidad:{$sum:1}} },
        { $project:{_id:0,periodo:'$_id',cantidad:1} },{ $sort:{periodo:1} },{ $limit:366 }]).toArray(),
      pAct.aggregate([{ $match:matchAct },{ $group:{_id:'$accion',cantidad:{$sum:1}} },
        { $project:{_id:0,accion:'$_id',cantidad:1} },{ $sort:{cantidad:-1} },{ $limit:20 }]).toArray(),
      // Archivos sin permisos actuales ni antecedentes de permiso concedido.
      pArch.aggregate([
        { $match:matchArch },
        { $lookup:{ from:'permisos', let:{fid:'$_id'}, pipeline:[
          { $match:{ $expr:{ $and:[{ $eq:['$recursoId','$$fid'] },{ $eq:['$tipo','archivo'] }] } } },{ $limit:1 }
        ], as:'vigentes' } },
        { $lookup:{ from:'actividades', let:{fid:'$_id'}, pipeline:[
          { $match:{ $expr:{ $and:[{ $eq:['$recursoId','$$fid'] },
            { $eq:['$tipoRecurso','archivo'] },{ $eq:['$accion','PERMISO_OTORGADO'] }] } } },{ $limit:1 }
        ], as:'historicos' } },
        { $match:{ vigentes:{$size:0}, historicos:{$size:0} } },
        { $sort:{uploadDate:-1} },{ $limit:100 },
        { $project:{_id:0,id:{$toString:'$_id'},nombre:'$filename'} }
      ]).toArray(),
      // Número de archivos activos en cada carpeta directa (no incluye nietos).
      pArch.aggregate([
        { $match:{ ...matchArch, 'metadata.carpetaId':{$type:'objectId'} } },
        { $group:{_id:'$metadata.carpetaId',cantidad:{$sum:1}} },
        { $lookup:{from:'carpetas',localField:'_id',foreignField:'_id',as:'carpeta'} },
        { $unwind:'$carpeta' },{ $match:{'carpeta.enPapelera':false} },
        { $sort:{cantidad:-1,_id:1} },{ $limit:10 },
        { $project:{_id:0,id:{$toString:'$_id'},nombre:'$carpeta.nombre',cantidad:1} }
      ]).toArray()
    ]);
    return res.json({
      alcance: c.usuarioId ? 'usuario' : 'global',
      resumen:{ totalArchivos,totalActividades,totalPermisos },
      archivosPorTipo,archivosPorFecha,archivosMasOperados,usuariosMasArchivos,usuariosMasCompartidos,
      archivosMasCompartidos, archivosNuncaCompartidos, carpetasMasArchivos, compartidosOtorgados:otorgados,compartidosRecibidos:recibidos,
      historialUsuario, operacionesPorTipo, operacionesPorPeriodo,accionesPrincipales,
      notas:{ archivos:'Archivos activos; los de papelera no se cuentan.',
        comparticion:'Permisos registrados; los revocados no cuentan. Algunos pueden corresponder a recursos en papelera.',
        actividad:'Historial conservado, incluso si se elimina un recurso.',
        limites:'Listados limitados para una interfaz ágil (50/100 registros).'}
    });
  } catch(e) { console.error('Reportes:',e); return res.status(500).json({ mensaje:'No se pudieron generar los reportes' }); }
});

module.exports = router;
