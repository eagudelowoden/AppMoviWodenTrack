import { Component, OnInit, OnDestroy, NgZone, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Geolocation, Position } from '@capacitor/geolocation';
import {
  logOutOutline, logInOutline, calendarOutline,
  cloudDownloadOutline, closeOutline, checkmarkCircleOutline,
  arrowForwardOutline, eyeOutline, bugOutline, documentTextOutline,
  locationOutline, chevronDownOutline, chevronUpOutline, megaphoneOutline,
  appsOutline, personOutline,
} from 'ionicons/icons';

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos sin actividad

@Component({
  selector: 'app-marcacion',
  templateUrl: './marcacion.page.html',
  styleUrls: ['./marcacion.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class MarcacionPage implements OnInit, OnDestroy {

  /** AuthService es la única fuente de verdad — ya no hay copia local en sessionStorage. */
  get userData() {
    return this.auth.session;
  }

  /** Muestra el tercer token del nombre: "Agudelo pita Elder Daniel" → "Elder" */
  get primerNombre(): string {
    const p = (this.userData?.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const idx = p.length >= 3 ? 2 : p.length - 1;
    const nombre = p[idx] ?? '';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
  }

  get canVerComprobantes(): boolean {
    return this.auth.hasPermiso('admin.marcacion_seriales');
  }

  /** Mismo permiso que usa la web para mostrar "Novedades" en el nav de Admin. */
  get canVerNovedades(): boolean {
    return this.auth.hasPermiso('admin.novedades');
  }

  /** Si hay al menos una opción del panel "Más opciones", vale la pena mostrarlo. */
  get tieneMasOpciones(): boolean {
    return this.canVerNovedades || this.canVerComprobantes;
  }

  /**
   * Marcación con GPS — misma condición EXACTA que la web:
   * debe ser de Ecuador (por company o país) Y tener permiso (o ser superadmin).
   */
  get canMarcacionGps(): boolean {
    const company = (this.userData?.company ?? '').toLowerCase();
    const pais    = (this.userData?.pais ?? '').toLowerCase();
    const esEcuador = company.includes('ecuador') || pais === 'ecuador';

    const tienePermiso =
      !!this.userData?.isSuperAdmin || this.userData?.permisos?.['ecuador.marcacion'] === true;

    return esEcuador && tienePermiso;
  }

  irAComprobantes() {
    this.masOpcionesAbierto = false;
    this.router.navigate(['/comprobantes']);
  }

  irANovedades() {
    this.masOpcionesAbierto = false;
    this.router.navigate(['/novedades']);
  }

  irAPerfil() {
    this.router.navigate(['/perfil']);
  }

  // ── Panel "Más opciones" desplegable ──────────────────────────────────────
  // Reemplaza los botones sueltos (Comprobantes, etc.) por un panel que se
  // expande — pensado para crecer: cada opción nueva es una fila más en
  // `opcionesMenu`, sin tocar el layout.
  masOpcionesAbierto = false;
  toggleMasOpciones() {
    this.masOpcionesAbierto = !this.masOpcionesAbierto;
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
  isMarkingGps = false;                      // bloquea la marcación GPS
  private lastMarkTimestamp = 0;

  // ── Estado marcación GPS (Ecuador) ─────────────────────────────────────────
  gpsTipoPendiente: 'entrada' | 'salida' = 'entrada'; // qué toca marcar ahora
  gpsUltima: any = null;                     // última marcación GPS de hoy
  gpsRegistrosHoy: any[] = [];               // marcaciones GPS de hoy
  gpsUbicacion: { latitud: number; longitud: number } | null = null; // última capturada
  private readonly MARK_COOLDOWN_MS = 4000;  // 4 s entre marcaciones

  constructor(
    private router:       Router,
    private api:          ApiService,
    private auth:         AuthService,
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
      'document-text-outline':    documentTextOutline,
      'location-outline':         locationOutline,
      'chevron-down-outline':     chevronDownOutline,
      'chevron-up-outline':       chevronUpOutline,
      'megaphone-outline':        megaphoneOutline,
      'apps-outline':             appsOutline,
      'person-outline':           personOutline,
    });

    // La sesión ya la dejó lista AuthService (guardada en home.page al hacer
    // login, o hidratada desde Preferences si la app se reabrió) — el guard
    // de la ruta (authGuard) ya garantiza que existe antes de llegar aquí.
    this.isInside     = this.userData?.is_inside     ?? false;
    this.dayCompleted = this.userData?.day_completed ?? false;
    this.horaEntrada  = this.userData?.hora_entrada  ?? null;
    this.horaSalida   = this.userData?.hora_salida   ?? null;
  }

  /** Persiste el estado en vivo (is_inside, horas, etc.) dentro de la sesión. */
  private saveSession() {
    this.auth.patchSession({
      is_inside:     this.isInside,
      day_completed: this.dayCompleted,
      hora_entrada:  this.horaEntrada,
      hora_salida:   this.horaSalida,
    });
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
      this.canMarcacionGps ? this.cargarEstadoGps() : Promise.resolve(),
    ]);

    // Si el usuario marca con GPS, pide el permiso de ubicación de una vez al
    // entrar — así cuando presione "Registrar" ya está concedido y no hay que
    // esperar el prompt nativo en ese momento. Si lo niega, no pasa nada aquí:
    // el error real (y el toast) aparece recién cuando intente marcar.
    if (this.canMarcacionGps) {
      this.asegurarPermisoUbicacion().catch(() => {});
    }
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
      const res = await this.api.getAttendanceStatus(this.userData!.employee_id);
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
    await Promise.allSettled([
      this.sincronizarEstado(),
      this.cargarMalla(),
      this.canMarcacionGps ? this.cargarEstadoGps() : Promise.resolve(),
    ]);
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
    try { this.mallaHoy = await this.api.getMallaHoy(this.userData!.employee_id); } catch {}
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
  async downloadUpdate() {
    if (!this.apkInfo?.exists || !this.apkInfo?.downloadUrl) {
      this.mostrarToast('El archivo APK aún no está disponible para descarga', 'warning');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      // En la app nativa, window.open() no dispara la descarga del APK.
      // Abrir en el navegador del sistema sí permite que Android maneje
      // la descarga y muestre la notificación nativa de "instalar".
      await Browser.open({ url: this.apkInfo.downloadUrl });
    } else {
      window.open(this.apkInfo.downloadUrl, '_blank');
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
      const res = await this.api.marcarAsistencia(this.userData!.employee_id, action);
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

  // ── Marcación con GPS (Ecuador) ────────────────────────────────────────────
  /** Carga el estado del día: qué toca marcar (entrada/salida) y la última. */
  async cargarEstadoGps() {
    try {
      const estado = await this.api.getEstadoMarcacionGps(this.userData!.id_odoo);
      this.gpsTipoPendiente = estado?.tipo_pendiente === 'salida' ? 'salida' : 'entrada';
      this.gpsUltima        = estado?.ultima ?? null;
      this.gpsRegistrosHoy  = estado?.registros_hoy ?? [];
    } catch {}
  }

  /** Marca según el tipo pendiente (un solo botón que alterna, como la web). */
  async marcarConGps() {
    if (this.isMarkingGps || this.isMarking) return;

    // Cooldown compartido con la marcación normal
    const now = Date.now();
    if (now - this.lastMarkTimestamp < this.MARK_COOLDOWN_MS) {
      this.mostrarToast('Espera un momento antes de volver a marcar', 'warning'); return;
    }
    if (!this.isOnline) { this.mostrarToast('Necesitas conexión para marcar', 'warning'); return; }

    const tipo = this.gpsTipoPendiente;
    this.isMarkingGps = true;

    // 1. Permiso de ubicación
    const permiso = await this.asegurarPermisoUbicacion();
    if (!permiso) {
      this.mostrarToast('Debes permitir el acceso a la ubicación para marcar con GPS', 'danger');
      this.isMarkingGps = false;
      return;
    }

    const loading = await this.loadingCtrl.create({ message: 'Obteniendo ubicación GPS...', spinner: 'crescent' });
    await loading.present();

    try {
      // 2. Mejor ubicación posible
      const ubic = await this.obtenerMejorUbicacion();
      await loading.dismiss();

      if (!ubic) {
        this.mostrarToast('No se pudo obtener la ubicación GPS. Intenta al aire libre.', 'danger');
        this.isMarkingGps = false;
        return;
      }
      this.gpsUbicacion = { latitud: ubic.latitud, longitud: ubic.longitud };

      // 3. Confirmación del usuario
      const confirmado = await this.confirmarMarcacionGps(tipo, ubic);
      if (!confirmado) { this.isMarkingGps = false; return; }

      // 4. Registrar en el backend (mismo endpoint que la web)
      const loading2 = await this.loadingCtrl.create({ message: 'Registrando marcación...', spinner: 'crescent' });
      await loading2.present();
      try {
        await this.api.marcarConGps({
          id_odoo:  this.userData!.id_odoo,
          cedula:   this.userData!.cedula || this.userData!.identificacion || '',
          nombre:   this.userData!.name,
          tipo,
          latitud:  ubic.latitud,
          longitud: ubic.longitud,
          company:  this.userData!.company || 'Ecuador',
        });
        this.lastMarkTimestamp = Date.now();
        await loading2.dismiss();
        this.mostrarToast(`✓ ${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada con GPS`, 'success');
        // Refrescar estado → el botón cambia a la acción contraria
        await this.cargarEstadoGps();
      } catch {
        await loading2.dismiss();
        this.mostrarToast('No se pudo registrar la marcación', 'danger');
      }
    } catch {
      await loading.dismiss().catch(() => {});
      this.mostrarToast('Error obteniendo la ubicación', 'danger');
    } finally {
      this.isMarkingGps = false;
    }
  }

  /** Pide (o valida) el permiso de ubicación nativo. */
  private async asegurarPermisoUbicacion(): Promise<boolean> {
    try {
      let estado = await Geolocation.checkPermissions();
      if (estado.location !== 'granted' && estado.coarseLocation !== 'granted') {
        estado = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      return estado.location === 'granted' || estado.coarseLocation === 'granted';
    } catch {
      // En navegador web checkPermissions puede no existir; el getCurrentPosition
      // disparará el prompt del navegador por su cuenta.
      return true;
    }
  }

  /**
   * Toma varias lecturas del GPS durante unos segundos y se queda con la MÁS
   * precisa (menor 'accuracy'), en vez de la primera/cacheada. Corta apenas
   * llega a ≤20 m o al vencer el tope de tiempo.
   */
  private async obtenerMejorUbicacion(): Promise<{ latitud: number; longitud: number; precision: number } | null> {
    const PRECISION_OBJETIVO = 20;  // m: si se alcanza, cortamos ya
    const TIEMPO_MAXIMO = 15000;    // ms: tope de espera

    return new Promise<{ latitud: number; longitud: number; precision: number } | null>((resolve) => {
      let mejor: Position | null = null;
      let watchId: string | null = null;
      let timer: any = null;
      let finalizado = false;

      const finalizar = async () => {
        if (finalizado) return;
        finalizado = true;
        if (timer) clearTimeout(timer);
        if (watchId) { try { await Geolocation.clearWatch({ id: watchId }); } catch {} }
        resolve(
          mejor
            ? {
                latitud:   mejor.coords.latitude,
                longitud:  mejor.coords.longitude,
                precision: mejor.coords.accuracy,
              }
            : null,
        );
      };

      Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: TIEMPO_MAXIMO, maximumAge: 0 },
        (pos, err) => {
          if (err || !pos) return;
          if (!mejor || pos.coords.accuracy < mejor.coords.accuracy) mejor = pos;
          if (mejor.coords.accuracy <= PRECISION_OBJETIVO) finalizar();
        },
      )
        .then((id) => {
          watchId = id;
          // Si el watch ya terminó antes de asignar el id, límpialo de una.
          if (finalizado) { Geolocation.clearWatch({ id }).catch(() => {}); }
        })
        .catch(async () => {
          // Fallback: un único intento con getCurrentPosition
          try {
            mejor = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true, timeout: TIEMPO_MAXIMO, maximumAge: 0,
            });
          } catch {}
          finalizar();
        });

      timer = setTimeout(() => finalizar(), TIEMPO_MAXIMO);
    });
  }

  /** Alerta de confirmación antes de registrar (muestra coordenadas, no precisión). */
  private confirmarMarcacionGps(
    tipo: 'entrada' | 'salida',
    ubic: { latitud: number; longitud: number },
  ): Promise<boolean> {
    return new Promise(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header:   `Marcar ${tipo}`,
        cssClass: 'alert-marcacion',
        message:  `Ubicación capturada:\n${ubic.latitud.toFixed(5)}, ${ubic.longitud.toFixed(5)}\n\n¿Confirmas la marcación de ${tipo}?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel', handler: () => resolve(false) },
          { text: 'Confirmar', handler: () => resolve(true) },
        ],
      });
      await alert.present();
    });
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
                empleado_id: this.userData!.employee_id,
                nombre:      this.userData!.name,
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
  async logout() {
    clearTimeout(this.inactivityTimer);
    await this.auth.clearSession();
    this.router.navigate(['/home'], { replaceUrl: true });
  }
}
