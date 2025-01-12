import { EapActionsService } from './../eap-actions/eap-actions.service';
import { AdminAreaDynamicDataEntity } from './../admin-area-dynamic-data/admin-area-dynamic-data.entity';
import { EventPlaceCodeEntity } from './event-place-code.entity';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivationLogDto,
  AffectedAreaDto,
  EventPlaceCodeDto,
} from './dto/event-place-code.dto';
import {
  LessThan,
  MoreThanOrEqual,
  Repository,
  In,
  MoreThan,
  IsNull,
  DataSource,
} from 'typeorm';

import { InjectRepository } from '@nestjs/typeorm';
import {
  LeadTime,
  LeadTimeUnit,
} from '../admin-area-dynamic-data/enum/lead-time.enum';
import { UploadTriggerPerLeadTimeDto } from './dto/upload-trigger-per-leadtime.dto';
import { TriggerPerLeadTime } from './trigger-per-lead-time.entity';
import { EventSummaryCountry, TriggeredArea } from '../../shared/data.model';
import { AdminAreaEntity } from '../admin-area/admin-area.entity';
import { DateDto } from './dto/date.dto';
import { TriggerPerLeadTimeDto } from './dto/trigger-per-leadtime.dto';
import { DisasterType } from '../disaster/disaster-type.enum';
import { DisasterEntity } from '../disaster/disaster.entity';
import { HelperService } from '../../shared/helper.service';
import { UserEntity } from '../user/user.entity';
import { EventMapImageEntity } from './event-map-image.entity';
import { TyphoonTrackService } from '../typhoon-track/typhoon-track.service';
import { CountryEntity } from '../country/country.entity';

@Injectable()
export class EventService {
  @InjectRepository(EventPlaceCodeEntity)
  private readonly eventPlaceCodeRepo: Repository<EventPlaceCodeEntity>;
  @InjectRepository(AdminAreaDynamicDataEntity)
  private readonly adminAreaDynamicDataRepo: Repository<AdminAreaDynamicDataEntity>;
  @InjectRepository(AdminAreaEntity)
  private readonly adminAreaRepository: Repository<AdminAreaEntity>;
  @InjectRepository(TriggerPerLeadTime)
  private readonly triggerPerLeadTimeRepository: Repository<TriggerPerLeadTime>;
  @InjectRepository(DisasterEntity)
  private readonly disasterTypeRepository: Repository<DisasterEntity>;
  @InjectRepository(UserEntity)
  private readonly userRepository: Repository<UserEntity>;
  @InjectRepository(EventMapImageEntity)
  private readonly eventMapImageRepository: Repository<EventMapImageEntity>;
  @InjectRepository(CountryEntity)
  private readonly countryRepository: Repository<CountryEntity>;

  public constructor(
    private eapActionsService: EapActionsService,
    private helperService: HelperService,
    private dataSource: DataSource,
    private typhoonTrackService: TyphoonTrackService,
  ) {}

  public async getEventSummary(
    countryCodeISO3: string,
    disasterType: DisasterType,
  ): Promise<EventSummaryCountry[]> {
    const recentDate = await this.getRecentDate(countryCodeISO3, disasterType);
    const eventSummary = await this.eventPlaceCodeRepo
      .createQueryBuilder('event')
      .select(['area."countryCodeISO3"', 'event."eventName"'])
      .leftJoin('event.adminArea', 'area')
      .groupBy('area."countryCodeISO3"')
      .addGroupBy('event."eventName"')
      .addSelect([
        'to_char(MIN("startDate") , \'yyyy-mm-dd\') AS "startDate"',
        'to_char(MAX("endDate") , \'yyyy-mm-dd\') AS "endDate"',
        'MAX(event."activeTrigger"::int)::boolean AS "activeTrigger"',
        'MAX(event."thresholdReached"::int)::boolean AS "thresholdReached"',
      ])
      .where('closed = :closed', {
        closed: false,
      })
      .andWhere('"endDate" >= :date', { date: recentDate.date })
      .andWhere(
        // for typhoon/flash-floods filter also on activeTrigger = true, thereby disabling old-event scenario
        `(event."disasterType" NOT IN ('typhoon','flash-floods') OR (event."disasterType" IN ('typhoon','flash-floods') AND event."activeTrigger" = true))`,
      )
      .andWhere('area."countryCodeISO3" = :countryCodeISO3', {
        countryCodeISO3: countryCodeISO3,
      })
      .andWhere('event."disasterType" = :disasterType', {
        disasterType: disasterType,
      })
      .getRawMany();

    for await (const event of eventSummary) {
      event.firstLeadTime = await this.getFirstLeadTime(
        countryCodeISO3,
        disasterType,
        event.eventName,
      );
      if (disasterType === DisasterType.Typhoon) {
        event.disasterSpecificProperties =
          await this.typhoonTrackService.getTyphoonSpecificProperties(
            countryCodeISO3,
            event.eventName,
          );
      }
    }
    return eventSummary;
  }

