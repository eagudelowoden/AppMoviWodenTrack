import { Component, NgZone, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService, LastUser } from '../services/auth.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { addIcons } from 'ionicons';
// Añadimos eyeOutline y eyeOffOutline a las importaciones
import {
  personOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  cloudDownloadOutline,
  megaphoneOutline,
  closeOutline,
  checkmarkCircleOutline,
  checkmarkOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class HomePage implements OnInit {
  userForm = { usuario: '', password: '' };
  showPassword = false;
  recordarUsuario = false;
  appVersion = '...';

  // Aviso de actualización — mismo criterio que en Marcación (barra abajo,
  // no el chip suelto que había antes acá).
  apkInfo: any = null;
  showUpdateBanner = false;

  // Estado de la descarga nativa (alimenta el modal de progreso).
  descargando = false;
  progresoDescarga = 0;
  descargaCompletada = false;

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
    private loadingCtrl: LoadingController,
    private ngZone: NgZone
  ) {
    // 2. Agregamos los iconos del "ojo" al registro de iconos
    addIcons({
      'person-outline': personOutline,
      'lock-closed-outline': lockClosedOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'megaphone-outline': megaphoneOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'checkmark-outline': checkmarkOutline,
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
      // El build (versionCode) va junto al número de versión: si alguna vez
      // "queda pegada" una versión vieja, el build es la forma más rápida de
      // confirmar si el APK instalado es realmente el que se acaba de
      // generar o uno viejo reinstalado por error — versionName se puede
      // repetir sin querer, versionCode siempre debe ser distinto por build.
      this.appVersion = `${info.version} (${info.build})`;
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

    // Precarga el usuario si quedó recordado. Solo si el campo está vacío, para
    // no pisar lo que la persona ya alcanzó a escribir.
    if (this.lastUser?.usuario && !this.userForm.usuario) {
      this.userForm.usuario = this.lastUser.usuario;
      this.recordarUsuario = true;
    }

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
          sessionStorage.removeItem('apk_dismissed_version');
          return;
        }
      }

      // sessionStorage (no localStorage): "descartar" solo dura mientras la
      // app sigue viva en memoria. Si el usuario cierra la app del todo y la
      // vuelve a abrir, el WebView arranca una sesión nueva y el banner
      // vuelve a aparecer si la versión instalada sigue desactualizada — así
      // un cierre accidental de la X no la esconde para siempre.
      const dismissed = sessionStorage.getItem('apk_dismissed_version');
      if (dismissed !== String(info.version)) {
        this.apkInfo = info;
        this.showUpdateBanner = true;
      }
    } catch {}
  }

  // Abre la página pública de descarga (frontend) — mismo mecanismo que la
  // web: el navegador/Chrome maneja la descarga y la instalación con su
  // propio flujo, ya probado y estable. Se abandonó el intento de
  // descargar+instalar DENTRO de la app (Filesystem + FileOpener): daba
  // "hay un problema con el archivo de la app" de forma persistente y
  // agregaba permisos/complejidad que no valían la pena frente a esto.
  async downloadUpdate() {
    const fileUrl = this.apkInfo?.downloadUrl;
    const pageUrl = this.apkInfo?.downloadPageUrl;

    if (!fileUrl && !pageUrl) {
      this.mostrarAlerta(
        'Archivo no disponible',
        'El equipo todavía no subió el instalador de esta versión al servidor. Intenta más tarde.'
      );
      return;
    }

    // En navegador, o si el backend no expone la URL directa del archivo, no
    // hay nada nativo que intentar: derecho a la página de descarga.
    if (!Capacitor.isNativePlatform() || !fileUrl) {
      await this.abrirPaginaDescarga(pageUrl);
      return;
    }

    this.descargando = true;
    this.progresoDescarga = 0;
    this.descargaCompletada = false;

    let listener: PluginListenerHandle | undefined;

    try {
      listener = await Filesystem.addListener('progress', (s) => {
        // El evento llega fuera de la zona de Angular: sin ngZone.run la barra
        // avanza en memoria pero no se repinta.
        this.ngZone.run(() => {
          this.progresoDescarga =
            s.contentLength > 0
              ? Math.min(100, Math.round((s.bytes / s.contentLength) * 100))
              : 0;
        });
      });

      const { path } = await Filesystem.downloadFile({
        url: fileUrl,
        path: `WodenTrack-${this.apkInfo?.version ?? 'update'}.apk`,
        directory: Directory.Cache,
        progress: true,
      });

      if (!path) throw new Error('La descarga no devolvió una ruta de archivo.');

      this.ngZone.run(() => {
        this.progresoDescarga = 100;
        this.descargaCompletada = true;
      });

      // Lanza el instalador del sistema. El plugin resuelve el content:// con
      // su propio FileProvider, que es lo que Android exige desde la 7.
      await FileOpener.open({
        filePath: path,
        contentType: 'application/vnd.android.package-archive',
      });
    } catch {
      // Cualquier fallo —permiso de instalación denegado, descarga cortada,
      // ruta que el FileProvider no puede servir— NO puede dejar al usuario
      // sin salida ni tumbar la app: caemos al flujo del navegador, que es el
      // que ya estaba probado y funcionando.
      await this.abrirPaginaDescarga(pageUrl, true);
    } finally {
      await listener?.remove();
      this.ngZone.run(() => {
        this.descargando = false;
      });
    }
  }

  /**
   * Camino de respaldo: la página pública de descarga. `trasFallo` avisa
   * primero, para que el usuario entienda por qué lo sacamos de la app en vez
   * de que el navegador le aparezca de la nada.
   */
  private async abrirPaginaDescarga(pageUrl?: string, trasFallo = false) {
    if (!pageUrl) {
      this.mostrarAlerta(
        'Archivo no disponible',
        'No pudimos preparar la descarga. Intenta más tarde.'
      );
      return;
    }

    const abrir = async () => {
      if (Capacitor.isNativePlatform()) await Browser.open({ url: pageUrl });
      else window.open(pageUrl, '_blank');
    };

    if (!trasFallo) {
      await abrir();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Continuemos en el navegador',
      message:
        'No pudimos instalar la actualización desde la app. Te llevamos a la página de descarga para completarla desde ahí.',
      buttons: [{ text: 'Continuar', handler: () => void abrir() }],
    });
    await alert.present();
  }

  dismissUpdate() {
    sessionStorage.setItem(
      'apk_dismissed_version',
      this.apkInfo?.version ?? ''
    );
    this.showUpdateBanner = false;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async ingresar() {
    if (!this.userForm.usuario || !this.userForm.password) {
      this.mostrarAlerta(
        'Campos Vacíos',
        'Por favor ingresa tu usuario y contraseña.'
      );
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Autenticando...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const data = await this.api.login(
        this.userForm.usuario,
        this.userForm.password
      );
      if (data?.token) {
        await this.auth.saveSession(data);
      }

      // Después de saveSession, que también escribe en LastUser — si se hiciera
      // antes, el merge de rememberLastUser correría con el valor viejo.
      await this.auth.setUsuarioRecordado(
        this.recordarUsuario ? this.userForm.usuario.trim() : null,
      );

      await loading.dismiss();

      this.router.navigate(['/marcacion'], {
        state: { user: data },
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
      buttons: ['Aceptar'],
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
