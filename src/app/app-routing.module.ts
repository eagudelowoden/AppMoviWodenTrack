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
    // Mismo slug que canVerNovedades en marcacion.page.ts (marcacion.novedad,
    // NO admin.novedades) — antes estaban desincronizados: el botón se
    // mostraba con un permiso, pero el guard de la ruta exigía otro, así que
    // cualquiera sin admin.novedades caía directo de vuelta a /marcacion en
    // cuanto tocaba "Novedades" (se sentía como que la pantalla "se cerraba").
    canActivate: [authGuard, permisoGuard('marcacion.novedad')],
    loadChildren: () => import('./pages/novedades/novedades.module').then( m => m.NovedadesPageModule)
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadChildren: () => import('./pages/perfil/perfil.module').then( m => m.PerfilPageModule)
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
