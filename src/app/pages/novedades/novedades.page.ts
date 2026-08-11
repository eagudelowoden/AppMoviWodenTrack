import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, addCircleOutline, timeOutline,
  cloudUploadOutline, closeOutline, checkmarkCircleOutline,
  closeCircleOutline, hourglassOutline, documentAttachOutline,
} from 'ionicons/icons';

const TIPIFICACIONES = [
  'Renuncia', 'No remunerado', 'Días compensatorios', 'Horas extra',
  'Día familia', 'Día cumpleaños', 'Incapacidades', 'Citas médicas',
  'Calamidad doméstica', 'Licencia maternidad', 'Licencia luto',
];

const COOLDOWN_MS = 3000;

@Component({
  selector: 'app-novedades',
  templateUrl: './novedades.page.html',
  styleUrls: ['./novedades.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class NovedadesPage implements OnInit {

  readonly tipificaciones = TIPIFICACIONES;

  tab: 'nueva' | 'historial' = 'nueva';

  form = {
    tipificacion: '',
    fechaInicio: '',
    fechaFin: '',
    ultimoDiaTrabajado: '',
    descripcion: '',
  };

  archivos: File[] = [];
  loading = false;
  submitStatus: 'ok' | 'error' | '' = '';
  submitMessage = '';

  misNovedades: any[] = [];
  loadingHistorial = false;
  private ultimaCarga = 0;

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private toastCtrl: ToastController,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'add-circle-outline': addCircleOutline,
      'time-outline': timeOutline,
      'cloud-upload-outline': cloudUploadOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'hourglass-outline': hourglassOutline,
      'document-attach-outline': documentAttachOutline,
    });
  }

  ngOnInit() {
    // authGuard + permisoGuard('marcacion.novedad') ya validan esto en la
    // ruta — este chequeo es una segunda capa de seguridad, por eso tiene
    // que usar EXACTAMENTE el mismo slug que el guard. Tenía 'admin.novedades'
    // (el slug viejo), así que el guard dejaba pasar pero esta verificación
    // rebotaba al instante — se sentía como que la pantalla "se salía sola".
    if (!this.auth.hasPermiso('marcacion.novedad')) {
      this.router.navigate(['/marcacion'], { replaceUrl: true });
      return;
    }
    this.cargarMisNovedades();
  }

  volver() {
    this.router.navigate(['/marcacion']);
  }

  cambiarTab(t: 'nueva' | 'historial') {
    this.tab = t;
    if (t === 'historial') this.cargarMisNovedades();
  }

  // ── Archivos ───────────────────────────────────────────────────────────────
  onFilesChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.archivos = [...this.archivos, ...Array.from(input.files)].slice(0, 10);
    input.value = '';
  }

  quitarArchivo(idx: number) {
    this.archivos.splice(idx, 1);
  }

  // ── Envío ──────────────────────────────────────────────────────────────────
  async enviar() {
    if (this.loading) return;

    if (!this.form.tipificacion || !this.form.descripcion.trim()) {
      this.mostrarToast('Completa el tipo y la descripción antes de enviar', 'warning');
      return;
    }
    const esRenuncia = this.form.tipificacion === 'Renuncia';
    if (esRenuncia && !this.form.ultimoDiaTrabajado) {
      this.mostrarToast('Indica el último día trabajado', 'warning');
      return;
    }
    if (!esRenuncia && (!this.form.fechaInicio || !this.form.fechaFin)) {
      this.mostrarToast('Indica la fecha de inicio y fin', 'warning');
      return;
    }

    const userData = this.auth.session;
    this.loading = true;
    this.submitStatus = '';

    try {
      await this.api.crearNovedad({
        nombre: userData?.name ?? '',
        cedula: String(userData?.cedula ?? userData?.identificacion ?? ''),
        descripcion: this.form.descripcion.trim(),
        tipificacion: this.form.tipificacion,
        fechaInicio: esRenuncia ? this.form.ultimoDiaTrabajado : this.form.fechaInicio,
        fechaFin: esRenuncia ? this.form.ultimoDiaTrabajado : this.form.fechaFin,
        ultimoDiaTrabajado: esRenuncia ? this.form.ultimoDiaTrabajado : null,
        creadoPor: userData?.employee_id ?? userData?.id_odoo ?? null,
        archivos: this.archivos,
      });

      this.submitStatus = 'ok';
      this.submitMessage = 'Novedad enviada correctamente.';
      this.mostrarToast('✓ Novedad enviada', 'success');
      this.resetForm();
      await this.cargarMisNovedades();
      this.tab = 'historial';
    } catch {
      this.submitStatus = 'error';
      this.submitMessage = 'No se pudo enviar la novedad. Intenta de nuevo.';
      this.mostrarToast('No se pudo enviar la novedad', 'danger');
    } finally {
      this.loading = false;
    }
  }

  resetForm() {
    this.form = { tipificacion: '', fechaInicio: '', fechaFin: '', ultimoDiaTrabajado: '', descripcion: '' };
    this.archivos = [];
    this.submitStatus = '';
  }

  // ── Historial ──────────────────────────────────────────────────────────────
  async cargarMisNovedades() {
    const idOdoo = this.auth.session?.id_odoo ?? this.auth.session?.employee_id;
    if (!idOdoo) return;

    const ahora = Date.now();
    if (ahora - this.ultimaCarga < COOLDOWN_MS && this.misNovedades.length) return;
    this.ultimaCarga = ahora;

    this.loadingHistorial = true;
    try {
      const data = await this.api.getMisNovedades(idOdoo);
      this.misNovedades = Array.isArray(data) ? data : [];
    } catch {
      this.mostrarToast('No se pudo cargar tu historial de novedades', 'danger');
    } finally {
      this.loadingHistorial = false;
    }
  }

  async handleRefresh(event: any) {
    this.ultimaCarga = 0;
    await this.cargarMisNovedades();
    event.target.complete();
  }

  // ── Presentación de estado (mismo criterio que la web) ────────────────────
  estadoLabel(v: number | null): string {
    return v === 1 ? 'Aprobado' : v === 0 ? 'Rechazado' : 'Pendiente';
  }

  estadoIcon(v: number | null): string {
    return v === 1 ? 'checkmark-circle-outline' : v === 0 ? 'close-circle-outline' : 'hourglass-outline';
  }

  estadoClass(v: number | null): string {
    if (v === 1) return 'is-ok';
    if (v === 0) return 'is-err';
    return 'is-warn';
  }

  formatFecha(f: string | null): string {
    if (!f) return '—';
    const [y, m, d] = String(f).split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }

  private async mostrarToast(message: string, color: string) {
    const t = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await t.present();
  }
}
