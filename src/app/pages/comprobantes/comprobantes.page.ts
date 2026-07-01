import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, searchOutline, documentTextOutline,
  chevronDownCircleOutline, alertCircleOutline,
} from 'ionicons/icons';

const SESSION_KEY = 'wt_session';
const COOLDOWN_MS = 3000;

const CAMPOS_VISIBLES = [
  { key: 'cedula_cliente', label: 'Cédula cliente' },
  { key: 'agente_campo', label: 'Agente' },
  { key: 'nombre_usuario', label: 'Cliente' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'grupo', label: 'Grupo' },
  { key: 'tarea', label: 'Tarea' },
  { key: 'tipo_cierre', label: 'Tipo de cierre' },
  { key: 'codigo_sap', label: 'Código SAP' },
  { key: 'nombre_material', label: 'Material' },
  { key: 'fecha_recepcion', label: 'Fecha recepción' },
  { key: 'fecha_cierre', label: 'Fecha cierre' },
];

@Component({
  selector: 'app-comprobantes',
  templateUrl: './comprobantes.page.html',
  styleUrls: ['./comprobantes.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class ComprobantesPage implements OnInit {

  readonly camposVisibles = CAMPOS_VISIBLES;

  filtros = { fecha: this.hoy(), documento: '', agente: '' };
  loading = false;
  error = '';
  registros: any[] | null = null;
  busquedaLocal = '';
  limite = 50;

  private ultimaConsulta = 0;

  constructor(
    private router: Router,
    private api: ApiService,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'search-outline': searchOutline,
      'document-text-outline': documentTextOutline,
      'chevron-down-circle-outline': chevronDownCircleOutline,
      'alert-circle-outline': alertCircleOutline,
    });
  }

  ngOnInit() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }
    const userData = JSON.parse(raw)?.userData;
    const puedeVer = userData?.isSuperAdmin || userData?.permisos?.['admin.marcacion_seriales'];
    if (!puedeVer) {
      this.router.navigate(['/marcacion'], { replaceUrl: true });
    }
  }

  private hoy(): string {
    return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  volver() {
    this.router.navigate(['/marcacion']);
  }

  async consultar() {
    if (this.loading) return;
    const ahora = Date.now();
    if (ahora - this.ultimaConsulta < COOLDOWN_MS) {
      this.error = 'Espera un momento antes de volver a consultar.';
      return;
    }
    this.ultimaConsulta = ahora;

    this.error = '';
    this.loading = true;
    this.limite = 50;

    try {
      const data = await this.api.getSerialesRecuperados(
        this.filtros.fecha,
        this.filtros.documento.trim() || undefined,
        this.filtros.agente.trim() || undefined,
      );
      this.registros = data?.registros ?? [];
    } catch (err: any) {
      this.error = err?.error?.error || 'Error al consultar la API externa.';
      this.registros = null;
    } finally {
      this.loading = false;
    }
  }

  get registrosFiltrados(): any[] {
    if (!this.registros) return [];
    const q = this.busquedaLocal.trim().toLowerCase();
    if (!q) return this.registros;
    return this.registros.filter((item) => {
      const campos = [item.serial, item.serial_confirmado, ...CAMPOS_VISIBLES.map((c) => item[c.key])];
      return campos.some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }

  get totalFiltrado(): number {
    return this.registrosFiltrados.length;
  }

  get visibles(): any[] {
    return this.registrosFiltrados.slice(0, this.limite);
  }

  verMas() {
    this.limite += 50;
  }

  linkComprobante(item: any): string {
    return item.comprobante_cliente || item.imagen_comprobante || '';
  }

  async abrirComprobante(item: any) {
    const url = this.linkComprobante(item);
    if (!url) return;
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  estatusClass(estatus: string): string {
    const s = String(estatus).toLowerCase();
    if (s.includes('terminado') || s.includes('recuperado') || s.includes('entregado')) return 'is-ok';
    if (s.includes('pendiente') || s.includes('proceso')) return 'is-warn';
    if (s.includes('cancel') || s.includes('fallid')) return 'is-err';
    return 'is-neutral';
  }
}
