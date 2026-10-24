'use strict';
/**
 * Datos iniciales del Proyecto Dos MEIA.
 * - NO elimina datos anteriores ni modifica contraseñas existentes.
 * - Reejecución idempotente: usa usernames/semillaClave y upserts.
 * - Requiere variables .env existentes: MONGO_URI, MONGO_DB_NAME.
 * - Para --aplicar requiere MEIA_SEED_PASSWORD en el entorno (NO se graba).
 * - Ejecutar desde servidor/: node scripts/cargarDatosPrueba.js --plan|--aplicar|--resumen
 */
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { MongoClient, GridFSBucket } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const VERSION = 'MEIA_SEMILLA_2026_01';
const PREFIJO = 'meia_demo_';
const CUENTAS = [
  { username: 'meia_demo_01', nombre: 'Ana Documentos (Demo)' },
  { username: 'meia_demo_02', nombre: 'Bruno Informes (Demo)' },
  { username: 'meia_demo_03', nombre: 'Carla Contratos (Demo)' }
];
const ARCHIVOS_POR_USUARIO = [17, 17, 16]; // 50 archivos activos
const NOMBRES_CARPETAS = ['Documentos', 'Informes', 'Contratos', 'Revisiones', 'Borradores'];
const OPE = new Set(['--plan', '--aplicar', '--resumen']);

async function actividad(db, { usuarioId, accion, tipoRecurso, recursoId, recursoNombre, detalles = {} }) {
  await db.collection('actividades').insertOne({
    usuarioId, accion, tipoRecurso, recursoId, recursoNombre,
    detalles: { ...detalles, semilla: VERSION }, fecha: new Date()
  });
}

async function cuentas(db, password, cambios) {
  const usuarios = db.collection('usuarios');
  const encontrados = [];
  let hash = null;
  for (const cuenta of CUENTAS) {
    let usuario = await usuarios.findOne({ username: cuenta.username });
    if (usuario && usuario.semillaMEIA !== VERSION) {
      throw new Error(`Conflicto: ya existe ${cuenta.username} y no pertenece a esta semilla. Nada se sobrescribirá.`);
    }
    if (!usuario) {
      hash ??= await bcrypt.hash(password, 10);
      const fecha = new Date();
      const doc = { nombre: cuenta.nombre, username: cuenta.username, passwordHash: hash,
        rol: 'USUARIO', activo: true, fechaCreacion: fecha, fechaActualizacion: fecha,
        semillaMEIA: VERSION };
      const r = await usuarios.insertOne(doc);
      usuario = { ...doc, _id: r.insertedId };
      cambios.usuarios++;
    }
    if (usuario.activo !== true || usuario.rol !== 'USUARIO') {
      throw new Error(`La cuenta ${cuenta.username} ha sido desactivada o cambió de rol. Corrígela manualmente.`);
    }
    encontrados.push(usuario);
  }
  return encontrados;
}

async function crearCarpeta(db, usuario, clave, nombre, padre, cambios) {
  const col = db.collection('carpetas');
  let carpeta = await col.findOne({ semillaMEIA: VERSION, semillaClave: clave });
  if (carpeta) {
    if (String(carpeta.propietarioId) !== String(usuario._id)) throw new Error('Conflicto de propietario de carpeta');
    return carpeta;
  }
  const doc = { nombre, propietarioId: usuario._id, padreId: padre?._id ?? null,
    ancestros: padre ? [...padre.ancestros, padre._id] : [], enPapelera: false,
    fechaCreacion: new Date(), fechaActualizacion: new Date(),
    semillaMEIA: VERSION, semillaClave: clave };
  const r = await col.insertOne(doc);
  carpeta = { ...doc, _id: r.insertedId };
  cambios.carpetas++;
  await actividad(db, { usuarioId: usuario._id, accion: 'CARPETA_CREADA',
    tipoRecurso: 'carpeta', recursoId: carpeta._id, recursoNombre: nombre });
  return carpeta;
}

