import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, cameraOutline, chevronDownOutline, chevronUpOutline, closeOutline,
  checkmarkCircleOutline, closeCircleOutline, timeOutline,
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

  constructor(private router: Router, private api: ApiService, private auth: AuthService) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'camera-outline': cameraOutline,
      'chevron-down-outline': chevronDownOutline,
      'chevron-up-outline': chevronUpOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'time-outline': timeOutline,
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

  verFoto(url: string, titulo: string) { this.visor = { url, titulo }; }
  cerrarVisor() { this.visor = null; }

  fechaHora(v: string): string {
    return v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }
}
