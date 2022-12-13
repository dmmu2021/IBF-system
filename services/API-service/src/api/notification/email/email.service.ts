/* eslint-disable @typescript-eslint/camelcase */
import { AdminAreaDynamicDataService } from './../../admin-area-dynamic-data/admin-area-dynamic-data.service';
import { LeadTimeEntity } from './../../lead-time/lead-time.entity';
import { CountryEntity } from './../../country/country.entity';
import { Injectable } from '@nestjs/common';
import { EventService } from '../../event/event.service';
import fs from 'fs';
import Mailchimp from 'mailchimp-api-v3';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndicatorMetadataEntity } from '../../metadata/indicator-metadata.entity';
import { LeadTime } from '../../admin-area-dynamic-data/enum/lead-time.enum';
import { DynamicIndicator } from '../../admin-area-dynamic-data/enum/dynamic-data-unit';
import { DisasterType } from '../../disaster/disaster-type.enum';
import { EventSummaryCountry } from '../../../shared/data.model';
import { NotificationContentService } from './../notification-content/notification-content.service';
import { HelperService } from '../../../shared/helper.service';

class ReplaceKeyValue {
  replaceKey: string;
  replaceValue: string;
}

@Injectable()
export class EmailService {
  @InjectRepository(IndicatorMetadataEntity)
  private readonly indicatorRepository: Repository<IndicatorMetadataEntity>;

  private placeholderToday = '(TODAY)';
  private fromEmail = process.env.SUPPORT_EMAIL_ADDRESS;
  private fromEmailName = 'IBF portal';

  private mailchimp = new Mailchimp(process.env.MC_API);

  public constructor(
    private readonly eventService: EventService,
    private readonly adminAreaDynamicDataService: AdminAreaDynamicDataService,
    private readonly notificationContentService: NotificationContentService,
    private readonly helperService: HelperService,
  ) {}

  private getSegmentId(countryCodeISO3: string): number {
    const segments = process.env.MC_SEGMENTS.split(',').map(segment =>
      segment.split(':'),
    );
    return Number(segments.find(s => s[0] === countryCodeISO3)[1]);
  }

  public async prepareAndSendEmail(
    country: CountryEntity,
    disasterType: DisasterType,
    activeEvents: EventSummaryCountry[],
  ): Promise<void> {
    const replaceKeyValues = await this.createReplaceKeyValues(
      country,
      disasterType,
      activeEvents,
    );
    const emailHtml = this.formatEmail(replaceKeyValues);
    const emailSubject = `IBF ${disasterType} warning`;
    this.sendEmail(emailSubject, emailHtml, country.countryCodeISO3);
  }

  private async sendEmail(
    subject: string,
    emailHtml: string,
    countryCodeISO3: string,
  ): Promise<void> {
    const campaignBody = {
      settings: {
        title: new Date().toISOString(),
        subject_line: subject,
        from_name: this.fromEmailName,
        reply_to: this.fromEmail,
        auto_tweet: false,
      },
      recipients: {
        list_id: process.env.MC_LIST_ID,
        segment_opts: {
          saved_segment_id: this.getSegmentId(countryCodeISO3),
        },
      },
      type: 'regular',
    };
    const createResult = await this.mailchimp.post('/campaigns', campaignBody);

    const updateBody = {
      html: emailHtml,
    };
    await this.mailchimp.put(
      `/campaigns/${createResult.id}/content`,
      updateBody,
    );
    await this.mailchimp.post(`/campaigns/${createResult.id}/actions/send`);
  }

