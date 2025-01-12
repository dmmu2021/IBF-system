import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DateTime } from 'luxon';
import { Subscription } from 'rxjs';
import { DisasterTypeService } from 'src/app/services/disaster-type.service';
import { DateFormats, MonthFormats } from 'src/app/types/lead-time';
import { TimelineService } from '../../services/timeline.service';
import { DisasterTypeKey } from '../../types/disaster-type-key';
@Component({
  selector: 'app-date-button',
  templateUrl: './date-button.component.html',
  styleUrls: ['./date-button.component.scss'],
})
export class DateButtonComponent implements OnInit, OnDestroy {
  @Input() date = DateTime.now();
  @Input() active: boolean;
  @Input() alert: boolean;
  @Input() thresholdReached: boolean;
  @Input() eventName: string | null;
  @Input() duration: number | null;

  private dateFormat = '';
  private monthFormat = '';
  private hourFormat = 'HH:00 a';
  public firstLine: string;
  public secondLine: string;
  public thirdLine: string;

  private timelineStateSubscription: Subscription;

  constructor(
    public disasterTypeService: DisasterTypeService,
    private timelineService: TimelineService,
  ) {}

  ngOnInit() {
    this.timelineStateSubscription = this.timelineService
      .getTimelineStateSubscription()
      .subscribe(this.onTimelineStateChange);
  }

  ngOnDestroy() {
    this.timelineStateSubscription.unsubscribe();
  }

  private onTimelineStateChange = () => {
    const disasterType = this.disasterTypeService?.disasterType?.disasterType;

    this.dateFormat = DateFormats[disasterType] || DateFormats.default;
    this.monthFormat = MonthFormats[disasterType] || MonthFormats.default;
    if (
      [
        DisasterTypeKey.flashFloods,
        DisasterTypeKey.floods,
        DisasterTypeKey.heavyRain,
      ].includes(disasterType)
    ) {
      this.firstLine = this.date.toFormat(this.dateFormat);
    }

    if (disasterType === DisasterTypeKey.typhoon) {
      if (this.active) {
        this.thirdLine = this.date
          ? this.date.toFormat(this.hourFormat)
          : 'Landfall';
      } else {
        this.thirdLine = '';
      }
    }

    this.secondLine = this.date
      ? this.date.toFormat(this.monthFormat)
      : 'Undetermined';

    if (
      this.eventName &&
      this.duration &&
      disasterType === DisasterTypeKey.drought
    ) {
      const endMonthDate = this.date.plus({ months: this.duration - 1 });
      let displayMonth = this.date.monthShort;
      if (this.duration > 1) {
        displayMonth = `${displayMonth}-${endMonthDate.monthShort}`;
      }
      this.secondLine = `${displayMonth} ${endMonthDate.year}`;

      this.thirdLine = `Duration ${this.duration} months`;
    }
  };
}
