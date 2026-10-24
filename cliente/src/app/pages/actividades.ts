import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Actividad, ActividadService } from '../services/actividad';

@Component({
  selector: 'app-actividades',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './actividades.html',
  styleUrl: './actividades.css'
})
export class Actividades implements OnInit {
  private readonly servicio = inject(ActividadService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  actividades: Actividad[] = [];
  desde = '';
  hasta = '';
  accion = '';
  tipoRecurso = '';
  pagina = 1;
  paginas = 0;
  total = 0;
  cargando = false;
  error = '';

  ngOnInit(): void { this.cargar(); }
  buscar(): void { this.pagina = 1; this.cargar(); }
  limpiar(): void {
    this.desde = ''; this.hasta = ''; this.accion = ''; this.tipoRecurso = '';
    this.buscar();
  }
  cambiarPagina(delta: number): void {
    const nuevaPagina = this.pagina + delta;
    if (nuevaPagina < 1 || nuevaPagina > this.paginas || this.cargando) return;
    this.pagina = nuevaPagina;
    this.cargar();
  }
  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.servicio.consultar({
      pagina: this.pagina,
      limite: 20,
      desde: this.desde,
      hasta: this.hasta,
      accion: this.accion.trim().toUpperCase(),
      tipoRecurso: this.tipoRecurso
    }).subscribe({
      next: (resultado) => {
        this.actividades = resultado.actividades;
        this.total = resultado.total;
        this.paginas = resultado.paginas;
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.cargando = false;
        this.error = e.error?.mensaje || 'No se pudo consultar el historial';
        this.cdr.markForCheck();
      }
    });
  }
  detalleVisible(item: Actividad): string {
    return Object.entries(item.detalles || {})
      .map(([clave, valor]) => `${clave}: ${valor ?? '—'}`)
      .join(' · ');
  }
  volver(): void { void this.router.navigateByUrl('/carpetas'); }
}
