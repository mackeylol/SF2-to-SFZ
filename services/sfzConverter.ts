
import { SF2Preset, SF2Sample, SF2Generator, SF2Bag } from '../types';

// Generator IDs from SF2 Spec
const OPER_START_ADDR_OFFSET = 0;
const OPER_END_ADDR_OFFSET = 1;
const OPER_START_LOOP_ADDR_OFFSET = 2;
const OPER_END_LOOP_ADDR_OFFSET = 3;
const OPER_INITIAL_FILTER_CUTOFF = 8;
const OPER_INITIAL_FILTER_Q = 9;
const OPER_PAN = 17;
const OPER_DELAY_MOD_LFO = 21;
const OPER_FREQ_MOD_LFO = 22;
const OPER_DELAY_VIB_LFO = 23;
const OPER_FREQ_VIB_LFO = 24;
const OPER_DELAY_MOD_ENV = 25;
const OPER_ATTACK_MOD_ENV = 26;
const OPER_HOLD_MOD_ENV = 27;
const OPER_DECAY_MOD_ENV = 28;
const OPER_SUSTAIN_MOD_ENV = 29;
const OPER_RELEASE_MOD_ENV = 30;
const OPER_DELAY_VOL_ENV = 33;
const OPER_ATTACK_VOL_ENV = 34;
const OPER_HOLD_VOL_ENV = 35;
const OPER_DECAY_VOL_ENV = 36;
const OPER_SUSTAIN_VOL_ENV = 37;
const OPER_RELEASE_VOL_ENV = 38;
const OPER_INSTRUMENT = 41;
const OPER_KEY_RANGE = 43;
const OPER_VEL_RANGE = 44;
const OPER_INITIAL_ATTENUATION = 48;
const OPER_COARSE_TUNE = 51;
const OPER_FINE_TUNE = 52;
const OPER_SAMPLE_ID = 53;
const OPER_SAMPLE_MODES = 54;
const OPER_SCALE_TUNING = 56;
const OPER_OVERRIDING_ROOT_KEY = 58;

const tcToSec = (tc: number) => Math.pow(2, tc / 1200);

export class SFZConverter {
  public static sanitize(name: string): string {
    return name.replace(/[^A-Za-z0-9_\-]/g, '_').trim();
  }

