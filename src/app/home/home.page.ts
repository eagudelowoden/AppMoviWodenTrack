import { Component, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { addIcons } from 'ionicons';
// Añadimos eyeOutline y eyeOffOutline a las importaciones
import { shieldCheckmark, personOutline, lockClosedOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false, 
  encapsulation: ViewEncapsulation.None 
})
export class HomePage {

  userForm = {
    usuario: '',
    password: ''
  };

  // 1. Variable para controlar la visibilidad
  showPassword = false;

  constructor(
    private router: Router,
    private api: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController
  ) {
    // 2. Agregamos los iconos del "ojo" al registro de iconos
    addIcons({ 
      'shield-checkmark': shieldCheckmark, 
      'person-outline': personOutline, 
      'lock-closed-outline': lockClosedOutline,
      'eye-outline': eyeOutline,
      'eye-off-outline': eyeOffOutline
    });
  }

  // 3. Función para alternar el estado
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