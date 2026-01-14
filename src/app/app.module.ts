import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

// 1. IMPORTAR HttpClientModule
import { HttpClientModule } from '@angular/common/http'; 

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

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
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})
export class AppModule {}