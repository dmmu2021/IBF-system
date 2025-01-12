import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, InsertResult } from 'typeorm';
import {
  AggregateDataRecord,
  EventSummaryCountry,
} from '../../../shared/data.model';
import { GeoJson } from '../../../shared/geo.model';
import { HelperService } from '../../../shared/helper.service';
import { AdminAreaDynamicDataEntity } from '../../admin-area-dynamic-data/admin-area-dynamic-data.entity';
import { AdminDataReturnDto } from '../../admin-area-dynamic-data/dto/admin-data-return.dto';
import { DynamicIndicator } from '../../admin-area-dynamic-data/enum/dynamic-data-unit';
import { DisasterType } from '../../disaster/disaster-type.enum';
import { DisasterEntity } from '../../disaster/disaster.entity';
import { DateDto } from '../../event/dto/date.dto';
import { EventService } from '../../event/event.service';
import { EventAreaEntity } from '../event-area.entity';

@Injectable()
export class EventAreaService {
  @InjectRepository(AdminAreaDynamicDataEntity)
  private readonly adminAreaDynamicDataRepo: Repository<AdminAreaDynamicDataEntity>;
  @InjectRepository(EventAreaEntity)
  private readonly eventAreaRepository: Repository<EventAreaEntity>;

  public constructor(
    private helperService: HelperService,
    private eventService: EventService,
  ) {}

  public async addOrUpdateEventAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventAreasGeoJson: GeoJson,
  ) {
    //delete existing entries for country & adminlevel first
    await this.eventAreaRepository.delete({
      countryCodeISO3: countryCodeISO3,
    });

    // then upload new admin-areas
    await Promise.all(
      eventAreasGeoJson.features.map((area): Promise<InsertResult> => {
        return this.eventAreaRepository
          .createQueryBuilder()
          .insert()
          .values({
            countryCodeISO3: countryCodeISO3,
            disasterType: disasterType,
            eventAreaName: area.properties[`name`],
            geom: (): string => this.geomFunction(area.geometry.coordinates),
          })
          .execute();
      }),
    );
  }

  private geomFunction(coordinates): string {
    return `ST_GeomFromGeoJSON( '{ "type": "MultiPolygon", "coordinates": ${JSON.stringify(
      coordinates,
    )} }' )`;
  }

  public async getEventAreas(
    countryCodeISO3: string,
    disaster: DisasterEntity,
    lastTriggeredDate: DateDto,
  ): Promise<GeoJson> {
    const eventAreas = [];

    const events = await this.eventService.getEventSummary(
      countryCodeISO3,
      disaster.disasterType,
    );
    for await (const event of events.filter((e) => e.activeTrigger)) {
      const eventArea = await this.eventAreaRepository
        .createQueryBuilder('area')
        .where({
          countryCodeISO3: countryCodeISO3,
          disasterType: disaster.disasterType,
          eventAreaName: event.eventName,
        })
        .select([
          'area."eventAreaName" as "eventAreaName"',
          'ST_AsGeoJSON(area.geom)::json As geom',
        ])
        .getRawOne();

      eventArea['eventName'] = event.eventName;
      eventArea['placeCode'] = event.eventName;
      const aggregateValue = await this.adminAreaDynamicDataRepo
        .createQueryBuilder('dynamic')
        .select('SUM(value)', 'value') // TODO: facilitate other aggregate-cases than SUM
        .where({
          timestamp: MoreThanOrEqual(
            this.helperService.getUploadCutoffMoment(
              disaster.disasterType,
              lastTriggeredDate.timestamp,
            ),
          ),
          disasterType: disaster.disasterType,
          indicator: disaster.actionsUnit,
          eventName: event.eventName,
        })
        .getRawOne();
      eventArea[disaster.actionsUnit] = aggregateValue.value;
      eventAreas.push(eventArea);
    }

    if (eventAreas.length === 0) {
      const allEventAreas = await this.eventAreaRepository
        .createQueryBuilder('area')
        .where({
          countryCodeISO3: countryCodeISO3,
          disasterType: disaster.disasterType,
        })
        .select([
          'area."eventAreaName" as "eventAreaName"',
          'ST_AsGeoJSON(area.geom)::json As geom',
        ])
        .getRawMany();
      for await (const eventArea of allEventAreas) {
        eventArea['eventName'] = eventArea.eventAreaName;
        eventArea['placeCode'] = eventArea.eventAreaName;
        eventArea[disaster.actionsUnit] = 0;

        eventAreas.push(eventArea);
      }
    }
    const geoJson = this.helperService.toGeojson(eventAreas);
    return geoJson;
  }

  public async getEventAreaAggregates(
    countryCodeISO3: string,
    disasterType: DisasterType,
    lastTriggeredDate: DateDto,
  ): Promise<AggregateDataRecord[]> {
    const events = await this.eventService.getEventSummary(
      countryCodeISO3,
      disasterType,
    );

    const aggregateRecords = [];
    for await (const event of events.filter((e) => e.activeTrigger)) {
      const aggregateValues = await this.getEventAreaAggregatesPerIndicator(
        disasterType,
        lastTriggeredDate,
        event,
      );

      for (const indicator of aggregateValues) {
        const aggregateRecord = new AggregateDataRecord();
        aggregateRecord.placeCode = event.eventName;
        aggregateRecord.indicator = indicator.indicator;
        aggregateRecord.value = indicator.value;
        aggregateRecords.push(aggregateRecord);
      }
    }
    return aggregateRecords;
  }
  public async getEventAreaDynamicData(
    countryCodeISO3: string,
    disasterType: DisasterType,
    indicator: DynamicIndicator,
    lastTriggeredDate: DateDto,
  ): Promise<AdminDataReturnDto[]> {
    const events = await this.eventService.getEventSummary(
      countryCodeISO3,
      disasterType,
    );

    const records = [];
    for await (const event of events.filter((e) => e.activeTrigger)) {
      const aggregateValues = await this.getEventAreaAggregatesPerIndicator(
        disasterType,
        lastTriggeredDate,
        event,
        indicator,
      );

      const record = new AdminDataReturnDto();
      record.placeCode = event.eventName;
      record.value = aggregateValues[0].value;
      records.push(record);
    }
    return records;
  }

  private async getEventAreaAggregatesPerIndicator(
    disasterType: DisasterType,
    lastTriggeredDate: DateDto,
    event: EventSummaryCountry,
    indicator?: DynamicIndicator,
  ): Promise<{ indicator: string; value: number }[]> {
    const whereFilters = {
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          disasterType,
          lastTriggeredDate.timestamp,
        ),
      ),
      disasterType: disasterType,
      eventName: event.eventName,
    };
    if (indicator) {
      whereFilters['indicator'] = indicator;
    }
    return await this.adminAreaDynamicDataRepo
      .createQueryBuilder('dynamic')
      .select('dynamic."indicator"', 'indicator')
      .addSelect(
        `CASE WHEN dynamic."indicator" = 'alert_threshold' THEN MAX(value) ELSE SUM(value) END as "value"`,
      )
      .where(whereFilters)
      .groupBy('dynamic."indicator"')
      .getRawMany();
  }
}
