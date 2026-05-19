import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  logOutOutline, logInOutline, calendarOutline,
  cloudDownloadOutline, closeOutline, checkmarkCircleOutline,
  arrowForwardOutline, eyeOutline, bugOutline,
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

  // Nombre a mostrar en el saludo:
  // "Agudelo pita Elder Daniel" → split(' ')[2] = "Elder"
  // Cambia a [3] si prefieres mostrar "Daniel"
  get primerNombre(): string {
    const partes = (this.userData?.name ?? '').split(' ');
    return partes[2] ?? partes[0] ?? '';
  }

  // Reloj
  timeOnly = '';
  ampm = '';
  fecha = '';
  private timeOffset = 0;
  private clockInterval: any;

  // Asistencia
  isInside      = false;
  dayCompleted  = false;
  isOnline      = navigator.onLine;
  horaEntrada: string | null = null;
  horaSalida:  string | null = null;

  // Extras
  mallaHoy: any = null;
  apkInfo: any = null;
  showUpdateBanner = false;
  readonly currentYear = new Date().getFullYear();

  // Guard doble marcación
  private lastMarkTimestamp = 0;
  private readonly MARK_COOLDOWN_MS = 4000;

  constructor(
    private router: Router,
    private api: ApiService,
    private alertCtrl: AlertController,
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
      'arrow-forward-outline': arrowForwardOutline,
      'eye-outline': eyeOutline,
      'bug-outline': bugOutline,
    });

    const nav = this.router.getCurrentNavigation();
    if (nav?.extras.state) {
      this.userData     = nav.extras.state['user'];
      this.isInside     = this.userData?.is_inside     ?? false;
      this.dayCompleted = this.userData?.day_completed  ?? false;
      this.horaEntrada  = this.userData?.hora_entrada   ?? null;
      this.horaSalida   = this.userData?.hora_salida    ?? null;
    }
  }

  async ngOnInit() {
    if (!this.userData) { this.router.navigate(['/home'], { replaceUrl: true }); return; }

    window.addEventListener('online',  () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);

    await this.sincronizarRelojOficial();
    this.clockInterval = setInterval(() => this.actualizarReloj(), 1000);

    await Promise.allSettled([this.cargarMalla(), this.verificarActualizacion()]);
  }

  ngOnDestroy() { clearInterval(this.clockInterval); }

  // ── Reloj ─────────────────────────────────────────────────────────────────
  async sincronizarRelojOficial() {
    try {
      const data = await this.api.getOfficialTime();
      const raw = data.datetime || data.fecha_hora;
      if (raw) this.timeOffset = new Date(raw).getTime() - Date.now();
    } catch { this.timeOffset = 0; }
    this.actualizarReloj();
  }

  actualizarReloj() {
    const now = new Date(Date.now() + this.timeOffset);
    const full = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const p = full.split(' ');
    this.timeOnly = p[0];
    this.ampm     = p[1] ?? '';
    this.fecha    = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ── Malla ─────────────────────────────────────────────────────────────────
  async cargarMalla() {
    try { this.mallaHoy = await this.api.getMallaHoy(this.userData.employee_id); } catch {}
  }

  // ── APK Update ────────────────────────────────────────────────────────────
  async verificarActualizacion() {
    try {
      const info = await this.api.getApkInfo();
      if (!info.exists) return;
      const dismissed = localStorage.getItem('apk_update_dismissed_at');
      const serverMs  = new Date(info.lastUpdate).getTime();
      if (!dismissed || Number(dismissed) < serverMs) { this.apkInfo = info; this.showUpdateBanner = true; }
    } catch {}
  }

  downloadUpdate() { if (this.apkInfo?.downloadUrl) window.open(this.apkInfo.downloadUrl, '_blank'); }
  dismissUpdate()  { localStorage.setItem('apk_update_dismissed_at', Date.now().toString()); this.showUpdateBanner = false; }

  // ── Marcación ─────────────────────────────────────────────────────────────
  async realizarMarcacion(action: 'in' | 'out') {
    const now = Date.now();
    if (now - this.lastMarkTimestamp < this.MARK_COOLDOWN_MS) {
      this.mostrarToast('Espera un momento antes de marcar de nuevo', 'warning'); return;
    }
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
        this.mostrarToast(action === 'in' ? '✓ Entrada registrada' : '✓ Salida registrada', 'success');
      } else {
        if (res.is_inside !== undefined) this.isInside = res.is_inside;
        this.mostrarToast(res.message || 'Error en la marcación', 'danger');
      }
    } catch {
      await loading.dismiss();
      this.mostrarToast('No se pudo conectar con el servidor', 'danger');
    }
  }

  // ── Ver marcación actual ──────────────────────────────────────────────────
  async verMarcacion() {
    const estado = this.dayCompleted
      ? '✅ Jornada completada'
      : this.isInside
        ? '🟢 Dentro — entrada registrada'
        : '⚪ Sin entrada registrada hoy';

    const alert = await this.alertCtrl.create({
      header: 'Mi marcación de hoy',
      cssClass: 'custom-alert-info',
      message: `
        <div style="text-align:left;font-size:13px;line-height:1.9">
          <b>Estado:</b> ${estado}<br>
          <b>Entrada:</b> ${this.horaEntrada ?? '—'}<br>
          <b>Salida:</b>  ${this.horaSalida  ?? '—'}
        </div>
      `,
      buttons: ['Cerrar'],
    });
    await alert.present();
  }

  // ── Reportar falla ────────────────────────────────────────────────────────
  async reportarFalla() {
    const alert = await this.alertCtrl.create({
      header: 'Reportar falla',
      subHeader: 'Describe brevemente el problema que encontraste',
      cssClass: 'custom-alert-danger',
      inputs: [{
        name: 'descripcion',
        type: 'textarea',
        placeholder: 'Ej: El botón de salida no responde...',
        attributes: { rows: 3 },
      }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar reporte',
          cssClass: 'btn-danger',
          handler: async (data) => {
            const desc = data.descripcion?.trim();
            if (!desc) { this.mostrarToast('Escribe una descripción antes de enviar', 'warning'); return false; }
            try {
              await this.api.reportarFalla({
                empleado_id: this.userData.employee_id,
                nombre: this.userData.name,
                descripcion: desc,
              });
              this.mostrarToast('✓ Reporte enviado. Gracias por reportar.', 'success');
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

  async mostrarToast(message: string, color: string) {
    const t = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await t.present();
  }

  logout() { this.userData = null; this.router.navigate(['/home'], { replaceUrl: true }); }
}
