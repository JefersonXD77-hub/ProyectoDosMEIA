
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';

export interface Carpeta {
  _id: string;
  nombre: string;
  padreId: string | null;
  ancestros: string[];
}

export interface Archivo {
  _id: string;
  filename: string;
  length: number;
  uploadDate: string;
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

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private url = 'http://127.0.0.1:3000/api';

  get token(): string {
    return sessionStorage.getItem('jwt') ?? '';
  }

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

  listarCarpetas(padreId: string | null) {
    return this.http.get<{
      total: number;
      carpetas: Carpeta[];
    }>(`${this.url}/carpetas`, {
      headers: {
        Authorization: `Bearer ${this.token}`
      },
      params: padreId ? { padreId } : {}
    });
  }

  crearCarpeta(nombre: string, padreId: string | null) {
    return this.http.post(`${this.url}/carpetas`,
      { nombre, padreId },
      {
        headers: {
          Authorization: `Bearer ${this.token}`
        }
      }
    );
  }


  listarArchivos(carpetaId: string | null) {
    return this.http.get<{
      total: number;
      archivos: Archivo[];
    }>(`${this.url}/archivos`, {
      headers: {
        Authorization: `Bearer ${this.token}`
      },
      params: carpetaId ? { carpetaId } : {}
    });
  }

  subirArchivo(archivo: File, carpetaId: string | null) {
    const datos = new FormData();
    datos.append('archivo', archivo);

    if (carpetaId) {
      datos.append('carpetaId', carpetaId);
    }

    return this.http.post(`${this.url}/archivos`, datos, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });
  }

  descargarArchivo(id: string) {
    return this.http.get(
      `${this.url}/archivos/${id}/descargar`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`
        },
        responseType: 'blob'
      }
    );
  }

}

export const sesionGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);

  return api.token
    ? true
    : router.createUrlTree(['/login']);
};
