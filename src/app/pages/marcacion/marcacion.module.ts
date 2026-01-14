import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarcacionPageRoutingModule } from './marcacion-routing.module';

import { MarcacionPage } from './marcacion.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MarcacionPageRoutingModule
  ],
  declarations: [MarcacionPage]
})
export class MarcacionPageModule {}
