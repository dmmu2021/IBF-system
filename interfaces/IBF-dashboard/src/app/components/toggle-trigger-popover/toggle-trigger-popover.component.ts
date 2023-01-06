import { Component, Input, OnInit } from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { DisasterTypeKey } from '../../types/disaster-type-key';

@Component({
  selector: 'app-toggle-trigger-popover',
  templateUrl: './toggle-trigger-popover.component.html',
  styleUrls: ['./toggle-trigger-popover.component.scss'],
})
export class ToggleTriggerPopoverComponent implements OnInit {
  @Input()
  public placeCodeName: string;

  @Input()
  public eapNode: string;

  @Input()
  public stopNode: string;

  @Input()
  public disasterType: DisasterTypeKey;

  constructor(
    private popoverController: PopoverController,
    private translateService: TranslateService,
  ) {}

  ngOnInit() {}

  public getDisasterSpecificText(): string {
    const key = `chat-component.generic.${this.stopNode}.${this.eapNode}.disaster-specific.${this.disasterType}`;
    const translation = this.translateService.instant(
      `chat-component.generic.${this.stopNode}.${this.eapNode}.disaster-specific.${this.disasterType}`,
    );
    return key === translation ? '' : translation;
  }

  public closePopover(): void {
    this.popoverController.dismiss(null, 'cancel');
  }

  public confirm(): void {
    this.popoverController.dismiss(null, 'confirm');
  }
}
