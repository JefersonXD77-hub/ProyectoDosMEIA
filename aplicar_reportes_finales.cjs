'use strict';
// Instalador local para C:\cursos\Java\MEIA\ProyectoDos.
// Ejecutar desde la raiz: node .\aplicar_reportes_finales.cjs --aplicar
const fs = require('fs');
const path = require('path');
const raiz = __dirname;
const payload = path.join(raiz, 'MEIA_REPORTES');
const archivos = [
  ['reportes.ts', 'cliente/src/app/pages/reportes.ts'],
  ['reportes.html', 'cliente/src/app/pages/reportes.html'],
  ['reportes.css', 'cliente/src/app/pages/reportes.css'],
  ['almacenamiento.routes.js', 'servidor/src/routes/almacenamiento.routes.js']
];
const appPath = path.join(raiz, 'servidor/src/app.js');
const firmaRuta = "app.use('/api/almacenamiento', require('./routes/almacenamiento.routes'));";
const anchor = /^[ \t]*app\.use\(\s*['"]\/api\/[^'"]+['"]\s*,/m;

try {
  const faltantes = [];
  if (!fs.existsSync(appPath)) faltantes.push('servidor/src/app.js');
  for (const [src, dst] of archivos) {
    if (!fs.existsSync(path.join(payload, src))) faltantes.push('MEIA_REPORTES/' + src);
    if (!src.endsWith('.routes.js') && !fs.existsSync(path.join(raiz, dst))) faltantes.push(dst);
  }
  if (faltantes.length) throw Error('Faltan archivos:\n - ' + faltantes.join('\n - '));
  const codigo = fs.readFileSync(appPath, 'utf8');
  const insertado = codigo.includes("'/api/almacenamiento'") || codigo.includes('"/api/almacenamiento"');
  if (!insertado && !anchor.test(codigo)) {
    throw Error('No encontré una línea app.use("/api/...", ...) en servidor/src/app.js. Por seguridad no modifiqué nada.');
  }
  console.log('Archivos de la interfaz:', archivos.slice(0, 3).map(x => x[1]).join(', '));
  console.log('Nuevo endpoint autenticado: GET /api/almacenamiento');
  console.log('Modificación de servidor/src/app.js:', insertado ? 'ya montado' : 'se insertará antes de las rutas API');
  if (!process.argv.includes('--aplicar')) {
    console.log('PREVISUALIZACIÓN. Para aplicar, ejecuta: node .\\aplicar_reportes_finales.cjs --aplicar');
    process.exit(0);
  }
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const respaldo = path.join(raiz, '_respaldo_reportes_' + sello);
  fs.mkdirSync(respaldo, {recursive:true});
  for (const [, destino] of archivos) {
    const original = path.join(raiz, destino);
    if (fs.existsSync(original)) {
      const copia = path.join(respaldo, destino);
      fs.mkdirSync(path.dirname(copia), {recursive:true});
      fs.copyFileSync(original, copia);
    }
  }
  const appBackup = path.join(respaldo, 'servidor/src/app.js');
  fs.mkdirSync(path.dirname(appBackup), {recursive:true});
  fs.copyFileSync(appPath, appBackup);
  for (const [origen, destino] of archivos) {
    fs.mkdirSync(path.dirname(path.join(raiz,destino)), {recursive:true});
    fs.copyFileSync(path.join(payload, origen), path.join(raiz, destino));
    console.log('ACTUALIZADO:', destino);
  }
  if (!insertado) {
    const nuevoCodigo = codigo.replace(anchor, encontrado => firmaRuta + '\n' + encontrado);
    fs.writeFileSync(appPath, nuevoCodigo, 'utf8');
    console.log('REGISTRADO: /api/almacenamiento en servidor/src/app.js');
  }
  console.log('\nINSTALACIÓN COMPLETA');
  console.log('Respaldo:', respaldo);
  console.log('Compila con: cd cliente; npx ng build');
  console.log('IMPORTANTE: si Express ya está levantado sin nodemon, reinícialo para habilitar el endpoint.');
} catch (e) {
  console.error('INSTALACIÓN INTERRUMPIDA:', e.message);
  process.exitCode = 1;
}
