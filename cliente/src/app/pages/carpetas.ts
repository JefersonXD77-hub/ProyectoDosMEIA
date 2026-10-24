
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

  template: `
    <header>
      <strong>Gestión Documental</strong>
      <button type="button" (click)="verCompartidos()"> Compartidos </button>
      <button type="button" (click)="verPapelera()"> Papelera </button>
      <button (click)="salir()">Cerrar sesión</button>
    </header>

    <main>
      <h1>Mis carpetas</h1>

      <!-- Ruta actual -->
      <nav>
        <button (click)="irRaiz()">Mi unidad</button>

        @for (item of ruta; track item._id; let i = $index) {
          <span> / </span>
          <button (click)="irNivel(i)">
            {{ item.nombre }}
          </button>
        }
      </nav>

      <!-- Crear carpeta -->
      <form (ngSubmit)="crear()">
        <input
          name="nombre"
          placeholder="Nombre de nueva carpeta"
          [(ngModel)]="nombreNuevo"
          required
        />

        <button type="submit" [disabled]="guardando">
          {{ guardando ? 'Creando...' : 'Crear carpeta' }}
        </button>
      </form>

      @if (error) {
        <p class="error">{{ error }}</p>
      }

      @if (aviso) {
        <p class="aviso">{{ aviso }}</p>
      }

      <!-- Carpetas -->
      <h2>Carpetas</h2>

      @if (cargando) {
        <p>Cargando carpetas...</p>
      } @else {
        <section>
          @for (carpeta of carpetas; track carpeta._id) {
            <div class="fila-carpeta">
              <button type="button" class="carpeta" (click)="abrir(carpeta)">
                📁 {{ carpeta.nombre }}
              </button>
              <button type="button" (click)="compartirCarpeta(carpeta)">Compartir</button>
              <button
                type="button"
                class="boton-peligro"
                (click)="enviarCarpetaPapelera(carpeta)"
                [disabled]="eliminandoCarpetaId !== null"
                title="Enviar esta carpeta y su contenido a la papelera"
              >
                {{ eliminandoCarpetaId === carpeta._id ? 'Eliminando...' : 'Eliminar' }}
              </button>
            </div>
          } @empty {
            <p>No hay carpetas en esta ubicación.</p>
          }
        </section>
      }

      <hr />

      <!-- Archivos -->
      <h2>Mis archivos</h2>

      <div class="subida">
        <input
          #archivoInput
          type="file"
          accept=".txt,.md"
          (change)="seleccionarArchivo($event)"
        />

        <button
          type="button"
          (click)="subirArchivo(archivoInput)"
          [disabled]="!archivoSeleccionado || subiendo"
        >
          {{ subiendo ? 'Subiendo...' : 'Subir archivo' }}
        </button>
      </div>

      <p class="ayuda">
        Formatos: .txt y .md. Tamaño máximo: 2 MB.
      </p>

      @if (cargandoArchivos) {
        <p>Cargando archivos...</p>
      } @else {
        <section>
          @for (archivo of archivos; track archivo._id) {
            <div class="archivo">
              <span>
                📄 {{ archivo.filename }}
                ({{ archivo.length }} bytes)
              </span>

              <div class="acciones">
                <button
                  type="button"
                  (click)="descargarArchivo(archivo)"
                >
                  Descargar
                </button>

                <button
                  type="button"
                  (click)="renombrarArchivo(archivo)"
                  [disabled]="renombrandoId === archivo._id"
                >
                  Renombrar
                </button>

                <button
                  type="button"
                  (click)="iniciarMovimiento(archivo)"
                >
                  Mover
                </button>
                <button type="button" (click)="compartirArchivo(archivo)">Compartir</button>
                <button
                  type="button"
                  (click)="enviarArchivoPapelera(archivo)"
                  [disabled]="eliminandoId !== null"
                >
                  Eliminar
                </button>
              </div>
            </div>
          } @empty {
            <p>No hay archivos en esta ubicación.</p>
          }
        </section>
      }

      <!-- Selector de destino -->
      @if (archivoParaMover) {
        <section class="panel-mover">
          <h2>Mover archivo</h2>

          <p>
            Archivo seleccionado:
            <strong>{{ archivoParaMover.filename }}</strong>
          </p>

          <h3>Seleccionar carpeta de destino</h3>

          <nav>
            <button
              type="button"
              (click)="irDestinoRaiz()"
              [disabled]="moviendo"
            >
              Mi unidad
            </button>

            @for (
              item of rutaDestino;
              track item._id;
              let i = $index
            ) {
              <span> / </span>
              <button
                type="button"
                (click)="irDestinoNivel(i)"
                [disabled]="moviendo"
              >
                {{ item.nombre }}
              </button>
            }
          </nav>

          @if (cargandoDestinos) {
            <p>Cargando destinos...</p>
          } @else {
            <div class="destinos">
              @for (
                carpeta of carpetasDestino;
                track carpeta._id
              ) {
                <button
                  type="button"
                  class="carpeta"
                  (click)="abrirDestino(carpeta)"
                  [disabled]="moviendo"
                >
                  📁 {{ carpeta.nombre }} →
                </button>
              } @empty {
                <p>No hay más subcarpetas aquí.</p>
              }
            </div>
          }

          @if (errorMovimiento) {
            <p class="error">{{ errorMovimiento }}</p>
          }

          <div class="acciones">
            <button
              type="button"
              (click)="confirmarMovimiento()"
              [disabled]="moviendo || cargandoDestinos"
            >
              {{
                moviendo
                  ? 'Moviendo...'
                  : 'Mover a esta ubicación'
              }}
            </button>

            <button
              type="button"
              (click)="cancelarMovimiento()"
              [disabled]="moviendo"
            >
              Cancelar
            </button>
          </div>
        </section>
      }
    </main>
  `,

  styles: [`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 30px;
      background: #17365d;
      color: white;
    }

    main {
      padding: 30px;
    }

    nav {
      margin: 18px 0;
    }

    form, .subida, .acciones {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 14px 0;
    }

    input {
      padding: 10px;
    }

    button {
      padding: 9px 13px;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .fila-carpeta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .fila-carpeta .carpeta { flex: 1; width: auto; }
    .boton-peligro { border: 1px solid #b91c1c; color: #991b1b; }

    .carpeta {
      display: block;
      width: 100%;
      margin: 6px 0;
      padding: 12px;
      text-align: left;
      background: #f2f5f9;
      border: 1px solid #ddd;
      border-radius: 6px;
    }

    .archivo {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding: 8px 12px;
      margin: 6px 0;
      background: #f2f5f9;
      border: 1px solid #ddd;
      border-radius: 6px;
    }

    .archivo span {
      overflow-wrap: anywhere;
    }

    .panel-mover {
      margin-top: 25px;
      padding: 20px;
      border: 1px solid #b6c7da;
      border-radius: 8px;
      background: #f6f9fc;
    }

    .destinos {
      margin: 15px 0;
    }

    .error {
      color: #b91c1c;
    }

    .aviso {
      color: #166534;
    }

    .ayuda {
      color: #666;
      font-size: 13px;
    }

    hr {
      margin: 30px 0;
      border: 0;
      border-top: 1px solid #ddd;
    }
  `]
})

