import {
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { PopoverController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import {
  AnalyticsEvent,
  AnalyticsPage,
} from 'src/app/analytics/analytics.enum';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { Country, DisasterType } from 'src/app/models/country.model';
import { PlaceCode } from 'src/app/models/place-code.model';
import { AdminLevelService } from 'src/app/services/admin-level.service';
import { AggregatesService } from 'src/app/services/aggregates.service';
import { CountryService } from 'src/app/services/country.service';
import { EventService } from 'src/app/services/event.service';
import { PlaceCodeService } from 'src/app/services/place-code.service';
import { EventState } from 'src/app/types/event-state';
import { IbfLayerName } from 'src/app/types/ibf-layer';
import { Indicator, NumberFormat } from 'src/app/types/indicator-group';
import { DisasterTypeService } from '../../services/disaster-type.service';
import { LayerControlInfoPopoverComponent } from '../layer-control-info-popover/layer-control-info-popover.component';

@Component({
  selector: 'app-aggregates',
  templateUrl: './aggregates.component.html',
  styleUrls: ['./aggregates.component.scss'],
})
export class AggregatesComponent implements OnInit, OnDestroy {
  @Input()
  public triggerStatus: string;

  public indicators: Indicator[] = [];
  public placeCode: PlaceCode;
  public placeCodeHover: PlaceCode;
  private country: Country;
  private disasterType: DisasterType;
  private aggregateComponentTranslateNode = 'aggregates-component';
  private defaultHeaderLabelTranslateNode = 'default-header-label';
  private exposedPrefixTranslateNode = 'exposed-prefix';
  private allPrefixTranslateNode = 'all-prefix';

  private defaultHeaderLabel: string;
  private exposedPrefix: string;
  private allPrefix: string;
  private popoverTexts: { [key: string]: string } = {};

  private eventState: EventState;

  private indicatorSubscription: Subscription;
  private countrySubscription: Subscription;
  private disasterTypeSubscription: Subscription;
  private placeCodeSubscription: Subscription;
  private placeCodeHoverSubscription: Subscription;
  private translateSubscription: Subscription;
  private translateLayerInfoPopupsSubscription: Subscription;
  private initialEventStateSubscription: Subscription;
  private manualEventStateSubscription: Subscription;

  constructor(
    private countryService: CountryService,
    private disasterTypeService: DisasterTypeService,
    private aggregatesService: AggregatesService,
    private placeCodeService: PlaceCodeService,
    private eventService: EventService,
    private adminLevelService: AdminLevelService,
    private popoverController: PopoverController,
    private changeDetectorRef: ChangeDetectorRef,
    private translateService: TranslateService,
    private analyticsService: AnalyticsService,
  ) {
    this.translateSubscription = this.translateService
      .get(this.aggregateComponentTranslateNode)
      .subscribe(this.onTranslate);

    this.translateLayerInfoPopupsSubscription = this.translateService
      .get('layer-info-popups.aggregates-section')
      .subscribe(this.onTranslateLayerInfoPopups);

    this.initialEventStateSubscription = this.eventService
      .getInitialEventStateSubscription()
      .subscribe(this.onEventStateChange);

    this.manualEventStateSubscription = this.eventService
      .getManualEventStateSubscription()
      .subscribe(this.onEventStateChange);
  }

  ngOnInit() {
    this.countrySubscription = this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);

    this.disasterTypeSubscription = this.disasterTypeService
      .getDisasterTypeSubscription()
      .subscribe(this.onDisasterTypeChange);

    this.placeCodeSubscription = this.placeCodeService
      .getPlaceCodeSubscription()
      .subscribe(this.onPlaceCodeChange);

    this.placeCodeHoverSubscription = this.placeCodeService
      .getPlaceCodeHoverSubscription()
      .subscribe(this.onPlaceCodeHoverChange);

    this.indicatorSubscription = this.aggregatesService
      .getIndicators()
      .subscribe(this.onIndicatorChange);
  }

  ngOnDestroy() {
    this.indicatorSubscription.unsubscribe();
    this.countrySubscription.unsubscribe();
    this.disasterTypeSubscription.unsubscribe();
    this.placeCodeSubscription.unsubscribe();
    this.placeCodeHoverSubscription.unsubscribe();
    this.translateSubscription.unsubscribe();
    this.translateLayerInfoPopupsSubscription.unsubscribe();
    this.initialEventStateSubscription.unsubscribe();
    this.manualEventStateSubscription.unsubscribe();
  }

  private onTranslate = (translatedStrings) => {
    this.defaultHeaderLabel =
      translatedStrings[this.defaultHeaderLabelTranslateNode];
    this.exposedPrefix = translatedStrings[this.exposedPrefixTranslateNode];
    this.allPrefix = translatedStrings[this.allPrefixTranslateNode];
  };

  private onTranslateLayerInfoPopups = (translatedStrings) => {
    this.popoverTexts = translatedStrings;
  };

  private onCountryChange = (country: Country) => {
    this.country = country;
  };

  private onDisasterTypeChange = (disasterType: DisasterType) => {
    this.disasterType = disasterType;
  };

  private onPlaceCodeChange = (placeCode: PlaceCode) => {
    this.placeCode = placeCode;
    this.changeDetectorRef.detectChanges();
  };

  private onPlaceCodeHoverChange = (placeCode: PlaceCode) => {
    this.placeCodeHover = placeCode;
    this.changeDetectorRef.detectChanges();
  };

  private onIndicatorChange = (newIndicators: Indicator[]) => {
    // clean data to avoid these inefficient filters and loops
    const filterAggregateIndicators = (indicator: Indicator) =>
      indicator.aggregateIndicator.includes(this.country.countryCodeISO3);

    this.indicators = newIndicators.filter(filterAggregateIndicators);
  };

  public async moreInfo(indicator: Indicator): Promise<void> {
    const popover = await this.popoverController.create({
      component: LayerControlInfoPopoverComponent,
      animated: true,
      cssClass: 'ibf-popover ibf-popover-normal',
      translucent: true,
      showBackdrop: true,
      componentProps: {
        layer: {
          label: indicator.label,
          description: this.getPopoverText(indicator.name),
        },
      },
    });

    this.analyticsService.logEvent(AnalyticsEvent.aggregateInformation, {
      indicator: indicator.name,
      page: AnalyticsPage.dashboard,
      isActiveEvent: this.eventService.state.activeEvent,
      isActiveTrigger: this.eventService.state.activeTrigger,
      component: this.constructor.name,
    });

    popover.present();
  }

  private getPopoverText(indicatorName: IbfLayerName): string {
    let popoverText = '';
    if (
      this.popoverTexts[indicatorName] &&
      this.popoverTexts[indicatorName][this.country.countryCodeISO3] &&
      this.popoverTexts[indicatorName][this.country.countryCodeISO3][
        this.disasterType.disasterType
      ]
    ) {
      popoverText = this.popoverTexts[indicatorName][
        this.country.countryCodeISO3
      ][this.disasterType.disasterType];
    }
    return popoverText;
  }

  public getAggregate(
    indicatorName: IbfLayerName,
    weightedAvg: boolean,
    numberFormat: NumberFormat,
  ) {
    const placeCode = this.placeCode || this.placeCodeHover;
    return this.aggregatesService.getAggregate(
      weightedAvg,
      indicatorName,
      placeCode ? placeCode.placeCode : null,
      numberFormat,
      this.triggerStatus,
    );
  }

  public getLabelAreasExposed() {
    let headerLabel = this.defaultHeaderLabel;
    let subHeaderLabel = '';

    const placeCode = this.placeCode || this.placeCodeHover;
    if (placeCode) {
      headerLabel = placeCode.placeCodeName;
      if (placeCode.placeCodeParentName) {
        subHeaderLabel = `(${placeCode.placeCodeParentName})`;
      }
    } else {
      if (this.country) {
        if (
          this.eventState?.activeTrigger &&
          this.country.adminRegionLabels[this.adminLevelService.adminLevel]
        ) {
          const areaCount = this.aggregatesService.nrTriggerActiveAreas;
          const adminAreaLabel = this.country.adminRegionLabels[
            this.adminLevelService.adminLevel
          ][areaCount > 1 ? 'plural' : 'singular'];
          headerLabel = `${this.exposedPrefix} ${adminAreaLabel}`;
        } else {
          headerLabel = `${this.allPrefix} ${this.country.countryName}`;
        }
      }
    }

    return { headerLabel, subHeaderLabel };
  }

  public getNumberAreasExposed() {
    let headerLabel;

    const placeCode = this.placeCode || this.placeCodeHover;
    if (placeCode) {
      headerLabel = '';
    } else {
      if (this.country) {
        if (this.eventState?.activeTrigger) {
          const areaCount = this.aggregatesService.nrTriggerActiveAreas;
          headerLabel = `${areaCount}`;
        } else {
          headerLabel = '';
        }
      }
    }

    return headerLabel;
  }

  public clearPlaceCode() {
    this.placeCodeService.clearPlaceCode();
  }

  private onEventStateChange = (eventState: EventState) => {
    this.eventState = eventState;
  };
}
