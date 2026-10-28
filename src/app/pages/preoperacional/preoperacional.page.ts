import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, arrowForwardOutline, cameraOutline, closeOutline,
  checkmarkOutline, warningOutline, lockClosedOutline, buildOutline,
  refreshOutline, cloudDoneOutline, logOutOutline,
} from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

const PLACA_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]$/;
const PLACA_KEY = 'woden_preop_placa';

interface Foto { id: string; blob: Blob; preview: string; }

@Component({
  selector: 'app-preoperacional',
  templateUrl: './preoperacional.page.html',
  styleUrls: ['./preoperacional.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class PreoperacionalPage implements OnInit, OnDestroy {
  cfg: any = null;
  cargando = true;
  errorCarga = '';
  enviando = false;

  paso = 0;
  errores: Record<string, string> = {};

  datos = { placa: '', km: '' };
  resp: Record<string, string> = {};
  textos: Record<string, string> = {};
  evid: Record<string, Foto[]> = {};

  mantEstado: any = null;

  inicio = new Date().toISOString();
  cerrado = false;
  resultado: any = null;

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'log-out-outline': logOutOutline,
      'arrow-forward-outline': arrowForwardOutline,
      'camera-outline': cameraOutline,
      'close-outline': closeOutline,
      'checkmark-outline': checkmarkOutline,
      'warning-outline': warningOutline,
      'lock-closed-outline': lockClosedOutline,
      'build-outline': buildOutline,
      'refresh-outline': refreshOutline,
      'cloud-done-outline': cloudDoneOutline,
    });
  }

  get nombreAgente(): string { return this.auth.session?.name ?? ''; }

  async ngOnInit() {
    // authGuard + permisoGuard ya validan; esto es la segunda capa (mismo slug).
    if (!this.auth.hasPermiso('preoperacional.diario')) {
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
  /** Resultado de la marcación que el servidor hace al recibir el formulario (respaldo si no se marcó al ingresar). */
  private avisoAsistencia() {
    const a = this.resultado?.asistencia;
    if (a?.marcada) this.toast(`Entrada registrada${a.hora ? " a las " + a.hora : ""}.`);
    else if (a?.mensaje) this.toast(a.mensaje);
  }
  /** Única salida sin enviar el formulario: la entrada ya quedó marcada y el formulario sigue pendiente. */
  async cerrarSesion() { await this.auth.clearSession(); this.router.navigate(['/home'], { replaceUrl: true }); }

  get puedeMensual(): boolean { return this.auth.hasPermiso('preoperacional.mensual'); }
  irMensual() { this.router.navigate(['/preoperacional/mensual']); }

  // ── Flujo ─────────────────────────────────────────────────────────────────
  get flujo(): any[] { return this.cfg ? [...this.cfg.secciones] : []; }
  get actual(): any { return this.flujo[this.paso]; }
  get esUltimaPregunta(): boolean { return this.paso === this.flujo.length - 2; }
  get etiquetaBoton(): string {
    const t = this.actual?.tipo;
    if (t === 'datos') return 'Continuar';
    return this.esUltimaPregunta ? 'Finalizar' : 'Continuar';
  }

  // ── Helpers de pregunta ───────────────────────────────────────────────────
  q(id: string): any { return this.cfg.preguntas[id]; }
  esMala(id: string): boolean { return !!this.resp[id] && this.resp[id] === this.q(id).insegura; }
  exigeEvidencia(id: string): boolean {
    const q = this.q(id);
    return q.evidencia === 'obligatoria' || (q.evidencia === 'condicional' && this.esMala(id));
  }
  muestraEvidencia(id: string): boolean {
    const q = this.q(id);
    return !(q.evidencia === 'ninguna' || (q.evidencia === 'condicional' && !this.esMala(id)));
  }
  alerta(id: string) { return this.q(id).alerta || this.cfg.alertaDefecto; }
  nFotos(item: string): number { return (this.evid[item] || []).length; }

  // ── Entradas ──────────────────────────────────────────────────────────────
  onPlaca(v: string) { this.datos.placa = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); delete this.errores['placa']; this.mantEstado = null; }
  onKm(v: string) { this.datos.km = v.replace(/\D/g, '').slice(0, 7); delete this.errores['km']; }
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
      delete this.errores[item + '_ev'];
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

  private blobs(items: string[]): Record<string, Blob[]> {
    const out: Record<string, Blob[]> = {};
    items.forEach((k) => { if (this.nFotos(k)) out[k] = this.evid[k].map((e) => e.blob); });
    return out;
  }

  // ── Preguntas ─────────────────────────────────────────────────────────────
  responder(id: string, op: string) {
    this.resp[id] = op;
    delete this.errores[id];
    const q = this.q(id);
    if (id === 'q5' && op === q.insegura && q.detiene) {
      this.cerrado = true;
      this.enviarInspeccion(true);
    }
  }

  // ── Validación ────────────────────────────────────────────────────────────
  private validar(): boolean {
    const e: Record<string, string> = {};
    const t = this.actual.tipo;
    if (t === 'datos') {
      if (!PLACA_RE.test(this.datos.placa)) e['placa'] = 'Placa inválida. Formato esperado: ABC12D o ABC123.';
      if (!this.datos.km) e['km'] = 'Registre el kilometraje actual.';
    } else if (t === 'preguntas') {
      for (const id of this.actual.ids) {
        const q = this.q(id);
        if (!this.resp[id]) { e[id] = 'Seleccione una respuesta.'; continue; }
        if (this.esMala(id) && q.seguimiento && !(this.textos[q.seguimiento.id] || '').trim()) {
          e[q.seguimiento.id] = 'Describa la condición identificada.';
        }
        if (this.exigeEvidencia(id) && !this.nFotos(id)) {
          e[id + '_ev'] = this.esMala(id) ? 'Adjunte evidencia de la condición identificada.' : 'Adjunte al menos una foto de este ítem.';
        }
      }
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
    const t = this.actual.tipo;

    if (t === 'datos') {
      this.enviando = true;
      try {
        this.mantEstado = await this.api.getPreopMantenimientoEstado(this.datos.placa);
        localStorage.setItem(PLACA_KEY, this.datos.placa);
        if (this.mantEstado.estado === 'bloqueado') { this.irPaso(0); return; }
        if (this.mantEstado.estado === 'pendiente') {
          this.toast(`Recuerde: falta el mantenimiento mensual de ${this.mantEstado.mes}. Le quedan ${this.mantEstado.diasRestantes} día(s).`);
        }
        this.irPaso(1);
      } catch (e) { this.errores = { general: this.msg(e) }; }
      finally { this.enviando = false; }
      return;
    }
    if (this.esUltimaPregunta) return this.enviarInspeccion(false);
    this.irPaso(this.paso + 1);
  }

  retroceder() { this.errores = {}; this.irPaso(Math.max(0, this.paso - 1)); }
  private irPaso(n: number) {
    this.paso = n;
    document.querySelector('ion-content')?.scrollToTop(200);
  }

  async enviarInspeccion(porCierre: boolean) {
    this.enviando = true;
    try {
      const respuestas = porCierre ? { q5: this.resp['q5'] } : { ...this.resp };
      this.resultado = await this.api.guardarPreopInspeccion(
        { placa: this.datos.placa, kilometraje: this.datos.km, inicio: this.inicio, respuestas, textos: { ...this.textos } },
        porCierre ? {} : this.blobs(Object.keys(this.cfg.preguntas)),
      );
      this.avisoAsistencia();
      this.irPaso(this.flujo.length - 1);
    } catch (e) {
      this.cerrado = false;
      if (porCierre) delete this.resp['q5'];
      this.errores = { general: this.msg(e) };
      this.toast(this.msg(e));
    } finally { this.enviando = false; }
  }

  /** Pide al coordinador la habilitación del mensual (plazo vencido). */
  async solicitarHabilitacion() {
    const alerta = await this.alertCtrl.create({
      header: 'Solicitar habilitación',
      message: `El plazo del mensual de la placa ${this.datos.placa} venció. Cuéntale a tu coordinador por qué no lo hiciste a tiempo.`,
      inputs: [{ name: 'motivo', type: 'textarea', placeholder: 'Motivo', attributes: { maxlength: 1000 } }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Enviar',
          handler: (v: any) => {
            const motivo = String(v?.motivo ?? '').trim();
            if (motivo.length < 5) { this.toast('Escribe el motivo (mínimo 5 caracteres).'); return false; }
            this.enviarSolicitud(motivo);
            return true;
          },
        },
      ],
    });
    await alerta.present();
  }

  private async enviarSolicitud(motivo: string) {
    const espera = await this.loadingCtrl.create({ message: 'Enviando solicitud…' });
    await espera.present();
    try {
      const r = await this.api.crearSolicitudPreop(this.datos.placa, motivo);
      this.toast(r?.coordinador ? `Solicitud enviada a ${r.coordinador}` : 'Solicitud enviada');
      this.mantEstado = await this.api.getPreopMantenimientoEstado(this.datos.placa);
    } catch (e) { this.toast(this.msg(e)); }
    finally { await espera.dismiss(); }
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  get recap(): any[] {
    return Object.keys(this.cfg.preguntas)
      .filter((id) => this.resp[id] && (!this.cerrado || id === 'q5'))
      .map((id) => {
        const q = this.q(id);
        return {
          num: q.num, titulo: q.titulo || (q.texto.slice(0, 52) + '…'), resp: this.resp[id],
          mala: this.resp[id] === q.insegura, fotos: this.nFotos(id),
          detalle: q.seguimiento ? this.textos[q.seguimiento.id] : '',
        };
      });
  }

  nueva() {
    this.liberarFotos();
    this.resp = {}; this.textos = {}; this.errores = {};
    this.datos.km = ''; this.resultado = null; this.cerrado = false;
    this.mantEstado = null;
    this.inicio = new Date().toISOString();
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