export class Carpetas implements OnInit {

  private api = inject(ApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

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

  // Mensajes
  error = '';
  aviso = '';

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
    this.cargar();
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

  // RENOMBRAR
  renombrarArchivo(archivo: Archivo) {
    if (this.renombrandoId) return;

    const respuesta = window.prompt(
      'Nuevo nombre del archivo (.txt o .md):',
      archivo.filename
    );

    if (respuesta === null) return;

    const nombre = respuesta.trim();

    if (nombre === archivo.filename) return;

    const formato =
      /^[^\\/:*?"<>|\u0000-\u001F]{1,150}\.(txt|md)$/i;

    if (!formato.test(nombre)) {
      this.error = 'Nombre invalido. Usa .txt o .md';
      return;
    }

    this.renombrandoId = archivo._id;
    this.error = '';

    this.api.actualizarArchivo(
      archivo._id,
      { nombre }
    ).subscribe({
      next: () => {
        this.renombrandoId = null;
        this.aviso = 'Archivo renombrado correctamente';
        this.cargarArchivos();
        this.cdr.markForCheck();
      },

      error: (error) => {
        this.renombrandoId = null;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No se pudo renombrar el archivo';
        this.cdr.markForCheck();
      }
    });
  }

  // MOVER: seleccionar archivo
  iniciarMovimiento(archivo: Archivo) {
    if (this.moviendo) return;

    this.archivoParaMover = archivo;
    this.rutaDestino = [];
    this.errorMovimiento = '';

    this.cargarDestinos();
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

  // Confirmar movimiento
  confirmarMovimiento() {
    const archivo = this.archivoParaMover;

    if (!archivo || this.moviendo || this.cargandoDestinos) {
      return;
    }

    const destino = this.destinoActual;
    const origen = archivo.metadata?.carpetaId ?? null;

    if (origen === destino) {
      this.errorMovimiento =
        'El archivo ya está en esta ubicación';
      return;
    }

    this.moviendo = true;
    this.errorMovimiento = '';

    this.api.actualizarArchivo(
      archivo._id,
      { carpetaId: destino }
    ).subscribe({
      next: () => {
        this.moviendo = false;
        this.archivoParaMover = null;
        this.rutaDestino = [];
        this.carpetasDestino = [];

        this.aviso = 'Archivo movido correctamente';
        this.cargarArchivos();
        this.cdr.markForCheck();
      },

      error: (error) => {
        this.moviendo = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.errorMovimiento =
          'No se pudo mover el archivo';

        this.cdr.markForCheck();
      }
    });
  }

  // Cancelar el movimiento
  cancelarMovimiento() {
    if (this.moviendo) return;

    this.archivoParaMover = null;
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