  public static createWavBuffer(sample: SF2Sample): ArrayBuffer {
    if (!sample.data) throw new Error('No sample data found');
    
    const buffer = new ArrayBuffer(44 + sample.data.length * 2);
    const view = new DataView(buffer);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + sample.data.length * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true); 
    view.setUint32(24, sample.sampleRate, true);
    view.setUint32(28, sample.sampleRate * 2, true);
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true); 
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, sample.data.length * 2, true);

    for (let i = 0; i < sample.data.length; i++) {
      view.setInt16(44 + i * 2, sample.data[i], true);
    }
    return buffer;
  }

  private static getGenerators(bags: any[], genList: any[], bagIdx: number): Record<number, number> {
    const gens: Record<number, number> = {};
    if (bagIdx < 0 || bagIdx >= bags.length) return gens;
    
    const start = bags[bagIdx].generatorStart;
    const end = (bags[bagIdx + 1]?.generatorStart) || genList.length;
    for (let i = start; i < end; i++) {
      gens[genList[i].operator] = genList[i].amount;
    }
    return gens;
  }

  public static getSFZContent(
    preset: SF2Preset,
    parsedData: any,
    outputBase: string
  ): string {
    const presetNameClean = preset.name.trim();
    let sfz = `// ${presetNameClean}\n`;
    sfz += `// Converted from SF2 to SFZ by SF2 to SFZ Studio\n\n`;
    sfz += `<control>\n`;
    sfz += `default_path=${outputBase} ${presetNameClean} Samples\n\n`;

    const pBagStart = preset.bagIndex;
    const pBagEnd = (parsedData.presets[parsedData.presets.indexOf(preset) + 1]?.bagIndex) || parsedData.pbag.length;

    // First Preset Bag might be Global
    let globalPresetGens: Record<number, number> = {};
    const firstPBagGens = this.getGenerators(parsedData.pbag, parsedData.pgen, pBagStart);
    if (firstPBagGens[OPER_INSTRUMENT] === undefined && pBagEnd > pBagStart) {
        globalPresetGens = firstPBagGens;
    }

    for (let pb = pBagStart; pb < pBagEnd; pb++) {
      const pGens = this.getGenerators(parsedData.pbag, parsedData.pgen, pb);
      if (pGens[OPER_INSTRUMENT] === undefined) continue;

      const instId = pGens[OPER_INSTRUMENT];
      const instrument = parsedData.instruments[instId];
      if (!instrument) continue;

      const iBagStart = instrument.bagIndex;
      const iBagEnd = (parsedData.instruments[instId + 1]?.bagIndex) || parsedData.ibag.length;

      // First Instrument Bag might be Global
      let globalInstGens: Record<number, number> = {};
      const firstIBagGens = this.getGenerators(parsedData.ibag, parsedData.igen, iBagStart);
      if (firstIBagGens[OPER_SAMPLE_ID] === undefined && iBagEnd > iBagStart) {
          globalInstGens = firstIBagGens;
      }

      for (let ib = iBagStart; ib < iBagEnd; ib++) {
        const iGens = this.getGenerators(parsedData.ibag, parsedData.igen, ib);
        if (iGens[OPER_SAMPLE_ID] === undefined) continue;

        const sampleId = iGens[OPER_SAMPLE_ID];
        const sample = parsedData.samples[sampleId];
        if (!sample || sample.name === 'EOS') continue;

        // Summing generators: Preset Global + Preset Local + Instrument Global + Instrument Local
        const combined: Record<number, number> = { ...globalPresetGens, ...pGens, ...globalInstGens, ...iGens };
        
        // Ranges are special: Instrument level overrides Preset level
        if (iGens[OPER_KEY_RANGE] !== undefined) combined[OPER_KEY_RANGE] = iGens[OPER_KEY_RANGE];
        else if (pGens[OPER_KEY_RANGE] !== undefined) combined[OPER_KEY_RANGE] = pGens[OPER_KEY_RANGE];

        if (iGens[OPER_VEL_RANGE] !== undefined) combined[OPER_VEL_RANGE] = iGens[OPER_VEL_RANGE];
        else if (pGens[OPER_VEL_RANGE] !== undefined) combined[OPER_VEL_RANGE] = pGens[OPER_VEL_RANGE];

        sfz += `<region>\n`;
        sfz += `sample=${this.sanitize(sample.name)}.wav\n`;

        // Range Mapping
        const keyRange = combined[OPER_KEY_RANGE];
        if (keyRange !== undefined) {
            const lo = keyRange & 0x7F;
            const hi = (keyRange >> 8) & 0x7F;
            if (lo === hi) sfz += `key=${lo}\n`;
            else sfz += `lokey=${lo} hikey=${hi}\n`;
        } else {
            // Default range if not specified
            sfz += `lokey=0 hikey=127\n`;
        }
        
        const velRange = combined[OPER_VEL_RANGE];
        if (velRange !== undefined) {
            const lo = velRange & 0x7F;
            const hi = (velRange >> 8) & 0x7F;
            sfz += `lovel=${lo} hivel=${hi}\n`;
        }

        // Ampeg
        if (combined[OPER_ATTACK_VOL_ENV] !== undefined) sfz += `ampeg_attack=${tcToSec(combined[OPER_ATTACK_VOL_ENV]).toFixed(4)}\n`;
        if (combined[OPER_DECAY_VOL_ENV] !== undefined) sfz += `ampeg_decay=${tcToSec(combined[OPER_DECAY_VOL_ENV]).toFixed(4)}\n`;
        if (combined[OPER_SUSTAIN_VOL_ENV] !== undefined) {
            const sustainDb = combined[OPER_SUSTAIN_VOL_ENV] / 10;
            const sustainRatio = Math.pow(10, -sustainDb / 20);
            sfz += `ampeg_sustain=${(sustainRatio * 100).toFixed(2)}\n`;
        }

        // Fix: Added missing OPER_RELEASE_VOL_ENV processing and other necessary mapping fields
        if (combined[OPER_RELEASE_VOL_ENV] !== undefined) {
          sfz += `ampeg_release=${tcToSec(combined[OPER_RELEASE_VOL_ENV]).toFixed(4)}\n`;
        }

        // Panning
        if (combined[OPER_PAN] !== undefined) {
          // SF2 pan is -500 to 500 (tenths of percent)
          sfz += `pan=${(combined[OPER_PAN] / 10).toFixed(2)}\n`;
        }

        // Tuning
        const rootKey = combined[OPER_OVERRIDING_ROOT_KEY] !== undefined && combined[OPER_OVERRIDING_ROOT_KEY] !== -1
          ? combined[OPER_OVERRIDING_ROOT_KEY] 
          : sample.originalPitch;
        sfz += `pitch_keycenter=${rootKey}\n`;

        let tune = (combined[OPER_COARSE_TUNE] || 0) * 100 + (combined[OPER_FINE_TUNE] || 0);
        tune += sample.pitchCorrection;
        if (tune !== 0) {
          sfz += `tune=${tune}\n`;
        }

        // Sample Loop
        const sampleModes = combined[OPER_SAMPLE_MODES] !== undefined ? combined[OPER_SAMPLE_MODES] : 0;
        const loopMode = sampleModes & 0x03;
        if (loopMode === 1 || loopMode === 3) {
          sfz += `loop_mode=loop_continuous\n`;
          sfz += `loop_start=${sample.startLoop - sample.start}\n`;
          sfz += `loop_end=${sample.endLoop - sample.start}\n`;
        }

        sfz += `\n`;
      }
    }
    return sfz;
  }
}
