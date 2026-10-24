import { Routes } from '@angular/router';

import { Login } from './pages/login';
import { Carpetas } from './pages/carpetas';
import { Papelera } from './pages/papelera';
import { Compartidos } from './pages/compartidos';
import { Actividades } from './pages/actividades';
import { sesionGuard } from './services/api';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'carpetas', component: Carpetas, canActivate: [sesionGuard] },
  { path: 'papelera', component: Papelera, canActivate: [sesionGuard] },
  { path: 'compartidos', component: Compartidos, canActivate: [sesionGuard]},
  {path: 'actividades', component: Actividades, canActivate: [sesionGuard]},
  { path: '**', redirectTo: 'login' }
];
