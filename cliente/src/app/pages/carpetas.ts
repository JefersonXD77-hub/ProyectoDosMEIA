
import {
  ChangeDetectorRef,
  Component,
  inject,
  OnInit
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  ApiService,
  Carpeta,
  Archivo
} from '../services/api';

@Component({
  selector: 'app-carpetas',
  standalone: true,
  imports: [FormsModule],

  template: `
    <header>
      <strong>Gestión Documental</strong>
      <button (click)="salir()">Cerrar sesión</button>
    </header>

    <main>
      <h1>Mis carpetas</h1>

      <!-- Navegación entre carpetas -->
      <nav>
        <button (click)="irRaiz()">Mi unidad</button>

        @for (item of ruta; track item._id; let i = $index) {
          <span> / </span>
          <button (click)="irNivel(i)">
            {{ item.nombre }}
          </button>
        }
      </nav>

      <!-- Crear carpetas -->
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

      <!-- Listado de carpetas -->
      <h2>Carpetas</h2>

      @if (cargando) {
        <p>Cargando carpetas...</p>
      } @else {
        <section class="listado">
          @for (carpeta of carpetas; track carpeta._id) {
            <button
              class="carpeta"
              (click)="abrir(carpeta)"
            >
              📁 {{ carpeta.nombre }}
            </button>
          } @empty {
            <p>No hay carpetas en esta ubicación.</p>
          }
        </section>
      }

      <hr />

      <!-- Gestión de archivos -->
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
        Formatos permitidos: .txt y .md.
        Tamaño máximo: 2 MB.
      </p>

      <!-- Listado de archivos -->
      @if (cargandoArchivos) {
        <p>Cargando archivos...</p>
      } @else {
        <section class="listado">
          @for (archivo of archivos; track archivo._id) {
            <div class="archivo">
              <span>
                📄 {{ archivo.filename }}
                ({{ archivo.length }} bytes)
              </span>

              <button
                type="button"
                (click)="descargarArchivo(archivo)"
              >
                Descargar
              </button>
            </div>
          } @empty {
            <p>No hay archivos en esta ubicación.</p>
          }
        </section>
      }
    </main>
  `,

  styles: [`
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
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

    form,
    .subida {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin: 20px 0;
    }

    input {
      padding: 10px;
    }

    button {
      padding: 10px 15px;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .listado {
      margin: 12px 0 24px;
    }

    .carpeta {
      display: block;
      width: 100%;
      text-align: left;
      margin: 6px 0;
      background: #f2f5f9;
      border: 1px solid #ddd;
      border-radius: 6px;
    }

    .archivo {
      display: flex;
      justify-content: space-between;
      align-items: center;
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

    .error {
      color: #b91c1c;
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

  // Datos de carpetas
  carpetas: Carpeta[] = [];
  ruta: Carpeta[] = [];

  nombreNuevo = '';
  cargando = false;
  guardando = false;

  // Datos de archivos
  archivos: Archivo[] = [];
  archivoSeleccionado: File | null = null;

  cargandoArchivos = false;
  subiendo = false;

  // Errores generales
  error = '';

  // Identificador de la carpeta actual
  get padreActual(): string | null {
    return this.ruta.length
      ? this.ruta[this.ruta.length - 1]._id
      : null;
  }

  // Se ejecuta al iniciar el componente
  ngOnInit() {
    this.cargar();
  }

  // Cargar carpetas y archivos de la ubicación actual
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

        console.error('Error al consultar carpetas:', error);

        this.cargando = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No fue posible consultar las carpetas';

        this.cdr.markForCheck();
      }
    });
  }

  // Abrir una subcarpeta
  abrir(carpeta: Carpeta) {
    this.ruta.push(carpeta);
    this.cargar();
  }

  // Regresar a la raíz
  irRaiz() {
    this.ruta = [];
    this.cargar();
  }

  // Regresar a un nivel anterior
  irNivel(indice: number) {
    this.ruta = this.ruta.slice(0, indice + 1);
    this.cargar();
  }

  // Crear una carpeta
  crear() {
    const nombre = this.nombreNuevo.trim();

    if (!nombre || this.guardando) return;

    this.guardando = true;
    this.error = '';

    this.api.crearCarpeta(nombre, this.padreActual).subscribe({
      next: () => {
        this.nombreNuevo = '';
        this.guardando = false;

        this.cargar();
        this.cdr.markForCheck();
      },

      error: (error) => {
        console.error('Error al crear carpeta:', error);

        this.guardando = false;
        this.error = 'No fue posible crear la carpeta';

        this.cdr.markForCheck();
      }
    });
  }

  // Seleccionar un archivo desde Windows
  seleccionarArchivo(evento: Event) {
    const input = evento.target as HTMLInputElement;

    this.archivoSeleccionado = input.files?.[0] ?? null;
    this.error = '';
  }

  // Consultar los archivos almacenados en GridFS
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

        console.error('Error al listar archivos:', error);

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

  // Subir archivo a MongoDB mediante Express
  subirArchivo(input: HTMLInputElement) {
    const archivo = this.archivoSeleccionado;

    if (!archivo || this.subiendo) return;

    // Validar formato
    if (!/\.(txt|md)$/i.test(archivo.name)) {
      this.error = 'Solo se permiten archivos .txt y .md';
      return;
    }

    // Validar tamaño
    if (archivo.size > 2 * 1024 * 1024) {
      this.error = 'El tamaño máximo permitido es de 2 MB';
      return;
    }

    this.subiendo = true;
    this.error = '';

    const carpetaId = this.padreActual;

    this.api.subirArchivo(archivo, carpetaId).subscribe({
      next: () => {
        this.archivoSeleccionado = null;
        input.value = '';
        this.subiendo = false;

        if (this.padreActual === carpetaId) {
          this.cargarArchivos();
        }

        this.cdr.markForCheck();
      },

      error: (error) => {
        console.error('Error al subir archivo:', error);

        this.subiendo = false;

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No fue posible subir el archivo';

        this.cdr.markForCheck();
      }
    });
  }

  // Descargar un archivo desde GridFS
  descargarArchivo(archivo: Archivo) {
    this.error = '';

    this.api.descargarArchivo(archivo._id).subscribe({
      next: (contenido) => {
        const url = URL.createObjectURL(contenido);

        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = archivo.filename;

        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();

        // Liberar los recursos temporales
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
      },

      error: (error) => {
        console.error('Error al descargar archivo:', error);

        if (error.status === 401) {
          this.salir();
          return;
        }

        this.error = 'No fue posible descargar el archivo';

        this.cdr.markForCheck();
      }
    });
  }

  // Cerrar sesión
  salir() {
    this.api.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
