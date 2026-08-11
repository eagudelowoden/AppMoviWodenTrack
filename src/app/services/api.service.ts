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
      this.http.post<any>(`${this.apiUrl}/reportar-falla`, data)
    );
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

  async getSerialesRecuperados(fecha: string, documento?: string, agente?: string) {
    const body: { fecha: string; documento?: string; agente?: string } = { fecha };
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
