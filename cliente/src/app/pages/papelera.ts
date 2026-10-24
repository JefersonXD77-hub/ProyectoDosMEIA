import {
  ChangeDetectorRef,
  Component,
  inject,
  OnInit
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, Archivo, Carpeta } from '../services/api';

@Component({
  selector: 'app-papelera',
  standalone: true,
  template: `
    <header>
      <strong>Gestión Documental</strong>
      <button type="button" (click)="volver()">Volver a Mis archivos</button>
    </header>
    <main>
      <h1>Papelera de reciclaje</h1>
      <p class="descripcion">
        Puedes restaurar los recursos o eliminarlos definitivamente.
        Una carpeta incluye todas sus subcarpetas y archivos.
      </p>
      <button type="button" (click)="cargar()"
        [disabled]="cargando || operandoId !== null || operandoCarpetaId !== null">
        Actualizar papelera
      </button>
      @if (error) { <p class="error">{{ error }}</p> }
      @if (aviso) { <p class="aviso">{{ aviso }}</p> }

      @if (cargando) {
        <p>Cargando papelera...</p>
      } @else {
        <h2>Carpetas eliminadas ({{ carpetas.length }})</h2>
        <section>
          @for (carpeta of carpetas; track carpeta._id) {
            <div class="recurso">
              <div class="informacion">
                <strong>📁 {{ carpeta.nombre }}</strong>
                <span>Incluye subcarpetas y archivos asociados</span>
              </div>
              <div class="acciones">
                <button type="button" (click)="restaurarCarpeta(carpeta)"
                  [disabled]="ocupado">
                  Restaurar carpeta
                </button>
                <button type="button" class="peligro"
                  (click)="eliminarCarpetaPermanente(carpeta)"
                  [disabled]="ocupado">
                  Eliminar definitivamente
                </button>
              </div>
            </div>
          } @empty { <p>No hay carpetas en la papelera.</p> }
        </section>

        <h2>Archivos eliminados individualmente ({{ archivos.length }})</h2>
        <section>
          @for (archivo of archivos; track archivo._id) {
            <div class="recurso">
              <div class="informacion">
                <strong>📄 {{ archivo.filename }}</strong>
                <span>{{ archivo.length }} bytes</span>
              </div>
              <div class="acciones">
                <button type="button" (click)="restaurarArchivo(archivo)"
                  [disabled]="ocupado">Restaurar</button>
                <button type="button" class="peligro"
                  (click)="eliminarArchivoPermanente(archivo)"
                  [disabled]="ocupado">Eliminar definitivamente</button>
              </div>
            </div>
          } @empty { <p>No hay archivos eliminados individualmente.</p> }
        </section>
      }
    </main>
  `,
  styles: [`
    header { display:flex; justify-content:space-between; align-items:center;
      padding:18px 30px; background:#17365d; color:white; }
    main { padding:30px; }
    .descripcion { color:#666; margin-bottom:24px; }
    h2 { margin-top:28px; }
    button { padding:10px 14px; cursor:pointer; }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .recurso { display:flex; align-items:center; justify-content:space-between;
      flex-wrap:wrap; gap:15px; padding:14px; margin:8px 0;
      border:1px solid #ddd; border-radius:7px; background:#f2f5f9; }
    .informacion { display:flex; flex-direction:column; gap:6px; overflow-wrap:anywhere; }
    .informacion span { color:#666; font-size:13px; }
    .acciones { display:flex; gap:10px; flex-wrap:wrap; }
    .peligro { background:#b91c1c; border:1px solid #991b1b;
      color:white; border-radius:5px; }
    .error { color:#b91c1c; }
    .aviso { color:#166534; }
  `]
})
export class Papelera implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  carpetas: Carpeta[] = [];
  archivos: Archivo[] = [];
  cargando = false;
  operandoId: string | null = null;
  operandoCarpetaId: string | null = null;
  error = '';
  aviso = '';

  get ocupado(): boolean {
    return this.cargando || this.operandoId !== null ||
      this.operandoCarpetaId !== null;
  }

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.error = '';
    forkJoin({
      carpetas: this.api.listarCarpetasPapelera(),
      archivos: this.api.listarPapelera()
    }).subscribe({
      next: (r) => {
        this.carpetas = r.carpetas.carpetas;
        // Los archivos eliminados junto a una carpeta se muestran
        // indirectamente en esa carpeta, para no duplicarlos.
        this.archivos = r.archivos.archivos.filter(
          a => !a.metadata?.papeleraLoteId
        );
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.cargando = false;
        if (error.status === 401) {
          this.sesionVencida();
          return;
        }
        console.error('Error consultando papelera:', error);
        this.error = 'No fue posible consultar la papelera';
        this.cdr.markForCheck();
      }
    });
  }

  restaurarCarpeta(carpeta: Carpeta) {
    if (this.ocupado) return;
    this.operandoCarpetaId = carpeta._id;
    this.error = '';
    this.aviso = '';
    this.api.restaurarCarpeta(carpeta._id).subscribe({
      next: () => {
        this.operandoCarpetaId = null;
        this.aviso = 'Carpeta y contenido restaurados';
        this.cargar();
      },
      error: error => {
        this.operandoCarpetaId = null;
        if (error.status === 401) { this.sesionVencida(); return; }
        this.error = error.error?.mensaje || 'No se pudo restaurar la carpeta';
        this.cdr.markForCheck();
      }
    });
  }

  eliminarCarpetaPermanente(carpeta: Carpeta) {
    if (this.ocupado) return;
    const confirmar = window.confirm(
      `¿Eliminar DEFINITIVAMENTE la carpeta "${carpeta.nombre}" ` +
      'y todos sus archivos y subcarpetas? No se puede deshacer.'
    );
    if (!confirmar) return;
    this.operandoCarpetaId = carpeta._id;
    this.error = '';
    this.aviso = '';
    this.api.eliminarCarpetaDefinitivamente(carpeta._id).subscribe({
      next: () => {
        this.operandoCarpetaId = null;
        this.aviso = 'Carpeta y contenido eliminados definitivamente';
        this.cargar();
      },
      error: error => {
        this.operandoCarpetaId = null;
        if (error.status === 401) { this.sesionVencida(); return; }
        this.error = error.error?.mensaje || 'No se pudo eliminar la carpeta';
        this.cdr.markForCheck();
      }
    });
  }

  restaurarArchivo(archivo: Archivo) {
    if (this.ocupado) return;
    this.operandoId = archivo._id;
    this.error = '';
    this.aviso = '';
    this.api.restaurarArchivo(archivo._id).subscribe({
      next: () => {
        this.operandoId = null;
        this.aviso = 'Archivo restaurado correctamente';
        this.cargar();
      },
      error: error => {
        this.operandoId = null;
        if (error.status === 401) { this.sesionVencida(); return; }
        this.error = error.error?.mensaje || 'No se pudo restaurar el archivo';
        this.cdr.markForCheck();
      }
    });
  }

  eliminarArchivoPermanente(archivo: Archivo) {
    if (this.ocupado) return;
    const confirmar = window.confirm(
      `¿Eliminar definitivamente "${archivo.filename}"? No se puede deshacer.`
    );
    if (!confirmar) return;
    this.operandoId = archivo._id;
    this.error = '';
    this.aviso = '';
    this.api.eliminarDefinitivamente(archivo._id).subscribe({
      next: () => {
        this.operandoId = null;
        this.aviso = 'Archivo eliminado definitivamente';
        this.cargar();
      },
      error: error => {
        this.operandoId = null;
        if (error.status === 401) { this.sesionVencida(); return; }
        this.error = error.error?.mensaje || 'No se pudo eliminar el archivo';
        this.cdr.markForCheck();
      }
    });
  }

  volver() { void this.router.navigateByUrl('/carpetas'); }

  private sesionVencida() {
    this.api.cerrarSesion();
    void this.router.navigateByUrl('/login');
  }
}
