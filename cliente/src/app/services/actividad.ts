import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ApiService } from './api';

export interface Actividad {
  _id: string;
  usuarioId: string;
  usuario: { nombre: string; username: string } | null;
  accion: string;
  tipoRecurso: string;
  recursoId: string | null;
  recursoNombre: string | null;
  detalles: Record<string, string | number | boolean | null>;
  fecha: string;
}

export interface RespuestaActividades {
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
  actividades: Actividad[];
}

export interface FiltrosActividades {
  pagina?: number;
  limite?: number;
  desde?: string;
  hasta?: string;
  accion?: string;
  tipoRecurso?: string;
  usuarioId?: string;
}

@Injectable({ providedIn: 'root' })
export class ActividadService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiService);
  private readonly url = 'http://127.0.0.1:3000/api/actividades';

  consultar(filtros: FiltrosActividades = {}) {
    let params = new HttpParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        params = params.set(clave, String(valor));
      }
    });
    return this.http.get<RespuestaActividades>(this.url, {
      params,
      headers: { Authorization: `Bearer ${this.api.token}` }
    });
  }
}
