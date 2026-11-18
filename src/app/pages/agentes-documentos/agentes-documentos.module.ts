import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { AgentesDocumentosPage } from './agentes-documentos.page';

const routes: Routes = [{ path: '', component: AgentesDocumentosPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [AgentesDocumentosPage],
})
export class AgentesDocumentosPageModule {}
