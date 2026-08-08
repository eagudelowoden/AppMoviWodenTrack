import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService, LastUser } from '../services/auth.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { addIcons } from 'ionicons';
// Añadimos eyeOutline y eyeOffOutline a las importaciones
import {
  personOutline, lockClosedOutline, eyeOutline, eyeOffOutline,
  cloudDownloadOutline, megaphoneOutline, closeOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class HomePage implements OnInit {

  userForm = { usuario: '', password: '' };
  showPassword  = false;
  appVersion    = '...';

  // Aviso de actualización — mismo criterio que en Marcación (barra abajo,
  // no el chip suelto que había antes acá).
  apkInfo: any = null;
  showUpdateBanner = false;

  // Usuario recordado del último login en este dispositivo — si existe,
  // saludamos por su nombre en vez del logo por defecto.
  lastUser: LastUser | null = null;

  /** Tercer token del nombre completo: "Agudelo Pita Elder Daniel" → "Elder". */
  get primerNombre(): string {
    const p = (this.lastUser?.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const idx = p.length >= 3 ? 2 : p.length - 1;
    const nombre = p[idx] ?? '';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
  }

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController
  ) {
    // 2. Agregamos los iconos del "ojo" al registro de iconos
    addIcons({
      'person-outline':        personOutline,
      'lock-closed-outline':   lockClosedOutline,
      'eye-outline':           eyeOutline,
      'eye-off-outline':       eyeOffOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'megaphone-outline':     megaphoneOutline,
      'close-outline':         closeOutline,
    });
  }

  async ngOnInit() {
    this.appVersion = await this.api.getVersion();
  }

  /**
   * Ionic cachea las páginas: si el usuario navega fuera de /home (por
   * ejemplo, entra y hace logout desde Marcación) y vuelve, esta instancia
   * de HomePage se REUTILIZA en vez de recrearse — Angular nunca vuelve a
   * llamar ngOnInit(). Por eso el usuario recordado y el aviso de versión se
   * recargan acá (lifecycle propio de Ionic, se dispara CADA VEZ que la
   * página vuelve a quedar activa, con o sin remontaje).
   */
  async ionViewWillEnter() {
    this.lastUser = await this.auth.getLastUser();
    await this.checkNewVersion();
  }

  private async checkNewVersion() {
    try {
      const info = await this.api.getApkInfo();
      if (!info?.version) return;

      // Comparamos contra la versión REALMENTE instalada (versionName nativo,
      // via @capacitor/app), no solo contra el flag de "descartado" — así el
      // banner desaparece solo apenas el usuario instala la nueva APK, sin
      // necesidad de que toque la X manualmente.
      if (Capacitor.isNativePlatform()) {
        const appInfo = await App.getInfo();
        if (compareVersions(appInfo.version, info.version) >= 0) {
          this.showUpdateBanner = false;
          localStorage.removeItem('apk_dismissed_version');
          return;
        }
      }

      const dismissed = localStorage.getItem('apk_dismissed_version');
      if (dismissed !== String(info.version)) {
        this.apkInfo = info;
        this.showUpdateBanner = true;
      }
    } catch {}
  }

  // Abre la página pública de descarga (frontend) en vez del endpoint crudo
  // del archivo — así nunca se ve la IP/puerto del backend en la barra de
  // direcciones, y no hace falta agregar el permiso de instalar paquetes
  // dentro de la APK: la descarga y la instalación las maneja el navegador,
  // como con cualquier APK descargado normalmente.
  async downloadUpdate() {
    const pageUrl = this.apkInfo?.downloadPageUrl;
    if (!pageUrl) {
      this.mostrarAlerta(
        'Archivo no disponible',
        'El equipo todavía no subió el instalador de esta versión al servidor. Intenta más tarde.',
      );
      return;
    }

    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: pageUrl });
    } else {
      window.open(pageUrl, '_blank');
    }
  }

  dismissUpdate() {
    localStorage.setItem('apk_dismissed_version', this.apkInfo?.version ?? '');
    this.showUpdateBanner = false;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async ingresar() {
    if (!this.userForm.usuario || !this.userForm.password) {
      this.mostrarAlerta('Campos Vacíos', 'Por favor ingresa tu usuario y contraseña.');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Autenticando...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const data = await this.api.login(this.userForm.usuario, this.userForm.password);
      if (data?.token) {
        await this.auth.saveSession(data);
      }
      await loading.dismiss();

      this.router.navigate(['/marcacion'], {
        state: { user: data }
      });

    } catch (error: any) {
      await loading.dismiss();
      let mensaje = 'No se pudo conectar con el servidor.';
      if (error.status === 401) mensaje = 'Contraseña incorrecta.';
      if (error.status === 404) mensaje = 'El usuario no existe.';

      this.mostrarAlerta('Error de Acceso', mensaje);
    }
  }

  async mostrarAlerta(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['Aceptar']
    });
    await alert.present();
  }
}

/** Compara versiones tipo "3.1.4": negativo si a<b, 0 si iguales, positivo si a>b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}