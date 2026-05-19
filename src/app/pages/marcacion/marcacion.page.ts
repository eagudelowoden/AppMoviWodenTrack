import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  logOutOutline,
  logInOutline,
  calendarOutline,
  cloudDownloadOutline,
  closeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-marcacion',
  templateUrl: './marcacion.page.html',
  styleUrls: ['./marcacion.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class MarcacionPage implements OnInit, OnDestroy {

  userData: any = null;

  // Reloj
  timeOnly: string = '';
  ampm: string = '';
  fecha: string = '';
  private timeOffset: number = 0;
  private clockInterval: any;

  // Estado de asistencia
  isInside: boolean = false;
  dayCompleted: boolean = false;
  isOnline: boolean = navigator.onLine;
  horaEntrada: string | null = null;
  horaSalida: string | null = null;

  // Malla del día
  mallaHoy: any = null;

  // APK update
  apkInfo: any = null;
  showUpdateBanner: boolean = false;

  // Guard contra doble marcación (ms desde el último intento)
  private lastMarkTimestamp: number = 0;
  private readonly MARK_COOLDOWN_MS = 4000;

  constructor(
    private router: Router,
    private api: ApiService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {
    addIcons({
      'log-out-outline': logOutOutline,
      'log-in-outline': logInOutline,
      'calendar-outline': calendarOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
    });

    const nav = this.router.getCurrentNavigation();
    if (nav?.extras.state) {
      this.userData = nav.extras.state['user'];
      this.isInside      = this.userData?.is_inside      || false;
      this.dayCompleted  = this.userData?.day_completed  || false;
      this.horaEntrada   = this.userData?.hora_entrada   || null;
      this.horaSalida    = this.userData?.hora_salida    || null;
    }
  }

  async ngOnInit() {
    if (!this.userData) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    window.addEventListener('online',  () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);

    await this.sincronizarRelojOficial();
    this.clockInterval = setInterval(() => this.actualizarReloj(), 1000);

    // Carga malla y verifica APK en paralelo sin bloquear la UI
    await Promise.allSettled([
      this.cargarMalla(),
      this.verificarActualizacion(),
    ]);
  }

  ngOnDestroy() {
    clearInterval(this.clockInterval);
  }

  // ── Reloj oficial ────────────────────────────────────────────────────────────
  async sincronizarRelojOficial() {
    try {
      const data = await this.api.getOfficialTime();
      const rawTime = data.datetime || data.fecha_hora;
      if (!rawTime) throw new Error('Sin fecha del servidor');
      this.timeOffset = new Date(rawTime).getTime() - new Date().getTime();
    } catch {
      this.timeOffset = 0;
    }
    this.actualizarReloj();
  }

  actualizarReloj() {
    const now = new Date(new Date().getTime() + this.timeOffset);
    const full = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
    const parts = full.split(' ');
    this.timeOnly = parts[0];
    this.ampm     = parts[1] ?? '';
    this.fecha    = now.toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  // ── Malla ────────────────────────────────────────────────────────────────────
  async cargarMalla() {
    try {
      const data = await this.api.getMallaHoy(this.userData.employee_id);
      this.mallaHoy = data;
    } catch {
      // fallo silencioso — no es crítico
    }
  }

  // ── APK Update ───────────────────────────────────────────────────────────────
  async verificarActualizacion() {
    try {
      const info = await this.api.getApkInfo();
      if (!info.exists) return;

      const dismissedAt = localStorage.getItem('apk_update_dismissed_at');
      const serverMs    = new Date(info.lastUpdate).getTime();

      if (!dismissedAt || Number(dismissedAt) < serverMs) {
        this.apkInfo          = info;
        this.showUpdateBanner = true;
      }
    } catch {
      // fallo silencioso
    }
  }

  downloadUpdate() {
    if (this.apkInfo?.downloadUrl) {
      window.open(this.apkInfo.downloadUrl, '_blank');
    }
  }

  dismissUpdate() {
    localStorage.setItem('apk_update_dismissed_at', Date.now().toString());
    this.showUpdateBanner = false;
  }

  // ── Marcación ────────────────────────────────────────────────────────────────
  async realizarMarcacion(action: 'in' | 'out') {
    // Guard de doble marcación — bloquea si el usuario pulsó hace menos de MARK_COOLDOWN_MS
    const now = Date.now();
    if (now - this.lastMarkTimestamp < this.MARK_COOLDOWN_MS) {
      this.mostrarToast('Espera un momento antes de marcar de nuevo', 'warning');
      return;
    }
    this.lastMarkTimestamp = now;

    const loading = await this.loadingCtrl.create({
      message: 'Validando marcación...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const response = await this.api.marcarAsistencia(this.userData.employee_id, action);
      await loading.dismiss();

      if (response.status === 'success') {
        this.isInside     = response.is_inside;
        this.dayCompleted = response.day_completed;
        this.horaEntrada  = response.check_in_at  ?? this.horaEntrada;
        this.horaSalida   = response.check_out_at ?? this.horaSalida;

        const msg = action === 'in' ? '✓ Entrada registrada' : '✓ Salida registrada';
        this.mostrarToast(msg, 'success');
      } else {
        // El backend rechazó la acción (doble entrada / doble salida)
        // Sincronizamos el estado real para corregir la UI
        if (response.is_inside !== undefined) {
          this.isInside = response.is_inside;
        }
        this.mostrarToast(response.message || 'Error en la marcación', 'danger');
      }
    } catch {
      await loading.dismiss();
      this.mostrarToast('No se pudo conectar con el servidor', 'danger');
    }
  }

  async mostrarToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  logout() {
    this.userData = null;
    this.router.navigate(['/home'], { replaceUrl: true });
  }
}
