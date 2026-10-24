'use strict';

const { ObjectId } = require('mongodb');
const { obtenerBD } = require('../config/mongodb');

const TIPOS = new Set(['archivo', 'carpeta', 'usuario', 'permiso', 'comentario', 'sistema']);

function aObjectId(valor, campo) {
  const texto = String(valor ?? '');
  if (!/^[0-9a-fA-F]{24}$/.test(texto)) {
    throw new Error(`${campo} debe ser un ObjectId válido`);
  }
  return new ObjectId(texto);
}

function limpiarDetalles(detalles) {
  if (!detalles || typeof detalles !== 'object' || Array.isArray(detalles)) return {};
  const salida = {};
  const prohibidos = /password|contrase|token|secret|authorization|hash|cookie|jwt/i;

  for (const [clave, valor] of Object.entries(detalles)) {
    if (prohibidos.test(clave) || Object.keys(salida).length >= 15) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(clave)) continue;
    if (valor === null || typeof valor === 'boolean' || typeof valor === 'number') {
      salida[clave] = valor;
    } else if (typeof valor === 'string') {
      salida[clave] = valor.slice(0, 250);
    }
  }
  return salida;
}

/**
 * Registra una operación que YA terminó correctamente.
 * El usuarioId debe proceder del middleware de autenticación, no del body HTTP.
 */
async function registrarActividad({
  usuarioId,
  accion,
  tipoRecurso,
  recursoId = null,
  recursoNombre = null,
  detalles = {}
}) {
  if (typeof accion !== 'string' || !/^[A-Z][A-Z0-9_]{2,79}$/.test(accion)) {
    throw new Error('La acción debe ser un identificador en mayúsculas');
  }
  if (!TIPOS.has(tipoRecurso)) {
    throw new Error('Tipo de recurso no admitido');
  }

  const documento = {
    usuarioId: aObjectId(usuarioId, 'usuarioId'),
    accion,
    tipoRecurso,
    recursoId: recursoId == null ? null : aObjectId(recursoId, 'recursoId'),
    recursoNombre: typeof recursoNombre === 'string' ? recursoNombre.slice(0, 250) : null,
    detalles: limpiarDetalles(detalles),
    fecha: new Date()
  };

  const resultado = await obtenerBD().collection('actividades').insertOne(documento);
  return resultado.insertedId;
}

/**
 * Para rutas existentes: si falla la auditoría, informa por consola sin convertir
 * una operación de negocio ya completada en respuesta HTTP de error.
 * NOTA: esto NO garantiza atomicidad entre el dato de negocio y la auditoría.
 */
async function registrarActividadSegura(datos) {
  try {
    await registrarActividad(datos);
    return true;
  } catch (error) {
    console.error('[AUDITORIA] No se pudo registrar la actividad:', error.message);
    return false;
  }
}

async function prepararIndicesActividades() {
  const actividades = obtenerBD().collection('actividades');
  await Promise.all([
    actividades.createIndex({ usuarioId: 1, fecha: -1 }, { name: 'actividad_usuario_fecha' }),
    actividades.createIndex({ accion: 1, fecha: -1 }, { name: 'actividad_accion_fecha' }),
    actividades.createIndex({ tipoRecurso: 1, recursoId: 1, fecha: -1 }, { name: 'actividad_recurso_fecha' }),
    actividades.createIndex({ fecha: -1 }, { name: 'actividad_fecha' })
  ]);
  console.log('Índices de actividades preparados');
}

module.exports = { registrarActividad, registrarActividadSegura, prepararIndicesActividades };
