import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { App } from '@capacitor/app';
import { environment } from '../../environments/environment';

// Margen tras volver del background antes de confiar en una señal de caída
// (el socket y la red tardan un instante en restablecerse al reanudar la app).
const RESUME_GRACE_MS = 8000;
// Tiempo que se le da al socket para reconectar solo antes de confirmar por HTTP.
const RECONNECT_WAIT_MS = 3000;

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

  private isPaused = false;
  private resumeGraceUntil = 0;
  private confirmando = false;

  constructor(private http: HttpClient, private ngZone: NgZone) {
    this.baseUrl = environment.apiUrl.replace(/\/usuarios\/?$/, '');
    this.healthUrl = this.baseUrl + '/version';
  }

  start() {
    this.listenAppLifecycle();
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
    this.handlePosibleCaida();
  }

  // Distingue "la app pasó a segundo plano" (el SO cierra el socket, es normal)
  // de una caída real del backend, y da un margen al volver antes de juzgar.
  private listenAppLifecycle() {
    App.addListener('pause', () => {
      this.ngZone.run(() => (this.isPaused = true));
    });

    App.addListener('resume', () => {
      this.ngZone.run(() => {
        this.isPaused = false;
        this.resumeGraceUntil = Date.now() + RESUME_GRACE_MS;
        if (!this.socket?.connected) this.socket?.connect();
        this.checkNow();
      });
    });
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

    // Ya no se marca offline al instante: puede ser solo que la app pasó a
    // segundo plano (el SO corta el socket) y no una caída real del backend.
    this.socket.on('disconnect', () => this.handlePosibleCaida());
    this.socket.on('connect_error', () => this.handlePosibleCaida());
  }

  // Señal de posible caída (socket o petición HTTP fallida): se ignora si la
  // app está en background o recién volvió de background, y se confirma con
  // un chequeo HTTP antes de avisar que el servidor realmente está caído.
  private handlePosibleCaida() {
    if (this.isPaused) return; // esperado si está en background
    if (Date.now() < this.resumeGraceUntil) return; // recién volvió, dale un respiro
    if (this.confirmando) return;

    this.confirmando = true;
    setTimeout(() => {
      if (this.socket?.connected) {
        this.confirmando = false;
        this.onlineSubject.next(true);
        return;
      }
      this.http.get(this.healthUrl).subscribe({
        next: () => {
          this.confirmando = false;
          this.onlineSubject.next(true);
        },
        error: () => {
          this.confirmando = false;
          this.onlineSubject.next(false);
        },
      });
    }, RECONNECT_WAIT_MS);
  }

  private checkNow() {
    if (this.isPaused) return; // no gastar batería/datos chequeando en background
    this.http.get(this.healthUrl).subscribe({
      next: () => this.onlineSubject.next(true),
      error: () => this.handlePosibleCaida(),
    });
  }
}
