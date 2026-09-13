import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, searchOutline, documentTextOutline,
  chevronDownCircleOutline, alertCircleOutline,
} from 'ionicons/icons';

const COOLDOWN_MS = 3000;

// Tope de días por consulta. El backend no lo impone (solo trunca a 5.000
// filas), pero su propio comentario advierte que 15 días sin filtros son
// ~150.000 filas: cientos de MB en el heap de una sola petición. En un móvil
// además hay que renderizarlas, así que el tope se corta aquí.
const MAX_DIAS_RANGO = 15;

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

  filtros = { fecha: this.hoy(), fechaFin: this.hoy(), documento: '', agente: '' };
  loading = false;
  error = '';
  registros: any[] | null = null;
  busquedaLocal = '';
  limite = 50;

  // Diagnóstico que devuelve el backend: de dónde salieron los datos ('directo'
  // = API de WFS, 'bd' = caché que llena el cron nocturno) y qué tanto del
  // rango pedido alcanza a cubrir esa caché.
  infoConsulta: {
    modo?: string;
    dias_rango?: number;
    dias_con_cache?: number;
    truncado?: boolean;
  } | null = null;

  /** La cédula del cliente es lo único que hace que WFS se consulte directo. */
  get hayFiltro(): boolean {
    return !!(this.filtros.documento.trim() || this.filtros.agente.trim());
  }

  /**
   * Días que abarca el rango, contando ambos extremos (igual que `diasEntre`
   * del backend). Se usa el valor absoluto porque el backend normaliza los
   * rangos invertidos, así que 10→1 cuenta lo mismo que 1→10.
   */
  get diasRango(): number {
    const ini = new Date(this.filtros.fecha + 'T00:00:00').getTime();
    const fin = new Date(
      (this.filtros.fechaFin || this.filtros.fecha) + 'T00:00:00',
    ).getTime();
    if (isNaN(ini) || isNaN(fin)) return 1;
    return Math.abs(Math.round((fin - ini) / 86400000)) + 1;
  }

  get rangoExcedido(): boolean {
    return this.diasRango > MAX_DIAS_RANGO;
  }

  private ultimaConsulta = 0;

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
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
    // authGuard + permisoGuard('admin.marcacion_seriales') ya validan esto en
    // la ruta — este chequeo queda como defensa extra, no como única barrera.
    if (!this.auth.hasPermiso('admin.marcacion_seriales')) {
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

    // Sin filtro no se consulta: un rango entero son decenas de miles de filas
    // que nadie revisa a mano. Va antes del cooldown — no tiene sentido gastar
    // el rate-limit en una petición que ni siquiera se envía.
    if (!this.hayFiltro) {
      this.error =
        'Aplica un filtro para consultar: cédula del cliente o nombre/cédula del agente.';
      this.registros = null;
      this.infoConsulta = null;
      return;
    }

    if (this.rangoExcedido) {
      this.error = `El rango no puede superar ${MAX_DIAS_RANGO} días. Estás pidiendo ${this.diasRango}.`;
      this.registros = null;
      this.infoConsulta = null;
      return;
    }

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
        this.filtros.fechaFin || this.filtros.fecha,
        this.filtros.documento.trim() || undefined,
        this.filtros.agente.trim() || undefined,
      );
      this.registros = data?.registros ?? [];
      this.infoConsulta = {
        modo: data?.modo,
        dias_rango: data?.dias_rango,
        dias_con_cache: data?.dias_con_cache,
        truncado: data?.truncado,
      };
    } catch (err: any) {
      this.error = err?.error?.error || 'Error al consultar la API externa.';
      this.registros = null;
      this.infoConsulta = null;
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
