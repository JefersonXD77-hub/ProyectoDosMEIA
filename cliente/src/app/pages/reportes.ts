import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';

type FilaCantidad = { tipo?: string; accion?: string; periodo?: string; cantidad: number };
type ArchivoFecha = { id:string; nombre:string; fecha:string; usuario:string; tamano:number };
type RecursoReporte = { id:string; nombre:string; operaciones?:number; cantidad?:number };
type UsuarioReporte = { id:string; nombre:string; username?:string; cantidad?:number; recursos?:number; destinatarios?:number };
type PermisoReporte = { id:string; tipo:string; nivel:string; recursoId:string; destinatario:string; fecha:string };
type ActividadReporte = { accion:string; tipoRecurso:string; recursoNombre?:string; usuario:string; fecha:string };
type ResultadoBusqueda = { _id:string; tipo:'archivo'|'carpeta'; nombre:string; fecha:string; tamano?:number; carpetaId?:string|null; esPropio?:boolean };
interface BusquedaRespuesta { total:number; pagina:number; paginas:number; resultados:ResultadoBusqueda[] }
interface ResumenRespuesta {
  alcance:'global'|'usuario';
  resumen:{totalArchivos:number;totalActividades:number;totalPermisos:number};
  archivosPorTipo:FilaCantidad[]; archivosPorFecha:ArchivoFecha[]; archivosMasOperados:RecursoReporte[];
  archivosNuncaCompartidos:RecursoReporte[]; carpetasMasArchivos:RecursoReporte[];
  usuariosMasArchivos:UsuarioReporte[]; usuariosMasCompartidos:UsuarioReporte[]; archivosMasCompartidos:RecursoReporte[];
  compartidosOtorgados:PermisoReporte[]; compartidosRecibidos:PermisoReporte[];
  historialUsuario:ActividadReporte[]; operacionesPorTipo:FilaCantidad[]; operacionesPorPeriodo:FilaCantidad[];
  accionesPrincipales:FilaCantidad[]; notas:{archivos:string;comparticion:string;actividad:string;limites:string};
}
interface UsuarioOpcion {id:string;nombre:string;username:string;activo:boolean}
interface AlmacenamientoRespuesta {
  alcance: 'global' | 'usuario';
  asignado: number;
  utilizado: number;
  disponible: number;
  porcentajeUso: number;
  cuotaPorUsuario: number;
  usuariosConCuota: number;
  totalArchivosAlmacenados: number;
}

