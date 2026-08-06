import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { ConnectivityService } from './services/connectivity.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  online = true;
  private sessionClosing = false;

  // Pantalla de bienvenida al abrir la app — continúa la transición después
  // del splash nativo (que ya se ve fondo blanco + reloj) con algo de marca
  // ("Bienvenido") mientras Angular termina de montar la primera pantalla.
  showWelcome = true;
  private readonly WELCOME_MS = 1300;

  constructor(
    public connectivity: ConnectivityService,
    private router: Router,
    private alertCtrl: AlertController,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    setTimeout(() => (this.showWelcome = false), this.WELCOME_MS);

    this.connectivity.online$.subscribe((isOnline) => {
      this.online = isOnline;
      if (!isOnline) this.handleDisconnect();
    });
    this.connectivity.start();
  }

  private async handleDisconnect() {
    const hayToken = this.auth.isLoggedIn();
    const enLogin = this.router.url.startsWith('/home') || this.router.url === '/';
    if (this.sessionClosing || !hayToken || enLogin) return;

    this.sessionClosing = true;
    await this.auth.clearSession();

    const alert = await this.alertCtrl.create({
      header: 'Conexión perdida',
      message:
        'Se perdió la conexión con el servidor. Tu sesión se cerrará por seguridad.',
      buttons: ['Aceptar'],
      backdropDismiss: false,
    });
    await alert.present();
    await alert.onDidDismiss();

    this.router.navigate(['/home']);
    this.sessionClosing = false;
  }
}
