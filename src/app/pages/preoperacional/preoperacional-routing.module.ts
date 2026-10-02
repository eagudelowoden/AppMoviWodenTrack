import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PreoperacionalPage } from './preoperacional.page';

const routes: Routes = [
  {
    path: '',
    component: PreoperacionalPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PreoperacionalPageRoutingModule {}
