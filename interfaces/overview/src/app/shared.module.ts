import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { LoginFormComponent } from './components/login-form/login-form.component';
import { MapComponent } from './components/map/map.component';
import { MatrixComponent } from './components/matrix/matrix.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [LoginFormComponent, MapComponent, MatrixComponent],
  exports: [LoginFormComponent, MapComponent, MatrixComponent],
})
export class SharedModule {}
