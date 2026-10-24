
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ApiService } from '../services/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
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
