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
  templateUrl: './compartidos.html',
  styleUrl: './compartidos.css'
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
