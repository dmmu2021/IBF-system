import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Connection } from 'typeorm';
import { SeedInit } from './seed-init';
import { ScriptsService } from './scripts.service';
import { RolesGuard } from '../roles.guard';
import { DisasterType } from '../api/disaster/disaster-type.enum';

class ResetDto {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;
}

export class MockDynamic {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;

  @ApiProperty({ example: 'UGA' })
  @IsIn(['PHL', 'UGA', 'ZMB', 'ETH', 'ZWE', 'EGY'])
  public readonly countryCodeISO3: string;

  @ApiProperty({ example: DisasterType.Floods })
  @IsIn([
    DisasterType.Floods,
    DisasterType.Dengue,
    DisasterType.Malaria,
    DisasterType.Drought,
    DisasterType.HeavyRain,
    DisasterType.Typhoon,
  ])
  public readonly disasterType: DisasterType;

  @ApiProperty()
  @IsNotEmpty()
  public readonly triggered: boolean;

  @ApiProperty({ example: true })
  @IsNotEmpty()
  public readonly removeEvents: boolean;

  @ApiProperty({ example: 1 })
  @IsOptional()
  public readonly eventNr: number;
}

export class MockAll {
  @ApiProperty({ example: 'fill_in_secret' })
  @IsNotEmpty()
  @IsString()
  public readonly secret: string;

  @ApiProperty()
  @IsNotEmpty()
  public readonly triggered: boolean;
}

@Controller('scripts')
@ApiTags('--- mock/seed data ---')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ScriptsController {
  private connection: Connection;

  private readonly scriptsService: ScriptsService;

  public constructor(connection: Connection, scriptsService: ScriptsService) {
    this.connection = connection;
    this.scriptsService = scriptsService;
  }

  @ApiOperation({ summary: 'Reset database with original seed data' })
  @ApiResponse({
    status: 202,
    description: 'Database reset with original seed data.',
  })
  @Post('/reset')
  public async resetDb(@Body() body: ResetDto, @Res() res): Promise<string> {
    if (body.secret !== process.env.RESET_SECRET) {
      return res.status(HttpStatus.FORBIDDEN).send('Not allowed');
    }

    const seed = new SeedInit(this.connection);
    await seed.run();
    return res
      .status(HttpStatus.ACCEPTED)
      .send('Database reset with original seed data.');
  }

  @ApiOperation({
    summary: 'Mock pipeline data for given country and disaster-type',
  })
  @ApiResponse({
    status: 202,
    description:
      'Successfully uploaded mock pipeline data for given country and disaster-type.',
  })
  @Post('/mock-dynamic-data')
  public async mockDynamic(
    @Body() body: MockDynamic,
    @Res() res,
  ): Promise<string> {
    if (body.secret !== process.env.RESET_SECRET) {
      return res.status(HttpStatus.FORBIDDEN).send('Not allowed');
    }

    await this.scriptsService.mockCountry(body);

    return res
      .status(HttpStatus.ACCEPTED)
      .send('Successfully uploaded mock pipeline data.');
  }

  @ApiOperation({
    summary: 'Upload mock data for all countries and disaster-types at once',
  })
  @ApiResponse({
    status: 202,
    description: 'Uploaded mock data for all countries and disaster-types',
  })
  @Post('/mock-all')
  public async mockAll(@Body() body: MockAll, @Res() res): Promise<string> {
    if (body.secret !== process.env.RESET_SECRET) {
      return res.status(HttpStatus.FORBIDDEN).send('Not allowed');
    }

    const result = await this.scriptsService.mockAll(body);

    return res.status(HttpStatus.ACCEPTED).send(result);
  }
}
