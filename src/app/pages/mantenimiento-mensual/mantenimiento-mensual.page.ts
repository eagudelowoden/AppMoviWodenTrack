import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, arrowForwardOutline, cameraOutline, closeOutline,
  checkmarkOutline, warningOutline, lockClosedOutline, buildOutline, cloudDoneOutline, refreshOutline,
} from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

const PLACA_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]$/;
const PLACA_KEY = 'woden_preop_placa';

interface Foto { id: string; blob: Blob; preview: string; }

/** OpeMensual: reporte mensual de mantenimiento, SOAT y tecnomecánica (uno por placa y mes). */
@Component({
  selector: 'app-mantenimiento-mensual',
  templateUrl: './mantenimiento-mensual.page.html',
  styleUrls: ['../preoperacional/preoperacional.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class MantenimientoMensualPage implements OnInit, OnDestroy {
  cfg: any = null;
  cargando = true;
  errorCarga = '';
  enviando = false;
  paso = 0;
  errores: Record<string, string> = {};
  datos = { placa: '' };
  evid: Record<string, Foto[]> = {};
  mantEstado: any = null;
  mant = this.nuevoMant();
  resultado: any = null;
  nSoportes = 0;

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private toastCtrl: ToastController,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'camera-outline': cameraOutline,
      'close-outline': closeOutline,
      'checkmark-outline': checkmarkOutline,
      'warning-outline': warningOutline,
      'lock-closed-outline': lockClosedOutline,
      'build-outline': buildOutline,
      'cloud-done-outline': cloudDoneOutline,
      'refresh-outline': refreshOutline,
    });
  }

  get nombreAgente(): string { return this.auth.session?.name ?? ''; }
  get puedeDiario(): boolean { return this.auth.hasPermiso('preoperacional.diario'); }

  async ngOnInit() {
    if (!this.auth.hasPermiso('preoperacional.mensual')) {
      this.router.navigate(['/marcacion'], { replaceUrl: true });
      return;
    }
    try {
      this.cfg = await this.api.getPreopConfig();
      this.datos.placa = localStorage.getItem(PLACA_KEY) ?? '';
    } catch (e) {
      this.errorCarga = this.msg(e);
    } finally {
      this.cargando = false;
    }
  }

  ngOnDestroy() { this.liberarFotos(); }

  volver() { this.router.navigate(['/marcacion']); }
  irDiario() { this.router.navigate(['/preoperacional/diario']); }

  // ── Flujo: placa → formulario → confirmación ──────────────────────────────
  get flujo(): any[] {
    if (!this.cfg) return [];
    return [
      { n: 1, tipo: 'datos', titulo: 'Placa de la motocicleta', eyebrow: 'Reporte mensual',
        nota: `Un solo reporte por placa al mes. Sin este reporte no se pueden registrar inspecciones diarias desde el día ${this.cfg.diaLimiteMantenimiento + 1}.` },
      { n: 'M', tipo: 'mantenimiento', titulo: 'Mantenimiento mensual', eyebrow: 'Requisito mensual',
        nota: 'Registre el mantenimiento preventivo, el próximo mantenimiento, el SOAT y la revisión técnico-mecánica.' },
      { n: 'R', tipo: 'resultado', titulo: 'Reporte guardado', eyebrow: 'Confirmación' },
    ];
  }
  get actual(): any { return this.flujo[this.paso]; }
  get etiquetaBoton(): string { return this.actual?.tipo === 'mantenimiento' ? 'Guardar reporte' : 'Continuar'; }

  nuevoMant() {
    return {
      realizado: '', fecha: '', km: '', taller: '', factura: '', motivo: '', programada: '',
      cambios: [] as string[], cambiosOtros: '', proxKm: '', proxFecha: '', soat: '', tecno: '',
    };
  }

  nFotos(item: string): number { return (this.evid[item] || []).length; }

  vigencia(f: string): { dias: number; txt: string; cls: string } | null {
    if (!f) return null;
    const dias = Math.round((Date.parse(f + 'T00:00:00Z') - Date.parse(this.cfg.hoy + 'T00:00:00Z')) / 86400000);
    if (dias < 0) return { dias, txt: `Vencido hace ${Math.abs(dias)} días`, cls: 'bad' };
    if (dias <= 30) return { dias, txt: `Vence en ${dias} día${dias === 1 ? '' : 's'}`, cls: 'warn' };
    return { dias, txt: `Vigente · ${dias} días`, cls: 'ok' };
  }

  // ── Entradas ──────────────────────────────────────────────────────────────
  onPlaca(v: string) { this.datos.placa = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); delete this.errores['placa']; this.mantEstado = null; }
  soloNum(campo: 'km' | 'proxKm', v: string) { this.mant[campo] = v.replace(/\D/g, '').slice(0, 7); }
  toggleCambio(c: string) {
    const i = this.mant.cambios.indexOf(c);
    if (i > -1) this.mant.cambios.splice(i, 1); else this.mant.cambios.push(c);
    delete this.errores['cambios'];
  }
  setRealizado(v: string) { this.mant.realizado = v; this.errores = {}; }

  // ── Fotos ─────────────────────────────────────────────────────────────────
  private comprimir(file: File): Promise<Blob | null> {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, 1400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => res(b), 'image/jpeg', 0.72);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  abrirCamara(item: string) {
    if (this.nFotos(item) >= this.cfg.maxFotosPorItem) {
      this.toast(`Máximo ${this.cfg.maxFotosPorItem} fotos por ítem.`);
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.setAttribute('capture', 'environment'); // abre la cámara trasera
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      const blob = await this.comprimir(f);
      if (!blob) { this.toast('No se pudo procesar la foto.'); return; }
      (this.evid[item] ||= []).push({ id: Math.random().toString(36).slice(2, 9), blob, preview: URL.createObjectURL(blob) });
      delete this.errores['mant_ev'];
    };
    inp.click();
  }

  quitarFoto(item: string, id: string) {
    const l = this.evid[item] || [];
    const i = l.findIndex((e) => e.id === id);
    if (i > -1) { URL.revokeObjectURL(l[i].preview); l.splice(i, 1); }
  }

  private liberarFotos() {
    Object.values(this.evid).forEach((l) => l.forEach((e) => URL.revokeObjectURL(e.preview)));
    this.evid = {};
  }

  // ── Validación ────────────────────────────────────────────────────────────
  private validar(): boolean {
    const e: Record<string, string> = {};
    const t = this.actual.tipo;
    if (t === 'datos') {
      if (!PLACA_RE.test(this.datos.placa)) e['placa'] = 'Placa inválida. Formato esperado: ABC12D o ABC123.';
    } else if (t === 'mantenimiento') {
      const m = this.mant;
      if (!m.realizado) e['realizado'] = 'Indique si se realizó el mantenimiento.';
      if (m.realizado === 'Sí') {
        if (!m.fecha) e['fechaM'] = 'Registre la fecha.';
        if (!m.km) e['kmM'] = 'Registre el kilometraje.';
        if (!m.taller.trim()) e['taller'] = 'Indique el taller.';
        if (!m.cambios.length) e['cambios'] = 'Marque al menos un cambio realizado.';
        if (m.cambios.includes('Otros') && !m.cambiosOtros.trim()) e['cambiosOtros'] = 'Describa los otros cambios.';
        if (!this.nFotos('mant')) e['mant_ev'] = 'Adjunte la factura u orden de servicio.';
      }
      if (m.realizado === 'No') {
        if (!m.motivo.trim()) e['motivo'] = 'Explique por qué no se realizó.';
        if (!m.programada) e['programada'] = 'Indique cuándo lo realizará.';
      }
      if (!m.proxKm && !m.proxFecha) e['proximo'] = 'Registre el kilometraje o la fecha del próximo mantenimiento.';
      if (!m.soat) e['soat'] = 'Registre el vencimiento del SOAT.';
      if (!m.tecno) e['tecno'] = 'Registre el vencimiento de la tecnomecánica.';
    }
    this.errores = e;
    return !Object.keys(e).length;
  }

  private scrollAlError() {
    setTimeout(() => document.querySelector('.pf-err')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  }

  // ── Navegación ────────────────────────────────────────────────────────────
  async avanzar() {
    if (this.enviando) return;
    if (!this.validar()) {
      this.toast('Complete lo marcado en rojo para continuar.');
      this.scrollAlError();
      return;
    }
    if (this.actual.tipo === 'mantenimiento') return this.guardarMantenimiento();

    this.enviando = true;
    try {
      this.mantEstado = await this.api.getPreopMantenimientoEstado(this.datos.placa);
      localStorage.setItem(PLACA_KEY, this.datos.placa);
      if (this.mantEstado.estado === 'ok') return; // ya reportado: se muestra el resumen
      this.irPaso(1);
    } catch (e) { this.errores = { general: this.msg(e) }; }
    finally { this.enviando = false; }
  }

  retroceder() { this.errores = {}; this.irPaso(Math.max(0, this.paso - 1)); }
  private irPaso(n: number) {
    this.paso = n;
    document.querySelector('ion-content')?.scrollToTop(200);
  }

  async guardarMantenimiento() {
    this.enviando = true;
    try {
      const m = this.mant;
      this.resultado = await this.api.guardarPreopMantenimiento({
        placa: this.datos.placa, realizado: m.realizado, fecha: m.fecha, kilometraje: m.km, taller: m.taller,
        factura: m.factura, motivo: m.motivo, programada: m.programada, cambios: m.cambios,
        cambiosOtros: m.cambiosOtros, proximoKm: m.proxKm, proximoFecha: m.proxFecha, soat: m.soat, tecno: m.tecno,
      }, (this.evid['mant'] || []).map((e) => e.blob));
      this.mantEstado = this.resultado.estado;
      this.nSoportes = this.nFotos('mant');
      this.errores = {};
      this.irPaso(2);
    } catch (e) {
      this.errores = { general: this.msg(e) };
      this.toast(this.msg(e));
    } finally { this.enviando = false; }
  }

  // ── Confirmación ──────────────────────────────────────────────────────────
  get rep(): any { return this.resultado?.estado?.reporte; }
  get vencidos(): string[] {
    const l: string[] = [];
    if (this.rep?.soatDias < 0) l.push(`SOAT vencido desde el ${this.rep.soat}`);
    if (this.rep?.tecnoDias < 0) l.push(`Revisión técnico-mecánica vencida desde el ${this.rep.tecno}`);
    return l;
  }

  nueva() {
    this.liberarFotos();
    this.mant = this.nuevoMant();
    this.resultado = null; this.mantEstado = null; this.errores = {};
    this.irPaso(0);
  }

  // ── Utilidades ────────────────────────────────────────────────────────────
  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m || (e?.status === 0 ? 'Sin conexión con el servidor.' : 'No se pudo completar la operación.'));
  }

  async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 3000, position: 'top' });
    await t.present();
  }
}
