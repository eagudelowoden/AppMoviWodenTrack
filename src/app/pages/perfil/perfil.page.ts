import { Component, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline, personCircleOutline, briefcaseOutline,
  businessOutline, idCardOutline, layersOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None,
})
export class PerfilPage {

  constructor(
    private router: Router,
    private auth: AuthService,
  ) {
    addIcons({
      'arrow-back-outline': arrowBackOutline,
      'person-circle-outline': personCircleOutline,
      'briefcase-outline': briefcaseOutline,
      'business-outline': businessOutline,
      'id-card-outline': idCardOutline,
      'layers-outline': layersOutline,
    });
  }

  get session() {
    return this.auth.session;
  }

  /** Iniciales para el avatar: primer apellido + primer nombre. */
  get iniciales(): string {
    const p = (this.session?.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    const a = p[0]?.[0] ?? '';
    const b = p.length >= 3 ? p[2]?.[0] : (p[1]?.[0] ?? '');
    return (a + (b ?? '')).toUpperCase();
  }

  volver() {
    this.router.navigate(['/marcacion']);
  }
}