@Component({
  selector:'app-reportes',
  standalone:true,
  imports:[CommonModule,FormsModule],
  templateUrl:'./reportes.html',
  styleUrl:'./reportes.css'
})
export class Reportes implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private api = 'http://127.0.0.1:3000/api/reportes';

  vista:'buscar'|'reportes' = 'buscar';
  texto = '';
  tipo = 'todos';
  extension = 'todas';
  orden = 'recientes';
  desde = '';
  hasta = '';
  usuarioId = '';
  usuarios:UsuarioOpcion[] = [];
  administrador = false;

  pagina = 1;
  total = 0;
  paginas = 0;
  resultados:ResultadoBusqueda[] = [];
  reportes:ResumenRespuesta|null = null;
  almacenamiento:AlmacenamientoRespuesta|null = null;
  cargandoBusqueda = false;
  cargandoReportes = false;
  cargandoAlmacenamiento = false;
  errorBusqueda = '';
  errorReportes = '';
  errorAlmacenamiento = '';
  errorDescarga = '';

  private get headers() { return { Authorization:`Bearer ${sessionStorage.getItem('jwt') ?? ''}` }; }
  private get baseParams():HttpParams {
    let p = new HttpParams();
    if (this.desde) p = p.set('desde',this.desde);
    if (this.hasta) p = p.set('hasta',this.hasta);
    if (this.usuarioId) p = p.set('usuarioId',this.usuarioId);
    return p;
  }
  ngOnInit() { this.buscar(); this.cargarReportes(); this.cargarAlmacenamiento(); }
  cambiarVista(nueva:'buscar'|'reportes') { this.vista = nueva; }

  tipoCambiado(nuevoTipo: string) {
    this.tipo = nuevoTipo;
    if (nuevoTipo === 'carpeta') this.extension = 'todas';
  }

  buscar(reset = true) {
    if (reset) this.pagina = 1;
    this.errorBusqueda = ''; this.cargandoBusqueda = true;
    let p = this.baseParams.set('tipo',this.tipo).set('extension', this.tipo === 'carpeta' ? 'todas' : this.extension)
      .set('orden',this.orden).set('pagina',String(this.pagina)).set('limite','20');
    if (this.texto.trim()) p = p.set('q',this.texto.trim());
    this.http.get<BusquedaRespuesta>(`${this.api}/buscar`,{headers:this.headers,params:p})
      .subscribe({
        next:r => { this.total=r.total;this.paginas=r.paginas;this.resultados=r.resultados;
          this.cargandoBusqueda=false;this.cdr.markForCheck(); },
        error:e => { this.cargandoBusqueda=false;this.errorBusqueda=this.error(e);this.cdr.markForCheck(); }
      });
  }
  cambiarPagina(delta:number) {
    const nueva=this.pagina+delta;
    if (nueva>=1 && nueva<=this.paginas) { this.pagina=nueva;this.buscar(false); }
  }
  cargarReportes() {
    this.cargandoReportes=true;this.errorReportes='';
    this.http.get<ResumenRespuesta>(`${this.api}/resumen`,{headers:this.headers,params:this.baseParams})
      .subscribe({
        next:r => { this.reportes=r;this.administrador=r.alcance==='global' || this.administrador;
          this.cargandoReportes=false;this.cdr.markForCheck();
          if (r.alcance==='global' && !this.usuarios.length) this.cargarUsuarios(); },
        error:e => { this.cargandoReportes=false;this.errorReportes=this.error(e);this.cdr.markForCheck(); }
      });
  }
  cargarAlmacenamiento() {
    this.cargandoAlmacenamiento = true;
    this.errorAlmacenamiento = '';
    let params = new HttpParams();
    if (this.usuarioId) params = params.set('usuarioId', this.usuarioId);
    this.http.get<AlmacenamientoRespuesta>('http://127.0.0.1:3000/api/almacenamiento', {
      headers: this.headers, params
    }).subscribe({
      next:r => {
        this.almacenamiento = r;
        this.cargandoAlmacenamiento = false;
        this.cdr.markForCheck();
      },
      error:e => {
        this.almacenamiento = null;
        this.cargandoAlmacenamiento = false;
        this.errorAlmacenamiento = this.error(e);
        this.cdr.markForCheck();
      }
    });
  }
  porcentajeBarra(valor?:number, maximo?:number):number {
    if (!valor || !maximo || maximo <= 0) return 0;
    return Math.max(0, Math.min(100, (valor / maximo) * 100));
  }
  progresoAlmacenamiento(valor:number):number {
    return Number.isFinite(valor) ? Math.max(0, Math.min(100, valor)) : 0;
  }
  formatearTamano(bytes:number):string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    let cantidad = bytes;
    let i = 0;
    while (cantidad >= 1024 && i < unidades.length - 1) {
      cantidad /= 1024;
      i++;
    }
    const decimales = i === 0 ? 0 : 2;
    return `${cantidad.toLocaleString('es-GT', {maximumFractionDigits:decimales})} ${unidades[i]}`;
  }
  private cargarUsuarios() {
    this.http.get<{usuarios:UsuarioOpcion[]}>(`${this.api}/usuarios`,{headers:this.headers})
      .subscribe({next:r=>{this.usuarios=r.usuarios;this.cdr.markForCheck();},error:()=>{}});
  }
  refrescar() { this.buscar();this.cargarReportes();this.cargarAlmacenamiento(); }
  limpiar() {
    this.texto='';this.tipo='todos';this.extension='todas';this.orden='recientes';
    this.desde='';this.hasta='';this.usuarioId='';this.refrescar();
  }
  descargar(archivo:ResultadoBusqueda) {
    this.errorDescarga='';
    this.http.get(`http://127.0.0.1:3000/api/archivos/${archivo._id}/descargar`,{
      headers:this.headers,responseType:'blob'
    }).subscribe({
      next:blob => {
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=url;link.download=archivo.nombre;
        document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
      },
      error:e => { this.errorDescarga=this.error(e);this.cdr.markForCheck(); }
    });
  }
  volver() { void this.router.navigateByUrl('/carpetas'); }
  private error(e:any):string {
    if (e?.status===401) return 'Sesión vencida. Inicia sesión nuevamente.';
    if (e?.status===403) return 'No tienes permiso para consultar estos datos.';
    return e?.error?.mensaje || 'No fue posible realizar la consulta.';
  }
}
