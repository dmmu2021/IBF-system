import { Injectable } from '@angular/core';
import { DateTime } from 'luxon';
import { ApiService } from 'src/app/services/api.service';
import { CountryService } from 'src/app/services/country.service';
import { LeadTimeTriggerKey, LeadTimeUnit } from 'src/app/types/lead-time';
import { Country, DisasterType } from '../models/country.model';
import { DisasterTypeService } from './disaster-type.service';

export class EventSummary {
  countryCodeISO3: string;
  startDate: string;
  endDate: string;
  activeTrigger: boolean;
  eventName: string;
  firstLeadTime?: string;
  firstLeadTimeLabel?: string;
  firstLeadTimeName?: string;
  timeUnit?: string;
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private country: Country;
  private disasterType: DisasterType;

  public state = {
    events: null,
    event: null,
    activeEvent: null,
    activeTrigger: null,
  };

  constructor(
    private apiService: ApiService,
    private countryService: CountryService,
    private disasterTypeService: DisasterTypeService,
  ) {
    this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);

    this.disasterTypeService
      .getDisasterTypeSubscription()
      .subscribe(this.onDisasterTypeChange);
  }

  private onCountryChange = (country: Country) => {
    this.resetState();
    this.country = country;
    this.getTrigger();
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.resetState();
    this.disasterType = disasterType;
    this.getTrigger();
  };

  private resetState() {
    this.state = {
      events: null,
      event: null,
      activeEvent: null,
      activeTrigger: null,
    };
  }

  public getTrigger() {
    if (this.country && this.disasterType) {
      this.apiService
        .getEvent(this.country.countryCodeISO3, this.disasterType.disasterType)
        .subscribe(this.onEvent);
    }
  }

  public getTriggerByDisasterType(
    country: string,
    disasterType: DisasterType,
    callback,
  ) {
    if (country && disasterType) {
      this.apiService
        .getEvent(country, disasterType.disasterType)
        .subscribe(this.onGetDisasterTypeEvent(disasterType, callback));
    }
  }

  private onGetDisasterTypeEvent = (disasterType: DisasterType, callback) => (
    events,
  ) => {
    disasterType.activeTrigger =
      (events.length && events[0].activeTrigger) || false;
    callback(disasterType);
  };

  private onEvent = (events) => {
    this.state.events = events;

    for (let event of this.state.events) {
      event.startDate = DateTime.fromISO(event.startDate).toFormat(
        'cccc, dd LLLL',
      );
      if (event.endDate) {
        event.endDate = this.endDateToLastTriggerDate(event.endDate);
      }
      this.getFirstTriggerDate(event);
    }

    this.setEvent(events[0]);
    this.state.activeEvent = !!this.state.event;
    this.state.activeTrigger =
      this.state.event && this.state.event.activeTrigger;

    this.setAlertState();
  };

  private endDateToLastTriggerDate(endDate: string): string {
    const originalEndDate = DateTime.fromFormat(endDate, 'yyyy-LL-dd');
    return originalEndDate.minus({ days: 7 }).toFormat('cccc, dd LLLL');
  }

  private setAlertState = () => {
    const dashboardElement = document.getElementById('ibf-dashboard-interface');
    if (dashboardElement) {
      if (this.state.activeTrigger) {
        dashboardElement.classList.remove('no-alert');
        dashboardElement.classList.add('trigger-alert');
      } else {
        dashboardElement.classList.remove('trigger-alert');
        dashboardElement.classList.add('no-alert');
      }
    }
  };

  private getFirstTriggerDate(event) {
    if (this.country && this.disasterType) {
      this.apiService
        .getTriggerPerLeadTime(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
          event.eventName,
        )
        .subscribe((response) =>
          this.onTriggerPerLeadTime(response, event.eventName),
        );
    }
  }

  private onTriggerPerLeadTime = (timesteps, eventName) => {
    let firstKey = null;
    Object.keys(timesteps)
      .sort((a, b) =>
        Number(LeadTimeTriggerKey[a]) > Number(LeadTimeTriggerKey[b]) ? 1 : -1,
      )
      .forEach((key) => {
        if (timesteps[key] === '1') {
          firstKey = !firstKey ? key : firstKey;
        }
      });

    const event =
      this.state.events.find((event) => event.eventName === eventName) ||
      this.state.events[0];

    event.firstLeadTime = firstKey;
    event.firstLeadTimeLabel = LeadTimeTriggerKey[firstKey];
    event.timeUnit = firstKey.split('-')[1];
    if (event.timeUnit === LeadTimeUnit.month) {
      event.firstLeadTimeName = this.getYearMOnth(firstKey);
    }
  };

  private getYearMOnth(firstKey): string {
    const timeUnitsInFuture = Number(LeadTimeTriggerKey[firstKey]);
    const today = DateTime.now();
    const futureDateTime = today.plus({ months: Number(timeUnitsInFuture) });
    const monthString = new Date(
      futureDateTime.year,
      futureDateTime.month - 1,
      1,
    ).toLocaleString('default', { month: 'long' });
    return `${monthString} ${futureDateTime.year}`;
  }

  public isOldEvent = () => this.state.activeEvent && !this.state.activeTrigger;

  public setEvent(event: EventSummary) {
    this.state.event = event;
  }
}
