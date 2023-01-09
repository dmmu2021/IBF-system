import { Component, OnInit } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { AnalyticsPage } from 'src/app/analytics/analytics.enum';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { AuthService } from 'src/app/auth/auth.service';
import { UserRole } from 'src/app/models/user/user-role.enum';
import { User } from 'src/app/models/user/user.model';
import { environment } from 'src/environments/environment';
import { ScreenOrientationPopoverComponent } from '../../components/screen-orientation-popover/screen-orientation-popover.component';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit {
  public version: string = environment.ibfSystemVersion;
  public isDev = false;
  public isMultiCountry = false;
  private readonly adminRole = UserRole.Admin;
  public environmentConfiguration = environment.configuration;
  private device = '';

  constructor(
    private authService: AuthService,
    private analyticsService: AnalyticsService,
    private popoverController: PopoverController,
  ) {
    this.authService.getAuthSubscription().subscribe(this.onUserChange);

    if (!this.isPhone() && !this.isTablet()) {
      return;
    }

    this.device = this.isPhone() ? 'mobile' : 'tablet';

    if (
      this.isPhone() ||
      (this.isTablet() && screen.orientation.type.includes('portrait'))
    ) {
      this.showScreenOrientationPopover();
    }
  }

  ngOnInit() {
    this.analyticsService.logPageView(AnalyticsPage.dashboard);
  }

  private onUserChange = (user: User): void => {
    if (user) {
      this.isDev = user.userRole === this.adminRole;
      this.isMultiCountry = user.countries.length > 1;
    }
  };

  private isTablet(): boolean {
    return /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(
      navigator.userAgent.toLowerCase(),
    );
  }

  private isPhone(): boolean {
    return /android.+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(
      navigator.userAgent.toLowerCase(),
    );
  }

  private async showScreenOrientationPopover() {
    const popover = await this.popoverController.create({
      component: ScreenOrientationPopoverComponent,
      animated: true,
      cssClass: `ibf-popover ${this.isTablet() ? 'ibf-popover-normal' : ''}`,
      translucent: true,
      showBackdrop: true,
      componentProps: {
        device: this.device,
      },
    });

    await popover.present();
  }
}
