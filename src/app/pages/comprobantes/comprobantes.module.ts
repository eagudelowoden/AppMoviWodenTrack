import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ComprobantesPageRoutingModule } from './comprobantes-routing.module';

import { ComprobantesPage } from './comprobantes.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ComprobantesPageRoutingModule
  ],
  declarations: [ComprobantesPage]
})
export class ComprobantesPageModule {}
