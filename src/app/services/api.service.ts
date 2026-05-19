import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  //private apiUrl = 'http://18.217.246.39:8082/usuarios';
  private apiUrl = 'http://localhost:8082/usuarios';

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
