import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, cameraOutline, closeOutline, checkmarkOutline, warningOutline, logOutOutline, documentOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

const PLACA_RE = /^[A-Z]{3}[0-9]{2}[A-Z0-9]$/;
const TELEFONO_RE = /^[0-9+()\-\s]{7,30}$/;
const MAX_MB = 10;
const MAX_POR_TIPO = 3;
const EXT_RE = /\.(pdf|jpe?g|png)$/i;

type Tipo = 'licencia' | 'tarjeta_propiedad' | 'soat' | 'tecnomecanica';
interface Adjunto { id: string; blob: Blob; nombre: string; preview: string | null; }

/**
 * Documentos de agente: datos personales, licencia de conducción, vehículo, SOAT y técnico-mecánica con sus archivos.
 * Es un repositorio aparte del preoperacional: no valida ni bloquea la marcación. Mismo backend que la web
 * (`/agentes-documentos/mio`); la cédula y el nombre salen del perfil, no se digitan.
 */
@Component({
  selector: 'app-agentes-documentos',
  templateUrl: './agentes-documentos.page.html',
  styleUrls: ['../preoperacional/preoperacional.page.scss', './agentes-documentos.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class AgentesDocumentosPage implements OnInit, OnDestroy {
  cargando = true;
  enviando = false;
  errorCarga = '';
  guardado = false;
  identidad = { nombre: '', cedula: '' };
  perfil: any = null;
  /** Archivos ya guardados en el servidor (vigentes). */
  archivos: any[] = [];
  placaPreop = '';
  hoy = '';
  errores: Record<string, string> = {};
  categorias = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

  f = {
    ciudad: '', telefono: '', licNumero: '', licCategoria: '', licVence: '', licTieneRestriccion: false, licRestriccion: '',
    placa: '', marca: '', modelo: '' as string | number, color: '', cilindraje: '', licTransito: '', propietario: '', soatVence: '', tecnoVence: '',
  };
  nuevos: Record<string, Adjunto[]> = { licencia: [], tarjeta_propiedad: [], soat: [], tecnomecanica: [] };

  readonly docs: { tipo: Tipo; n: number; titulo: string }[] = [
    { tipo: 'licencia', n: 9, titulo: 'Licencia de conducción vigente, por ambas caras' },
    { tipo: 'tarjeta_propiedad', n: 17, titulo: 'Licencia de tránsito vigente, por ambas caras' },
    { tipo: 'soat', n: 19, titulo: 'SOAT vigente del vehículo' },
    { tipo: 'tecnomecanica', n: 21, titulo: 'Certificado vigente de la revisión técnico-mecánica' },
  ];

  constructor(
    private router: Router,
    private api: ApiService,
    private auth: AuthService,
    private toastCtrl: ToastController,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'camera-outline': cameraOutline,
      'close-outline': closeOutline,
      'checkmark-outline': checkmarkOutline,
      'warning-outline': warningOutline,
      'log-out-outline': logOutOutline,
      'document-outline': documentOutline,
      'cloud-upload-outline': cloudUploadOutline,
    });
  }

  async ngOnInit() {
    if (!this.auth.hasPermiso('agentes_docs.registrar')) {
      this.router.navigate(['/marcacion'], { replaceUrl: true });
      return;
    }
    try {
      const d = await this.api.getDocsAgente();
      this.identidad = d.identidad;
      this.archivos = d.archivos;
      this.hoy = d.hoy;
      this.placaPreop = d.placaPreop || '';
      this.perfil = d.perfil;
      if (d.perfil) this.cargarForm(d.perfil);
      // Si ya hizo el preoperacional y aún no tiene placa aquí, se precarga la de su preoperacional.
      if (!this.f.placa && this.placaPreop) this.f.placa = this.placaPreop;
    } catch (e) {
      this.errorCarga = this.msg(e);
    } finally {
      this.cargando = false;
    }
  }

  ngOnDestroy() { this.liberar(); }

  private cargarForm(p: any) {
    Object.assign(this.f, {
      ciudad: p.ciudad || '', telefono: p.telefono || '', licNumero: p.licNumero || '', licCategoria: p.licCategoria || '',
      licVence: p.licVence || '', licTieneRestriccion: !!p.licTieneRestriccion, licRestriccion: p.licRestriccion || '',
      placa: p.placa || '', marca: p.marca || '', modelo: p.modelo || '', color: p.color || '', cilindraje: p.cilindraje || '',
      licTransito: p.licTransito || '', propietario: p.propietario || '', soatVence: p.soatVence || '', tecnoVence: p.tecnoVence || '',
    });
  }

  volver() { this.router.navigate(['/marcacion']); }
  async cerrarSesion() { await this.auth.clearSession(); this.router.navigate(['/home'], { replaceUrl: true }); }

  // ── Avisos de vencimiento ─────────────────────────────────────────────────
  get vencimientos(): { nombre: string; fecha: string; dias: number }[] {
    const p = this.perfil;
    if (!p) return [];
    return [
      { nombre: 'Licencia de conducción', fecha: p.licVence, dias: p.licDias },
      { nombre: 'SOAT', fecha: p.soatVence, dias: p.soatDias },
      { nombre: 'Revisión técnico-mecánica', fecha: p.tecnoVence, dias: p.tecnoDias },
    ].filter((v) => v.dias !== null && v.dias !== undefined && v.dias <= 30);
  }
  fechaCorta(iso: string): string { return iso ? iso.split('-').reverse().join('/') : ''; }

  vigencia(fecha: string): { txt: string; cls: string } | null {
    if (!fecha || !this.hoy) return null;
    const dias = Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(this.hoy + 'T00:00:00Z')) / 86400000);
    if (dias < 0) return { txt: `Vencido hace ${Math.abs(dias)} días`, cls: 'bad' };
    if (dias <= 30) return { txt: `Vence en ${dias} día${dias === 1 ? '' : 's'}`, cls: 'warn' };
    return { txt: `Vigente · ${dias} días`, cls: 'ok' };
  }

  // ── Entradas ──────────────────────────────────────────────────────────────
  onPlaca(v: string) { this.f.placa = v.toUpperCase().replace(/[^A-Z0-9]/g, ''); delete this.errores['placa']; }
  soloNum(campo: 'modelo', v: string) { this.f[campo] = v.replace(/\D/g, '').slice(0, 4); }
  limpiar(k: string) { delete this.errores[k]; }
  usarPlacaPreop() { this.f.placa = this.placaPreop; delete this.errores['placa']; }

  // ── Archivos ──────────────────────────────────────────────────────────────
  vigentes(tipo: Tipo): any[] { return this.archivos.filter((a) => a.tipo === tipo); }

  private comprimir(file: File): Promise<Blob | null> {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, 1800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => res(b), 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  /** Cámara o galería/archivos del celular (PDF, JPG o PNG). */
  elegir(tipo: Tipo, camara: boolean) {
    if (this.nuevos[tipo].length >= MAX_POR_TIPO) { this.toast(`Máximo ${MAX_POR_TIPO} archivos por documento.`); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = camara ? 'image/*' : '.pdf,.jpg,.jpeg,.png,image/*,application/pdf';
    if (camara) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const file = inp.files?.[0];
      inp.remove();
      if (!file) return;
      if (!camara && !EXT_RE.test(file.name) && !file.type.startsWith('image/')) { this.toast('Solo PDF, JPG o PNG.'); return; }
      if (file.size > MAX_MB * 1048576 && !file.type.startsWith('image/')) { this.toast(`El archivo supera ${MAX_MB} MB.`); return; }
      let blob: Blob = file;
      let nombre = file.name || 'documento';
      if (file.type.startsWith('image/')) {
        const c = await this.comprimir(file);
        if (!c) { this.toast('No se pudo procesar la imagen.'); return; }
        blob = c;
        nombre = nombre.replace(/\.[^.]+$/, '') + '.jpg';
      }
      if (blob.size > MAX_MB * 1048576) { this.toast(`El archivo supera ${MAX_MB} MB.`); return; }
      this.nuevos[tipo].push({
        id: Math.random().toString(36).slice(2, 9), blob, nombre,
        preview: blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null,
      });
      delete this.errores['arch_' + tipo];
    };
    inp.click();
  }

  quitar(tipo: Tipo, id: string) {
    const l = this.nuevos[tipo];
    const i = l.findIndex((a) => a.id === id);
    if (i > -1) { if (l[i].preview) URL.revokeObjectURL(l[i].preview!); l.splice(i, 1); }
  }

  private liberar() {
    Object.values(this.nuevos).forEach((l) => l.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)));
    this.nuevos = { licencia: [], tarjeta_propiedad: [], soat: [], tecnomecanica: [] };
  }

  // ── Validación y envío ────────────────────────────────────────────────────
  private validar(): boolean {
    const e: Record<string, string> = {};
    const obl = (k: keyof typeof this.f, msg = 'Campo obligatorio.') => { if (!String(this.f[k] ?? '').trim()) e[k] = msg; };
    (['ciudad', 'telefono', 'licNumero', 'licCategoria', 'placa', 'marca', 'color', 'cilindraje', 'licTransito', 'propietario'] as const).forEach((k) => obl(k));
    (['licVence', 'soatVence', 'tecnoVence'] as const).forEach((k) => obl(k, 'Seleccione la fecha.'));
    if (this.f.telefono && !TELEFONO_RE.test(this.f.telefono)) e['telefono'] = 'Número no válido.';
    if (this.f.licTieneRestriccion) obl('licRestriccion', 'Indique la restricción.');
    if (this.f.placa && !PLACA_RE.test(this.f.placa)) e['placa'] = 'Placa inválida. Formato esperado: ABC12D.';
    const anio = Number(this.f.modelo);
    if (!anio || anio < 1980 || anio > new Date().getFullYear() + 1) e['modelo'] = 'Año no válido.';
    for (const d of this.docs) if (!this.nuevos[d.tipo].length && !this.vigentes(d.tipo).length) e['arch_' + d.tipo] = 'Adjunte el documento.';
    this.errores = e;
    return !Object.keys(e).length;
  }

  async guardar() {
    if (this.enviando) return;
    this.guardado = false;
    if (!this.validar()) {
      this.toast('Complete lo marcado en rojo para continuar.');
      setTimeout(() => document.querySelector('.pf-err')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
      return;
    }
    this.enviando = true;
    try {
      const payload = { ...this.f, modelo: Number(this.f.modelo), licRestriccion: this.f.licTieneRestriccion ? this.f.licRestriccion : '' };
      const archivos: Record<string, { blob: Blob; nombre: string }[]> = {};
      for (const d of this.docs) if (this.nuevos[d.tipo].length) archivos[d.tipo] = this.nuevos[d.tipo].map((a) => ({ blob: a.blob, nombre: a.nombre }));
      const r = await this.api.guardarDocsAgente(payload, archivos);
      this.archivos = r.archivos;
      this.perfil = r.perfil;
      this.liberar();
      this.guardado = true;
      this.toast('Tu información quedó guardada.');
      document.querySelector('ion-content')?.scrollToTop?.(300);
    } catch (e) {
      this.errores = { general: this.msg(e) };
      this.toast(this.msg(e));
    } finally {
      this.enviando = false;
    }
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m || (e?.status === 0 ? 'Sin conexión con el servidor.' : 'No se pudo completar la operación.'));
  }

  async toast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 3000, position: 'top' });
    await t.present();
  }
}
