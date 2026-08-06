import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { ConnectivityService } from './connectivity.service';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private connectivity: ConnectivityService,
    private auth: AuthService,
  ) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const token = this.auth.token;
    const authReq = token
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

    return next.handle(authReq).pipe(
      tap({
        error: (err: HttpErrorResponse) => {
          // status 0 = no hubo respuesta del servidor (caído, reiniciando, sin red)
          if (err.status === 0) this.connectivity.reportOffline();
        },
      })
    );
  }
}
