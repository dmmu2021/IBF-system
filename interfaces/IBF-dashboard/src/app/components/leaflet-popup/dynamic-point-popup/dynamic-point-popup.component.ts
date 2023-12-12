import { Component, Input, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LatLng } from 'leaflet';
import { EapAlertClass, EapAlertClasses } from '../../../models/country.model';
import { RiverGauge, Station } from '../../../models/poi.model';
import { IbfLayerName } from '../../../types/ibf-layer';
import { LeadTime } from '../../../types/lead-time';

@Component({
  selector: 'app-dynamic-point-popup',
  templateUrl: './dynamic-point-popup.component.html',
  styleUrls: ['./dynamic-point-popup.component.scss'],
})
export class DynamicPointPopupComponent implements OnInit {
  @Input()
  public layerName: IbfLayerName;

  @Input()
  public riverGauge?: RiverGauge;

  @Input()
  public typhoonTrackPoint?: {
    timestamp: string;
    category: string;
    markerLatLng: LatLng;
    passed: boolean;
  };

  @Input()
  public glofasData?: {
    station: Station;
    leadTime: LeadTime;
    eapAlertClasses: EapAlertClasses;
  };

  public typhoonData: {
    timestamp: string;
    category: string;
  };

  public ibfLayerName = IbfLayerName;

  public title: string;
  public footerContent: string;

  public glofasHeaderStyle: string;
  public glofasFooterStyle: string;

  public eapAlertClass: EapAlertClass;

  private allowedLayers = [
    IbfLayerName.gauges,
    IbfLayerName.typhoonTrack,
    IbfLayerName.glofasStations,
  ];

  constructor(private translate: TranslateService) {}

  ngOnInit(): void {
    if (!this.layerName || !this.allowedLayers.includes(this.layerName)) {
      return;
    }

    if (!this.riverGauge && !this.typhoonTrackPoint && !this.glofasData) {
      return;
    }

    if (this.layerName === IbfLayerName.typhoonTrack) {
      this.typhoonData = {
        timestamp: this.typhoonTrackPoint.timestamp,
        category: this.typhoonTrackPoint.category,
      };
    }

    if (
      this.layerName === IbfLayerName.glofasStations &&
      this.glofasData.eapAlertClasses
    ) {
      this.eapAlertClass = this.glofasData.eapAlertClasses[
        this.glofasData.station.dynamicData.eapAlertClass
      ];
    }

    this.title = this.getTitle();
    this.footerContent = this.getFooterContent();

    this.glofasHeaderStyle =
      this.layerName === IbfLayerName.glofasStations
        ? `background: var(--ion-color-${this.eapAlertClass.color});color: var(--ion-color-${this.eapAlertClass.color}-contrast);`
        : '';

    this.glofasFooterStyle =
      this.layerName === IbfLayerName.glofasStations
        ? `color: var(--ion-color-${this.eapAlertClass.color}); background: var(--ion-color-${this.eapAlertClass.color}-contrast);`
        : '';
  }

  private getTitle(): string {
    if (this.layerName === IbfLayerName.gauges) {
      return `${this.translate.instant('map-popups.river-gauge.header')} ${
        this.riverGauge.fid
      } ${this.riverGauge.name}`;
    }

    if (this.layerName === IbfLayerName.typhoonTrack) {
      return `Typhoon track${this.typhoonTrackPoint.passed ? ' (passed)' : ''}`;
    }

    if (this.layerName === IbfLayerName.glofasStations) {
      return `${this.glofasData.station.stationCode} STATION: ${this.glofasData.station.stationName}`;
    }

    return '';
  }

  private getFooterContent(): string {
    if (this.layerName === IbfLayerName.gauges) {
      return !this.riverGauge.dynamicData?.['water-level']
        ? ''
        : this.riverGauge.dynamicData?.['water-level'] <=
          this.riverGauge.dynamicData?.['water-level-reference']
        ? this.translate.instant('map-popups.river-gauge.below')
        : this.translate.instant('map-popups.river-gauge.above');
    }

    if (this.layerName === IbfLayerName.typhoonTrack) {
      const lat = `${Math.abs(this.typhoonTrackPoint.markerLatLng.lat).toFixed(
        4,
      )}° ${this.typhoonTrackPoint.markerLatLng.lat > 0 ? 'N' : 'S'}`;
      const lng = `${Math.abs(this.typhoonTrackPoint.markerLatLng.lng).toFixed(
        4,
      )}° ${this.typhoonTrackPoint.markerLatLng.lng > 0 ? 'E' : 'W'}`;
      return `${lat}, ${lng}`;
    }

    if (this.layerName === IbfLayerName.glofasStations) {
      return this.eapAlertClass.label;
    }

    return '';
  }
}
