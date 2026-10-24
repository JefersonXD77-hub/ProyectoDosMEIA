import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, UsuarioAdmin } from '../services/api';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css'
})
export class Usuarios implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  usuarios: UsuarioAdmin[] = [];
  miId = '';
  nombre = '';
  username = '';
  password = '';
  rol: 'USUARIO' | 'ADMINISTRADOR' = 'USUARIO';
  cargando = false;
  creando = false;
  procesando = false;
  pendiente: UsuarioAdmin | null = null;
  error = '';
  aviso = '';

  ngOnInit(): void {
    this.api.perfilActual().subscribe({
      next: r => { this.miId = r.usuario.id; this.cdr.markForCheck(); },
      error: () => this.salir()
    });
    this.cargar();
  }
  cargar(): void {
    this.cargando = true;
    this.api.listarUsuariosAdmin().subscribe({
      next: r => { this.usuarios = r.usuarios; this.cargando = false; this.cdr.markForCheck(); },
      error: e => { this.cargando = false; this.error = this.mensaje(e); this.cdr.markForCheck(); }
    });
  }
  crear(): void {
    const nombre = this.nombre.trim();
    const username = this.username.trim().toLowerCase();
    if (this.creando) return;
    this.error = ''; this.aviso = '';
    if (!nombre || !/^[a-z0-9_]{3,30}$/.test(username) || this.password.length < 5) {
      this.error = 'Revisa nombre, usuario (3 a 30 caracteres) y contraseña (mínimo 5).'; return;
    }
    this.creando = true;
    this.api.crearUsuarioAdmin({ nombre, username, password: this.password, rol: this.rol }).subscribe({
      next: () => {
        this.creando = false;
        this.nombre = ''; this.username = ''; this.password = ''; this.rol = 'USUARIO';
        this.aviso = 'Usuario creado correctamente'; this.cargar();
      },
      error: e => { this.creando = false; this.error = this.mensaje(e); this.cdr.markForCheck(); }
    });
  }
  solicitarEstado(u: UsuarioAdmin): void {
    if (u._id === this.miId || this.procesando) return;
    this.error = ''; this.aviso = ''; this.pendiente = u;
  }
  cancelar(): void { this.pendiente = null; }
  confirmar(): void {
    const u = this.pendiente;
    if (!u || this.procesando || u._id === this.miId) return;
    this.procesando = true;
    this.api.cambiarEstadoUsuarioAdmin(u._id, !u.activo).subscribe({
      next: () => {
        this.procesando = false; this.pendiente = null;
        this.aviso = u.activo ? 'Usuario desactivado' : 'Usuario activado';
        this.cargar();
      },
      error: e => {
        this.procesando = false; this.pendiente = null;
        this.error = this.mensaje(e); this.cdr.markForCheck();
      }
    });
  }
  volver(): void { void this.router.navigateByUrl('/carpetas'); }
  salir(): void { this.api.cerrarSesion(); void this.router.navigateByUrl('/login'); }
  private mensaje(e: any): string { return e?.error?.mensaje || 'No fue posible completar la operación'; }
}
