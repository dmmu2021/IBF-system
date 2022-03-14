import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { DateTime } from 'luxon';
import { forkJoin, Subscription } from 'rxjs';
import {
  AnalyticsEvent,
  AnalyticsPage,
} from 'src/app/analytics/analytics.enum';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { AuthService } from 'src/app/auth/auth.service';
import { Country, DisasterType } from 'src/app/models/country.model';
import { PlaceCode } from 'src/app/models/place-code.model';
import { ApiService } from 'src/app/services/api.service';
import { CountryService } from 'src/app/services/country.service';
import { DisasterTypeService } from 'src/app/services/disaster-type.service';
import { EapActionsService } from 'src/app/services/eap-actions.service';
import { EventService } from 'src/app/services/event.service';
import { PlaceCodeService } from 'src/app/services/place-code.service';
import { EapAction } from 'src/app/types/eap-action';
import { EventState } from 'src/app/types/event-state';
import { TimelineState } from 'src/app/types/timeline-state';
import { AggregatesService } from '../../services/aggregates.service';
import { TimelineService } from '../../services/timeline.service';
import { Indicator } from '../../types/indicator-group';
import { LeadTimeUnit } from '../../types/lead-time';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy {
  public triggeredAreas: any[];
  public activeAreas: any[];
  public filteredActiveAreas: any[];
  public stoppedAreas: any[];
  public filteredStoppedAreas: any[];
  public activeDisasterType: string;
  public eventState: EventState;
  public timelineState: TimelineState;
  private indicators: Indicator[];

  private translatedStrings: object;
  private updateSuccessMessage: string;
  private updateFailureMessage: string;
  private promptButtonLabel: string;
  private stopTriggerPopup: object;

  private countrySubscription: Subscription;
  private eapActionSubscription: Subscription;
  private placeCodeSubscription: Subscription;
  private disasterTypeSubscription: Subscription;
  private translateSubscription: Subscription;
  private initialEventStateSubscription: Subscription;
  private manualEventStateSubscription: Subscription;
  private timelineStateSubscription: Subscription;
  private indicatorSubscription: Subscription;

  public eapActions: EapAction[];
  public changedActions: EapAction[] = [];
  public submitDisabled = true;
  public adminAreaLabel: string;
  public adminAreaLabelPlural: string;
  public disasterTypeLabel: string;
  public disasterTypeName: string;
  public actionIndicatorLabel: string;
  private country: Country;
  public disasterType: DisasterType;
  public lastModelRunDate: string;
  private lastModelRunDateFormat = 'cccc, dd LLLL HH:mm';
  public isWarn = false;

  constructor(
    private eapActionsService: EapActionsService,
    public authService: AuthService,
    public eventService: EventService,
    private placeCodeService: PlaceCodeService,
    private disasterTypeService: DisasterTypeService,
    private timelineService: TimelineService,
    private countryService: CountryService,
    private aggregatesService: AggregatesService,
    private alertController: AlertController,
    private changeDetectorRef: ChangeDetectorRef,
    private translateService: TranslateService,
    private apiService: ApiService,
    private analyticsService: AnalyticsService,
  ) {
    this.translateSubscription = this.translateService
      .get('chat-component')
      .subscribe(this.onTranslate);
  }

  ngOnInit() {
    this.countrySubscription = this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);

    this.eapActionSubscription = this.eapActionsService
      .getTriggeredAreas()
      .subscribe(this.onTriggeredAreasChange);

    this.placeCodeSubscription = this.placeCodeService
      .getPlaceCodeSubscription()
      .subscribe(this.onPlaceCodeChange);

    this.disasterTypeSubscription = this.disasterTypeService
      .getDisasterTypeSubscription()
      .subscribe(this.onDisasterTypeChange);

    this.initialEventStateSubscription = this.eventService
      .getInitialEventStateSubscription()
      .subscribe(this.onEventStateChange);

    this.manualEventStateSubscription = this.eventService
      .getManualEventStateSubscription()
      .subscribe(this.onEventStateChange);

    this.timelineStateSubscription = this.timelineService
      .getTimelineStateSubscription()
      .subscribe(this.onTimelineStateChange);

    this.indicatorSubscription = this.aggregatesService
      .getIndicators()
      .subscribe(this.onIndicatorChange);
  }

  ngOnDestroy() {
    this.countrySubscription.unsubscribe();
    this.eapActionSubscription.unsubscribe();
    this.placeCodeSubscription.unsubscribe();
    this.disasterTypeSubscription.unsubscribe();
    this.translateSubscription.unsubscribe();
    this.initialEventStateSubscription.unsubscribe();
    this.manualEventStateSubscription.unsubscribe();
    this.timelineStateSubscription.unsubscribe();
    this.indicatorSubscription.unsubscribe();
  }

  private onTranslate = (translatedStrings) => {
    this.translatedStrings = translatedStrings;
  };

  private onCountryChange = (country: Country) => {
    this.country = country;
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.disasterType = disasterType;
    this.setupChatText();
  };

  private onIndicatorChange = (indicators: Indicator[]) => {
    this.indicators = indicators;
    this.setupChatText();
  };

  private onEventStateChange = (eventState: EventState) => {
    this.eventState = eventState;
  };

  private onTimelineStateChange = (timelineState: TimelineState) => {
    this.timelineState = timelineState;
  };

  private onTriggeredAreasChange = (triggeredAreas) => {
    this.triggeredAreas = triggeredAreas;
    this.triggeredAreas.sort((a, b) =>
      a.actionsValue > b.actionsValue ? -1 : 1,
    );
    this.triggeredAreas.forEach((area) => {
      this.disableSubmitButtonForTriggeredArea(area);
      this.formatDates(area);
      this.filterEapActionsByMonth(area);
      area.eapActions.forEach((action) => {
        action.monthLong = DateTime.utc(
          2022, // year does not matter, this is just about converting month-number to month-name
          action.month === 12 ? 1 : action.month + 1, // The due-by date of actions lies one month later then when it's added
          1,
        ).monthLong;
      });
    });
    this.stoppedAreas = this.triggeredAreas.filter((area) => area.stopped);
    this.activeAreas = this.triggeredAreas.filter((area) => !area.stopped);
    this.setDefaultFilteredAreas();
  };

  private onPlaceCodeChange = (placeCode: PlaceCode) => {
    const activeLeadTime = this.timelineState?.timeStepButtons.find(
      (t) => t.value === this.timelineState?.activeLeadTime,
    );
    if (placeCode && activeLeadTime.alert) {
      const filterTriggeredAreasByPlaceCode = (triggeredArea) =>
        triggeredArea.placeCode === placeCode.placeCode;

      this.filteredActiveAreas = this.activeAreas.filter(
        filterTriggeredAreasByPlaceCode,
      );
      this.filteredStoppedAreas = this.stoppedAreas.filter(
        filterTriggeredAreasByPlaceCode,
      );
    } else {
      this.setDefaultFilteredAreas();
    }
    this.changeDetectorRef.detectChanges();
  };

  private setDefaultFilteredAreas = () => {
    if (this.eventService.isOldEvent()) {
      this.filteredActiveAreas = [...this.triggeredAreas];
      this.filteredStoppedAreas = [];
    } else {
      this.filteredActiveAreas = [];
      this.filteredStoppedAreas = [];
    }
  };

  private setupChatText = () => {
    if (this.country && this.disasterType && this.indicators.length) {
      const disasterType =
        this.disasterType?.disasterType ||
        this.country.disasterTypes[0].disasterType;
      const adminLevel = this.country.countryDisasterSettings.find(
        (s) => s.disasterType === disasterType,
      ).defaultAdminLevel;
      this.adminAreaLabel = this.country.adminRegionLabels[adminLevel].singular;
      this.adminAreaLabelPlural = this.country.adminRegionLabels[
        adminLevel
      ].plural.toLowerCase();
      this.changeDetectorRef.detectChanges();

      this.disasterTypeLabel = this.disasterType.label;
      this.disasterTypeName = this.disasterType.disasterType;
      this.actionIndicatorLabel = this.indicators
        .find((indicator) => indicator.name === this.disasterType.actionsUnit)
        .label.toLowerCase();

      const activeEventsSelector = 'active-event';
      const updateSuccesSelector = 'update-success';
      const updateFailureSelector = 'update-failure';
      const stopTriggerPopupSelector = 'stop-trigger-popup';

      this.updateSuccessMessage = this.translatedStrings[this.disasterTypeName][
        activeEventsSelector
      ][updateSuccesSelector];
      this.updateFailureMessage = this.translatedStrings[this.disasterTypeName][
        activeEventsSelector
      ][updateFailureSelector];
      this.stopTriggerPopup = this.translatedStrings[this.disasterTypeName][
        activeEventsSelector
      ][stopTriggerPopupSelector];

      this.apiService
        .getRecentDates(
          this.country.countryCodeISO3,
          this.disasterType.disasterType,
        )
        .subscribe((date) => {
          this.onRecentDates(date, this.disasterType);
        });

      this.changeDetectorRef.detectChanges();
    }
  };

  private onRecentDates = (date, disasterType: DisasterType) => {
    const recentDate = date.timestamp || date.date;
    this.lastModelRunDate = recentDate
      ? DateTime.fromISO(recentDate).toFormat(this.lastModelRunDateFormat)
      : 'unknown';
    this.isLastModelDateStale(recentDate, disasterType);
  };

  private disableSubmitButtonForTriggeredArea = (triggeredArea) =>
    (triggeredArea.submitDisabled = true);

  private formatDates = (triggeredArea) => {
    triggeredArea.startDate = DateTime.fromISO(
      triggeredArea.startDate,
    ).toFormat('cccc, dd LLLL');
    triggeredArea.stoppedDate = DateTime.fromISO(
      triggeredArea.stoppedDate,
    ).toFormat('cccc, dd LLLL');
  };

  private filterEapActionsByMonth = (triggeredArea) => {
    // SIMULATE: Change 'currentMonth' manually to simulate a different month
    const currentMonth = DateTime.fromFormat(
      this.lastModelRunDate,
      this.lastModelRunDateFormat,
    ).month;
    triggeredArea.filteredEapActions = triggeredArea.eapActions
      .filter(
        (action) =>
          !action.month || // If no month provided, then we assume static EAP-actions and show all
          this.showMonthlyAction(action.month, currentMonth),
      )
      .sort((a, b) =>
        a.month && this.shiftYear(a.month) > this.shiftYear(b.month) ? 1 : -1,
      );
  };

  private showMonthlyAction(month, currentMonth) {
    if (!this.showMonthlyEapActions()) {
      return;
    }
    const monthBeforeCurrentMonth =
      this.shiftYear(month) <= this.shiftYear(currentMonth);
    // TO DO: make this generic instead of hard-coded
    if (currentMonth < 3 || currentMonth >= 10) {
      return [10, 11, 12, 1, 2].includes(month) && monthBeforeCurrentMonth;
    } else if (currentMonth >= 3 && currentMonth < 10) {
      return [3, 4, 5, 6, 7, 8, 9].includes(month) && monthBeforeCurrentMonth;
    }
  }

  // This makes the year "start" at the moment of one of the "droughtForecastMonths" instead of in January ..
  // .. thereby making sure that the order is correct: 'december' comes before 'january', etc.
  private shiftYear = (monthNumber: number) => {
    const droughtForecastMonths = this.getDroughtForecastMonths();
    return (monthNumber + 12 - droughtForecastMonths[0]) % 12;
  };

  private getDroughtForecastMonths = () =>
    this.country.countryDisasterSettings.find(
      (s) => s.disasterType === this.disasterType.disasterType,
    ).droughtForecastMonths;

  private showMonthlyEapActions = () =>
    this.country.countryDisasterSettings.find(
      (s) => s.disasterType === this.disasterType.disasterType,
    ).showMonthlyEapActions;

  private filterTriggeredAreaByPlaceCode = (placeCode) => (triggeredArea) =>
    triggeredArea.placeCode === placeCode;

  private filterChangedEAPActionByChangedEAPAction = (changedAction) => (
    eapAction,
  ) => !(eapAction.action === changedAction.action);

  private filterEAPActionByEAPAction = (action) => (eapAction) =>
    eapAction.action === action;

  private filterEAPActionByPlaceCode = (placeCode) => (eapAction) =>
    eapAction.placeCode === placeCode;

  public changeAction(
    placeCode: string,
    action: string,
    checkbox: boolean,
  ): void {
    this.analyticsService.logEvent(AnalyticsEvent.eapAction, {
      placeCode,
      eapAction: action,
      eapActionStatus: checkbox,
      page: AnalyticsPage.dashboard,
      isActiveEvent: this.eventService.state.activeEvent,
      isActiveTrigger: this.eventService.state.activeTrigger,
      component: this.constructor.name,
    });

    const filterTriggeredAreaByPlaceCode = this.filterTriggeredAreaByPlaceCode(
      placeCode,
    );

    const triggeredArea = this.triggeredAreas.find(
      filterTriggeredAreaByPlaceCode,
    );
    const changedAction = triggeredArea.eapActions.find(
      this.filterEAPActionByEAPAction(action),
    );

    changedAction.checked = checkbox;
    if (!this.changedActions.includes(changedAction)) {
      this.changedActions.push(changedAction);
    } else {
      this.changedActions = this.changedActions.filter(
        this.filterChangedEAPActionByChangedEAPAction(changedAction),
      );
    }
    this.triggeredAreas.find(filterTriggeredAreaByPlaceCode).submitDisabled =
      this.changedActions.length === 0;
    this.changeDetectorRef.detectChanges();
  }

  private checkEAPAction = (action) => {
    return this.eapActionsService.checkEapAction(
      action.action,
      action.checked,
      action.placeCode,
      this.eventState?.event?.eventName,
    );
  };

  public submitEapAction(placeCode: string): void {
    this.analyticsService.logEvent(AnalyticsEvent.eapSubmit, {
      placeCode,
      page: AnalyticsPage.dashboard,
      isActiveEvent: this.eventService.state.activeEvent,
      isActiveTrigger: this.eventService.state.activeTrigger,
      component: this.constructor.name,
    });

    this.triggeredAreas.find(
      this.filterTriggeredAreaByPlaceCode(placeCode),
    ).submitDisabled = true;

    forkJoin(
      this.changedActions
        .filter(this.filterEAPActionByPlaceCode(placeCode))
        .map(this.checkEAPAction),
    ).subscribe({
      next: () => this.actionResult(this.updateSuccessMessage),
      error: () => this.actionResult(this.updateFailureMessage),
    });
  }

  private async actionResult(resultMessage: string): Promise<void> {
    const alert = await this.alertController.create({
      message: resultMessage,
      buttons: [
        {
          text: this.promptButtonLabel,
          handler: () => {
            alert.dismiss(true);
            return false;
          },
        },
      ],
    });

    alert.present();
  }

  private onStopTriggerByTriggeredArea = (triggeredArea) => async (
    message,
  ): Promise<void> => {
    const cancelTranslateNode = 'cancel';
    const confirmTranslateNode = 'confirm';

    const alert = await this.alertController.create({
      message,
      buttons: [
        {
          text: this.stopTriggerPopup[cancelTranslateNode],
          handler: () => {
            console.log('Cancel stop trigger');
          },
        },
        {
          text: this.stopTriggerPopup[confirmTranslateNode],
          handler: () => {
            this.stopTrigger(
              triggeredArea.eventPlaceCodeId,
              triggeredArea.placeCode,
            );
          },
        },
      ],
    });

    alert.present();
  };

  public openStopTriggerPopup(triggeredArea): void {
    this.translateSubscription = this.translateService
      .get(
        `chat-component.${this.disasterTypeName}.active-event.stop-trigger-popup.message`,
        {
          placeCodeName: triggeredArea.name,
        },
      )
      .subscribe(this.onStopTriggerByTriggeredArea(triggeredArea));
  }

  public stopTrigger(eventPlaceCodeId: string, placeCode: string): void {
    this.analyticsService.logEvent(AnalyticsEvent.stopTrigger, {
      page: AnalyticsPage.dashboard,
      isActiveEvent: this.eventService.state.activeEvent,
      isActiveTrigger: this.eventService.state.activeTrigger,
      placeCode,
    });
    const failureTranslateNode = 'failure';
    this.apiService.stopTrigger(eventPlaceCodeId).subscribe({
      next: () => this.reloadEapAndTrigger(),
      error: () =>
        this.actionResult(this.stopTriggerPopup[failureTranslateNode]),
    });
  }

  private reloadEapAndTrigger() {
    this.eapActionsService.loadAdminAreasAndActions();
    this.eventService.getTrigger();
  }

  public showClearoutWarning() {
    if (!this.showMonthlyEapActions()) {
      return;
    }
    const droughtForecastMonths = this.getDroughtForecastMonths();
    const currentMonth = DateTime.fromFormat(
      this.lastModelRunDate,
      this.lastModelRunDateFormat,
    ).plus({ months: 1 }).month; // add 1 month, because pipeline run (end of) september should trigger the warning for october
    return droughtForecastMonths.includes(currentMonth);
  }

  private isLastModelDateStale = (recentDate, disasterType: DisasterType) => {
    const percentageOvertimeAllowed = 0.1; // 10%

    const updateFrequencyUnit = disasterType.leadTimes[0].leadTimeName.split(
      '-',
    )[1] as LeadTimeUnit;

    const durationUnit =
      updateFrequencyUnit === LeadTimeUnit.day
        ? 'days'
        : updateFrequencyUnit === LeadTimeUnit.hour
        ? 'hours'
        : updateFrequencyUnit === LeadTimeUnit.month
        ? 'months'
        : null;
    const durationUnitValue =
      updateFrequencyUnit === LeadTimeUnit.day
        ? 1
        : updateFrequencyUnit === LeadTimeUnit.hour
        ? 12
        : updateFrequencyUnit === LeadTimeUnit.month
        ? 1
        : null;

    const nowDate = DateTime.now();
    const diff = nowDate
      .diff(DateTime.fromISO(recentDate), durationUnit)
      .toObject();
    if (diff[durationUnit] > durationUnitValue + percentageOvertimeAllowed) {
      this.isWarn = true;
    } else {
      this.isWarn = false;
    }
  };

  public showEapActionForecasts() {
    return this.showMonthlyEapActions();
  }

  public getForecastInfo(): [] {
    const currentMonthKey = 'c';
    const currentMonth = this.timelineState?.today[currentMonthKey].month;

    const ondForecast = `${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.ond',
    )} ${this.translateService.instant(
      'chat-component.drought.forecast-info.forecast',
    )}`;
    const mamForecast = `${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.mam',
    )} ${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.forecast',
    )}`;
    const ondBelow = `${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.below-average',
    )} ${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.ond',
    )}`;
    const mamBelow = `${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.below-average',
    )} ${this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.mam',
    )}`;

    const forecasts = {
      12: [ondBelow],
      1: [ondBelow],
      2: [ondBelow, mamForecast],
      3: [],
      4: [],
      5: [],
      6: [mamBelow],
      7: [mamBelow, ondForecast],
      8: [mamBelow, ondForecast],
      9: [mamBelow, ondForecast],
      10: [],
      11: [],
    };

    return forecasts[currentMonth];
  }

  public getNumberOfActions(nrActions: number, nrForecasts: number) {
    const text = this.translateService.instant(
      'chat-component.drought.active-event.forecast-info.actions',
      {
        nrActions,
      },
    );
    if (nrForecasts === 0) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    } else {
      return text;
    }
  }
}