  private async createReplaceKeyValues(
    country: CountryEntity,
    disasterType: DisasterType,
    events: EventSummaryCountry[],
  ): Promise<ReplaceKeyValue[]> {
    const emailKeyValueReplaceList = [
      {
        replaceKey: '(SOCIAL-MEDIA-PART)',
        replaceValue: this.getSocialMediaHtml(country),
      },
      {
        replaceKey: '(TABLES-stacked)',
        replaceValue: await this.getTriggerOverviewTables(
          country,
          disasterType,
          events,
        ),
      },
      {
        replaceKey: this.placeholderToday,
        replaceValue: new Date().toLocaleDateString('default', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      },
      {
        replaceKey: '(LEAD-DATE-LIST-SHORT)',
        replaceValue: (
          await this.getLeadTimeList(country, disasterType, events)
        )['leadTimeListShort'],
      },
      {
        replaceKey: '(LEAD-DATE-LIST-LONG)',
        replaceValue: (
          await this.getLeadTimeList(country, disasterType, events)
        )['leadTimeListLong'],
      },
      {
        replaceKey: '(IMG-LOGO)',
        replaceValue: country.notificationInfo.logo,
      },
      {
        replaceKey: '(TRIGGER-STATEMENT)',
        replaceValue: country.notificationInfo.triggerStatement[disasterType],
      },
      {
        replaceKey: '(MAP-IMAGE-PART)',
        replaceValue: await this.getMapImageHtml(country, disasterType, events),
      },
      {
        replaceKey: '(LINK-DASHBOARD)',
        replaceValue: process.env.DASHBOARD_URL,
      },
      {
        replaceKey: '(LINK-EAP-SOP)',
        replaceValue: country.countryDisasterSettings.find(
          s => s.disasterType === disasterType,
        ).eapLink,
      },
      {
        replaceKey: '(SOCIAL-MEDIA-LINK)',
        replaceValue: country.notificationInfo.linkSocialMediaUrl,
      },
      {
        replaceKey: '(SOCIAL-MEDIA-TYPE)',
        replaceValue: country.notificationInfo.linkSocialMediaType,
      },
      {
        replaceKey: '(ADMIN-AREA-PLURAL)',
        replaceValue:
          country.adminRegionLabels[
            String(
              country.countryDisasterSettings.find(
                s => s.disasterType === disasterType,
              ).defaultAdminLevel,
            )
          ].plural,
      },
      {
        replaceKey: '(ADMIN-AREA-SINGULAR)',
        replaceValue:
          country.adminRegionLabels[
            String(
              country.countryDisasterSettings.find(
                s => s.disasterType === disasterType,
              ).defaultAdminLevel,
            )
          ].singular,
      },
      {
        replaceKey: '(DISASTER-TYPE)',
        replaceValue: this.notificationContentService.firstCharOfWordsToUpper(
          (await this.notificationContentService.getDisaster(disasterType))
            .label,
        ),
      },
      {
        replaceKey: '(VIDEO-PDF-LINKS)',
        replaceValue: this.getVideoPdfLinks(
          country.notificationInfo.linkVideo,
          country.notificationInfo.linkPdf,
        ),
      },
    ];
    return emailKeyValueReplaceList;
  }

  private getVideoPdfLinks(videoLink: string, pdfLink: string) {
    const linkVideoHTML = `
                    <a
                        href="${videoLink}"
                        title="Video instructions"
                        target="_blank"
                        style="
                        font-size: 14px;
                        font-family: Helvetica,
                            Arial,
                            sans-serif;
                        font-weight: bold;
                        color: #0c0c0c;
                        display: inline-block;
                    " >
                        here
                    </a>`;

    const linkPdfHTML = `<a href="${pdfLink}"
                        target="_blank"
                        title="PDF instructions"
                        style="
                        font-size: 14px;
                        font-family: Helvetica,
                            Arial,
                            sans-serif;
                        font-weight: bold;
                        color: #0c0c0c;
                        display: inline-block;
                        "  >
                        here
                    </a>`;
    let videoStr = '';
    if (videoLink) {
      videoStr = 'Video' + linkVideoHTML;
    }
    let pdfStr = '';
    if (pdfLink) {
      pdfStr = 'PDF' + linkPdfHTML;
    }
    let andStr = '';
    if (videoStr && pdfStr) {
      andStr = 'and';
    }
    if (videoStr || pdfStr) {
      return `See instructions for the dashboard in the form of a ${videoStr} ${andStr} ${pdfStr}`;
    }
  }

  private async getLeadTimeList(
    country: CountryEntity,
    disasterType: DisasterType,
    events: EventSummaryCountry[],
  ): Promise<object> {
    const triggeredLeadTimes = await this.notificationContentService.getLeadTimesAcrossEvents(
      country.countryCodeISO3,
      disasterType,
      events,
    );
    let leadTimeListShort = '';
    let leadTimeListLong = '';
    for (const leadTime of country.countryDisasterSettings.find(
      s => s.disasterType === disasterType,
    ).activeLeadTimes) {
      if (triggeredLeadTimes[leadTime.leadTimeName] === '1') {
        for await (const event of events) {
          // for each event ..
          const triggeredLeadTimes = await this.eventService.getTriggerPerLeadtime(
            country.countryCodeISO3,
            disasterType,
            event.eventName,
          );
          if (triggeredLeadTimes[leadTime.leadTimeName] === '1') {
            // .. find the right leadtime
            const [leadTimeValue, leadTimeUnit] = leadTime.leadTimeLabel.split(
              '-',
            );

            const eventName = event.eventName
              ? `${event.eventName}`
              : this.notificationContentService.firstCharOfWordsToUpper(
                  (
                    await this.notificationContentService.getDisaster(
                      disasterType,
                    )
                  ).label,
                );

            const triggerStatus = event.thresholdReached
              ? 'trigger reached'
              : 'trigger not reached';

            const dateTimePreposition = leadTimeUnit === 'month' ? 'in' : 'on';
            const dateAndTime = this.notificationContentService.getFirstLeadTimeDate(
              Number(leadTimeValue),
              leadTimeUnit,
            );
            const disasterSpecificCopy = await this.getDisasterSpecificCopy(
              disasterType,
              leadTime,
              event,
            );
            const leadTimeFromNow = `${leadTimeValue} ${leadTimeUnit}s`;

            // We are hack-misusing 'extraInfo' being filled as a proxy for typhoonNoLandfallYet-boolean
            const leadTimeString = disasterSpecificCopy.leadTimeString
              ? disasterSpecificCopy.leadTimeString
              : leadTimeFromNow;

            const timestamp = disasterSpecificCopy.timestamp
              ? ` | ${disasterSpecificCopy.timestamp}`
              : '';

            leadTimeListShort = `${leadTimeListShort}<li>${eventName}: ${
              disasterSpecificCopy.extraInfo ||
              leadTime.leadTimeName === LeadTime.hour0
                ? leadTimeString
                : `${dateAndTime}${timestamp} (${leadTimeString})`
            }</li>`;
            leadTimeListLong = `${leadTimeListLong}<li>${eventName} - <strong>${triggerStatus}</strong>: ${
              disasterSpecificCopy.eventStatus
            }${
              disasterSpecificCopy.extraInfo ||
              leadTime.leadTimeName === LeadTime.hour0
                ? ''
                : ` ${dateTimePreposition} ${dateAndTime}${timestamp} (${leadTimeString})`
            }. ${disasterSpecificCopy.extraInfo}</li>`;
          }
        }
      }
    }
    return { leadTimeListShort, leadTimeListLong };
  }

  private async getTriggerOverviewTables(
    country: CountryEntity,
    disasterType: DisasterType,
    events: EventSummaryCountry[],
  ): Promise<string> {
    const triggeredLeadTimes = await this.notificationContentService.getLeadTimesAcrossEvents(
      country.countryCodeISO3,
      disasterType,
      events,
    );
    let leadTimeTables = '';
    for (const leadTime of country.countryDisasterSettings.find(
      s => s.disasterType === disasterType,
    ).activeLeadTimes) {
      if (triggeredLeadTimes[leadTime.leadTimeName] === '1') {
        for await (const event of events) {
          // for each event ..
          const triggeredLeadTimes = await this.eventService.getTriggerPerLeadtime(
            country.countryCodeISO3,
            disasterType,
            event.eventName,
          );
          if (
            triggeredLeadTimes[leadTime.leadTimeName] === '1' &&
            event.thresholdReached // Only show table if trigger reached
          ) {
            // .. find the right leadtime
            const tableForLeadTime = await this.getTableForLeadTime(
              country,
              disasterType,
              leadTime,
              event,
            );
            leadTimeTables = leadTimeTables + tableForLeadTime;
          }
        }
      }
    }
    return leadTimeTables;
  }

  private getSocialMediaHtml(country: CountryEntity): string {
    if (country.notificationInfo.linkSocialMediaType) {
      return fs.readFileSync(
        './src/api/notification/email/html/social-media-link.html',
        'utf8',
      );
    } else {
      return '';
    }
  }

  private async getMapImageHtml(
    country: CountryEntity,
    disasterType: DisasterType,
    events: EventSummaryCountry[],
  ): Promise<string> {
    let html = '';
    for await (const event of events) {
      const mapImage = await this.eventService.getEventMapImage(
        country.countryCodeISO3,
        disasterType,
        event.eventName || 'no-name',
      );
      if (mapImage) {
        let eventHtml = fs.readFileSync(
          './src/api/notification/email/html/map-image.html',
          'utf8',
        );
        eventHtml = eventHtml.replace(
          '(MAP-IMG-SRC)',
          this.getMapImgSrc(
            country.countryCodeISO3,
            disasterType,
            event.eventName,
          ),
        );
        eventHtml = eventHtml.replace('(EVENT-NAME)', event.eventName);
        html += eventHtml;
      }
    }
    return html;
  }

  private getMapImgSrc(
    countryCodeISO3: string,
    disasterType: DisasterType,
    eventName: string,
  ): string {
    const src = `${
      process.env.NG_API_URL
    }/event/event-map-image/${countryCodeISO3}/${disasterType}/${eventName ||
      'no-name'}`;
    return src;
  }

  private async getTableForLeadTime(
    country: CountryEntity,
    disasterType: DisasterType,
    leadTime: LeadTimeEntity,
    event: EventSummaryCountry,
  ): Promise<string> {
    const adminLevel = country.countryDisasterSettings.find(
      s => s.disasterType === disasterType,
    ).defaultAdminLevel;
    const adminAreaLabels = country.adminRegionLabels[String(adminLevel)];
    const adminAreaLabelsParent =
      country.adminRegionLabels[String(adminLevel - 1)];

    const actionUnit = await this.indicatorRepository.findOne({
      name: (await this.notificationContentService.getDisaster(disasterType))
        .actionsUnit,
    });
    const leadTimeValue = leadTime.leadTimeName.split('-')[0];
    const leadTimeUnit = leadTime.leadTimeName.split('-')[1];

    const zeroHour = leadTime.leadTimeName === LeadTime.hour0;
    const disasterSpecificCopy = this.getDisasterSpecificCopy(
      disasterType,
      leadTime,
      event,
    );

    const tableForLeadTimeStart = `<div>
      <strong>${
        zeroHour
          ? disasterSpecificCopy
          : `Forecast ${
              disasterType === DisasterType.HeavyRain ? 'estimated ' : ''
            }${leadTimeValue} ${leadTimeUnit}(s) from`
      } today (${this.placeholderToday}):</strong>
  </div>
  <table class="notification-alerts-table">
      <caption class="notification-alerts-table-caption">The following table lists all the exposed ${adminAreaLabels.plural.toLowerCase()} in order of ${actionUnit.label.toLowerCase()},</caption>
      <thead>
          <tr>
              <th align="center">Predicted ${actionUnit.label}</th>
              <th align="left">${adminAreaLabels.singular}${
      adminAreaLabelsParent ? ' (' + adminAreaLabelsParent.singular + ')' : ''
    }</th>
          </tr>
      </thead>
      <tbody>
      <br>`;
    const tableForLeadTimeMiddle = await this.getAreaTables(
      country,
      disasterType,
      leadTime,
      event.eventName,
      actionUnit,
    );
    const tableForLeadTimeEnd = '</tbody></table>';
    const tableForLeadTime =
      tableForLeadTimeStart + tableForLeadTimeMiddle + tableForLeadTimeEnd;
    return tableForLeadTime;
  }

  private async getAreaTables(
    country: CountryEntity,
    disasterType: DisasterType,
    leadTime: LeadTimeEntity,
    eventName: string,
    actionUnit: IndicatorMetadataEntity,
  ): Promise<string> {
    const triggeredAreas = await this.eventService.getTriggeredAreas(
      country.countryCodeISO3,
      disasterType,
      country.countryDisasterSettings.find(s => s.disasterType === disasterType)
        .defaultAdminLevel,
      leadTime.leadTimeName,
      eventName,
    );
    const disaster = await this.notificationContentService.getDisaster(
      disasterType,
    );
    let areaTableString = '';
    for (const area of triggeredAreas) {
      const actionUnitValue = await this.adminAreaDynamicDataService.getDynamicAdminAreaDataPerPcode(
        disaster.actionsUnit as DynamicIndicator,
        area.placeCode,
        leadTime.leadTimeName as LeadTime,
        eventName,
      );
      const areaTable = `<tr class='notification-alerts-table-row'>
            <td align='center'>${this.notificationContentService.formatActionUnitValue(
              actionUnitValue,
              actionUnit,
            )}</td>
            <td align='left'>${area.name}${
        area.nameParent ? ' (' + area.nameParent + ')' : ''
      }</td>
          </tr>`;
      areaTableString = areaTableString + areaTable;
    }
    return areaTableString;
  }

  private formatEmail(emailKeyValueReplaceList: ReplaceKeyValue[]): string {
    let emailHtml = fs.readFileSync(
      './src/api/notification/email/html/trigger-notification.html',
      'utf8',
    );
    for (const entry of emailKeyValueReplaceList) {
      emailHtml = emailHtml.split(entry.replaceKey).join(entry.replaceValue);
    }
    return emailHtml;
  }

  private async getDisasterSpecificCopy(
    disasterType: DisasterType,
    leadTime: LeadTimeEntity,
    event: EventSummaryCountry,
  ): Promise<{
    eventStatus: string;
    extraInfo: string;
    leadTimeString?: string;
    timestamp?: string;
  }> {
    switch (disasterType) {
      case DisasterType.HeavyRain:
        return this.getHeavyRainCopy();
      case DisasterType.Typhoon:
        return await this.getTyphoonCopy(leadTime.leadTimeName, event);
      default:
        return { eventStatus: '', extraInfo: '' };
    }
  }

  private getHeavyRainCopy(): {
    eventStatus: string;
    extraInfo: string;
  } {
    return {
      eventStatus: 'Estimated',
      extraInfo: '',
    };
  }

  private async getTyphoonCopy(
    leadTime: string,
    event: EventSummaryCountry,
  ): Promise<{
    eventStatus: string;
    extraInfo: string;
    leadTimeString: string;
    timestamp: string;
  }> {
    const {
      typhoonLandfall,
      typhoonNoLandfallYet,
    } = event.disasterSpecificProperties;
    let eventStatus = '';
    let extraInfo = '';
    let leadTimeString = null;

    if (leadTime === LeadTime.hour0) {
      if (typhoonLandfall) {
        eventStatus = 'Has <strong>already made landfall</strong>';
        leadTimeString = 'Already made landfall';
      } else {
        eventStatus = 'Has already reached the point closest to land';
        leadTimeString = 'reached the point closest to land';
      }
    } else {
      if (typhoonNoLandfallYet) {
        eventStatus =
          '<strong>Landfall time prediction cannot be determined yet</strong>';
        extraInfo = 'Keep monitoring the event.';
        leadTimeString = 'Undetermined landfall';
      } else if (typhoonLandfall) {
        eventStatus = 'Estimated to <strong>make landfall</strong>';
      } else {
        eventStatus =
          '<strong>Not predicted to make landfall</strong>. It is estimated to reach the point closest to land';
      }
    }

    const timestampString = await this.getLeadTimeTimestamp(
      leadTime,
      event.countryCodeISO3,
    );

    return {
      eventStatus: eventStatus,
      extraInfo: extraInfo,
      leadTimeString,
      timestamp: timestampString,
    };
  }

  private async getLeadTimeTimestamp(
    leadTime: string,
    countryCodeISO3: string,
  ): Promise<string> {
    const recentDate = await this.helperService.getRecentDate(
      countryCodeISO3,
      DisasterType.Typhoon,
    );
    const gmtUploadDate = new Date(recentDate.timestamp);
    const hours = Number(leadTime.split('-')[0]);
    const gmtEventDate = new Date(
      gmtUploadDate.setTime(gmtUploadDate.getTime() + hours * 60 * 60 * 1000),
    );

    const timezone = {
      PHL: {
        label: 'PHT',
        difference: 8,
      },
      default: {
        label: 'GMT',
        difference: 0,
      },
    };

    const hourDiff =
      timezone[countryCodeISO3]?.difference || timezone.default.difference;
    const localEventDate = new Date(
      gmtEventDate.setTime(gmtEventDate.getTime() + hourDiff * 60 * 60 * 1000),
    );
    const timezoneLabel =
      timezone[countryCodeISO3]?.label || timezone.default.label;
    return `${localEventDate.getHours()}:00 ${timezoneLabel}`;
  }
}
