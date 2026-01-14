import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarcacionPage } from './marcacion.page';

const routes: Routes = [
  {
    path: '',
    component: MarcacionPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarcacionPageRoutingModule {}
