import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService, LastUser } from '../services/auth.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
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
  downloading = false;
  downloadProgress = 0;

  // Ruta FIJA (sin versión en el nombre): cada descarga nueva sobrescribe la
  // anterior en vez de acumular un .apk distinto por cada actualización.
  private readonly APK_FILE_NAME = 'wodentrack-update.apk';

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
    // Antes se pedía /version, que devuelve APP_VERSION — la versión del
    // backend web genérico, sin relación con la APK instalada. Acá mostramos
    // el versionName nativo real (el mismo que se compara contra
    // APP_VERSION_APK en checkNewVersion), así el número que ve el usuario
    // SIEMPRE coincide con lo que realmente tiene instalado.
    if (Capacitor.isNativePlatform()) {
      const info = await App.getInfo();
      this.appVersion = info.version;
    } else {
      this.appVersion = await this.api.getVersion();
    }
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

  // Descarga el APK dentro de la app (misma ruta fija siempre, así cada
  // actualización SOBREESCRIBE la anterior en vez de acumularse) y lanza el
  // instalador nativo de Android. Antes de arrancar explicamos por qué va a
  // aparecer la pantalla de "permitir instalar apps desconocidas" — para que
  // no se sienta como algo sospechoso.
  async downloadUpdate() {
    if (!this.apkInfo?.exists || !this.apkInfo?.downloadUrl) {
      this.mostrarAlerta(
        'Archivo no disponible',
        'El equipo todavía no subió el instalador de esta versión al servidor. Intenta más tarde.',
      );
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      window.open(this.apkInfo.downloadUrl, '_blank');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Actualizar WodenTrack',
      message:
        'Vamos a descargar e instalar la nueva versión dentro de la app. ' +
        'Android va a pedirte permiso para "instalar apps desconocidas" — ' +
        'es normal: como WodenTrack no viene de Play Store, el sistema pide ' +
        'esa confirmación una sola vez para instalaciones directas. No afecta ' +
        'tus datos ni tu sesión.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Continuar', handler: () => this.runDownload() },
      ],
    });
    await alert.present();
  }

  private async runDownload() {
    if (this.downloading) return;
    this.downloading = true;
    this.downloadProgress = 0;

    const progressListener = await Filesystem.addListener('progress', (status) => {
      if (status.contentLength > 0) {
        this.downloadProgress = Math.round((status.bytes / status.contentLength) * 100);
      }
    });

    try {
      const result = await Filesystem.downloadFile({
        url: this.apkInfo.downloadUrl,
        path: this.APK_FILE_NAME,
        directory: Directory.Cache,
        progress: true,
      });

      if (!result.path) throw new Error('Descarga sin ruta de archivo');

      await FileOpener.openFile({
        path: result.path,
        mimeType: 'application/vnd.android.package-archive',
      });
    } catch (error) {
      this.mostrarAlerta(
        'Error al descargar',
        'No se pudo descargar la actualización. Verifica tu conexión e intenta de nuevo.',
      );
    } finally {
      await progressListener.remove();
      this.downloading = false;
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