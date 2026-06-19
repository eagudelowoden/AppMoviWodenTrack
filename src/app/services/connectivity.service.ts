import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ConnectivityService {
  private onlineSubject = new BehaviorSubject<boolean>(true);
  online$ = this.onlineSubject.asObservable();

  private readonly baseUrl: string;
  private readonly healthUrl: string;
  // Polling de respaldo (más lento) por si el socket no pudo ni conectar
  private readonly pollMs = 10000;
  private pollHandle: any = null;
  private socket: Socket | null = null;

  constructor(private http: HttpClient) {
    this.baseUrl = environment.apiUrl.replace(/\/usuarios\/?$/, '');
    this.healthUrl = this.baseUrl + '/version';
  }

  start() {
    this.connectSocket();
    if (this.pollHandle) return;
    this.checkNow();
    this.pollHandle = setInterval(() => this.checkNow(), this.pollMs);
  }

  stop() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }

  // Llamado por el interceptor cuando una petición real falla por conexión (status 0)
  reportOffline() {
    if (this.onlineSubject.value) this.onlineSubject.next(false);
  }

  private connectSocket() {
    if (this.socket) return;
    this.socket = io(`${this.baseUrl}/interno`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    // Conexión/reconexión confirmada → el backend está vivo
    this.socket.on('connect', () => this.onlineSubject.next(true));

    // Se cae la conexión (backend caído/reiniciando) → aviso INSTANTÁNEO,
    // no hay que esperar al polling
    this.socket.on('disconnect', () => this.onlineSubject.next(false));
    this.socket.on('connect_error', () => this.onlineSubject.next(false));
  }

  private checkNow() {
    this.http.get(this.healthUrl).subscribe({
      next: () => this.onlineSubject.next(true),
      error: () => this.onlineSubject.next(false),
    });
  }
}
