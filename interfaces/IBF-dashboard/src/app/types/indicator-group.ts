import { LayerActivation } from '../models/layer-activation.enum';
import { ColorBreaks, IbfLayerLabel, IbfLayerName } from './ibf-layer';

export class Indicator {
  countryDisasterTypes: JSON;
  name: IbfLayerName;
  label: IbfLayerLabel;
  icon: string;
  active: LayerActivation;
  numberFormatMap: NumberFormat;
  numberFormatAggregate: NumberFormat;
  weightedAvg: boolean;
  weightVar: IbfLayerName;
  colorBreaks?: ColorBreaks;
  order: number;
  unit?: string;
  lazyLoad: boolean;
  dynamic?: boolean;
  description: JSON;
  aggregateUnit: string;
}

export enum NumberFormat {
  decimal0 = 'decimal0',
  decimal2 = 'decimal2',
  perc = 'perc',
}
