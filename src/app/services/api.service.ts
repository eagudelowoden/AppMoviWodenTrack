import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  
  // Servidor de lógica y usuarios (NestJS)
  private apiUrl = 'http://18.217.246.39:8082/usuarios'; 
  //private apiUrl = 'http://localhost:8082/usuarios'; 
  
  // Servidor de hora oficial
  private timeUrl = 'http://3.133.217.145:8081';

  constructor(private http: HttpClient) { }



  // 2. Login de usuario
  async login(usuario: string, password: string) {
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/login`, { usuario, password }));
  }

  // 3. Marcación de asistencia (ACTUALIZADO para recibir la hora)
  async marcarAsistencia(employeeId: number, horaOficial: string) {
    // Enviamos ambos datos en el cuerpo del POST
    return firstValueFrom(this.http.post<any>(`${this.apiUrl}/attendance`, { 
      employee_id: employeeId,
      fecha_hora: horaOficial // Este campo lo recibirá tu NestJS
    }));
  }
  async getOfficialTime() {
  // Ahora llamamos a nuestro propio NestJS (él hace el puente)
  return firstValueFrom(this.http.get<any>(`${this.apiUrl}/hora-oficial`));
}
}