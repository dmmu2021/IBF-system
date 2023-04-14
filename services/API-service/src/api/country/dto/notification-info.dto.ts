import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NotificationInfoDto {
  @ApiProperty()
  @IsString()
  public countryCodeISO3: string;

  @ApiProperty()
  public logo: {};

  @ApiProperty()
  public triggerStatement: {};

  @ApiProperty()
  @IsString()
  public linkSocialMediaType: string;

  @ApiProperty()
  @IsString()
  public linkSocialMediaUrl: string;

  @ApiProperty()
  @IsString()
  public linkVideo: string;

  @ApiProperty()
  @IsString()
  public linkPdf: string;

  @ApiProperty()
  @IsOptional()
  public useWhatsapp?: {};

  @ApiProperty()
  @IsOptional()
  public whatsappMessage?: {};

  @ApiProperty()
  @IsOptional()
  @IsString()
  public externalEarlyActionForm?: string;

  @ApiProperty()
  public mailSegment: {};
}
