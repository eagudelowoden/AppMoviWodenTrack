import { Component, OnInit, OnDestroy, NgZone, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  logOutOutline, logInOutline, calendarOutline,
  cloudDownloadOutline, closeOutline, checkmarkCircleOutline,
  arrowForwardOutline, eyeOutline, bugOutline,
} from 'ionicons/icons';

const SESSION_KEY   = 'wt_session';
const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos sin actividad

@Component({
  selector: 'app-marcacion',
  templateUrl: './marcacion.page.html',
  styleUrls: ['./marcacion.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class MarcacionPage implements OnInit, OnDestroy {

  userData: any = null;

  /** Muestra el tercer token del nombre: "Agudelo pita Elder Daniel" → "Elder" */
  get primerNombre(): string {
    const p = (this.userData?.name ?? '').split(' ');
    return p[2] ?? p[0] ?? '';
  }

  // ── Reloj ──────────────────────────────────────────────────────────────────
  timeOnly = '';
  ampm     = '';
  fecha    = '';
  private timeOffset    = 0;
  private clockInterval: any;
  private inactivityTimer: any;

  // ── Estado asistencia ──────────────────────────────────────────────────────
  isInside      = false;
  dayCompleted  = false;
  isOnline      = navigator.onLine;
  horaEntrada: string | null = null;
  horaSalida:  string | null = null;

  // ── Extras ─────────────────────────────────────────────────────────────────
  mallaHoy: any  = null;
  apkInfo:  any  = null;
  showUpdateBanner = false;
  readonly currentYear = new Date().getFullYear();

  // ── Guards doble marcación ─────────────────────────────────────────────────
  isMarking = false;                         // bloquea clicks simultáneos
  private lastMarkTimestamp = 0;
  private readonly MARK_COOLDOWN_MS = 4000;  // 4 s entre marcaciones

  constructor(
    private router:       Router,
    private api:          ApiService,
    private alertCtrl:    AlertController,
    private loadingCtrl:  LoadingController,
    private toastCtrl:    ToastController,
    private ngZone:       NgZone,
  ) {
    addIcons({
      'log-out-outline':          logOutOutline,
      'log-in-outline':           logInOutline,
      'calendar-outline':         calendarOutline,
      'cloud-download-outline':   cloudDownloadOutline,
      'close-outline':            closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'arrow-forward-outline':    arrowForwardOutline,
      'eye-outline':              eyeOutline,
      'bug-outline':              bugOutline,
    });

    // 1️⃣  Estado desde navegación (login normal)
    const nav = this.router.getCurrentNavigation();
    if (nav?.extras.state) {
      this.userData     = nav.extras.state['user'];
      this.isInside     = this.userData?.is_inside    ?? false;
      this.dayCompleted = this.userData?.day_completed ?? false;
      this.horaEntrada  = this.userData?.hora_entrada  ?? null;
      this.horaSalida   = this.userData?.hora_salida   ?? null;
      this.saveSession();
    } else {
      // 2️⃣  Refresh de página → restaurar desde sessionStorage
      this.restoreSession();
    }
  }

  // ── Persistencia de sesión ─────────────────────────────────────────────────
  private saveSession() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      userData:     this.userData,
      isInside:     this.isInside,
      dayCompleted: this.dayCompleted,
      horaEntrada:  this.horaEntrada,
      horaSalida:   this.horaSalida,
    }));
  }

  private restoreSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const s           = JSON.parse(raw);
      this.userData     = s.userData;
      this.isInside     = s.isInside;
      this.dayCompleted = s.dayCompleted;
      this.horaEntrada  = s.horaEntrada;
      this.horaSalida   = s.horaSalida;
    } catch {}
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  async ngOnInit() {
    if (!this.userData) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    window.addEventListener('online',  () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);

    // Timer de inactividad — cierra sesión a los 10 min sin tocar la pantalla
    this.resetInactivityTimer();
    document.addEventListener('touchstart', this.onActivity);
    document.addEventListener('click',      this.onActivity);

    await this.sincronizarRelojOficial();
    this.clockInterval = setInterval(() => this.actualizarReloj(), 1000);

    // Sincronizar estado real + malla + APK en paralelo
    await Promise.allSettled([
      this.sincronizarEstado(),
      this.cargarMalla(),
      this.verificarActualizacion(),
    ]);
  }

  ngOnDestroy() {
    clearInterval(this.clockInterval);
    clearTimeout(this.inactivityTimer);
    document.removeEventListener('touchstart', this.onActivity);
    document.removeEventListener('click',      this.onActivity);
  }

  // ── Inactividad ────────────────────────────────────────────────────────────
  private onActivity = () => this.ngZone.run(() => this.resetInactivityTimer());

  private resetInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(async () => {
      await this.mostrarToast('Sesión cerrada por inactividad', 'warning');
      setTimeout(() => this.logout(), 1500);
    }, INACTIVITY_MS);
  }

  // ── Sincronizar estado desde backend ───────────────────────────────────────
  async sincronizarEstado() {
    try {
      const res = await this.api.getAttendanceStatus(this.userData.employee_id);
      if (res) {
        this.isInside     = res.is_inside     ?? this.isInside;
        this.dayCompleted = res.day_completed  ?? this.dayCompleted;
        this.horaEntrada  = res.hora_entrada   ?? res.check_in_at  ?? this.horaEntrada;
        this.horaSalida   = res.hora_salida    ?? res.check_out_at ?? this.horaSalida;
        this.saveSession();
      }
    } catch {}
  }

  // ── Pull-to-refresh ────────────────────────────────────────────────────────
  async handleRefresh(event: any) {
    await Promise.allSettled([this.sincronizarEstado(), this.cargarMalla()]);
    event.target.complete();
  }

  // ── Reloj ──────────────────────────────────────────────────────────────────
  async sincronizarRelojOficial() {
    try {
      const data = await this.api.getOfficialTime();
      const raw  = data.datetime || data.fecha_hora;
      if (raw) this.timeOffset = new Date(raw).getTime() - Date.now();
    } catch { this.timeOffset = 0; }
    this.actualizarReloj();
  }

  actualizarReloj() {
    const now  = new Date(Date.now() + this.timeOffset);
    const full = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
    const p       = full.split(' ');
    this.timeOnly = p[0];
    this.ampm     = p[1] ?? '';
    this.fecha    = now.toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  // ── Malla ──────────────────────────────────────────────────────────────────
  async cargarMalla() {
    try { this.mallaHoy = await this.api.getMallaHoy(this.userData.employee_id); } catch {}
  }

  // ── APK Update ─────────────────────────────────────────────────────────────
  async verificarActualizacion() {
    try {
      const info = await this.api.getApkInfo();
      const dismissedVersion = localStorage.getItem('apk_dismissed_version');

      console.log('[APK] info recibida:', info);
      console.log('[APK] versión guardada en localStorage:', dismissedVersion);
      console.log('[APK] versión del servidor:', info?.version);

      if (!info?.version) { console.warn('[APK] Sin versión válida, saliendo'); return; }

      if (dismissedVersion !== String(info.version)) {
        console.log('[APK] Versión nueva detectada → mostrando banner');
        this.apkInfo = info;
        this.showUpdateBanner = true;
      } else {
        console.log('[APK] Misma versión → banner oculto');
      }
    } catch (e) {
      console.warn('[APK] Error en la petición:', e);
    }
  }

  // Solo descarga si el archivo existe en el servidor
  downloadUpdate() {
    if (this.apkInfo?.exists && this.apkInfo?.downloadUrl) {
      window.open(this.apkInfo.downloadUrl, '_blank');
    } else {
      this.mostrarToast('El archivo APK aún no está disponible para descarga', 'warning');
    }
  }

  dismissUpdate() {
    localStorage.setItem('apk_dismissed_version', this.apkInfo?.version ?? '');
    this.showUpdateBanner = false;
  }

  // ── Marcación — triple guard ───────────────────────────────────────────────
  async realizarMarcacion(action: 'in' | 'out') {

    // Guard 1: petición en curso (doble click simultáneo)
    if (this.isMarking) return;

    // Guard 2: cooldown de 4 segundos
    const now = Date.now();
    if (now - this.lastMarkTimestamp < this.MARK_COOLDOWN_MS) {
      this.mostrarToast('Espera un momento antes de volver a marcar', 'warning'); return;
    }

    // Guard 3: estado ya coincide con la acción (validación lógica)
    if (action === 'in'  &&  this.isInside)   { this.mostrarToast('Ya tienes una entrada registrada', 'warning'); return; }
    if (action === 'out' && !this.isInside)   { this.mostrarToast('No hay entrada abierta para cerrar', 'warning'); return; }
    if (this.dayCompleted)                    { this.mostrarToast('Tu jornada de hoy ya está completada', 'warning'); return; }

    this.isMarking         = true;
    this.lastMarkTimestamp = now;

    const loading = await this.loadingCtrl.create({ message: 'Validando...', spinner: 'crescent' });
    await loading.present();

    try {
      const res = await this.api.marcarAsistencia(this.userData.employee_id, action);
      await loading.dismiss();

      if (res.status === 'success') {
        this.isInside     = res.is_inside;
        this.dayCompleted = res.day_completed;
        this.horaEntrada  = res.check_in_at  ?? this.horaEntrada;
        this.horaSalida   = res.check_out_at ?? this.horaSalida;
        this.saveSession();
        this.mostrarToast(action === 'in' ? '✓ Entrada registrada' : '✓ Salida registrada', 'success');
      } else {
        if (res.is_inside !== undefined) { this.isInside = res.is_inside; this.saveSession(); }
        this.mostrarToast(res.message || 'Error en la marcación', 'danger');
      }
    } catch {
      await loading.dismiss();
      this.mostrarToast('No se pudo conectar con el servidor', 'danger');
    } finally {
      this.isMarking = false;
    }
  }

  // ── Ver marcación ──────────────────────────────────────────────────────────
  async verMarcacion() {
    const estado = this.dayCompleted
      ? '✅ Jornada completada'
      : this.isInside
        ? '🟢 Entrada registrada'
        : '⚪ Sin entrada registrada hoy';

    const alert = await this.alertCtrl.create({
      header:    'Mi marcación de hoy',
      cssClass:  'alert-marcacion',
      message:   `${estado}\n\nEntrada:  ${this.horaEntrada ?? '—'}\nSalida:     ${this.horaSalida ?? '—'}`,
      buttons:   [{ text: 'Cerrar', role: 'cancel' }],
    });
    await alert.present();
  }

  // ── Reportar falla ─────────────────────────────────────────────────────────
  async reportarFalla() {
    const alert = await this.alertCtrl.create({
      header:    'Reportar falla',
      subHeader: 'Describe brevemente el problema que encontraste',
      cssClass:  'custom-alert-danger',
      inputs: [{
        name:        'descripcion',
        type:        'textarea',
        placeholder: 'Ej: El botón de salida no responde...',
        attributes:  { rows: 3 },
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text:     'Enviar reporte',
          cssClass: 'btn-danger',
          handler:  async (data) => {
            const desc = data.descripcion?.trim();
            if (!desc) { this.mostrarToast('Escribe una descripción antes de enviar', 'warning'); return false; }
            try {
              await this.api.reportarFalla({
                empleado_id: this.userData.employee_id,
                nombre:      this.userData.name,
                descripcion: desc,
              });
              this.mostrarToast('✓ Reporte enviado. Gracias.', 'success');
              return true;
            } catch {
              this.mostrarToast('No se pudo enviar el reporte', 'danger');
              return true;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  async mostrarToast(message: string, color: string) {
    const t = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await t.present();
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    clearTimeout(this.inactivityTimer);
    this.userData = null;
    this.router.navigate(['/home'], { replaceUrl: true });
  }
}