  public async getRecentDate(
    countryCodeISO3: string,
    disasterType: DisasterType,
  ): Promise<DateDto> {
    return this.helperService.getRecentDate(countryCodeISO3, disasterType);
  }

  public async uploadTriggerPerLeadTime(
    uploadTriggerPerLeadTimeDto: UploadTriggerPerLeadTimeDto,
  ): Promise<void> {
    uploadTriggerPerLeadTimeDto.date =
      this.helperService.setDayToLastDayOfMonth(
        uploadTriggerPerLeadTimeDto.date,
        uploadTriggerPerLeadTimeDto.triggersPerLeadTime[0].leadTime,
      );
    const triggersPerLeadTime: TriggerPerLeadTime[] = [];
    const timestamp = uploadTriggerPerLeadTimeDto.date || new Date();
    for (const leadTime of uploadTriggerPerLeadTimeDto.triggersPerLeadTime) {
      // Delete existing entries in case of a re-run of the pipeline for some reason
      await this.deleteDuplicates(uploadTriggerPerLeadTimeDto, leadTime);

      const triggerPerLeadTime = new TriggerPerLeadTime();
      triggerPerLeadTime.date = uploadTriggerPerLeadTimeDto.date || new Date();
      triggerPerLeadTime.timestamp = timestamp;
      triggerPerLeadTime.countryCodeISO3 =
        uploadTriggerPerLeadTimeDto.countryCodeISO3;
      triggerPerLeadTime.leadTime = leadTime.leadTime as LeadTime;
      triggerPerLeadTime.triggered = leadTime.triggered;
      triggerPerLeadTime.thresholdReached =
        leadTime.triggered && leadTime.thresholdReached;
      triggerPerLeadTime.disasterType =
        uploadTriggerPerLeadTimeDto.disasterType;
      triggerPerLeadTime.eventName = uploadTriggerPerLeadTimeDto.eventName;

      triggersPerLeadTime.push(triggerPerLeadTime);
    }

    await this.triggerPerLeadTimeRepository.save(triggersPerLeadTime);
  }

