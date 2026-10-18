import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ApiService } from './api.service';

/**
 * Al abrir el preoperacional Diario o Mensual: loading «Iniciando…» mientras el servidor valida que no haya una entrada
 * abierta y, si corresponde, la marca (una sola vez; es idempotente). Es idempotente, así que se ejecuta siempre y el
 * loading se ve cada vez. Nunca impide abrir el formulario: un fallo solo se avisa.
 */
export const preopInicioGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  const loadingCtrl = inject(LoadingController);
  const toastCtrl = inject(ToastController);

  const espera = await loadingCtrl.create({ message: 'Iniciando…', spinner: 'crescent', backdropDismiss: false });
  await espera.present();
  const inicio = Date.now();
  try {
    const r = await api.iniciarPreop();
    // Solo si algo falló; el bloqueo del mensual lo explica el propio formulario.
    if (r.mensaje && !r.bloqueo) {
      const t = await toastCtrl.create({ message: r.mensaje, duration: 4000, position: 'bottom', color: 'warning' });
      await t.present();
    }
  } catch { /* el formulario se abre igual */ } finally {
    // Que el loading no parpadee: se mantiene un mínimo para que se note que se está validando.
    await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - inicio))));
    await espera.dismiss();
  }
  return true;
};
