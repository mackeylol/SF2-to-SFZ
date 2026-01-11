
import { SF2Preset, SF2Instrument, SF2Sample, SF2Bag, SF2Generator } from '../types';

export class SF2Parser {
  private view: DataView;
  private offset: number = 0;
  private buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  private readString(length: number): string {
    const chars = [];
    for (let i = 0; i < length; i++) {
      const char = this.view.getUint8(this.offset + i);
      if (char === 0) break;
      chars.push(String.fromCharCode(char));
    }
    this.offset += length;
    return chars.join('').trim();
  }

  private readUint32(): number {
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  private readUint16(): number {
    const val = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  private readInt16(): number {
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  private readInt8(): number {
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  public async parse() {
    // Basic RIFF verification
    const riff = this.readString(4);
    if (riff !== 'RIFF') throw new Error('Not a RIFF file');
    this.readUint32(); // Size
    const fb = this.readString(4);
    if (fb !== 'sfbk') throw new Error('Not a SoundFont file');

    let pdta: any = {};
    let sdtaOffset = 0;
    let sdtaSize = 0;

    while (this.offset < this.view.byteLength) {
      const chunkId = this.readString(4);
      const chunkSize = this.readUint32();
      const endOffset = this.offset + chunkSize;

      if (chunkId === 'LIST') {
        const listType = this.readString(4);
        if (listType === 'pdta') {
          pdta = this.parsePdta(endOffset);
        } else if (listType === 'sdta') {
          // Find 'smpl' sub-chunk
          while (this.offset < endOffset) {
            const subId = this.readString(4);
            const subSize = this.readUint32();
            if (subId === 'smpl') {
              sdtaOffset = this.offset;
              sdtaSize = subSize;
              this.offset += subSize;
            } else {
              this.offset += subSize;
            }
          }
        } else {
          this.offset = endOffset;
        }
      } else {
        this.offset = endOffset;
      }
    }

    // Attach sample data to headers
    const samples: SF2Sample[] = pdta.shdr.map((s: any) => {
        const start = s.start * 2;
        const end = s.end * 2;
        const rawData = new Int16Array(this.buffer.slice(sdtaOffset + start, sdtaOffset + end));
        return { ...s, data: rawData };
    });

    return {
      presets: pdta.phdr,
      instruments: pdta.inst,
      samples,
      pbag: pdta.pbag,
      ibag: pdta.ibag,
      pgen: pdta.pgen,
      igen: pdta.igen
    };
  }

  private parsePdta(limit: number) {
    const pdta: any = {};
    while (this.offset < limit) {
      const id = this.readString(4);
      const size = this.readUint32();
      const next = this.offset + size;

      switch (id) {
        case 'phdr': pdta.phdr = this.readPhdr(size); break;
        case 'pbag': pdta.pbag = this.readBag(size); break;
        case 'pgen': pdta.pgen = this.readGen(size); break;
        case 'inst': pdta.inst = this.readInst(size); break;
        case 'ibag': pdta.ibag = this.readBag(size); break;
        case 'igen': pdta.igen = this.readGen(size); break;
        case 'shdr': pdta.shdr = this.readShdr(size); break;
        default: this.offset = next; break;
      }
      this.offset = next;
    }
    return pdta;
  }

  private readPhdr(size: number) {
    const count = size / 38;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        name: this.readString(20),
        preset: this.readUint16(),
        bank: this.readUint16(),
        bagIndex: this.readUint16(),
        library: this.readUint32(),
        genre: this.readUint32(),
        morphology: this.readUint32()
      });
    }
    return items;
  }

  private readBag(size: number) {
    const count = size / 4;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        generatorStart: this.readUint16(),
        modulatorStart: this.readUint16()
      });
    }
    return items;
  }

  private readGen(size: number) {
    const count = size / 4;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        operator: this.readUint16(),
        amount: this.readInt16()
      });
    }
    return items;
  }

  private readInst(size: number) {
    const count = size / 22;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        name: this.readString(20),
        bagIndex: this.readUint16()
      });
    }
    return items;
  }

  private readShdr(size: number) {
    const count = size / 46;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({
        name: this.readString(20),
        start: this.readUint32(),
        end: this.readUint32(),
        startLoop: this.readUint32(),
        endLoop: this.readUint32(),
        sampleRate: this.readUint32(),
        originalPitch: this.readUint8(),
        pitchCorrection: this.readInt8(),
        sampleLink: this.readUint16(),
        sampleType: this.readUint16()
      });
    }
    return items;
  }

  private readUint8(): number {
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }
}
