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
import { CountryTriggers } from '../models/country-triggers.model';
import { Country, DisasterType } from '../models/country.model';
import { DisasterTypeKey } from '../types/disaster-type-key';
import { EventState } from '../types/event-state';
import { TimelineState } from '../types/timeline-state';
import { DisasterTypeService } from './disaster-type.service';
import { EventService } from './event.service';

@Injectable({
  providedIn: 'root',
})
export class TimelineService {
  private startingState: TimelineState = {
    today: DateTime.now(),
    timeStepButtons: [],
    activeLeadTime: null,
  };
  public state = this.startingState;
  private timelineStateSubject = new BehaviorSubject<TimelineState>(
    this.startingState,
  );
  private triggersAllEvents: CountryTriggers;
  private country: Country;
  private disasterType: DisasterType;
  private eventState: EventState;

  constructor(
    private countryService: CountryService,
    private disasterTypeService: DisasterTypeService,
    private eventService: EventService,
    private apiService: ApiService,
  ) {
    this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);

    this.disasterTypeService
      .getDisasterTypeSubscription()
      .subscribe(this.onDisasterTypeChange);

    this.eventService
      .getInitialEventStateSubscription()
      .subscribe(this.onInitialEventStateChange);

    this.eventService
      .getManualEventStateSubscription()
      .subscribe(this.onManualEventStateChange);
  }

  private onCountryChange = (country: Country) => {
    this.triggersAllEvents = null;
    this.country = country;
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.disasterType = disasterType;
  };

  private onInitialEventStateChange = (eventState: EventState) => {
    this.eventState = eventState;
    if (this.country && this.disasterType) {
      this.loadTimeStepButtons();
    }
  };

  private onManualEventStateChange = (eventState: EventState) => {
    this.eventState = eventState;
  };

  public getTimelineStateSubscription(): Observable<TimelineState> {
    return this.timelineStateSubject.asObservable();
  }

  private leadTimeToLeadTimeButton = (
    leadTime: LeadTime,
    index: number,
  ): void => {
    const isLeadTimeEnabled = this.isLeadTimeEnabled(leadTime);
    const triggerKey = LeadTimeTriggerKey[leadTime];
    this.state.timeStepButtons[index] = {
      date: this.getLeadTimeDate(leadTime, triggerKey),
      unit: leadTime.split('-')[1] as LeadTimeUnit,
      value: leadTime,
      alert:
        this.triggersAllEvents &&
        this.triggersAllEvents[leadTime] &&
        this.triggersAllEvents[leadTime] === '1' &&
        this.triggersAllEvents[`${leadTime}-thresholdReached`] === '1',
      disabled: !isLeadTimeEnabled,
      active: false,
    };
  };

  private onTriggerPerLeadTime = (triggers) => {
    this.triggersAllEvents = { ...this.triggersAllEvents, ...triggers };

    this.state.timeStepButtons = [];
    const visibleLeadTimes = this.getVisibleLeadTimes();
    visibleLeadTimes.map(this.leadTimeToLeadTimeButton);

    // filter enabled + triggered lead-times
    let toShowTimeStepButtons = this.state.timeStepButtons.filter(
      (timeStepButton) => !timeStepButton.disabled && timeStepButton.alert,
    );
    // except if that leads to empty set: filter enabled lead-times
    if (toShowTimeStepButtons.length === 0) {
      toShowTimeStepButtons = this.state.timeStepButtons.filter(
        (timeStepButton) => !timeStepButton.disabled,
      );
    }
    // and take first one of this set as active lead-time
    if (toShowTimeStepButtons.length > 0) {
      this.handleTimeStepButtonClick(toShowTimeStepButtons[0].value);
    }
  };

  private onRecentDates = (date) => {
    if (date.timestamp || date.date) {
      this.state.today = DateTime.fromISO(date.timestamp || date.date);
    } else {
      this.state.today = DateTime.now();
    }
    // SIMULATE: change this to simulate different months (only in chat-component)
    // const addMonthsToCurrentDate = -1;
    // this.state.today = this.state.today.plus({
    //   months: addMonthsToCurrentDate,
    // });

    const events = this.eventState?.events;
    if (events?.length) {
      for (const event of events) {
        if (event.activeTrigger) {
          this.apiService
            .getTriggerPerLeadTime(
              this.country.countryCodeISO3,
              this.disasterType.disasterType,
              event?.eventName,
            )
            .subscribe(this.onTriggerPerLeadTime);
        } else {
          this.onTriggerPerLeadTime(null);
        }
      }
    }
    if (!events || !events.length) {
      this.onTriggerPerLeadTime(null);
    }
  };

  public loadTimeStepButtons(): void {
    if (this.country && this.disasterType) {
      this.apiService
        .getRecentDates(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
        )
        .subscribe(this.onRecentDates);
    }
  }

  private deactivateLeadTimeButton = (leadTimeButton) =>
    (leadTimeButton.active = false);

  private filterLeadTimeButtonByLeadTime = (leadTime) => (leadTimeButton) =>
    leadTimeButton.value === leadTime;

  public handleTimeStepButtonClick(timeStepButtonValue) {
    this.state.activeLeadTime = timeStepButtonValue;
    this.state.timeStepButtons.forEach(this.deactivateLeadTimeButton);
    this.state.timeStepButtons.find(
      this.filterLeadTimeButtonByLeadTime(timeStepButtonValue),
    ).active = true;

    this.timelineStateSubject.next(this.state);
  }

  private getLeadTimeDate(leadTime: LeadTime, triggerKey: string) {
    if (leadTime.includes(LeadTimeUnit.day)) {
      return this.state.today.plus({ days: Number(triggerKey) });
    } else if (leadTime.includes(LeadTimeUnit.hour)) {
      return this.state.today.plus({ hours: Number(triggerKey) });
    } else if (leadTime.includes(LeadTimeUnit.month)) {
      if (
        this.country.countryDisasterSettings.find(
          (s) => s.disasterType === this.disasterType.disasterType,
        ).droughtEndOfMonthPipeline
      ) {
        return this.state.today.plus({ months: Number(triggerKey) + 1 });
      }
      return this.state.today.plus({ months: Number(triggerKey) });
    }
  }

  private isLeadTimeEnabled(leadTime: LeadTime): boolean {
    const leadTimes = this.country
      ? this.country.countryDisasterSettings.find(
          (s) => s.disasterType === this.disasterType.disasterType,
        ).activeLeadTimes
      : [];
    const leadTimeIndex = leadTimes.indexOf(leadTime);

    const leadTimeAvailable =
      leadTimeIndex >= 0 &&
      this.filterActiveLeadTimePerDisasterType(this.disasterType, leadTime);

    return leadTimeAvailable;
  }

  private getVisibleLeadTimes() {
    const visibleLeadTimes = [];
    this.disasterType.leadTimes.sort((a, b) =>
      Number(LeadTimeTriggerKey[a.leadTimeName]) >
      Number(LeadTimeTriggerKey[b.leadTimeName])
        ? 1
        : -1,
    );
    for (const leadTime of this.disasterType.leadTimes) {
      // Push first only active lead-times ..
      if (
        visibleLeadTimes.indexOf(leadTime.leadTimeName) === -1 &&
        this.isLeadTimeEnabled(leadTime.leadTimeName)
      ) {
        visibleLeadTimes.push(leadTime.leadTimeName);
      }
    }
    for (const leadTime of this.disasterType.leadTimes) {
      // .. and then all other lead-times
      if (
        visibleLeadTimes.indexOf(leadTime.leadTimeName) === -1 &&
        this.showNonActiveLeadTimes(visibleLeadTimes, leadTime.leadTimeName) &&
        this.filterVisibleLeadTimePerDisasterType(
          this.disasterType,
          leadTime.leadTimeName,
        )
      ) {
        visibleLeadTimes.push(leadTime.leadTimeName);
      }
    }
    return visibleLeadTimes.sort((a, b) =>
      Number(LeadTimeTriggerKey[a]) > Number(LeadTimeTriggerKey[b]) ? 1 : -1,
    );
  }

  private showNonActiveLeadTimes(leadTimes, leadTimeName) {
    return (
      !leadTimes
        .map((leadTime) => this.getDateFromLeadTime(leadTime))
        .includes(this.getDateFromLeadTime(leadTimeName)) ||
      this.isLeadTimeEnabled(leadTimeName)
    );
  }

  private getDateFromLeadTime(leadTime) {
    const date = this.getLeadTimeDate(
      leadTime,
      LeadTimeTriggerKey[leadTime],
    ).toISODate();

    return date;
  }

  private checkStickyDroughtSeason() {
    for (const area of this.getForecastSeasonAreas()) {
      for (const season of area) {
        if (season.length > 1) {
          return true;
        }
      }
    }
  }

  private checkRegionalDroughtSeason() {
    const forecastSeasonAreas = this.country.countryDisasterSettings.find(
      (s) => s.disasterType === this.disasterType.disasterType,
    ).droughtForecastMonths;
    return Object.values(forecastSeasonAreas).length > 1;
  }

  private filterVisibleLeadTimePerDisasterType(
    disasterType: DisasterType,
    leadTime: LeadTime,
  ): boolean {
    if (disasterType.disasterType === DisasterTypeKey.drought) {
      if (this.checkRegionalDroughtSeason()) {
        return true;
      }
      const leadTimeMonth = this.getLeadTimeMonth(leadTime);
      const nextForecastMonthEndOfMonth = this.getNextForecastMonth(
        this.checkStickyDroughtSeason(),
      );
      return (
        leadTimeMonth <= nextForecastMonthEndOfMonth // hide months beyond next Forecast month
      );
    } else if (disasterType.disasterType === DisasterTypeKey.typhoon) {
      const events = this.eventState?.events;
      const relevantLeadTimes = this.eventState?.activeTrigger
        ? events.map((e) => e.firstLeadTime)
        : [LeadTime.hour72];
      const relevantLeadTimesModulo24 = relevantLeadTimes.map(
        (lt) => Number(LeadTimeTriggerKey[lt]) % 24,
      );
      const leadTimeModulo24 = Number(leadTime.split('-')[0]) % 24;
      return relevantLeadTimesModulo24.includes(leadTimeModulo24);
    } else {
      return true;
    }
  }

  private filterActiveLeadTimePerDisasterType(
    disasterType: DisasterType,
    leadTime: LeadTime,
  ): boolean {
    if (disasterType.disasterType === DisasterTypeKey.drought) {
      const leadTimeMonth = this.getLeadTimeMonth(leadTime);
      if (this.checkRegionalDroughtSeason()) {
        // If regional drought seasons (and thus potentially multiple triggers) ..
        const triggeredLeadTimes = Object.keys(this.triggersAllEvents).filter(
          (lt) => this.triggersAllEvents[lt] === '1',
        );
        // .. show all triggered lead times only
        if (triggeredLeadTimes.length) {
          return triggeredLeadTimes.includes(leadTime);
        }
        // .. otherwise determine first available leadtime month
        const nextForecastMonth = this.getNextForecastMonth(
          this.checkStickyDroughtSeason(),
        );
        return nextForecastMonth.equals(leadTimeMonth);
      } else {
        // .. otherwise determine first available leadtime month
        const nextForecastMonth = this.getNextForecastMonth(
          this.checkStickyDroughtSeason(),
        );
        return nextForecastMonth.equals(leadTimeMonth);
      }
    } else if (disasterType.disasterType === DisasterTypeKey.typhoon) {
      const events = this.eventState?.events;
      const relevantLeadTimes = this.eventState?.activeTrigger
        ? events.map((e) => e.firstLeadTime)
        : [LeadTime.hour72];
      return relevantLeadTimes.includes(leadTime);
    } else {
      return true;
    }
  }

  private getNextForecastMonth(sticky: boolean): DateTime {
    let todayLeadTime = this.state.today;
    if (
      this.country.countryDisasterSettings.find(
        (s) => s.disasterType === this.disasterType.disasterType,
      ).droughtEndOfMonthPipeline
    ) {
      todayLeadTime = this.state.today.plus({ month: 1 });
    }
    const currentYear = todayLeadTime.year;
    const currentMonth = todayLeadTime.month;

    let forecastMonthNumbers = [];
    for (const area of this.getForecastSeasonAreas()) {
      const forecastSeasons = area.map((season) => {
        const filteredSeason = sticky
          ? season.filter((month) => month >= currentMonth)
          : season;
        return filteredSeason[0];
      });

      forecastMonthNumbers = [...forecastMonthNumbers, ...forecastSeasons];
    }

    let forecastMonthNumber: number;
    forecastMonthNumbers
      .sort((a, b) => (a > b ? -1 : 1))
      .forEach((month) => {
        if (currentMonth <= month) {
          forecastMonthNumber = month;
        }
      });
    if (!forecastMonthNumber) {
      forecastMonthNumber =
        forecastMonthNumbers[forecastMonthNumbers.length - 1];
    }
    const nextForecastMonthYear =
      currentMonth > forecastMonthNumber ? currentYear + 1 : currentYear;
    return DateTime.utc(nextForecastMonthYear, forecastMonthNumber, 1);
  }

  private getLeadTimeMonth(leadTime: LeadTime): DateTime {
    const addMonths =
      Number(LeadTimeTriggerKey[leadTime]) +
      (this.country.countryDisasterSettings.find(
        (s) => s.disasterType === this.disasterType.disasterType,
      ).droughtEndOfMonthPipeline
        ? 1
        : 0);
    const leadTimeMonth = this.state.today.plus({
      month: addMonths,
    });
    return DateTime.utc(leadTimeMonth.year, leadTimeMonth.month, 1);
  }

  private getForecastSeasonAreas = (): [][][] => {
    return Object.values(
      this.country.countryDisasterSettings.find(
        (s) => s.disasterType === this.disasterType.disasterType,
      ).droughtForecastMonths,
    );
  };
}
