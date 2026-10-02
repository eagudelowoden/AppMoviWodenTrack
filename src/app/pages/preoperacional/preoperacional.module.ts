import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { PreoperacionalPageRoutingModule } from './preoperacional-routing.module';
import { PreoperacionalPage } from './preoperacional.page';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, PreoperacionalPageRoutingModule],
  declarations: [PreoperacionalPage],
})
export class PreoperacionalPageModule {}