  private async deleteDuplicates(
    uploadTriggerPerLeadTimeDto: UploadTriggerPerLeadTimeDto,
    selectedLeadTime: TriggerPerLeadTimeDto,
  ): Promise<void> {
    const deleteFilters = {
      countryCodeISO3: uploadTriggerPerLeadTimeDto.countryCodeISO3,
      disasterType: uploadTriggerPerLeadTimeDto.disasterType,
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          uploadTriggerPerLeadTimeDto.disasterType,
          uploadTriggerPerLeadTimeDto.date,
        ),
      ),
    };
    if (uploadTriggerPerLeadTimeDto.eventName) {
      deleteFilters['eventName'] = uploadTriggerPerLeadTimeDto.eventName;
    }
    // Do not overwrite based on 'leadTime' as typhoon should also overwrite if lead-time has changed (as it's a calculated field, instead of fixed)
    if (uploadTriggerPerLeadTimeDto.disasterType !== DisasterType.Typhoon) {
      deleteFilters['leadTime'] = selectedLeadTime.leadTime as LeadTime;
    }
    await this.triggerPerLeadTimeRepository.delete(deleteFilters);
  }

  private async deleteDuplicateEvents(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
    date: Date,
  ): Promise<void> {
    const countryAdminAreaIds = await this.getCountryAdminAreaIds(
      countryCodeISO3,
    );
    const deleteFilters = {
      adminArea: In(countryAdminAreaIds),
      disasterType: disasterType,
      startDate: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(disasterType, date),
      ),
    };
    if (eventName) {
      deleteFilters['eventName'] = eventName;
    }
    const eventAreasToDelete = await this.eventPlaceCodeRepo.find({
      where: deleteFilters,
    });
    await this.eventPlaceCodeRepo.remove(eventAreasToDelete);
  }

  public async getTriggerUnit(disasterType: DisasterType): Promise<string> {
    return (
      await this.disasterTypeRepository.findOne({
        select: ['triggerUnit'],
        where: { disasterType: disasterType },
      })
    ).triggerUnit;
  }

  public async getTriggeredAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    adminLevel: number,
    leadTime: string,
    eventName: string,
  ): Promise<TriggeredArea[]> {
    const lastTriggeredDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );
    const triggerUnit = await this.getTriggerUnit(disasterType);
    const defaultAdminLevel = (
      await this.countryRepository.findOne({
        where: { countryCodeISO3: countryCodeISO3 },
        relations: ['countryDisasterSettings'],
      })
    ).countryDisasterSettings.find(
      (d) => d.disasterType === disasterType,
    ).defaultAdminLevel;

    const whereFiltersDynamicData = {
      indicator: triggerUnit,
      value: MoreThan(0),
      adminLevel: adminLevel,
      disasterType: disasterType,
      countryCodeISO3: countryCodeISO3,
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          disasterType,
          lastTriggeredDate.timestamp,
        ),
      ),
    };
    if (eventName) {
      whereFiltersDynamicData['eventName'] = eventName;
    }
    if (leadTime) {
      whereFiltersDynamicData['leadTime'] = leadTime;
    }
    const triggeredAreasRaw = await this.adminAreaDynamicDataRepo
      .createQueryBuilder('dynamic')
      .select(['dynamic.placeCode AS "placeCode"'])
      .where(whereFiltersDynamicData)
      .execute();
    const triggeredPlaceCodes = triggeredAreasRaw.map(
      (element) => element.placeCode,
    );

    if (adminLevel > defaultAdminLevel) {
      // Use this to also return something on deeper levels than default (to show in chat-section)
      return this.getDeeperTriggeredAreas(
        triggeredPlaceCodes,
        disasterType,
        lastTriggeredDate,
      );
    }

    const whereFiltersEvent = {
      closed: false,
      disasterType: disasterType,
    };
    if (eventName) {
      whereFiltersEvent['eventName'] = eventName;
    }
    const triggeredAreasQuery = this.eventPlaceCodeRepo
      .createQueryBuilder('event')
      .select([
        'area."placeCode" AS "placeCode"',
        'area.name AS name',
        'area."adminLevel" AS "adminLevel"',
        'event."actionsValue"',
        'event."eventPlaceCodeId"',
        'event."activeTrigger"',
        'event."stopped"',
        'event."startDate"',
        'event."manualStoppedDate" AS "stoppedDate"',
        '"user"."firstName" || \' \' || "user"."lastName" AS "displayName"',
        'parent.name AS "nameParent"',
      ])
      .leftJoin('event.adminArea', 'area')
      .leftJoin('event.user', 'user')
      .leftJoin(
        AdminAreaEntity,
        'parent',
        'area."placeCodeParent" = parent."placeCode"',
      )
      .where(whereFiltersEvent)
      .andWhere('area."countryCodeISO3" = :countryCodeISO3', {
        countryCodeISO3: countryCodeISO3,
      })
      .orderBy('event."actionsValue"', 'DESC');

    if (triggeredPlaceCodes.length) {
      triggeredAreasQuery.andWhere('area."placeCode" IN(:...placeCodes)', {
        placeCodes: triggeredPlaceCodes,
      });
    }
    const triggeredAreas = await triggeredAreasQuery.getRawMany();

    for (const area of triggeredAreas) {
      if (
        triggeredPlaceCodes.length === 0 &&
        disasterType === DisasterType.Typhoon
      ) {
        // Exception to speed up typhoon performance. Works because old-event is switched off for typhoon. Should be refactored better.
        area.eapActions = [];
      } else {
        area.eapActions = await this.eapActionsService.getActionsWithStatus(
          countryCodeISO3,
          disasterType,
          area.placeCode,
          eventName,
        );
      }
    }
    return triggeredAreas;
  }

  private async getDeeperTriggeredAreas(
    triggeredPlaceCodes: string[],
    disasterType: DisasterType,
    lastTriggeredDate: DateDto,
  ): Promise<TriggeredArea[]> {
    const actionUnit = await this.getActionUnit(disasterType);
    const areas = await this.adminAreaDynamicDataRepo
      .createQueryBuilder('dynamic')
      .where({
        placeCode: In(triggeredPlaceCodes),
        indicator: actionUnit,
        timestamp: MoreThanOrEqual(
          this.helperService.getUploadCutoffMoment(
            disasterType,
            lastTriggeredDate.timestamp,
          ),
        ),
      })
      .leftJoinAndSelect(
        AdminAreaEntity,
        'area',
        'dynamic."placeCode" = area."placeCode"',
      )
      // add parent event (for data on 'stopped' areas 1 level deeper than default)
      .leftJoin(
        AdminAreaEntity,
        'parent',
        'area."placeCodeParent" = parent."placeCode"',
      )
      .leftJoin('parent.eventPlaceCodes', 'parentEvent')
      .leftJoin('parentEvent.user', 'parentUser')
      // add grandparent event (for data on 'stopped' areas 2 levels deeper than default)
      .leftJoin(
        AdminAreaEntity,
        'grandparent',
        'parent."placeCodeParent" = grandparent."placeCode"',
      )
      .leftJoin('grandparent.eventPlaceCodes', 'grandparentEvent')
      .leftJoin('grandparentEvent.user', 'grandparentUser')
      .select([
        'dynamic."placeCode" AS "placeCode"',
        'area.name AS name',
        'area."adminLevel" AS "adminLevel"',
        'dynamic.value AS value',
        'COALESCE("parentEvent"."startDate","grandparentEvent"."startDate") AS "startDate"',
        'COALESCE(parentEvent.stopped,"grandparentEvent".stopped) AS stopped',
        'COALESCE("parentEvent"."manualStoppedDate","grandparentEvent"."manualStoppedDate") AS "stoppedDate"',
        'COALESCE("parentUser"."firstName","grandparentUser"."firstName") || \' \' || COALESCE("parentUser"."lastName","grandparentUser"."lastName") AS "displayName"',
      ])
      .getRawMany();
    return areas.map((area) => {
      return {
        placeCode: area.placeCode,
        name: area.name,
        nameParent: null,
        actionsValue: area.value,
        stopped: area.stopped,
        startDate: area.startDate,
        stoppedDate: area.stoppedDate,
        displayName: area.displayName,
        eapActions: [],
      };
    });
  }

  public async getActivationLogData(
    countryCodeISO3?: string,
    disasterType?: string,
  ): Promise<ActivationLogDto[]> {
    let baseQuery = this.eventPlaceCodeRepo
      .createQueryBuilder('event')
      .select([
        'area."countryCodeISO3" AS "countryCodeISO3"',
        'event."disasterType"',
        'COALESCE(event."eventName", \'no name\') AS "eventName"',
        'area."placeCode" AS "placeCode"',
        'area.name AS name',
        'event."startDate"',
        'event.stopped as stopped',
        'case when event.stopped = true then event."manualStoppedDate" end as "stopDate"',
        'event.closed as closed',
        'case when event.closed = true then event."endDate" end as "endDate"',
        'disaster."actionsUnit" as "exposureIndicator"',
        'event."actionsValue" as "exposureValue"',
        'event."eventPlaceCodeId" as "databaseId"',
      ])
      .leftJoin('event.adminArea', 'area')
      .leftJoin('event.disasterType', 'disaster')
      .where({ thresholdReached: true })
      .orderBy('event."startDate"', 'DESC')
      .addOrderBy('area."countryCodeISO3"', 'ASC')
      .addOrderBy('event."disasterType"', 'ASC')
      .addOrderBy('area."placeCode"', 'ASC');

    if (countryCodeISO3 && disasterType) {
      baseQuery = baseQuery
        .andWhere('event."disasterType" = :disasterType', {
          disasterType: disasterType,
        })
        .andWhere('area."countryCodeISO3" = :countryCodeISO3', {
          countryCodeISO3: countryCodeISO3,
        });
    }
    const activationLogData = await baseQuery.getRawMany();

    if (!activationLogData.length) {
      return [new ActivationLogDto()];
    }

    return activationLogData;
  }

  private async getFirstLeadTime(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
  ) {
    const timesteps = await this.getTriggerPerLeadtime(
      countryCodeISO3,
      disasterType,
      eventName,
    );
    let firstKey = null;
    if (timesteps) {
      Object.keys(timesteps)
        .filter((key) => Object.values(LeadTime).includes(key as LeadTime))
        .sort((a, b) =>
          Number(a.split('-')[0]) > Number(b.split('-')[0]) ? 1 : -1,
        )
        .forEach((key) => {
          if (timesteps[key] === '1') {
            firstKey = !firstKey ? key : firstKey;
          }
        });
    }
    return firstKey;
  }

  public async getTriggerPerLeadtime(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
  ): Promise<object> {
    const lastTriggeredDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );
    const whereFilters = {
      countryCodeISO3: countryCodeISO3,
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          disasterType,
          lastTriggeredDate.timestamp,
        ),
      ),
      disasterType: disasterType,
    };
    if (eventName) {
      whereFilters['eventName'] = eventName;
    }

    const triggersPerLeadTime = await this.triggerPerLeadTimeRepository.find({
      where: whereFilters,
    });

    if (triggersPerLeadTime.length === 0) {
      return;
    }
    const result = {};
    result['date'] = triggersPerLeadTime[0].date;
    result['countryCodeISO3'] = triggersPerLeadTime[0].countryCodeISO3;
    for (const leadTimeKey in LeadTime) {
      const leadTimeUnit = LeadTime[leadTimeKey];
      const leadTimeIsTriggered = triggersPerLeadTime.find(
        (el): boolean => el.leadTime === leadTimeUnit,
      );
      if (leadTimeIsTriggered) {
        result[leadTimeUnit] = String(Number(leadTimeIsTriggered.triggered));
        result[`${leadTimeUnit}-thresholdReached`] = String(
          Number(leadTimeIsTriggered.thresholdReached),
        );
      }
    }
    return result;
  }

  public async toggleStoppedTrigger(
    userId: string,
    eventPlaceCodeDto: EventPlaceCodeDto,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { userId: userId },
    });
    if (!user) {
      const errors = 'User not found';
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }
    const eventPlaceCode = await this.eventPlaceCodeRepo.findOne({
      where: { eventPlaceCodeId: eventPlaceCodeDto.eventPlaceCodeId },
    });
    if (!eventPlaceCode) {
      const errors = 'Event placeCode not found';
      throw new HttpException({ errors }, HttpStatus.NOT_FOUND);
    }
    eventPlaceCode.stopped = !eventPlaceCode.stopped;
    eventPlaceCode.manualStoppedDate = new Date();
    eventPlaceCode.user = user;
    await this.eventPlaceCodeRepo.save(eventPlaceCode);
  }

  public async getCountryAdminAreaIds(
    countryCodeISO3: string,
  ): Promise<string[]> {
    return (
      await this.adminAreaRepository.find({
        select: ['id'],
        where: { countryCodeISO3: countryCodeISO3 },
      })
    ).map((area) => area.id);
  }

  private async getActionUnit(disasterType: DisasterType): Promise<string> {
    return (
      await this.disasterTypeRepository.findOne({
        select: ['actionsUnit'],
        where: { disasterType: disasterType },
      })
    ).actionsUnit;
  }

  public async processEventAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    adminLevel: number,
    eventName: string,
    date: Date,
  ): Promise<void> {
    // First delete duplicate events for upload within same time-block
    await this.deleteDuplicateEvents(
      countryCodeISO3,
      disasterType,
      eventName,
      date,
    );

    // Then set all events to inactive
    await this.setAllEventsToInactive(countryCodeISO3, disasterType);

    // update active ones to true + update population and end_date
    await this.updateExistingEventAreas(
      countryCodeISO3,
      disasterType,
      adminLevel,
      eventName,
    );

    // add new ones
    await this.addNewEventAreas(
      countryCodeISO3,
      disasterType,
      adminLevel,
      eventName,
    );

    // close old events
    await this.closeEventsAutomatic(countryCodeISO3, disasterType, eventName);
  }

  private async setAllEventsToInactive(
    countryCodeISO3: string,
    disasterType: DisasterType,
  ) {
    const countryAdminAreaIds = await this.getCountryAdminAreaIds(
      countryCodeISO3,
    );
    // only set records that are not updated yet in this sequence of pipeline runs (e.g. multiple events in 1 day)
    // after the 1st event this means everything is updated ..
    // .. and from the 2nd event onwards if will not be set to activeTrigger=false again ..
    const recentDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );
    const cutoffDate = this.helperService.getUploadCutoffMoment(
      disasterType,
      recentDate.timestamp,
    );
    const endDate = await this.getEndDate(disasterType, cutoffDate);

    // .. but only check on endDate if eventName is not null > I cannot remember why..
    const eventAreas = await this.eventPlaceCodeRepo.find({
      where: [
        {
          adminArea: { id: In(countryAdminAreaIds) },
          disasterType: disasterType,
          activeTrigger: true,
          endDate: LessThan(endDate),
        },
        {
          adminArea: { id: In(countryAdminAreaIds) },
          disasterType: disasterType,
          activeTrigger: true,
          eventName: IsNull(),
        },
      ],
    });

    if (eventAreas.length) {
      await this.eventPlaceCodeRepo
        .createQueryBuilder()
        .update()
        .set({
          activeTrigger: false,
        })
        .where({
          eventPlaceCodeId: In(eventAreas.map((area) => area.eventPlaceCodeId)),
        })
        .execute();
    }
  }

  private async getAffectedAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    adminLevel: number,
    eventName: string,
  ): Promise<AffectedAreaDto[]> {
    const triggerUnit = await this.getTriggerUnit(disasterType);

    const lastTriggeredDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );

    const whereFilters = {
      indicator: triggerUnit,
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          disasterType,
          lastTriggeredDate.timestamp,
        ),
      ),
      countryCodeISO3: countryCodeISO3,
      adminLevel: adminLevel,
      disasterType: disasterType,
      eventName: eventName || IsNull(),
    };

    const triggeredPlaceCodes = await this.adminAreaDynamicDataRepo
      .createQueryBuilder('area')
      .select('area."placeCode"')
      .addSelect('MAX(area.value) AS "triggerValue"')
      .where(whereFilters)
      .andWhere(
        `(area.value > 0 OR (area."eventName" is not null AND area."disasterType" IN ('flash-floods','typhoon')))`,
      ) // Also allow value=0 entries with typhoon/flash-floods and event name (= below trigger event)
      .groupBy('area."placeCode"')
      .getRawMany();

    const triggerPlaceCodesArray = triggeredPlaceCodes.map((a) => a.placeCode);

    if (triggerPlaceCodesArray.length === 0) {
      return [];
    }

    const actionUnit = await this.getActionUnit(disasterType);

    const whereOptions = {
      placeCode: In(triggerPlaceCodesArray),
      indicator: actionUnit,
      timestamp: MoreThanOrEqual(
        this.helperService.getUploadCutoffMoment(
          disasterType,
          lastTriggeredDate.timestamp,
        ),
      ),
      countryCodeISO3: countryCodeISO3,
      adminLevel: adminLevel,
      disasterType: disasterType,
    };
    if (eventName) {
      whereFilters['eventName'] = eventName;
    }

    const affectedAreas: AffectedAreaDto[] = await this.adminAreaDynamicDataRepo
      .createQueryBuilder('area')
      .select('area."placeCode"')
      .addSelect('MAX(area.value) AS "actionsValue"')
      .addSelect('MAX(area."leadTime") AS "leadTime"')
      .where(whereOptions)
      .andWhere('(area.value > 0 OR area."eventName" is not null)') // Also allow value=0 entries with event name (= below trigger event)
      .groupBy('area."placeCode"')
      .getRawMany();

    for (const area of affectedAreas) {
      area.triggerValue = triggeredPlaceCodes.find(
        (p) => p.placeCode === area.placeCode,
      ).triggerValue;
    }

    return affectedAreas;
  }

  private async updateExistingEventAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    adminLevel: number,
    eventName: string,
  ): Promise<void> {
    const affectedAreas = await this.getAffectedAreas(
      countryCodeISO3,
      disasterType,
      adminLevel,
      eventName,
    );
    const countryAdminAreaIds = await this.getCountryAdminAreaIds(
      countryCodeISO3,
    );
    const unclosedEventAreas = await this.eventPlaceCodeRepo.find({
      where: {
        closed: false,
        adminArea: In(countryAdminAreaIds),
        disasterType: disasterType,
        eventName: eventName || IsNull(),
      },
      relations: ['adminArea'],
    });

    // To optimize performance here ..
    const idsToUpdateAboveThreshold = [];
    const idsToUpdateBelowThreshold = [];
    const uploadDate = await this.getRecentDate(countryCodeISO3, disasterType);
    const endDate = await this.getEndDate(disasterType, uploadDate.timestamp);
    unclosedEventAreas.forEach((eventArea) => {
      const affectedArea = affectedAreas.find(
        (area) => area.placeCode === eventArea.adminArea.placeCode,
      );
      if (affectedArea) {
        eventArea.activeTrigger = true;
        eventArea.endDate = endDate;
        if (affectedArea.triggerValue > 0) {
          eventArea.thresholdReached = true;
          idsToUpdateAboveThreshold.push(eventArea.eventPlaceCodeId);
        } else {
          eventArea.thresholdReached = false;
          idsToUpdateBelowThreshold.push(eventArea.eventPlaceCodeId);
        }
      }
    });
    // .. first fire one query to update all rows that need thresholdReached = true
    await this.updateEvents(idsToUpdateAboveThreshold, true, endDate);

    // .. then fire one query to update all rows that need thresholdReached = false
    await this.updateEvents(idsToUpdateBelowThreshold, false, endDate);

    // .. lastly we update those records where actionsValue changed
    await this.updateActionsValue(unclosedEventAreas, affectedAreas);
  }

  private async updateEvents(
    eventPlaceCodeIds: string[],
    aboveThreshold: boolean,
    endDate: Date,
  ) {
    if (eventPlaceCodeIds.length) {
      await this.eventPlaceCodeRepo
        .createQueryBuilder()
        .update()
        .set({
          activeTrigger: true,
          thresholdReached: aboveThreshold,
          endDate: endDate,
        })
        .where({ eventPlaceCodeId: In(eventPlaceCodeIds) })
        .execute();
    }
  }

  private async updateActionsValue(
    unclosedEventAreas: EventPlaceCodeEntity[],
    affectedAreas: AffectedAreaDto[],
  ) {
    let affectedArea: AffectedAreaDto;
    const eventAreasToUpdate = [];
    for await (const eventArea of unclosedEventAreas) {
      affectedArea = affectedAreas.find(
        (area) => area.placeCode === eventArea.adminArea.placeCode,
      );
      if (
        affectedArea &&
        eventArea.actionsValue !== affectedArea.actionsValue
      ) {
        eventArea.actionsValue = affectedArea.actionsValue;
        eventAreasToUpdate.push(
          `('${eventArea.eventPlaceCodeId}',${eventArea.actionsValue})`,
        );
      }
    }
    if (eventAreasToUpdate.length) {
      const repository = this.dataSource.getRepository(EventPlaceCodeEntity);
      const updateQuery = `UPDATE "${repository.metadata.schema}"."${
        repository.metadata.tableName
      }" epc \
      SET "actionsValue" = areas.value \
      FROM (VALUES ${eventAreasToUpdate.join(',')}) areas(id,value) \
      WHERE areas.id::uuid = epc."eventPlaceCodeId" \
      `;
      await this.dataSource.query(updateQuery);
    }
  }

  private async addNewEventAreas(
    countryCodeISO3: string,
    disasterType: DisasterType,
    adminLevel: number,
    eventName: string,
  ): Promise<void> {
    const affectedAreas = await this.getAffectedAreas(
      countryCodeISO3,
      disasterType,
      adminLevel,
      eventName,
    );
    const countryAdminAreaIds = await this.getCountryAdminAreaIds(
      countryCodeISO3,
    );
    const existingUnclosedEventAreas = (
      await this.eventPlaceCodeRepo.find({
        where: {
          closed: false,
          adminArea: In(countryAdminAreaIds),
          disasterType: disasterType,
          eventName: eventName || IsNull(),
        },
        relations: ['adminArea'],
      })
    ).map((area) => area.adminArea.placeCode);
    const newEventAreas: EventPlaceCodeEntity[] = [];
    const startDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );
    for await (const area of affectedAreas) {
      if (!existingUnclosedEventAreas.includes(area.placeCode)) {
        const adminArea = await this.adminAreaRepository.findOne({
          where: { placeCode: area.placeCode },
        });
        const eventArea = new EventPlaceCodeEntity();
        eventArea.adminArea = adminArea;
        eventArea.eventName = eventName;
        eventArea.thresholdReached = area.triggerValue > 0;
        eventArea.actionsValue = +area.actionsValue;
        eventArea.startDate = startDate.timestamp;
        eventArea.endDate = await this.getEndDate(
          disasterType,
          startDate.timestamp,
        );
        eventArea.activeTrigger = true;
        eventArea.stopped = false;
        eventArea.manualStoppedDate = null;
        eventArea.disasterType = disasterType;
        newEventAreas.push(eventArea);
      }
    }
    await this.eventPlaceCodeRepo.save(newEventAreas);
  }

  private async closeEventsAutomatic(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
  ) {
    const countryAdminAreaIds = await this.getCountryAdminAreaIds(
      countryCodeISO3,
    );
    const uploadDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      disasterType,
    );
    const whereFilters = {
      endDate: LessThan(uploadDate.timestamp),
      adminArea: In(countryAdminAreaIds),
      disasterType: disasterType,
      closed: false,
    };
    if (eventName) {
      whereFilters['eventName'] = eventName;
    }
    const expiredEventAreas = await this.eventPlaceCodeRepo.find({
      where: whereFilters,
    });

    //Below threshold events can be removed from this table after closing
    const belowThresholdEvents = expiredEventAreas.filter(
      (a) => !a.thresholdReached,
    );
    await this.eventPlaceCodeRepo.remove(belowThresholdEvents);

    //For the other ones update 'closed = true'
    const aboveThresholdEvents = expiredEventAreas.filter(
      (a) => a.thresholdReached,
    );
    for await (const area of aboveThresholdEvents) {
      area.closed = true;
    }
    await this.eventPlaceCodeRepo.save(aboveThresholdEvents);
  }

  private async getEndDate(
    disasterType: DisasterType,
    passedDate: Date,
  ): Promise<Date> {
    const today = new Date(JSON.parse(JSON.stringify(passedDate)));

    const disasterTypeEntity = await this.disasterTypeRepository.findOne({
      where: { disasterType: disasterType },
    });
    return disasterTypeEntity.leadTimeUnit === LeadTimeUnit.month
      ? new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
      : new Date(today.setDate(today.getDate() + 7));
  }

  public async postEventMapImage(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
    imageFileBlob,
  ): Promise<void> {
    let eventMapImageEntity = await this.eventMapImageRepository.findOne({
      where: {
        countryCodeISO3: countryCodeISO3,
        disasterType: disasterType,
        eventName: eventName === 'no-name' || !eventName ? IsNull() : eventName,
      },
    });

    if (!eventMapImageEntity) {
      eventMapImageEntity = new EventMapImageEntity();
      eventMapImageEntity.countryCodeISO3 = countryCodeISO3;
      eventMapImageEntity.disasterType = disasterType;
      eventMapImageEntity.eventName =
        eventName === 'no-name' ? null : eventName;
    }

    eventMapImageEntity.image = imageFileBlob.buffer;

    this.eventMapImageRepository.save(eventMapImageEntity);
  }

  public async getEventMapImage(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
  ): Promise<any> {
    const eventMapImageEntity = await this.eventMapImageRepository.findOne({
      where: {
        countryCodeISO3: countryCodeISO3,
        disasterType: disasterType,
        eventName: eventName === 'no-name' || !eventName ? IsNull() : eventName,
      },
    });

    return eventMapImageEntity?.image;
  }
}
