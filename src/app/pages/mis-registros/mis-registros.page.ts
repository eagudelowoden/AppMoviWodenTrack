import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, cameraOutline, chevronDownOutline, chevronUpOutline, closeOutline,
  checkmarkCircleOutline, closeCircleOutline, timeOutline, documentTextOutline,
} from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

/** Consulta agente ope: el agente ve SUS preoperacionales diarios y mensuales, con fotos. */
@Component({
  selector: 'app-mis-registros',
  templateUrl: './mis-registros.page.html',
  styleUrls: ['./mis-registros.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class MisRegistrosPage implements OnInit {
  tab: 'diarios' | 'mensuales' = 'diarios';
  cargando = false;
  error = '';

  diarios: any[] = [];
  mensuales: any[] = [];

  /** id de la inspección abierta + su detalle (respuestas y fotos). */
  abiertoId: number | null = null;
  detalle: any = null;
  cargandoDetalle = false;

  /** Visor de fotos a pantalla completa. */
  visor: { url: string; titulo: string } | null = null;

  constructor(private router: Router, private api: ApiService, private auth: AuthService, private toastCtrl: ToastController) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'camera-outline': cameraOutline,
      'chevron-down-outline': chevronDownOutline,
      'chevron-up-outline': chevronUpOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'time-outline': timeOutline,
      'document-text-outline': documentTextOutline,
    });
  }

  ngOnInit() {
    if (!this.auth.hasPermiso('preoperacional.consulta_agente')) {
      this.router.navigate(['/marcacion'], { replaceUrl: true });
      return;
    }
    this.cargar();
  }

  volver() { this.router.navigate(['/marcacion']); }

  async cargar() {
    this.cargando = true;
    this.error = '';
    try {
      [this.diarios, this.mensuales] = await Promise.all([this.api.getMisPreop(), this.api.getMisPreopMant()]);
    } catch (e: any) {
      this.error = e?.error?.message || 'No se pudo cargar tu historial.';
    } finally {
      this.cargando = false;
    }
  }

  async refrescar(ev: any) {
    await this.cargar();
    ev.target.complete();
  }

  cambiarTab(t: 'diarios' | 'mensuales') { this.tab = t; }

  async abrir(r: any) {
    if (this.abiertoId === r.id) { this.abiertoId = null; this.detalle = null; return; }
    this.abiertoId = r.id;
    this.detalle = null;
    this.cargandoDetalle = true;
    try {
      this.detalle = await this.api.getPreopDetalle(r.id);
    } catch (e: any) {
      this.error = e?.error?.message || 'No se pudo cargar el detalle.';
      this.abiertoId = null;
    } finally {
      this.cargandoDetalle = false;
    }
  }

  /** id del registro cuyo PDF se está generando (para el spinner del botón). */
  descargando: string | null = null;

  /** Genera el PDF (con el enlace a las fotos) y lo abre con el visor del teléfono. */
  async descargarPdf(tipo: 'inspecciones' | 'mantenimientos', id: number) {
    if (this.descargando) return;
    this.descargando = tipo[0] + id;
    try {
      const { base64, nombre } = await this.api.descargarPreopPdf(tipo, id);
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({ path: nombre, data: base64, directory: Directory.Cache });
        await FileOpener.open({ filePath: uri, contentType: 'application/pdf' });
      } else {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${base64}`;
        a.download = nombre;
        a.click();
      }
    } catch (e: any) {
      await this.avisar(e?.error?.message || 'No se pudo generar el PDF.');
    } finally { this.descargando = null; }
  }

  private async avisar(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 3500, position: 'bottom', color: 'danger' });
    await t.present();
  }

  verFoto(url: string, titulo: string) { this.visor = { url, titulo }; }
  cerrarVisor() { this.visor = null; }

  fechaHora(v: string): string {
    return v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }
}