async function cargarArchivo(db, bucket, usuario, clave, nombre, carpeta, contenido, papelera, cambios) {
  const col = db.collection('documentos.files');
  let archivo = await col.findOne({ 'metadata.semillaMEIA': VERSION, 'metadata.semillaClave': clave });
  if (archivo) {
    if (String(archivo.metadata?.propietarioId) !== String(usuario._id)) throw new Error('Conflicto de propietario de archivo');
    return archivo;
  }
  const extension = path.extname(nombre).toLowerCase();
  const metadata = { propietarioId: usuario._id, carpetaId: carpeta._id,
    enPapelera: false, tipo: extension, semillaMEIA: VERSION, semillaClave: clave };
  const stream = bucket.openUploadStream(nombre, { metadata });
  await pipeline(Readable.from([Buffer.from(contenido, 'utf8')]), stream);
  archivo = await col.findOne({ _id: stream.id });
  if (!archivo) throw new Error(`El archivo ${nombre} no aparece en GridFS después de la carga`);
  cambios.archivos++;
  await actividad(db, { usuarioId: usuario._id, accion: 'ARCHIVO_SUBIDO',
    tipoRecurso: 'archivo', recursoId: archivo._id, recursoNombre: nombre,
    detalles: { tamano: archivo.length, carpetaId: String(carpeta._id) } });
  if (papelera) {
    const r = await col.updateOne({ _id: archivo._id, 'metadata.enPapelera': false },
      { $set: { 'metadata.enPapelera': true, 'metadata.fechaEliminacion': new Date(),
        'metadata.fechaActualizacion': new Date() } });
    if (r.modifiedCount) {
      cambios.papelera++;
      await actividad(db, { usuarioId: usuario._id, accion: 'ARCHIVO_PAPELERA',
        tipoRecurso: 'archivo', recursoId: archivo._id, recursoNombre: nombre });
    }
  }
  return archivo;
}

async function crearPermiso(db, usuario, destinatario, tipo, r, nivel, cambios) {
  const filtro = { tipo, recursoId: r._id, propietarioId: usuario._id, destinatarioId: destinatario._id };
  const existente = await db.collection('permisos').findOne(filtro);
  if (existente) return; // No cambiar autorizaciones existentes
  const fecha = new Date();
  const resultado = await db.collection('permisos').updateOne(filtro,
    { $setOnInsert: { ...filtro, nivel, fechaCreacion: fecha, fechaActualizacion: fecha,
      semillaMEIA: VERSION } }, { upsert: true });
  if (resultado.upsertedCount) {
    cambios.permisos++;
    await actividad(db, { usuarioId: usuario._id, accion: 'PERMISO_OTORGADO',
      tipoRecurso: tipo, recursoId: r._id,
      recursoNombre: tipo === 'archivo' ? r.filename : r.nombre,
      detalles: { destinatario: destinatario.username, nivel, destinatarioId: String(destinatario._id) } });
  }
}

async function resumen(db) {
  const usuarios = await db.collection('usuarios').countDocuments({ activo: true });
  const usuariosDemo = await db.collection('usuarios').countDocuments({ semillaMEIA: VERSION });
  const archivosActivos = await db.collection('documentos.files').countDocuments({ 'metadata.enPapelera': false });
  const archivosDemo = await db.collection('documentos.files').countDocuments({ 'metadata.semillaMEIA': VERSION, 'metadata.enPapelera': false });
  const papeleraDemo = await db.collection('documentos.files').countDocuments({ 'metadata.semillaMEIA': VERSION, 'metadata.enPapelera': true });
  const permisos = await db.collection('permisos').countDocuments({});
  const permisosDemo = await db.collection('permisos').countDocuments({ semillaMEIA: VERSION });
  const actividades = await db.collection('actividades').countDocuments({});
  console.log('\n=== RESUMEN BASE DE DATOS ===');
  console.table({ usuarios:{ total:usuarios, semilla:usuariosDemo },
    archivosActivos:{ total:archivosActivos, semilla:archivosDemo },
    archivosEnPapelera:{ total:'-', semilla:papeleraDemo },
    permisosVigentes:{ total:permisos, semilla:permisosDemo },
    historial:{ total:actividades, semilla:'-' } });
  console.log('Nota: las operaciones revocadas pueden existir solo en actividades, no en permisos.');
}

function contenidoEjemplo(usuario, numero, extension) {
  const temas = ['Inventario documental', 'Contratos internos', 'Actas de reunión',
    'Procedimientos técnicos', 'Guía del departamento', 'Plan de trabajo'];
  const tema = temas[(numero - 1) % temas.length];
  const encabezado = extension === '.md' ? `# ${tema}\n\n` : `${tema.toUpperCase()}\n\n`;
  return `${encabezado}Documento demostrativo del Proyecto Dos MEIA.\n` +
    `Usuario: ${usuario.username}\nNúmero: ${numero}\n` +
    `Fecha de generación: 2026-10-23\n\n` +
    'Este archivo de prueba se almacena realmente en MongoDB mediante GridFS.\n' +
    'Su objetivo es demostrar navegación, consulta, permisos y reportes.\n';
}

