
export interface SF2Sample {
  name: string;
  start: number;
  end: number;
  startLoop: number;
  endLoop: number;
  sampleRate: number;
  originalPitch: number;
  pitchCorrection: number;
  sampleLink: number;
  sampleType: number;
  data?: Int16Array;
}

export interface SF2Generator {
  operator: number;
  amount: number;
}

export interface SF2Bag {
  generatorStart: number;
  modulatorStart: number;
  generators: SF2Generator[];
}

export interface SF2Instrument {
  name: string;
  bagIndex: number;
  bags: SF2Bag[];
}

export interface SF2Preset {
  name: string;
  preset: number;
  bank: number;
  bagIndex: number;
  library: number;
  genre: number;
  morphology: number;
  bags: SF2Bag[];
}

export interface ConversionStatus {
  stage: 'idle' | 'parsing' | 'converting' | 'zipping' | 'complete' | 'error';
  progress: number;
  message: string;
}
