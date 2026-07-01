import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ComprobantesPage } from './comprobantes.page';

const routes: Routes = [
  {
    path: '',
    component: ComprobantesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ComprobantesPageRoutingModule {}
