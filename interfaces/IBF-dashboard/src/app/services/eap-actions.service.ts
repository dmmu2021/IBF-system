import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from 'src/app/services/api.service';
import { CountryService } from 'src/app/services/country.service';
import { Country, DisasterType } from '../models/country.model';
import { AdminLevel } from '../types/admin-level';
import { EventState } from '../types/event-state';
import { TimelineState } from '../types/timeline-state';
import { AdminLevelService } from './admin-level.service';
import { DisasterTypeService } from './disaster-type.service';
import { EventService, EventSummary } from './event.service';
import { TimelineService } from './timeline.service';

@Injectable({
  providedIn: 'root',
})
export class EapActionsService {
  private triggeredAreaSubject = new BehaviorSubject<any[]>([]);
  public triggeredAreas: any[];
  private country: Country;
  private disasterType: DisasterType;
  private adminLevel: AdminLevel;
  private event: EventSummary;
  private eventState: EventState;
  public timelineState: TimelineState;

  constructor(
    private countryService: CountryService,
    private apiService: ApiService,
    private timelineService: TimelineService,
    private disasterTypeService: DisasterTypeService,
    private adminLevelService: AdminLevelService,
    private eventService: EventService,
  ) {
    this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);

    this.timelineService
      .getTimelineStateSubscription()
      .subscribe(this.onTimelineStateChange);

    this.disasterTypeService
      .getDisasterTypeSubscription()
      .subscribe(this.onDisasterTypeChange);

    this.adminLevelService
      .getAdminLevelSubscription()
      .subscribe(this.onAdminLevelChange);

    this.eventService
      .getInitialEventStateSubscription()
      .subscribe(this.onEventStatusChange);
  }

  private onCountryChange = (country: Country) => {
    this.country = country;
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.disasterType = disasterType;
    this.loadAdminAreasAndActions();
  };

  private onTriggeredAreas = (triggeredAreas) => {
    this.triggeredAreas = triggeredAreas;
    this.triggeredAreaSubject.next(this.triggeredAreas);
  };

  private onEvent = (events) => {
    this.event = events[0];
    if (this.event && this.timelineState.activeLeadTime) {
      this.getTriggeredAreasApi(
        this.timelineState.activeLeadTime,
        this.adminLevel ||
          this.country.countryDisasterSettings.find(
            (s) => s.disasterType === this.disasterType.disasterType,
          ).defaultAdminLevel,
      );
    }
  };

  private onTimelineStateChange = (timelineState: TimelineState) => {
    this.timelineState = timelineState;
    if (this.event && this.timelineState.activeLeadTime) {
      this.getTriggeredAreasApi(
        this.timelineState.activeLeadTime,
        this.adminLevel ||
          this.country.countryDisasterSettings.find(
            (s) => s.disasterType === this.disasterType.disasterType,
          ).defaultAdminLevel,
      );
    }
  };

  private onAdminLevelChange = (adminLevel: AdminLevel) => {
    if (this.event && this.timelineState?.activeLeadTime && adminLevel) {
      this.getTriggeredAreasApi(this.timelineState?.activeLeadTime, adminLevel);
    }
  };

  private getTriggeredAreasApi(leadTime: string, adminLevel: AdminLevel) {
    if (this.disasterType) {
      this.apiService
        .getTriggeredAreas(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
          adminLevel,
          leadTime,
          this.eventState?.event?.eventName,
        )
        .subscribe(this.onTriggeredAreas);
    }
  }

  loadAdminAreasAndActions() {
    if (this.country && this.disasterType) {
      this.apiService
        .getEventsSummary(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
        )
        .subscribe(this.onEvent);
    }
  }

  getTriggeredAreas(): Observable<any[]> {
    return this.triggeredAreaSubject.asObservable();
  }

  checkEapAction(
    action: string,
    status: boolean,
    placeCode: string,
    eventName: string,
  ) {
    return this.apiService.checkEapAction(
      action,
      this.country.countryCodeISO3,
      this.disasterType.disasterType,
      status,
      placeCode,
      eventName,
    );
  }

  private onEventStatusChange(eventState: EventState) {
    this.eventState = eventState;
  }
}
