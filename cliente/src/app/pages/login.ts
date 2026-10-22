
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from '../services/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="contenedor">
      <section class="tarjeta">
        <h1>Gestión Documental</h1>
        <p>Inicia sesión para acceder a tus archivos</p>

        <form (ngSubmit)="ingresar()">
          <label for="username">Usuario</label>
          <input
            id="username"
            name="username"
            [(ngModel)]="username"
            required
          />

          <label for="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            [(ngModel)]="password"
            required
          />

          @if (error) {
            <p class="error">{{ error }}</p>
          }

          <button type="submit" [disabled]="cargando">
            {{ cargando ? 'Ingresando...' : 'Iniciar sesión' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [`
    .contenedor {
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f3f6fa;
    }
    .tarjeta {
      width: min(380px, 90%);
      background: white;
      padding: 32px;
      border-radius: 12px;
      box-shadow: 0 5px 22px #0001;
    }
    h1 { margin-bottom: 8px; }
    form { display: grid; gap: 12px; margin-top: 24px; }
    input {
      padding: 11px;
      border: 1px solid #bbb;
      border-radius: 6px;
    }
    button {
      padding: 12px;
      background: #1768aa;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .error { color: #b91c1c; }
  `]
})
export class Login {
  private api = inject(ApiService);
  private router = inject(Router);

  username = '';
  password = '';
  error = '';
  cargando = false;

  ingresar() {
    this.error = '';
    this.cargando = true;

    this.api.login(this.username, this.password).subscribe({
      next: (respuesta) => {
        this.api.guardarToken(respuesta.token);
        void this.router.navigateByUrl('/carpetas');
      },
      error: (error) => {
        this.error = error.status === 401
          ? 'Usuario o contraseña incorrectos'
          : 'No fue posible iniciar sesión';

        this.cargando = false;
      }
    });
  }
}
