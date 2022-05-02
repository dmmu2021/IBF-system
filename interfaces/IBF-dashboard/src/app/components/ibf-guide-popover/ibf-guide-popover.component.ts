import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PopoverController } from '@ionic/angular';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-ibf-guide-popover',
  templateUrl: './ibf-guide-popover.component.html',
  styleUrls: ['./ibf-guide-popover.component.scss'],
})
export class IbfGuidePopoverComponent implements OnInit {
  public pdfUrl: string;
  public videoUrl: string;
  public safeVideoUrl: SafeResourceUrl;
  public whatsNewUrl: string;

  constructor(
    private popoverController: PopoverController,
    private domSanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.safeVideoUrl = this.domSanitizer.bypassSecurityTrustResourceUrl(
      this.videoUrl,
    );
  }

  public openPdfManual(): void {
    window.open(this.pdfUrl, '_blank');
  }

  public openWhatsNew(): void {
    window.open(environment.whatsNewUrl, '_blank');
  }

  public closePopover(): void {
    this.popoverController.dismiss();
  }
}
