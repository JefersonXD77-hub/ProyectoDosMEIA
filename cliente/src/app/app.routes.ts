
import { Routes } from '@angular/router';

import { Login } from './pages/login';
import { Carpetas } from './pages/carpetas';
import { sesionGuard } from './services/api';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'carpetas',
    component: Carpetas,
    canActivate: [sesionGuard]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
