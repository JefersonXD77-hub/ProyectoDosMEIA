import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, PermisoCompartido, TipoRecurso, NivelComparticion, ContenidoCompartido, UsuarioCompartible } from '../services/api';

@Component({
  selector: 'app-compartidos',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header>
      <strong>Gestión Documental · Compartidos</strong>
      <button type="button" (click)="volver()">Volver a Mis archivos</button>
    </header>
    <main>
      <h1>Compartir archivos y carpetas</h1>
      <p>Lectura permite consultar y descargar; Comentar añade comentarios; Edición también permite renombrar.</p>

      @if (seleccionId) {
        <section class="panel">
          <h2>Compartir: {{ seleccionNombre }}</h2>
          <form (ngSubmit)="conceder()">
            <div class="campo-destinatario">
              <label for="busquedaDestinatario">Persona con quien compartir</label>
              <input
                id="busquedaDestinatario"
                type="search"
                name="busquedaDestinatario"
                [(ngModel)]="busquedaDestinatario"
                (ngModelChange)="alCambiarBusqueda($event)"
                (focus)="mostrarSugerencias = true"
                placeholder="Buscar por nombre o usuario..."
                autocomplete="off"
                maxlength="60"
              />
              @if (usuarioSeleccionado) {
                <div class="usuario-elegido">
                  ✓ {{ usuarioSeleccionado.nombre }} (&#64;{{ usuarioSeleccionado.username }})
                  <button type="button" (click)="limpiarDestinatario()">Cambiar</button>
                </div>
              } @else if (mostrarSugerencias) {
                <div class="sugerencias">
                  @if (busquedaDestinatario.trim().length < 2) {
                    <p>Escribe al menos 2 caracteres para buscar.</p>
                  } @else if (buscandoUsuarios) {
                    <p>Buscando usuarios...</p>
                  } @else {
                    @for (u of sugerencias; track u.username) {
                      <button type="button" class="sugerencia" (click)="seleccionarDestinatario(u)">
                        <strong>{{ u.nombre }}</strong>
                        <span>&#64;{{ u.username }}</span>
                      </button>
                    } @empty {
                      <p>No se encontraron usuarios activos.</p>
                    }
                  }
                </div>
              }
            </div>
            <label>Permiso
              <select name="nivel" [(ngModel)]="nivel">
                <option value="LECTURA">Lectura</option>
                <option value="COMENTAR">Comentar</option>
                <option value="EDICION">Edición</option>
              </select>
            </label>
            <button type="submit" [disabled]="procesando || !usuarioSeleccionado">Guardar permiso</button>
            <button type="button" (click)="cerrarSeleccion()">Cerrar</button>
          </form>
        </section>
      }

      @if (error) { <p class="error">{{ error }}</p> }
      @if (aviso) { <p class="aviso">{{ aviso }}</p> }

      <h2>Compartidos por mí ({{ otorgados.length }})</h2>
      @if (cargando) { <p>Cargando recursos...</p> }
      @for (p of otorgados; track p.id) {
        <div class="fila">
          <span>📎 {{ p.recursoNombre }} ({{ p.tipo }}) → <strong>{{ p.destinatario }}</strong> · {{ p.nivel }}</span>
          <div class="acciones">
            <button type="button" (click)="prepararCompartir(p)">Compartir con otro usuario</button>
            <button type="button" (click)="verComentarios(p.tipo, p.recursoId, 'PROPIETARIO')">Comentarios</button>
            <button type="button" (click)="abrirEditorPermiso(p)" [disabled]="procesando">
              Cambiar permiso
            </button>
            <button type="button" (click)="revocar(p)" [disabled]="procesando">Revocar</button>
          </div>
        </div>
        @if (edicionPermisoId === p.id) {
          <div class="editor-permiso">
            <label>Permiso de {{ p.destinatario }}
              <select name="editarNivel" [(ngModel)]="nivelEditando">
                <option value="LECTURA">Lectura</option>
                <option value="COMENTAR">Comentar</option>
                <option value="EDICION">Edición</option>
              </select>
            </label>
            <button type="button" (click)="guardarCambioNivel(p)"
              [disabled]="procesando || nivelEditando === p.nivel">Guardar cambio</button>
            <button type="button" (click)="cancelarCambioNivel()">Cancelar</button>
          </div>
        }
      } @empty { <p>No has compartido recursos todavía.</p> }

      <h2>Compartidos conmigo ({{ recibidos.length }})</h2>
      @for (p of recibidos; track p.id) {
        <div class="fila">
          <span>{{ p.tipo === 'carpeta' ? '📁' : '📄' }} <strong>{{ p.recursoNombre }}</strong> · de {{ p.propietario }} · {{ p.nivel }}</span>
          <div class="acciones">
            @if (p.tipo === 'carpeta') {
              <button (click)="abrirCarpeta(p.recursoId)">Abrir carpeta</button>
            } @else {
              <button (click)="descargar(p.recursoId, p.recursoNombre)">Descargar</button>
            }
            @if (p.nivel === 'EDICION') {
              <button (click)="renombrar(p.tipo,p.recursoId,p.recursoNombre)">Renombrar</button>
            }
            <button (click)="verComentarios(p.tipo,p.recursoId,p.nivel)">Comentarios</button>
          </div>
        </div>
      } @empty { <p>Todavía no te han compartido documentos.</p> }

      @if (contenido) {
        <section class="panel">
          <h2>Carpeta compartida: {{ contenido.carpeta.nombre }}</h2>
          <button (click)="cerrarCarpeta()">Cerrar carpeta compartida</button>
          @if (rutaCompartida.length > 1) { <button (click)="subirNivel()">Subir un nivel</button> }
          @for (c of contenido.carpetas; track c._id) {
            <div class="fila"><span>📁 {{ c.nombre }}</span>
              <button (click)="abrirCarpeta(c._id)">Abrir</button>
            </div>
          }
          @for (a of contenido.archivos; track a._id) {
            <div class="fila"><span>📄 {{ a.filename }} ({{ a.length }} bytes)</span>
              <div class="acciones">
                <button (click)="descargar(a._id,a.filename)">Descargar</button>
                @if (contenido.nivel === 'EDICION' || contenido.nivel === 'PROPIETARIO') {
                  <button (click)="renombrar('archivo',a._id,a.filename)">Renombrar</button>
                }
                <button (click)="verComentarios('archivo',a._id,contenido.nivel)">Comentarios</button>
              </div>
            </div>
          }
        </section>
      }

      @if (recursoComentarios) {
        <section class="panel">
          <h2>Comentarios del recurso</h2>
          <button (click)="recursoComentarios=null">Cerrar comentarios</button>
          @for (c of comentarios; track $index) {
            <p class="comentario">
              <strong>{{ c.autor || 'Usuario' }}:</strong> {{ c.texto }}
              <small>({{ mostrarFecha(c.fechaCreacion) }})</small>
            </p>
          } @empty { <p>Sin comentarios.</p> }
          @if (permisoComentario !== 'LECTURA') {
            <form (ngSubmit)="publicarComentario()">
              <input name="comentario" [(ngModel)]="textoComentario" maxlength="1000" placeholder="Escribe un comentario" required />
              <button type="submit" [disabled]="procesando">Publicar</button>
            </form>
          } @else { <p>Tu permiso es de solo lectura.</p> }
        </section>
      }
    </main>
  `,
  styles: [`
    header { display:flex; justify-content:space-between; align-items:center; background:#17365d; color:white; padding:18px 30px; }
    main { padding:30px; } h2 { margin-top:30px; } button, input, select { padding:9px 12px; }
    button { cursor:pointer; } button:disabled { opacity:.55; cursor:not-allowed; }
    .panel { background:#f5f8fc; border:1px solid #bdcee0; padding:18px; margin:16px 0; border-radius:8px; }
    form { display:flex; flex-wrap:wrap; gap:10px; align-items:end; }
    label { display:flex; flex-direction:column; gap:6px; }
    .fila { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; border:1px solid #ddd; padding:12px; border-radius:5px; margin:6px 0; }
    .acciones { display:flex; flex-wrap:wrap; gap:6px; }
    .error { color:#b91c1c; } .aviso { color:#166534; }
    .comentario { border-bottom:1px solid #ddd; padding:8px; }
    .editor-permiso { display:flex; gap:10px; flex-wrap:wrap; align-items:end; padding:12px; border:1px solid #cbd5e1; border-radius:6px; background:#f5f8fc; }
    .editor-permiso label { display:flex; flex-direction:column; gap:6px; }
    .comentario small { color:#475569; }
    .campo-destinatario { position:relative; display:flex; flex-direction:column; gap:6px; min-width:300px; flex:1 1 310px; max-width:420px; }
    .campo-destinatario input { width:100%; box-sizing:border-box; }
    .sugerencias { position:absolute; top:100%; left:0; right:0; z-index:5; background:white; border:1px solid #bdcee0; border-radius:6px; box-shadow:0 8px 20px #0002; max-height:220px; overflow:auto; }
    .sugerencias p { margin:0; padding:10px; color:#475569; font-size:.9rem; }
    .sugerencia { display:flex; flex-direction:column; align-items:flex-start; width:100%; gap:4px; background:white; border:0; border-bottom:1px solid #edf2f7; text-align:left; }
    .sugerencia:hover, .sugerencia:focus-visible { background:#eaf2fb; }
    .sugerencia span { color:#475569; font-size:.85rem; }
    .usuario-elegido { display:flex; flex-wrap:wrap; align-items:center; gap:6px; color:#166534; font-size:.9rem; }
    .usuario-elegido button { padding:4px 8px; }
  `]
})
export class Compartidos implements OnInit, OnDestroy {
  private api=inject(ApiService);
  private router=inject(Router);
  private route=inject(ActivatedRoute);
  private cdr=inject(ChangeDetectorRef);

  otorgados: PermisoCompartido[]=[];
  recibidos: PermisoCompartido[]=[];
  seleccionId=''; seleccionNombre=''; seleccionTipo:TipoRecurso='archivo';
  username=''; nivel:NivelComparticion='LECTURA';
  busquedaDestinatario = '';
  sugerencias: UsuarioCompartible[] = [];
  usuarioSeleccionado: UsuarioCompartible | null = null;
  buscandoUsuarios = false;
  mostrarSugerencias = false;
  private consultaUsuarios$ = new Subject<string>();
  private suscripcionBusqueda?: Subscription;
  cargando=false; procesando=false; error=''; aviso='';
  contenido:ContenidoCompartido|null=null;
  rutaCompartida:string[]=[];
  recursoComentarios: {tipo:TipoRecurso;id:string}|null=null;
  permisoComentario='LECTURA'; textoComentario='';
  comentarios: {texto:string;fechaCreacion:string;autor?:string}[]=[];
  edicionPermisoId: string | null = null;
  nivelEditando: NivelComparticion = 'LECTURA';

  ngOnInit() {
    // Debounce evita consultar MongoDB en cada tecla; switchMap descarta búsquedas anteriores.
    this.suscripcionBusqueda = this.consultaUsuarios$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(texto => {
        if (texto.length < 2) return of([] as UsuarioCompartible[]);
        return this.api.buscarUsuarios(texto).pipe(
          map(respuesta => respuesta.usuarios),
          catchError(error => {
            console.error('No fue posible buscar usuarios', error);
            if (error.status === 401) this.fallo(error, 'Sesión vencida');
            else this.error = 'No fue posible buscar usuarios';
            return of([] as UsuarioCompartible[]);
          })
        );
      })
    ).subscribe(usuarios => {
      this.sugerencias = usuarios;
      this.buscandoUsuarios = false;
      this.cdr.markForCheck();
    });

    const qs=this.route.snapshot.queryParamMap;
    if ((qs.get('tipo')==='archivo' || qs.get('tipo')==='carpeta') && qs.get('id')) {
      this.seleccionTipo=qs.get('tipo') as TipoRecurso;
      this.seleccionId=qs.get('id')!;
      this.seleccionNombre=qs.get('nombre') || this.seleccionId;
    }
    this.cargar();
  }
  cargar() {
    this.cargando=true;
    this.api.compartidosOtorgados().subscribe({next:r=>{
      this.otorgados=r.permisos; this.cdr.markForCheck();
    },error:e=>this.fallo(e,'No se pudieron consultar recursos otorgados')});
    this.api.compartidosRecibidos().subscribe({next:r=>{
      this.recibidos=r.permisos;this.cargando=false;this.cdr.markForCheck();
    },error:e=>{this.cargando=false;this.fallo(e,'No se pudieron consultar recursos recibidos');}});
  }
  fallo(e:any,msj:string) {
    console.error(msj,e);this.procesando=false;
    if(e.status===401){this.api.cerrarSesion();void this.router.navigateByUrl('/login');return;}
    this.error=e.error?.mensaje || msj;this.cdr.markForCheck();
  }
  alCambiarBusqueda(texto: string) {
    this.username = '';
    this.usuarioSeleccionado = null;
    this.sugerencias = [];
    this.mostrarSugerencias = true;
    this.buscandoUsuarios = texto.trim().length >= 2;
    this.error = '';
    this.consultaUsuarios$.next(texto.trim());
  }

  seleccionarDestinatario(usuario: UsuarioCompartible) {
    this.usuarioSeleccionado = usuario;
    this.username = usuario.username;
    this.busquedaDestinatario = `${usuario.nombre} (@${usuario.username})`;
    this.mostrarSugerencias = false;
    this.sugerencias = [];
    this.consultaUsuarios$.next('');
    this.cdr.markForCheck();
  }

  limpiarDestinatario() {
    this.busquedaDestinatario = '';
    this.usuarioSeleccionado = null;
    this.username = '';
    this.sugerencias = [];
    this.mostrarSugerencias = false;
    this.buscandoUsuarios = false;
    this.consultaUsuarios$.next('');
    this.cdr.markForCheck();
  }

  conceder() {
    if (!this.seleccionId || !this.usuarioSeleccionado || this.procesando) return;
    this.procesando = true;
    this.error = '';
    this.aviso = '';
    this.api.compartir(this.seleccionTipo, this.seleccionId, this.usuarioSeleccionado.username, this.nivel).subscribe({
      next: () => {
        this.procesando = false;
        this.aviso = 'Permiso guardado';
        this.limpiarDestinatario();
        this.cargar();
      },
      error: e => this.fallo(e, 'Error al compartir')
    });
  }
  cerrarSeleccion(){
    this.seleccionId='';
    this.limpiarDestinatario();
    void this.router.navigate(['/compartidos']);
  }

  prepararCompartir(p: PermisoCompartido) {
    this.seleccionTipo = p.tipo;
    this.seleccionId = p.recursoId;
    this.seleccionNombre = p.recursoNombre;
    this.limpiarDestinatario();
    this.nivel = 'LECTURA';
    this.error = '';
    this.aviso = '';
    this.cdr.markForCheck();
  }

  abrirEditorPermiso(p: PermisoCompartido) {
    if (this.edicionPermisoId === p.id) {
      this.cancelarCambioNivel();
      return;
    }
    this.edicionPermisoId = p.id;
    this.nivelEditando = p.nivel;
  }

  cancelarCambioNivel() {
    this.edicionPermisoId = null;
  }

  guardarCambioNivel(p: PermisoCompartido) {
    if (this.procesando || this.edicionPermisoId !== p.id || this.nivelEditando === p.nivel) return;
    this.procesando = true;
    this.error = '';
    this.aviso = '';
    this.api.cambiarPermiso(p.id, this.nivelEditando).subscribe({
      next: () => {
        this.procesando = false;
        this.edicionPermisoId = null;
        this.aviso = 'Permiso modificado';
        this.cargar();
      },
      error: e => this.fallo(e, 'No se pudo modificar el permiso')
    });
  }
  revocar(p:PermisoCompartido){
    if(!window.confirm(`¿Retirar a ${p.destinatario} el acceso a ${p.recursoNombre}?`))return;
    this.procesando=true;
    this.api.revocarPermiso(p.id).subscribe({next:()=>{this.procesando=false;this.aviso='Permiso retirado';this.cargar();},error:e=>this.fallo(e,'No se pudo revocar')});
  }
  abrirCarpeta(id:string){
    this.api.contenidoCompartido(id).subscribe({next:r=>{
      this.rutaCompartida.push(id);this.contenido=r;this.cdr.markForCheck();
    },error:e=>this.fallo(e,'No se pudo abrir la carpeta')});
  }
  subirNivel(){ if(this.rutaCompartida.length<2)return;
    this.rutaCompartida.pop();const id=this.rutaCompartida.pop()!;this.abrirCarpeta(id);
  }
  cerrarCarpeta(){this.rutaCompartida=[];this.contenido=null;}
  descargar(id:string,nombre:string){
    this.api.descargarCompartido(id).subscribe({next:contenido=>{
      const url=URL.createObjectURL(contenido);
      const enlace=document.createElement('a');enlace.href=url;enlace.download=nombre;
      document.body.appendChild(enlace);enlace.click();enlace.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },error:e=>this.fallo(e,'No se pudo descargar el archivo')});
  }
  renombrar(tipo:TipoRecurso,id:string,nombreActual:string){
    const nombre=window.prompt('Nuevo nombre:',nombreActual)?.trim();
    if(!nombre || nombre===nombreActual)return;
    this.api.renombrarCompartido(tipo,id,nombre).subscribe({next:()=>{
      this.aviso='Recurso renombrado';this.cargar();
      if(this.rutaCompartida.length){const idActual=this.rutaCompartida.pop()!;this.abrirCarpeta(idActual);}
    },error:e=>this.fallo(e,'No se pudo renombrar')});
  }
  verComentarios(tipo:TipoRecurso,id:string,nivel:string){
    this.recursoComentarios={tipo,id};
    this.permisoComentario=nivel;
    this.comentarios=[];
    this.error='';
    this.api.listarComentarios(tipo,id).subscribe({
      next:r=>{this.comentarios=r.comentarios;this.cdr.markForCheck();},
      error:e=>{this.recursoComentarios=null;this.fallo(e,'No se pudieron listar comentarios');}
    });
  }

  mostrarFecha(fecha: string): string {
    const valor = new Date(fecha);
    return Number.isNaN(valor.getTime()) ? fecha : valor.toLocaleString('es-GT');
  }
  publicarComentario(){
    if(!this.recursoComentarios || !this.textoComentario.trim())return;
    const {tipo,id}=this.recursoComentarios;this.procesando=true;
    this.api.comentar(tipo,id,this.textoComentario).subscribe({next:()=>{
      this.procesando=false;this.textoComentario='';this.verComentarios(tipo,id,this.permisoComentario);
    },error:e=>this.fallo(e,'No se pudo publicar el comentario')});
  }
  ngOnDestroy() {
    this.suscripcionBusqueda?.unsubscribe();
    this.consultaUsuarios$.complete();
  }
  volver(){void this.router.navigateByUrl('/carpetas');}
}
