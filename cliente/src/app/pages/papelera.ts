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
  templateUrl: './papelera.html',
  styleUrl: './papelera.css'
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
