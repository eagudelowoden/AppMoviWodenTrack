import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protege una ruta: sin sesión válida, redirige a /home. Antes el chequeo
 * vivía repetido dentro de cada página (`ngOnInit` de marcacion/comprobantes
 * leyendo `sessionStorage` a mano) — ahora es un guard real de Angular,
 * centralizado, y corre ANTES de que la página cargue.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  router.navigate(['/home'], { replaceUrl: true });
  return false;
};

/**
 * Protege una ruta detrás de un permiso puntual (o superadmin). Uso:
 *   { path: 'comprobantes', canActivate: [authGuard, permisoGuard('admin.marcacion_seriales')] }
 */
export function permisoGuard(slug: string): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.hasPermiso(slug)) return true;

    router.navigate(['/marcacion'], { replaceUrl: true });
    return false;
  };
}
