import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AlertController, LoadingController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logOutOutline, timeOutline, checkmarkCircle, closeCircle } from 'ionicons/icons';

@Component({
  selector: 'app-marcacion',
  templateUrl: './marcacion.page.html',
  styleUrls: ['./marcacion.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class MarcacionPage implements OnInit {

  userData: any = null;
  reloj: string = '';
  fecha: string = '';
  isInside: boolean = false;
  dayCompleted: boolean = false; // Nueva variable para el bloqueo
  isOnline: boolean = navigator.onLine;
  
  private timeOffset: number = 0; 

  constructor(
    private router: Router,
    private api: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController
  ) {
    addIcons({ 
      'log-out-outline': logOutOutline, 
      'time-outline': timeOutline, 
      'checkmark-circle': checkmarkCircle,
      'close-circle': closeCircle 
    });
    
    const nav = this.router.getCurrentNavigation();
    if (nav?.extras.state) {
      this.userData = nav.extras.state['user'];
      this.isInside = this.userData?.is_inside || false;
      // Recuperamos el estado del día desde el login de NestJS
      this.dayCompleted = this.userData?.day_completed || false;
    }
  }

  async ngOnInit() {
    if (!this.userData) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);

    // Sincronización de hora (tu lógica original)
    await this.sincronizarRelojOficial();

    // Reloj en vivo
    setInterval(() => this.actualizarReloj(), 1000);
  }

  async sincronizarRelojOficial() {
    try {
      const data = await this.api.getOfficialTime();
      const serverTime = new Date(data.local_time).getTime();
      const deviceTime = new Date().getTime();
      this.timeOffset = serverTime - deviceTime;
      console.log('Sincronización exitosa. Offset:', this.timeOffset, 'ms');
    } catch (error) {
      console.error('Error sincronizando hora oficial.', error);
      this.timeOffset = 0; 
    }
  }

  actualizarReloj() {
    const now = new Date(new Date().getTime() + this.timeOffset);
    this.reloj = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    this.fecha = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  async realizarMarcacion() {
    const loading = await this.loadingCtrl.create({ 
      message: 'Validando marcación...', 
      spinner: 'crescent' 
    });
    await loading.present();

    try {
      // 1. Hora oficial para el envío (Seguridad)
      const timeData = await this.api.getOfficialTime();
      
      // 2. Llamada al servicio con los dos parámetros (ID y Hora)
      const response = await this.api.marcarAsistencia(
        this.userData.employee_id,
        timeData.odoo_utc_time
      );

      await loading.dismiss();

      if (response.status === 'success') {
        // Actualizamos estado visual de entrada/salida
        this.isInside = (response.type === 'in');

        // BLOQUEO: Si el servidor dice que marcó SALIDA ('out'), 
        // el día se considera completado hasta el nuevo login.
        if (response.type === 'out') {
          this.dayCompleted = true;
        }

        const titulo = response.type === 'in' ? '¡Entrada Registrada!' : '¡Salida Registrada!';
        this.mostrarAlerta(titulo, response.message, 'success');
      }

    } catch (error) {
      await loading.dismiss();
      this.mostrarAlerta('Error de Marcación', 'No se pudo conectar con el servidor.', 'danger');
    }
  }

  logout() {
    this.userData = null;
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  async mostrarAlerta(header: string, message: string, color: string) {
    const alert = await this.alertCtrl.create({
      header,
      message,
      cssClass: `custom-alert-${color}`, 
      buttons: ['ENTENDIDO']
    });
    await alert.present();
  }
}