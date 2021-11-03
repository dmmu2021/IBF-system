import { Component, Input, OnInit } from '@angular/core';
import { DisasterTypeService } from 'src/app/services/disaster-type.service';
import { DateTime } from 'luxon';
import { LeadTimeUnit, DateFormats, MonthFormats} from 'src/app/types/lead-time';

@Component({
  selector: 'app-date-button',
  templateUrl: './date-button.component.html',
  styleUrls: ['./date-button.component.scss'],
})
export class DateButtonComponent implements OnInit {
  @Input() date = DateTime.now();
  @Input() unit = LeadTimeUnit.day;
  

  private dateFormat = '';
  private monthFormat = '';
  private hourFormat = 'HH:mm a';
  public displayDate: string;
  public displayMonth: string;
  public displayHour: string;

  constructor(
    public disasterTypeService: DisasterTypeService,
  ) {}

  ngOnInit() {
    this.dateFormat = DateFormats[this.disasterTypeService?.disasterType?.disasterType] || DateFormats.default
    this.monthFormat = MonthFormats[this.disasterTypeService?.disasterType?.disasterType] || MonthFormats.default
    if (this.unit === LeadTimeUnit.day) {
      this.displayDate = this.date.toFormat(this.dateFormat);
    }
    if (this.unit === LeadTimeUnit.hour) {
      this.displayHour = this.date.toFormat(this.hourFormat);
    }
    this.displayMonth = this.date.toFormat(this.monthFormat);
  }
}
