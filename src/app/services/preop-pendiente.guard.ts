import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Cada vez que se abre Asistencia (al iniciar sesión o al darle «volver» desde un formulario sin enviarlo): loading
 * «Validando» mientras el servidor revisa qué preoperacional le falta al agente (primero el mensual, luego el diario).
 * Si le falta alguno, el servidor marca la entrada en esa misma revisión (ya ingresó) y el agente es llevado al formulario;
 * como esta guarda corre en cada entrada a Asistencia, no puede salir de ahí sin enviarlo. Quien no tiene el permiso de
 * preoperacional (403) o si falla la red, pasa sin más: la marcación del servidor sigue exigiendo el preoperacional.
 */
export const preopPendienteGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  const auth = inject(AuthService);
  const router = inject(Router);
  const loadingCtrl = inject(LoadingController);
  const toastCtrl = inject(ToastController);

  // Solo si ESTA sesión puede abrir los formularios: si no, redirigir la devuelve a Asistencia y se forma un bucle.
  if (!auth.hasPermiso('preoperacional.diario') && !auth.hasPermiso('preoperacional.mensual')) return true;

  const espera = await loadingCtrl.create({ message: 'Validando', spinner: 'crescent', backdropDismiss: false });
  await espera.present();
  const inicio = Date.now();
  let destino: string | null = null;
  const avisos: { message: string; color: string; duration: number }[] = [];
  try {
    const p = await api.getPreopPendientes();
    if (p?.siguiente) {
      if (!auth.hasPermiso(`preoperacional.${p.siguiente}`)) return true;
      destino = p.siguiente === 'mensual' ? '/preoperacional/mensual' : '/preoperacional/diario';
      const a = p.asistencia;
      if (a?.marcada) avisos.push({ message: `Entrada registrada${a.hora ? ` a las ${a.hora}` : ''}.`, color: 'success', duration: 3500 });
      else if (a?.mensaje) avisos.push({ message: a.mensaje, color: 'warning', duration: 5000 });
      avisos.push({
        message: p.siguiente === 'mensual'
          ? `Primero debes diligenciar el mantenimiento mensual de ${p.mes}${p.placa ? ` (placa ${p.placa})` : ''}. Si no lo realizas, no quedará tu marcaje de asistencia.`
          : 'Debes diligenciar el preoperacional diario antes de marcar. Si no lo realizas, no quedará tu marcaje de asistencia.',
        color: 'warning',
        duration: 8000,
      });
    }
  } catch { /* sin permiso de preoperacional o sin red: se deja pasar */ } finally {
    // Que el loading no parpadee: se mantiene un mínimo para que se note que se está validando.
    await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - inicio))));
    await espera.dismiss();
  }
  for (const a of avisos) {
    const t = await toastCtrl.create({ message: a.message, duration: a.duration, position: 'top', color: a.color });
    await t.present();
  }
  return destino ? router.parseUrl(destino) : true;
};
