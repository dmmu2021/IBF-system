import { Injectable } from '@nestjs/common';
import { Readable } from 'typeorm/platform/PlatformTools';
import { DisasterType } from '../api/disaster/disaster-type.enum';
import { GeoJson, GeoJsonFeature } from './geo.model';
import csv from 'csv-parser';

@Injectable()
export class HelperService {
  public toGeojson(rawResult): GeoJson {
    const geoJson: GeoJson = {
      type: 'FeatureCollection',
      features: [],
    };
    rawResult.forEach((i): void => {
      const feature: GeoJsonFeature = {
        type: 'Feature',
        geometry: i.geom,
        properties: {},
      };
      delete i.geom;
      feature.properties = i;
      geoJson.features.push(feature);
    });

    return geoJson;
  }

  public getLast12hourInterval(
    disasterType: DisasterType,
    triggeredDate?: Date,
  ): Date {
    // This function was made to accomodate 'typhoon' setting where upload-frequency is '12 hours'
    // This means that endpoint cannot only check on date = lastTriggeredDate.date, but should also check on the right 12-hour interval
    // However to be able to use this function generically also for other disasterTypes (freq '1 day'), it returns last 24-hour interval (midnight)
    const date = triggeredDate || new Date();
    const lastInterval = new Date(date);
    if (disasterType === DisasterType.Typhoon) {
      // The update frequency is 12 hours, so dividing up in 2 12-hour intervals
      if (date.getHours() >= 12) {
        // If PM, set to 'noon'
        lastInterval.setHours(12, 0, 0, 0);
      } else {
        // If AM set to 'midnight'
        lastInterval.setHours(0, 0, 0, 0);
      }
    } else {
      // If other disaster-type set to 'midnight'
      lastInterval.setHours(0, 0, 0, 0);
    }
    return lastInterval;
  }

  public async csvBufferToArray(buffer): Promise<object[]> {
    const stream = new Readable();
    stream.push(buffer.toString());
    stream.push(null);
    const parsedData = [];
    return await new Promise(function(resolve, reject) {
      stream
        .pipe(csv())
        .on('error', error => reject(error))
        .on('data', row => parsedData.push(row))
        .on('end', () => {
          resolve(parsedData);
        });
    });
  }
}
