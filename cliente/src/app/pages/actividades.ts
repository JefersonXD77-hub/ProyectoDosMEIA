import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Actividad, ActividadService } from '../services/actividad';

@Component({
  selector: 'app-actividades',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
    <header>
      <strong>Gestión Documental · Historial de actividad</strong>
      <button type="button" (click)="volver()">Volver a Mis archivos</button>
    </header>
    <main>
      <h1>Historial de actividad</h1>
      <p>Consulta quién realizó cada operación, sobre qué recurso y cuándo.</p>
      <form (ngSubmit)="buscar()">
        <label>Desde
          <input type="date" name="desde" [(ngModel)]="desde" />
        </label>
        <label>Hasta
          <input type="date" name="hasta" [(ngModel)]="hasta" />
        </label>
        <label>Operación
          <input type="text" name="accion" [(ngModel)]="accion"
            placeholder="Ej. ARCHIVO_SUBIDO" />
        </label>
        <label>Recurso
          <select name="tipoRecurso" [(ngModel)]="tipoRecurso">
            <option value="">Todos</option>
            <option value="archivo">Archivos</option>
            <option value="carpeta">Carpetas</option>
            <option value="permiso">Permisos</option>
            <option value="comentario">Comentarios</option>
            <option value="usuario">Usuarios</option>
          </select>
        </label>
        <button type="submit" [disabled]="cargando">Buscar</button>
        <button type="button" (click)="limpiar()">Limpiar</button>
      </form>
      @if (error) { <p class="error">{{ error }}</p> }
      @if (cargando) { <p>Cargando actividades...</p> }
      @else {
        <p>{{ total }} operaciones encontradas</p>
        <section>
          @for (item of actividades; track item._id) {
            <article>
              <div>
                <strong>{{ item.accion }}</strong>
                <span class="fecha">{{ item.fecha | date:'dd/MM/yyyy HH:mm:ss' }}</span>
              </div>
              <div>Usuario: {{ item.usuario?.nombre || item.usuario?.username || item.usuarioId }}</div>
              <div>Recurso: {{ item.tipoRecurso }} · {{ item.recursoNombre || item.recursoId || 'Sin nombre' }}</div>
              @if (detalleVisible(item)) {
                <small>Detalles: {{ detalleVisible(item) }}</small>
              }
            </article>
          } @empty {
            <p>No hay operaciones registradas con los filtros seleccionados.</p>
          }
        </section>
        <footer>
          <button type="button" (click)="cambiarPagina(-1)" [disabled]="pagina <= 1">Anterior</button>
          <span>Página {{ pagina }} de {{ paginas || 1 }}</span>
          <button type="button" (click)="cambiarPagina(1)" [disabled]="pagina >= paginas">Siguiente</button>
        </footer>
      }
    </main>
  `,
  styles: [`
    header { display:flex; justify-content:space-between; align-items:center;
      background:#17365d; color:white; padding:16px 28px; gap:12px; }
    main { max-width:1200px; margin:auto; padding:28px; }
    form { display:flex; flex-wrap:wrap; gap:12px; align-items:end;
      border:1px solid #ddd; border-radius:8px; padding:16px; }
    label { display:flex; flex-direction:column; gap:5px; font-size:14px; }
    input, select, button { padding:9px; }
    button { cursor:pointer; }
    article { border:1px solid #d8e1ee; background:#f6f8fb;
      border-radius:7px; padding:14px; margin:10px 0; }
    article div:first-child { display:flex; gap:15px; flex-wrap:wrap; justify-content:space-between; }
    .fecha, small { color:#4d5d72; }
    .error { color:#b91c1c; }
    footer { display:flex; align-items:center; justify-content:center; gap:16px; margin:20px 0; }
  `]
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
