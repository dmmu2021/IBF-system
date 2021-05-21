import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlofasStationForecastEntity } from './glofas-station-forecast.entity';
import { GlofasStationEntity } from './glofas-station.entity';
import { GlofasStationService } from './glofas-station.service';

describe('GlofasStationService', (): void => {
  let service: GlofasStationService;

  beforeEach(
    async (): Promise<void> => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot(),
          TypeOrmModule.forFeature([
            GlofasStationEntity,
            GlofasStationForecastEntity,
          ]),
        ],
        providers: [GlofasStationService],
      }).compile();

      service = module.get<GlofasStationService>(GlofasStationService);
    },
  );

  it('should be defined', (): void => {
    expect(service).toBeDefined();
  });
});
