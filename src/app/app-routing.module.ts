import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { authGuard, permisoGuard } from './services/auth.guard';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then( m => m.HomePageModule)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'marcacion',
    canActivate: [authGuard],
    loadChildren: () => import('./pages/marcacion/marcacion.module').then( m => m.MarcacionPageModule)
  },
  {
    path: 'comprobantes',
    canActivate: [authGuard, permisoGuard('admin.marcacion_seriales')],
    loadChildren: () => import('./pages/comprobantes/comprobantes.module').then( m => m.ComprobantesPageModule)
  },
  {
    path: 'novedades',
    canActivate: [authGuard, permisoGuard('admin.novedades')],
    loadChildren: () => import('./pages/novedades/novedades.module').then( m => m.NovedadesPageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
