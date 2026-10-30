import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  private get baseUrl() {
    return this.apiUrl.replace(/\/usuarios\/?$/, '');
  }

  constructor(private http: HttpClient) {}

  async login(usuario: string, password: string) {
    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/login`, { usuario, password })
    );
  }

  // Envía la acción explícita ('in' | 'out') para evitar doble marcación en el backend
  async marcarAsistencia(employeeId: number, action: 'in' | 'out') {
    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/attendance`, {
        employee_id: employeeId,
        action,
      })
    );
  }

  async getMallaHoy(employeeId: number) {
    return firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/malla-hoy/${employeeId}`)
    );
  }

  // Recalcula los permisos vigentes de la sesión — la web y la app cachean
  // `permisos` desde el login y nunca lo vuelven a pedir solas, así que si un
  // admin cambia un permiso con la sesión ya abierta, hay que llamar esto
  // para que se refleje sin pedirle a la persona que cierre sesión.
  async getPermisosSesion(employeeId: number) {
    return firstValueFrom(
      this.http.get<Record<string, boolean>>(`${this.apiUrl}/permisos-sesion/${employeeId}`)
    );
  }

  async getApkInfo() {
    return firstValueFrom(
      this.http.get<any>(`${this.baseUrl}/apk/info`)
    );
  }

  async getOfficialTime() {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/hora-oficial`));
  }

  async reportarFalla(data: {
    empleado_id: number;
    nombre: string;
    descripcion: string;
  }) {
    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/reportar-falla`, { ...data, origen: 'android' })
    );
  }

  /** Informa al servidor qué versión de la app tiene esta persona (para saber cuántos actualizaron). */
  async reportarInstalacion(version: string, versionCode: number) {
    return firstValueFrom(this.http.post<any>(`${this.baseUrl}/apk/instalacion`, { version, versionCode, plataforma: 'android' }));
  }

  /** Mis reportes de falla con la respuesta del administrador. */
  async misReportesFalla() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/mis-reportes-falla`));
  }

  async marcarRespuestasFallaLeidas() {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/mis-reportes-falla/leidas`, {}));
  }

  async getAttendanceStatus(employeeId: number) {
    return firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/attendance-status/${employeeId}`)
    );
  }

  // ── Marcación Ecuador con GPS (mismo backend que la web) ─────────────────────
  async getEstadoMarcacionGps(idOdoo: number) {
    return firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/marcacion-ecuador/estado/${idOdoo}`)
    );
  }

  async marcarConGps(payload: {
    id_odoo: number;
    cedula?: string;
    nombre: string;
    tipo: 'entrada' | 'salida';
    latitud?: number | null;
    longitud?: number | null;
    company?: string;
  }) {
    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/marcacion-ecuador/marcar`, payload)
    );
  }

  async getSerialesRecuperados(
    fecha: string,
    fechaFin?: string,
    documento?: string,
    agente?: string,
  ) {
    const body: {
      fecha: string;
      fecha_fin: string;
      documento?: string;
      agente?: string;
    } = { fecha, fecha_fin: fechaFin || fecha };
    if (documento) body.documento = documento;
    if (agente) body.agente = agente;
    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/wfsm/seriales-recuperados`, body)
    );
  }

  // ── Novedades (mismo backend/endpoints que la web) ────────────────────────
  async getMisNovedades(idOdoo: number, filtros?: { fechaDesde?: string; fechaHasta?: string; buscar?: string }) {
    let params = `idOdoo=${idOdoo}`;
    if (filtros?.fechaDesde) params += `&fechaDesde=${filtros.fechaDesde}`;
    if (filtros?.fechaHasta) params += `&fechaHasta=${filtros.fechaHasta}`;
    if (filtros?.buscar) params += `&buscar=${encodeURIComponent(filtros.buscar)}`;
    return firstValueFrom(
      this.http.get<any[]>(`${this.apiUrl}/novedades/mis-novedades?${params}`)
    );
  }

  async crearNovedad(payload: {
    nombre: string;
    cedula: string;
    descripcion: string;
    tipificacion: string;
    fechaInicio: string;
    fechaFin: string;
    ultimoDiaTrabajado?: string | null;
    creadoPor?: number | null;
    archivos?: File[];
  }) {
    const fd = new FormData();
    fd.append('nombre', payload.nombre);
    fd.append('cedula', payload.cedula);
    fd.append('descripcion', payload.descripcion);
    fd.append('tipificacion', payload.tipificacion ?? '');
    fd.append('fechaInicio', payload.fechaInicio);
    fd.append('fechaFin', payload.fechaFin);
    if (payload.ultimoDiaTrabajado) fd.append('ultimoDiaTrabajado', payload.ultimoDiaTrabajado);
    fd.append('storageMode', 'local');
    if (payload.creadoPor != null) fd.append('creadoPor', String(payload.creadoPor));
    for (const file of payload.archivos ?? []) fd.append('archivos', file);

    return firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/novedades`, fd)
    );
  }

  // ── Preoperacional moto (mismo backend que la web; fotos van a S3 desde el servidor) ──
  async getPreopConfig() {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/preoperacional-moto/config`));
  }

  async getPreopMantenimientoEstado(placa: string) {
    return firstValueFrom(
      this.http.get<any>(`${this.apiUrl}/preoperacional-moto/mantenimiento/estado`, { params: { placa } })
    );
  }

  async guardarPreopMantenimiento(payload: any, fotos: Blob[]) {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    fotos.forEach((b, i) => fd.append('mant', b, `mant-${i + 1}.jpg`));
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/preoperacional-moto/mantenimiento`, fd));
  }

  async guardarPreopInspeccion(payload: any, fotos: Record<string, Blob[]>) {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    for (const [item, lista] of Object.entries(fotos)) {
      lista.forEach((b, i) => fd.append(item, b, `${item}-${i + 1}.jpg`));
    }
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/preoperacional-moto/inspecciones`, fd));
  }

  /**
   * Las fotos guardadas en el servidor (modo "local") llegan con una ruta relativa
   * (/usuarios/preoperacional-moto/evidencia-local?...). En la web se resuelve contra el mismo dominio, pero en la app
   * el origen es capacitor://localhost, así que hay que anteponer el origen del backend.
   */
  private absolutizarUrls<T>(dato: T): T {
    const origen = this.apiUrl.replace(/\/usuarios\/?$/, '');
    const recorrer = (v: any): void => {
      if (Array.isArray(v)) { v.forEach(recorrer); return; }
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) {
        if (k === 'url' && typeof v[k] === 'string' && v[k].startsWith('/')) v[k] = origen + v[k];
        else recorrer(v[k]);
      }
    };
    recorrer(dato);
    return dato;
  }

  /**
   * Qué preoperacional le falta hoy al agente (primero el mensual, luego el diario). Si falta alguno, el servidor marca la
   * entrada en esta misma llamada (idempotente). Responde 403 a quien no tiene permiso de preoperacional.
   */
  async getPreopPendientes(): Promise<{ siguiente: 'mensual' | 'diario' | null; placa: string | null; mes: string; asistencia: { marcada: boolean; hora?: string | null; mensaje?: string } | null }> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/preoperacional-moto/pendientes`));
  }

  /** PDF de lo diligenciado, con el enlace cifrado (/cif/<token>) a las fotos. Devuelve el archivo en base64. */
  async descargarPreopPdf(tipo: 'inspecciones' | 'mantenimientos', id: number): Promise<{ base64: string; nombre: string }> {
    const res = await firstValueFrom(
      this.http.get(`${this.apiUrl}/preoperacional-moto/${tipo}/${id}/pdf`, { responseType: 'blob', observe: 'response' }),
    );
    const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `preoperacional-${id}.pdf`;
    const blob = res.body as Blob;
    const base64 = await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1] || '');
      r.onerror = () => fail(r.error);
      r.readAsDataURL(blob);
    });
    return { base64, nombre };
  }

  /** Estado de la revisión diaria de hoy: una sola por agente y día; otra solo con autorización de la coordinación. */
  async getPreopDiarioEstado(): Promise<{ registrada: boolean; placa: string | null; autorizada: boolean; solicitud: { estado: string; coordinador?: string; respuesta?: string } | null }> {
    return firstValueFrom(this.http.get<any>(`${this.apiUrl}/preoperacional-moto/diario/estado`));
  }

  /** El agente pide al coordinador que lo habilite a diligenciar el mensual fuera de plazo (o autorice una 2.ª revisión diaria). */
  async crearSolicitudPreop(placa: string, motivo: string, tipo: 'mensual' | 'diario' = 'mensual') {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/preoperacional-moto/solicitudes`, { placa, motivo, tipo }));
  }

  async getMisPreop() {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/preoperacional-moto/inspecciones/mias`));
  }

  async getMisPreopMant() {
    return this.absolutizarUrls(
      await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/preoperacional-moto/mantenimientos/mios`)),
    );
  }

  async getPreopDetalle(id: number) {
    return this.absolutizarUrls(
      await firstValueFrom(this.http.get<any>(`${this.apiUrl}/preoperacional-moto/inspecciones/${id}`)),
    );
  }


  async getVersion(): Promise<string> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ version: string }>(`${this.baseUrl}/version`)
      );
      return res.version || '—';
    } catch {
      return '—';
    }
  }
}
