import { Component } from '@angular/core';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage {
  private isDev = false;
  private readonly adminRole = 'admin';

  constructor(private authService: AuthService) {
    this.authService.authenticationState$.subscribe((user) => {
      this.isDev = user.role == this.adminRole;
    });
  }
}
