
import {
  ChangeDetectorRef,
  Component,
  inject,
  OnInit
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService, Carpeta, Archivo } from '../services/api';

@Component({
  selector: 'app-carpetas',
  standalone: true,
  imports: [FormsModule],

  templateUrl: './carpetas.html',
  styleUrl: './carpetas.css'
})

export class Carpetas implements OnInit {

  private api = inject(ApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Mostrar la administración solo cuando Express confirma el rol.
  esAdministrador = false;

  // Carpetas
  carpetas: Carpeta[] = [];
  ruta: Carpeta[] = [];
  nombreNuevo = '';

  cargando = false;
  guardando = false;

  // Archivos
  archivos: Archivo[] = [];
  archivoSeleccionado: File | null = null;

  cargandoArchivos = false;
  subiendo = false;

  // Edicion de archivos
  renombrandoId: string | null = null;
  archivoRenombrar: Archivo | null = null;
  nombreBaseRenombrar = '';
  extensionRenombrado = '.txt';
  errorRenombrado = '';

  // Papelera
  eliminandoId: string | null = null;

  // Movimiento de archivos
  archivoParaMover: Archivo | null = null;
  rutaDestino: Carpeta[] = [];
  carpetasDestino: Carpeta[] = [];

  cargandoDestinos = false;
  moviendo = false;
  errorMovimiento = '';

  eliminandoCarpetaId: string | null = null;

  // Renombrar y mover carpetas sin alterar la identidad de los recursos.
  carpetaRenombrar: Carpeta | null = null;
  nombreCarpetaRenombrar = '';
  renombrandoCarpetaId: string | null = null;
  errorRenombrarCarpeta = '';
  carpetaParaMover: Carpeta | null = null;

  // Mensajes
  error = '';
  aviso = '';

  get elementosCarpeta(): (
    | { tipo: 'carpeta'; id: string; nombre: string; carpeta: Carpeta }
    | { tipo: 'archivo'; id: string; nombre: string; archivo: Archivo }
  )[] {
    const directorios = this.carpetas.map(c => ({
      tipo: 'carpeta' as const, id: c._id, nombre: c.nombre, carpeta: c
    }));
    const documentos = this.archivos.map(a => ({
      tipo: 'archivo' as const, id: a._id, nombre: a.filename, archivo: a
    }));
    return [...directorios, ...documentos].sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'carpeta' ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }

  get padreActual(): string | null {
    return this.ruta.length
      ? this.ruta[this.ruta.length - 1]._id
      : null;
  }

  get destinoActual(): string | null {
    return this.rutaDestino.length
      ? this.rutaDestino[this.rutaDestino.length - 1]._id
      : null;
  }

  ngOnInit() {
    this.consultarRolUsuario();
    this.cargar();
  }

  // El rol se obtiene desde el backend, no desde sessionStorage.
  consultarRolUsuario() {
    this.api.perfilActual().subscribe({
      next: (respuesta) => {
        this.esAdministrador = respuesta.usuario.rol === 'ADMINISTRADOR';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.esAdministrador = false;
        if (error.status === 401) {
          this.salir();
          return;
        }
        console.error('No se pudo consultar el rol del usuario:', error);
        this.cdr.markForCheck();
      }
    });
  }

  // Consultar carpetas y archivos
  cargar() {
    this.cargando = true;
    this.error = '';

    const carpetaId = this.padreActual;

    this.cargarArchivos();

    this.api.listarCarpetas(carpetaId).subscribe({
      next: (respuesta) => {
        if (this.padreActual !== carpetaId) return;

        this.carpetas = respuesta.carpetas;
        this.cargando = false;
        this.cdr.markForCheck();
      },

      error: (error) => {
        if (this.padreActual !== carpetaId) return;

        console.error(error);
        this.cargando = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No se pudieron consultar las carpetas';
        this.cdr.markForCheck();
      }
    });
  }

  // Navegacion
  abrir(carpeta: Carpeta) {
    this.ruta.push(carpeta);
    this.aviso = '';
    this.cargar();
  }

  irRaiz() {
    this.ruta = [];
    this.aviso = '';
    this.cargar();
  }

  irNivel(indice: number) {
    this.ruta = this.ruta.slice(0, indice + 1);
    this.aviso = '';
    this.cargar();
  }

  // Crear carpeta
  crear() {
    const nombre = this.nombreNuevo.trim();

    if (!nombre || this.guardando) return;

    this.guardando = true;
    this.error = '';

    this.api.crearCarpeta(nombre, this.padreActual)
      .subscribe({
        next: () => {
          this.nombreNuevo = '';
          this.guardando = false;
          this.aviso = 'Carpeta creada correctamente';
          this.cargar();
          this.cdr.markForCheck();
        },

        error: (error) => {
          this.guardando = false;

          if (error.status === 401) {
            this.salir();
            return;
          }

          this.error = 'No se pudo crear la carpeta';
          this.cdr.markForCheck();
        }
      });
  }

  // Renombrar una carpeta.
  renombrarCarpeta(carpeta: Carpeta) {
    if (this.renombrandoCarpetaId) return;
    this.carpetaRenombrar = carpeta;
    this.nombreCarpetaRenombrar = carpeta.nombre;
    this.errorRenombrarCarpeta = '';
  }

  cancelarRenombradoCarpeta() {
    if (this.renombrandoCarpetaId) return;
    this.carpetaRenombrar = null;
    this.errorRenombrarCarpeta = '';
  }

  guardarRenombradoCarpeta() {
    const carpeta = this.carpetaRenombrar;
    const nombre = this.nombreCarpetaRenombrar.trim();
    if (!carpeta || this.renombrandoCarpetaId) return;
    if (!nombre || nombre.length > 100) {
      this.errorRenombrarCarpeta = 'Escribe un nombre válido de hasta 100 caracteres.';
      return;
    }
    if (nombre === carpeta.nombre) { this.cancelarRenombradoCarpeta(); return; }
    this.renombrandoCarpetaId = carpeta._id;
    this.errorRenombrarCarpeta = '';
    this.api.actualizarCarpeta(carpeta._id, { nombre }).subscribe({
      next: () => {
        this.renombrandoCarpetaId = null;
        this.carpetaRenombrar = null;
        this.aviso = 'Carpeta renombrada correctamente';
        this.cargar();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.renombrandoCarpetaId = null;
        if (e.status === 401) { this.salir(); return; }
        this.errorRenombrarCarpeta = e.error?.mensaje || 'No se pudo renombrar la carpeta';
        this.cdr.markForCheck();
      }
    });
  }

  // Seleccionar archivo
  seleccionarArchivo(evento: Event) {
    const input = evento.target as HTMLInputElement;

    this.archivoSeleccionado = input.files?.[0] ?? null;
    this.error = '';
  }

  // Consultar archivos de la carpeta actual
  cargarArchivos() {
    this.cargandoArchivos = true;

    const carpetaId = this.padreActual;

    this.api.listarArchivos(carpetaId).subscribe({
      next: (respuesta) => {
        if (this.padreActual !== carpetaId) return;

        this.archivos = respuesta.archivos;
        this.cargandoArchivos = false;
        this.cdr.markForCheck();
      },

      error: (error) => {
        if (this.padreActual !== carpetaId) return;

        console.error(error);
        this.cargandoArchivos = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No se pudieron consultar los archivos';
        this.cdr.markForCheck();
      }
    });
  }

  // Subir a GridFS
  subirArchivo(input: HTMLInputElement) {
    const archivo = this.archivoSeleccionado;

    if (!archivo || this.subiendo) return;

    if (!/\.(txt|md)$/i.test(archivo.name)) {
      this.error = 'Solo se permiten .txt y .md';
      return;
    }

    if (archivo.size > 2 * 1024 * 1024) {
      this.error = 'El archivo supera los 2 MB';
      return;
    }

    this.subiendo = true;
    this.error = '';

    const carpetaId = this.padreActual;

    this.api.subirArchivo(archivo, carpetaId)
      .subscribe({
        next: () => {
          this.subiendo = false;
          this.archivoSeleccionado = null;
          input.value = '';

          this.aviso = 'Archivo subido correctamente';

          if (this.padreActual === carpetaId) {
            this.cargarArchivos();
          }

          this.cdr.markForCheck();
        },

        error: (error) => {
          this.subiendo = false;

          if (error.status === 401) {
            this.salir();
            return;
          }

          this.error = 'No se pudo subir el archivo';
          this.cdr.markForCheck();
        }
      });
  }

  // Descargar desde GridFS
  descargarArchivo(archivo: Archivo) {
    this.api.descargarArchivo(archivo._id)
      .subscribe({
        next: (contenido) => {
          const url = URL.createObjectURL(contenido);
          const enlace = document.createElement('a');

          enlace.href = url;
          enlace.download = archivo.filename;

          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();

          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },

        error: (error) => {
          if (error.status === 401) {
            this.salir();
            return;
          }

          this.error = 'No se pudo descargar el archivo';
          this.cdr.markForCheck();
        }
      });
  }

  // Abre un diálogo de la propia aplicación y conserva la extensión original.
  renombrarArchivo(archivo: Archivo) {
    if (this.renombrandoId) return;
    const extension = archivo.filename.match(/\.(txt|md)$/i)?.[0];
    if (!extension) { this.error = 'Formato de archivo no admitido'; return; }
    this.archivoRenombrar = archivo;
    this.extensionRenombrado = extension;
    this.nombreBaseRenombrar = archivo.filename.slice(0, -extension.length);
    this.errorRenombrado = '';
  }

  cancelarRenombrado() {
    if (this.renombrandoId) return;
    this.archivoRenombrar = null;
    this.errorRenombrado = '';
  }

  guardarRenombrado() {
    const archivo = this.archivoRenombrar;
    if (!archivo || this.renombrandoId) return;
    const base = this.nombreBaseRenombrar.trim();
    if (!base || base.length > 145 || /[\\/:*?"<>|\x00-\x1F]/.test(base) || /[. ]$/.test(base)) {
      this.errorRenombrado = 'Usa un nombre válido sin caracteres especiales ni punto final.';
      return;
    }
    const nombre = base + this.extensionRenombrado;
    if (nombre === archivo.filename) { this.cancelarRenombrado(); return; }
    this.renombrandoId = archivo._id;
    this.errorRenombrado = '';
    this.api.actualizarArchivo(archivo._id, { nombre }).subscribe({
      next: () => {
        this.renombrandoId = null;
        this.archivoRenombrar = null;
        this.aviso = 'Archivo renombrado correctamente';
        this.cargarArchivos();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.renombrandoId = null;
        if (error.status === 401) { this.salir(); return; }
        this.errorRenombrado = error.error?.mensaje || 'No se pudo renombrar el archivo';
        this.cdr.markForCheck();
      }
    });
  }

  // MOVER: seleccionar archivo
  iniciarMovimiento(archivo: Archivo) {
    if (this.moviendo) return;

    this.carpetaParaMover = null;
    this.archivoParaMover = archivo;
    this.rutaDestino = [];
    this.errorMovimiento = '';

    this.cargarDestinos();
  }

  iniciarMovimientoCarpeta(carpeta: Carpeta) {
    if (this.moviendo) return;
    this.archivoParaMover = null;
    this.carpetaParaMover = carpeta;
    this.rutaDestino = [];
    this.errorMovimiento = '';
    this.cargarDestinos();
  }

  // Deshabilitar los destinos que generarían un ciclo en el árbol.
  destinoPermitido(carpeta: Carpeta): boolean {
    const origen = this.carpetaParaMover;
    if (!origen) return true;
    return carpeta._id !== origen._id &&
      !(carpeta.ancestros ?? []).some(a => String(a) === origen._id);
  }

  // Consultar las carpetas disponibles
  cargarDestinos() {
    this.cargandoDestinos = true;
    this.errorMovimiento = '';

    const carpetaId = this.destinoActual;

    this.api.listarCarpetas(carpetaId).subscribe({
      next: (respuesta) => {
        if (this.destinoActual !== carpetaId) return;

        this.carpetasDestino = respuesta.carpetas;
        this.cargandoDestinos = false;
        this.cdr.markForCheck();
      },

      error: (error) => {
        if (this.destinoActual !== carpetaId) return;

        this.cargandoDestinos = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.errorMovimiento =
          'No se pudieron cargar las carpetas';

        this.cdr.markForCheck();
      }
    });
  }

  // Entrar a una carpeta de destino
  abrirDestino(carpeta: Carpeta) {
    if (!this.destinoPermitido(carpeta)) {
      this.errorMovimiento = 'No puedes mover una carpeta dentro de sí misma o de una subcarpeta.';
      return;
    }
    this.rutaDestino.push(carpeta);
    this.cargarDestinos();
  }

  // Seleccionar la raiz
  irDestinoRaiz() {
    this.rutaDestino = [];
    this.cargarDestinos();
  }

  // Regresar a un nivel del destino
  irDestinoNivel(indice: number) {
    this.rutaDestino =
      this.rutaDestino.slice(0, indice + 1);

    this.cargarDestinos();
  }

  // Confirmar movimiento de archivo o carpeta.
  confirmarMovimiento() {
    const archivo = this.archivoParaMover;
    const carpeta = this.carpetaParaMover;
    if ((!archivo && !carpeta) || this.moviendo || this.cargandoDestinos) return;

    const destino = this.destinoActual;
    const origen = archivo ? (archivo.metadata?.carpetaId ?? null) : (carpeta?.padreId ?? null);
    if (origen === destino) {
      this.errorMovimiento = 'El recurso ya está en esta ubicación';
      return;
    }
    if (carpeta && this.rutaDestino.some(c => !this.destinoPermitido(c))) {
      this.errorMovimiento = 'No puedes mover la carpeta a su interior ni a una carpeta descendiente.';
      return;
    }

    this.moviendo = true;
    this.errorMovimiento = '';
    const operacion = archivo
      ? this.api.actualizarArchivo(archivo._id, { carpetaId: destino })
      : this.api.actualizarCarpeta(carpeta!._id, { padreId: destino });

    operacion.subscribe({
      next: () => {
        this.moviendo = false;
        this.archivoParaMover = null;
        this.carpetaParaMover = null;
        this.rutaDestino = [];
        this.carpetasDestino = [];
        this.aviso = archivo ? 'Archivo movido correctamente' : 'Carpeta movida correctamente';
        this.cargar();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.moviendo = false;
        if (e.status === 401) { this.salir(); return; }
        this.errorMovimiento = e.error?.mensaje || 'No se pudo mover el recurso';
        this.cdr.markForCheck();
      }
    });
  }

  // Cancelar el movimiento
  cancelarMovimiento() {
    if (this.moviendo) return;

    this.archivoParaMover = null;
    this.carpetaParaMover = null;
    this.rutaDestino = [];
    this.carpetasDestino = [];
    this.errorMovimiento = '';
  }

  // Navegar a la papelera
  verPapelera() {
    void this.router.navigateByUrl('/papelera');
  }

  // Envia una carpeta y todo su contenido a la papelera.
  enviarCarpetaPapelera(carpeta: Carpeta) {
    if (this.eliminandoCarpetaId !== null) return;

    const confirmado = window.confirm(
      `¿Enviar la carpeta "${carpeta.nombre}", sus subcarpetas y archivos a la papelera?`
    );
    if (!confirmado) return;

    this.eliminandoCarpetaId = carpeta._id;
    this.error = '';
    this.aviso = '';

    this.api.enviarCarpetaPapelera(carpeta._id).subscribe({
      next: () => {
        this.eliminandoCarpetaId = null;
        this.aviso = 'Carpeta y contenido enviados a la papelera';
        this.cargar();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.eliminandoCarpetaId = null;
        if (error.status === 401) {
          this.salir();
          return;
        }
        console.error('Error al enviar carpeta a papelera:', error);
        this.error = 'No se pudo enviar la carpeta a la papelera';
        this.cdr.markForCheck();
      }
    });
  }

  // Eliminacion logica de un archivo
  enviarArchivoPapelera(archivo: Archivo) {
    if (this.eliminandoId !== null) return;

    const confirmado = window.confirm(
      `¿Enviar "${archivo.filename}" a la papelera?`
    );

    if (!confirmado) return;

    this.eliminandoId = archivo._id;
    this.error = '';
    this.aviso = '';

    this.api.enviarPapelera(archivo._id).subscribe({
      next: () => {
        this.eliminandoId = null;
        this.aviso = 'Archivo enviado a la papelera';
        this.cargarArchivos();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.eliminandoId = null;

        if (error.status === 401) {
          this.salir();
          return;
        }

        console.error('Error enviando a la papelera:', error);
        this.error = 'No se pudo enviar el archivo a la papelera';
        this.cdr.markForCheck();
      }
    });
  }
  verUsuarios() {
    void this.router.navigateByUrl('/usuarios');
  }

  verReportes() {
    void this.router.navigateByUrl('/reportes');
  }


  verActividades() {
    void this.router.navigateByUrl('/actividades');
  }

  verCompartidos() {
    void this.router.navigateByUrl('/compartidos');
  }

  compartirCarpeta(carpeta: Carpeta) {
    void this.router.navigate(['/compartidos'], {
      queryParams: { tipo: 'carpeta', id: carpeta._id, nombre: carpeta.nombre }
    });
  }

  compartirArchivo(archivo: Archivo) {
    void this.router.navigate(['/compartidos'], {
      queryParams: { tipo: 'archivo', id: archivo._id, nombre: archivo.filename }
    });
  }

  // Cerrar sesion
  salir() {
    this.api.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
