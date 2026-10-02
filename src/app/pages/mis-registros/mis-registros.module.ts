import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { MisRegistrosPage } from './mis-registros.page';

const routes: Routes = [{ path: '', component: MisRegistrosPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [MisRegistrosPage],
})
export class MisRegistrosPageModule {}
