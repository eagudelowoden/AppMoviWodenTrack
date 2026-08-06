import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

// 1. IMPORTAR HttpClientModule
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AuthInterceptor } from './services/auth.interceptor';
import { AuthService } from './services/auth.service';

// Hidrata la sesión (token + permisos) desde Capacitor Preferences ANTES de
// que Angular termine de arrancar — así los route guards y el primer
// request HTTP ya ven la sesión correcta, sin condición de carrera.
function initAuth(auth: AuthService) {
  return () => auth.init();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    // 2. CONFIGURAR EL MODO IOS PARA EVITAR ESTILOS NATIVOS DE ANDROID
    IonicModule.forRoot({
      // mode: 'md'
    }),
    AppRoutingModule,
    // 3. AGREGAR EL MÓDULO HTTP
    HttpClientModule
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: APP_INITIALIZER, useFactory: initAuth, deps: [AuthService], multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}