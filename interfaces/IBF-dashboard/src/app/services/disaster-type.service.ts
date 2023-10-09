import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  Country,
  CountryDisasterSettings,
  DisasterType,
} from '../models/country.model';
import { DisasterTypeKey } from '../types/disaster-type-key';
import { CountryService } from './country.service';

@Injectable({
  providedIn: 'root',
})
export class DisasterTypeService {
  private disasterTypeSubject = new BehaviorSubject<DisasterType>(null);
  public disasterType: DisasterType;
  private countryDisasterSettings: CountryDisasterSettings;
  private countryDisasterSettingsSubject = new BehaviorSubject<CountryDisasterSettings>(
    null,
  );

  private country: Country;

  constructor(private countryService: CountryService) {
    this.countryService
      .getCountrySubscription()
      .subscribe(this.onCountryChange);
  }

  public getDisasterTypeSubscription = (): Observable<DisasterType> => {
    return this.disasterTypeSubject.asObservable();
  };

  public setDisasterType(disasterType: DisasterType) {
    this.disasterType = disasterType;
    this.disasterTypeSubject.next(this.disasterType);
    this.setCountryDisasterTypeSettings();
  }

  public hasEap(disasterType: DisasterTypeKey): string {
    const eapDisasterTypes = [
      DisasterTypeKey.floods,
      DisasterTypeKey.drought,
      DisasterTypeKey.typhoon,
      DisasterTypeKey.flashFloods,
    ];
    return eapDisasterTypes.includes(disasterType) ? 'eap' : 'no-eap';
  }

  private onCountryChange = (country: Country) => {
    this.country = country;

    this.setCountryDisasterTypeSettings();
  };

  private setCountryDisasterTypeSettings() {
    const settings = this.country?.countryDisasterSettings.find(
      (s) => s.disasterType === this.disasterType?.disasterType,
    );

    if (!settings) {
      return;
    }

    this.countryDisasterSettings = settings;
    this.countryDisasterSettingsSubject.next(this.countryDisasterSettings);
  }

  public getCountryDisasterSettingsSubscription(): Observable<CountryDisasterSettings> {
    return this.countryDisasterSettingsSubject.asObservable();
  }
}
