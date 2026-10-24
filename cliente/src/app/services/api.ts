import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';

export interface Carpeta {
  _id: string;
  nombre: string;
  padreId: string | null;
  ancestros: string[];
  enPapelera?: boolean;
  fechaEliminacion?: string;
}

export interface Archivo {
  _id: string;
  filename: string;
  length: number;
  uploadDate: string;
  metadata?: {
    carpetaId?: string | null;
    papeleraLoteId?: string | null;
  };
}

interface RespuestaLogin {
  mensaje: string;
  token: string;
  usuario: {
    id: string;
    nombre: string;
    username: string;
    rol: string;
  };
}

interface RespuestaCarpetas {
  total: number;
  carpetas: Carpeta[];
}

interface RespuestaArchivos {
  total: number;
  archivos: Archivo[];
}

export interface UsuarioCompartible {
  username: string;
  nombre: string;
}

export type NivelComparticion = 'LECTURA' | 'COMENTAR' | 'EDICION';
export type TipoRecurso = 'archivo' | 'carpeta';
export interface PermisoCompartido {
  id: string;
  tipo: TipoRecurso;
  recursoId: string;
  recursoNombre: string;
  nivel: NivelComparticion;
  destinatario: string;
  propietarioId: string;
  propietario: string;
}
export interface ContenidoCompartido {
  carpeta: { id: string; nombre: string };
  nivel: string;
  carpetas: { _id: string; nombre: string }[];
  archivos: { _id: string; filename: string; length: number }[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private url = 'http://127.0.0.1:3000/api';

  get token(): string {
    return sessionStorage.getItem('jwt') ?? '';
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`
    };
  }

  // Autenticacion
  login(username: string, password: string) {
    return this.http.post<RespuestaLogin>(
      `${this.url}/auth/login`,
      { username, password }
    );
  }

  guardarToken(token: string) {
    sessionStorage.setItem('jwt', token);
  }

  cerrarSesion() {
    sessionStorage.removeItem('jwt');
  }

  // Carpetas
  listarCarpetas(padreId: string | null) {
    return this.http.get<RespuestaCarpetas>(
      `${this.url}/carpetas`,
      {
        headers: this.headers,
        params: padreId ? { padreId } : {}
      }
    );
  }

  crearCarpeta(nombre: string, padreId: string | null) {
    return this.http.post(
      `${this.url}/carpetas`,
      { nombre, padreId },
      { headers: this.headers }
    );
  }

  // Archivos: consultar
  listarArchivos(carpetaId: string | null) {
    return this.http.get<RespuestaArchivos>(
      `${this.url}/archivos`,
      {
        headers: this.headers,
        params: carpetaId ? { carpetaId } : {}
      }
    );
  }

  // Archivos: subir
  subirArchivo(archivo: File, carpetaId: string | null) {
    const datos = new FormData();
    datos.append('archivo', archivo);

    if (carpetaId) {
      datos.append('carpetaId', carpetaId);
    }

    return this.http.post(
      `${this.url}/archivos`,
      datos,
      { headers: this.headers }
    );
  }

  // Archivos: descargar
  descargarArchivo(id: string) {
    return this.http.get(
      `${this.url}/archivos/${id}/descargar`,
      {
        headers: this.headers,
        responseType: 'blob'
      }
    );
  }

  // Archivos: renombrar o mover
  actualizarArchivo(
    id: string,
    cambios: {
      nombre?: string;
      carpetaId?: string | null;
    }
  ) {
    return this.http.patch(
      `${this.url}/archivos/${id}`,
      cambios,
      { headers: this.headers }
    );
  }

  // Busqueda de usuarios activos (sin exponer contrasenas ni datos privados)
  buscarUsuarios(texto: string) {
    return this.http.get<{ usuarios: UsuarioCompartible[] }>(
      `${this.url}/compartidos/usuarios`,
      { headers: this.headers, params: { q: texto } }
    );
  }

  // Comparticion: conceder/actualizar por nombre de usuario
  compartir(tipo: TipoRecurso, recursoId: string, username: string, nivel: NivelComparticion) {
    return this.http.post<{ mensaje: string }>(`${this.url}/compartidos`,
      {tipo, recursoId, username, nivel}, {headers: this.headers});
  }
  compartidosOtorgados() {
    return this.http.get<{total: number; permisos: PermisoCompartido[]}>(
      `${this.url}/compartidos/otorgados`, {headers: this.headers});
  }
  compartidosRecibidos() {
    return this.http.get<{total: number; permisos: PermisoCompartido[]}>(
      `${this.url}/compartidos/recibidos`, {headers: this.headers});
  }
  cambiarPermiso(id: string, nivel: NivelComparticion) {
    return this.http.patch(`${this.url}/compartidos/permisos/${id}`, {nivel}, {headers: this.headers});
  }
  revocarPermiso(id: string) {
    return this.http.delete(`${this.url}/compartidos/permisos/${id}`, {headers: this.headers});
  }
  contenidoCompartido(carpetaId: string) {
    return this.http.get<ContenidoCompartido>(
      `${this.url}/compartidos/carpetas/${carpetaId}/contenido`, {headers: this.headers});
  }
  descargarCompartido(id: string) {
    return this.http.get(`${this.url}/compartidos/archivos/${id}/descargar`,
      {headers: this.headers, responseType:'blob'});
  }
  renombrarCompartido(tipo: TipoRecurso, id: string, nombre: string) {
    return this.http.patch(`${this.url}/compartidos/${tipo}/${id}/renombrar`,
      {nombre}, {headers: this.headers});
  }
  listarComentarios(tipo: TipoRecurso, id: string) {
    return this.http.get<{comentarios: {texto:string; fechaCreacion: string; autor?: string}[]}>(
      `${this.url}/compartidos/comentarios/${tipo}/${id}`, {headers: this.headers});
  }
  comentar(tipo: TipoRecurso, recursoId: string, texto: string) {
    return this.http.post(`${this.url}/compartidos/comentarios`,
      {tipo,recursoId,texto}, {headers: this.headers});
  }

  // Papelera de carpetas: operaciones sobre su jerarquia
  listarCarpetasPapelera() {
    return this.http.get<RespuestaCarpetas>(
      `${this.url}/carpetas/papelera`,
      { headers: this.headers }
    );
  }

  enviarCarpetaPapelera(id: string) {
    return this.http.delete<{ mensaje: string }>(
      `${this.url}/carpetas/${id}`,
      { headers: this.headers }
    );
  }

  restaurarCarpeta(id: string) {
    return this.http.patch<{ mensaje: string }>(
      `${this.url}/carpetas/${id}/restaurar`,
      {},
      { headers: this.headers }
    );
  }

  eliminarCarpetaDefinitivamente(id: string) {
    return this.http.delete<{ mensaje: string }>(
      `${this.url}/carpetas/${id}/permanente`,
      { headers: this.headers }
    );
  }

  // Papelera: eliminacion logica
  enviarPapelera(id: string) {
    return this.http.delete<{ mensaje: string }>(
      `${this.url}/archivos/${id}`,
      { headers: this.headers }
    );
  }

  // Papelera: consultar
  listarPapelera() {
    return this.http.get<RespuestaArchivos>(
      `${this.url}/archivos/papelera`,
      { headers: this.headers }
    );
  }

  // Papelera: restaurar
  restaurarArchivo(id: string) {
    return this.http.patch<{ mensaje: string }>(
      `${this.url}/archivos/${id}/restaurar`,
      {},
      { headers: this.headers }
    );
  }

  // Papelera: eliminar definitivamente
  eliminarDefinitivamente(id: string) {
    return this.http.delete<{ mensaje: string }>(
      `${this.url}/archivos/${id}/permanente`,
      { headers: this.headers }
    );
  }
}

// Proteccion basica de rutas Angular
export const sesionGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);

  return api.token
    ? true
    : router.createUrlTree(['/login']);
};
