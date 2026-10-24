import { Routes } from '@angular/router';

import { Login } from './pages/login';
import { Carpetas } from './pages/carpetas';
import { Papelera } from './pages/papelera';
import { Compartidos } from './pages/compartidos';
import { Actividades } from './pages/actividades';
import { sesionGuard, administradorGuard } from './services/api';

import { Reportes } from './pages/reportes';
import { Usuarios } from './pages/usuarios';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'carpetas', component: Carpetas, canActivate: [sesionGuard] },
  { path: 'papelera', component: Papelera, canActivate: [sesionGuard] },
  { path: 'compartidos', component: Compartidos, canActivate: [sesionGuard]},
  {path: 'actividades', component: Actividades, canActivate: [sesionGuard]},
  { path: 'reportes', component: Reportes, canActivate: [sesionGuard] },
  { path: 'usuarios', component: Usuarios, canActivate: [sesionGuard, administradorGuard] },
  { path: '**', redirectTo: 'login' }
];