async function ejecutar(db, password) {
  const cambios = { usuarios: 0, carpetas: 0, archivos: 0, permisos: 0, papelera: 0 };
  const us = await cuentas(db, password, cambios);
  const carpetasPorUsuario = [];
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    const raiz = await crearCarpeta(db, u, `${i}/carpeta/raiz`, 'MEIA DEMO - Documentos', null, cambios);
    const informes = await crearCarpeta(db,u,`${i}/carpeta/informes`,'Informes',raiz,cambios);
    const contratos = await crearCarpeta(db,u,`${i}/carpeta/contratos`,'Contratos',raiz,cambios);
    const revisiones = await crearCarpeta(db,u,`${i}/carpeta/revisiones`,'Revisiones',informes,cambios);
    const borradores = await crearCarpeta(db,u,`${i}/carpeta/borradores`,'Borradores',raiz,cambios);
    carpetasPorUsuario.push([raiz,informes,contratos,revisiones,borradores]);
  }

  const bucket = new GridFSBucket(db, { bucketName: 'documentos' });
  const activos = [];
  for (let i = 0; i < us.length; i++) {
    for (let n = 1; n <= ARCHIVOS_POR_USUARIO[i]; n++) {
      const extension = (n + i) % 2 === 0 ? '.txt' : '.md';
      const nombre = `MEIA_DEMO_${i+1}_${String(n).padStart(2,'0')}${extension}`;
      const carpeta = carpetasPorUsuario[i][(n-1) % NOMBRES_CARPETAS.length];
      const archivo = await cargarArchivo(db,bucket,us[i],`${i}/archivo/${n}`,nombre,carpeta,
        contenidoEjemplo(us[i],n,extension),false,cambios);
      activos.push({ usuario: us[i], archivo, ownerIndex:i });
    }
    const basura = carpetasPorUsuario[i][0];
    if (i < 2) await cargarArchivo(db,bucket,us[i],`${i}/papelera/1`,
      `MEIA_DEMO_PAPELERA_${i+1}.txt`,basura,contenidoEjemplo(us[i],99,'.txt'),true,cambios);
  }

  // 20 permisos únicos: 8 archivos compartidos con DOS destinatarios (16),
  // 2 archivos adicionales con un destinatario cada uno (2),
  // y 2 carpetas con un destinatario cada una (2).
  for (let j = 0; j < 8; j++) {
    const x = activos[j];
    const destinos = us.filter(u => String(u._id) !== String(x.usuario._id));
    for (let k=0; k<2; k++) await crearPermiso(db,x.usuario,destinos[k],'archivo',x.archivo,
      ['LECTURA','COMENTAR','EDICION'][(j+k)%3],cambios);
  }
  for (let j=8; j<10; j++) {
    const x = activos[j];
    const destino = us[(x.ownerIndex+1)%3];
    await crearPermiso(db,x.usuario,destino,'archivo',x.archivo,'LECTURA',cambios);
  }
  for (let i=0; i<2; i++) await crearPermiso(db,us[i],us[(i+1)%3],
    'carpeta',carpetasPorUsuario[i][1],'COMENTAR',cambios);
  console.log('\nNUEVOS REGISTROS CREADOS:'); console.table(cambios);
  await resumen(db);
}

async function main() {
  const modo = process.argv[2];
  if (!OPE.has(modo) || process.argv.length !== 3) {
    console.log('Uso: node scripts/cargarDatosPrueba.js --plan | --aplicar | --resumen');
    process.exitCode = 2; return;
  }
  const uri = process.env.MONGO_URI;
  const bd = process.env.MONGO_DB_NAME;
  if (!uri || !bd) throw new Error('Faltan MONGO_URI o MONGO_DB_NAME en servidor/.env');
  const clave = process.env.MEIA_SEED_PASSWORD;
  if (modo === '--aplicar' && (!clave || clave.length < 8)) {
    throw new Error('Configura MEIA_SEED_PASSWORD (mínimo 8 caracteres) en PowerShell, sin escribirla en los archivos fuente');
  }
  const cliente = new MongoClient(uri, { serverSelectionTimeoutMS:5000 });
  try {
    await cliente.connect();
    const db = cliente.db(bd);
    await db.command({ ping:1 });
    console.log('Base conectada:', db.databaseName);
    if (modo === '--plan') {
      console.log('PLAN: +3 cuentas demo (si no existen), +15 carpetas, +50 archivos activos, +2 archivos a papelera, +20 permisos.');
      console.log('No borra datos y reejecutarlo evita duplicar datos de esta semilla.');
      await resumen(db);
    } else if (modo === '--resumen') await resumen(db);
    else await ejecutar(db, clave);
  } finally { await cliente.close(); }
}
main().catch(e => { console.error('ERROR EN CARGA:', e.message); process.exitCode=1; });
