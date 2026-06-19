import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ConnectivityService {
  private onlineSubject = new BehaviorSubject<boolean>(true);
  online$ = this.onlineSubject.asObservable();

  private readonly healthUrl: string;
  private readonly pollMs = 10000;
  private pollHandle: any = null;

  constructor(private http: HttpClient) {
    this.healthUrl = environment.apiUrl.replace(/\/usuarios\/?$/, '') + '/version';
  }

  start() {
    if (this.pollHandle) return;
    this.checkNow();
    this.pollHandle = setInterval(() => this.checkNow(), this.pollMs);
  }

  stop() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  // Llamado por el interceptor cuando una petición real falla por conexión (status 0)
  reportOffline() {
    if (this.onlineSubject.value) this.onlineSubject.next(false);
  }

  private checkNow() {
    this.http.get(this.healthUrl).subscribe({
      next: () => this.onlineSubject.next(true),
      error: () => this.onlineSubject.next(false),
    });
  }
}
