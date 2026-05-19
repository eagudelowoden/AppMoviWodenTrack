import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { addIcons } from 'ionicons';
// Añadimos eyeOutline y eyeOffOutline a las importaciones
import { shieldCheckmark, personOutline, lockClosedOutline, eyeOutline, eyeOffOutline, cloudDownloadOutline } from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false, 
  encapsulation: ViewEncapsulation.None 
})
export class HomePage implements OnInit {

  userForm = { usuario: '', password: '' };
  showPassword  = false;
  appVersion    = '...';
  hasNewVersion = false;
  newVersion    = '';

  constructor(
    private router: Router,
    private api: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController
  ) {
    // 2. Agregamos los iconos del "ojo" al registro de iconos
    addIcons({
      'shield-checkmark':      shieldCheckmark,
      'person-outline':        personOutline,
      'lock-closed-outline':   lockClosedOutline,
      'eye-outline':           eyeOutline,
      'eye-off-outline':       eyeOffOutline,
      'cloud-download-outline': cloudDownloadOutline,
    });
  }

  async ngOnInit() {
    this.appVersion = await this.api.getVersion();
    await this.checkNewVersion();
  }

  private async checkNewVersion() {
    try {
      const info = await this.api.getApkInfo();
      if (!info?.version) return;
      const dismissed = localStorage.getItem('apk_dismissed_version');
      if (dismissed !== String(info.version)) {
        this.hasNewVersion = true;
        this.newVersion    = info.version;
      }
    } catch {}
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async ingresar() {
    if (!this.userForm.usuario || !this.userForm.password) {
      this.mostrarAlerta('Campos Vacíos', 'Por favor ingresa tu usuario y contraseña.');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Autenticando...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      const data = await this.api.login(this.userForm.usuario, this.userForm.password);
      await loading.dismiss();

      this.router.navigate(['/marcacion'], { 
        state: { user: data } 
      });

    } catch (error: any) {
      await loading.dismiss();
      let mensaje = 'No se pudo conectar con el servidor.';
      if (error.status === 401) mensaje = 'Contraseña incorrecta.';
      if (error.status === 404) mensaje = 'El usuario no existe.';

      this.mostrarAlerta('Error de Acceso', mensaje);
    }
  }

  async mostrarAlerta(header: string, message: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['Aceptar']
    });
    await alert.present();
  }
}