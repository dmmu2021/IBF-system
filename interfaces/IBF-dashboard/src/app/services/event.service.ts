import { Injectable } from '@angular/core';
import { DateTime } from 'luxon';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { CountryService } from 'src/app/services/country.service';
import {
  LeadTime,
  LeadTimeTriggerKey,
  LeadTimeUnit,
} from 'src/app/types/lead-time';
import { Country, DisasterType } from '../models/country.model';
import { EventState } from '../types/event-state';
import { DisasterTypeService } from './disaster-type.service';

export class EventSummary {
  countryCodeISO3: string;
  startDate: string;
  endDate: string;
  activeTrigger: boolean;
  eventName: string;
  firstLeadTime?: string;
  firstLeadTimeLabel?: string;
  firstLeadTimeDate?: string;
  timeUnit?: string;
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private country: Country;
  private disasterType: DisasterType;

  private nullState = {
    events: null,
    event: null,
    activeEvent: null,
    activeTrigger: null,
  };

  public state = this.nullState;

  public initialEventStateSubject = new BehaviorSubject<EventState>(
    this.nullState,
  );
  public manualEventStateSubject = new BehaviorSubject<EventState>(
    this.nullState,
  );

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
    this.country = country;
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.resetState();
    this.disasterType = disasterType;
    this.getTrigger();
  };

  public switchEvent(leadTime: LeadTime) {
    const event = this.state.activeTrigger
      ? this.state.events.find(
          (e) => (e.firstLeadTime as LeadTime) === leadTime,
        )
      : this.state.event;
    // Trigger a different 'event' subject in this case ..
    // .. so that timelineService can distinguish between initial event switch and manual event switch
    this.setEventManually(event);
  }

  public setEventInitially(event: EventSummary) {
    this.state.event = event;
    this.initialEventStateSubject.next(this.state);
  }

  public setEventManually(event: EventSummary) {
    this.state.event = event;
    this.manualEventStateSubject.next(this.state);
  }

  public getInitialEventStateSubscription(): Observable<EventState> {
    return this.initialEventStateSubject.asObservable();
  }

  public getManualEventStateSubscription(): Observable<EventState> {
    return this.manualEventStateSubject.asObservable();
  }

  private resetState() {
    this.state = this.nullState;
  }

  public getTrigger() {
    if (this.country && this.disasterType) {
      this.apiService
        .getEventsSummary(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
        )
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
        .getEventsSummary(country, disasterType.disasterType)
        .subscribe(this.onGetDisasterTypeEvent(disasterType, callback));
    }
  }

  private onGetDisasterTypeEvent = (disasterType: DisasterType, callback) => (
    events,
  ) => {
    disasterType.activeTrigger =
      events.filter((e: EventSummary) => e.activeTrigger).length > 0 || false;
    callback(disasterType);
  };

  private onEvent = (events) => {
    this.state.events = events;

    if (events.length) {
      for (const event of this.state.events) {
        event.startDate = DateTime.fromISO(event.startDate).toFormat(
          'cccc, dd LLLL',
        );
        if (event.endDate) {
          event.endDate = this.endDateToLastTriggerDate(event.endDate);
        }
        this.getFirstTriggerDate(event);
      }
    }

    this.state.activeEvent = !!events[0];
    this.state.activeTrigger =
      events[0] &&
      this.state.events.filter((e: EventSummary) => e.activeTrigger).length > 0;
    this.setEventInitially(events[0]);

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
    if (timesteps) {
      Object.keys(timesteps)
        .sort((a, b) =>
          Number(LeadTimeTriggerKey[a]) > Number(LeadTimeTriggerKey[b])
            ? 1
            : -1,
        )
        .forEach((key) => {
          if (timesteps[key] === '1') {
            firstKey = !firstKey ? key : firstKey;
          }
        });
    }

    const event =
      this.state.events.find((e) => e.eventName === eventName) ||
      this.state.events[0];

    event.firstLeadTime = firstKey;
    event.firstLeadTimeLabel = LeadTimeTriggerKey[firstKey];
    event.timeUnit = firstKey?.split('-')[1];

    event.firstLeadTimeDate = firstKey
      ? this.getFirstLeadTimeDate(firstKey, event.timeUnit)
      : null;
  };

  private getFirstLeadTimeDate(firstKey, timeUnit: LeadTimeUnit): string {
    const timeUnitsInFuture = Number(LeadTimeTriggerKey[firstKey]);
    const today = DateTime.now();
    const futureDateTime =
      timeUnit === LeadTimeUnit.month
        ? today.plus({ months: Number(timeUnitsInFuture) })
        : timeUnit === LeadTimeUnit.day
        ? today.plus({ days: Number(timeUnitsInFuture) })
        : timeUnit === LeadTimeUnit.hour
        ? today.plus({ hours: Number(timeUnitsInFuture) })
        : null;
    const monthString = new Date(
      futureDateTime.year,
      futureDateTime.month - 1,
      1,
    ).toLocaleString('default', { month: 'long' });

    if (timeUnit === LeadTimeUnit.month) {
      return `${monthString} ${futureDateTime.year}`;
    } else if (timeUnit === LeadTimeUnit.day) {
      return `${futureDateTime.day} ${monthString} ${futureDateTime.year}`;
    } else if (timeUnit === LeadTimeUnit.hour) {
      return futureDateTime.toFormat('cccc, dd LLLL HH:00');
    }
  }

  public isOldEvent = () => this.state.activeEvent && !this.state.activeTrigger;
}
