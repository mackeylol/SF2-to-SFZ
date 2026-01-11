
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ConversionStatus, SF2Preset } from './types';
import { SF2Parser } from './services/sf2Parser';
import { SFZConverter } from './services/sfzConverter';

declare var JSZip: any;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [presets, setPresets] = useState<SF2Preset[]>([]);
  const [status, setStatus] = useState<ConversionStatus>({ stage: 'idle', progress: 0, message: '' });
  const [parsedData, setParsedData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPresets = useMemo(() => {
    return presets.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [presets, searchTerm]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStatus({ stage: 'parsing', progress: 10, message: 'Reading SoundFont headers...' });

    try {
      const buffer = await selectedFile.arrayBuffer();
      const parser = new SF2Parser(buffer);
      const data = await parser.parse();
      
      setParsedData(data);
      // Filter out sentinel and empty names
      const validPresets = data.presets.filter((p: any) => p.name !== 'EOP' && p.name.trim() !== '');
      setPresets(validPresets);
      setStatus({ stage: 'idle', progress: 100, message: 'Ready to convert.' });
    } catch (err: any) {
      console.error(err);
      setStatus({ stage: 'error', progress: 0, message: `Failed to parse: ${err.message}` });
    }
  };

  const convertAndDownload = async () => {
    if (!file || !parsedData) return;

    if (typeof JSZip === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.head.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
    }

    setStatus({ stage: 'converting', progress: 0, message: 'Initializing ZIP packager...' });
    const zip = new JSZip();
    const outputBase = file.name.replace('.sf2', '');

    try {
      const totalPresets = presets.length;
      
      // We map samples globally to avoid duplicates in the zip
      const samplesToExport = new Set<number>();

      for (let i = 0; i < totalPresets; i++) {
        const preset = presets[i];
        setStatus({ 
            stage: 'converting', 
            progress: Math.round((i / totalPresets) * 40), 
            message: `Analyzing preset: ${preset.name}` 
        });

        const sfzContent = SFZConverter.getSFZContent(preset, parsedData, outputBase);
        zip.file(`${outputBase} ${preset.name.trim()}.sfz`, sfzContent);

        // Identify which samples are needed for this preset
        // (For simplicity, we track all sample IDs mentioned in the SFZ generation logic)
        // Here we just extract all valid samples in the SoundFont into a shared Samples folder
      }

      const validSamples = parsedData.samples.filter((s: any) => s.name !== 'EOS' && s.data);
      const totalSamples = validSamples.length;

      for (let j = 0; j < totalSamples; j++) {
        const sample = validSamples[j];
        setStatus({ 
            stage: 'converting', 
            progress: 40 + Math.round((j / totalSamples) * 40), 
            message: `Exporting samples: ${Math.round((j / totalSamples) * 100)}%` 
        });
        
        const wavBuffer = SFZConverter.createWavBuffer(sample);
        // Put samples in a shared folder for all SFZs to reference
        // Note: The SFZ converter's default_path will need to point correctly.
        // In this implementation, each SFZ points to its own Samples folder 
        // to strictly follow the Python script's logic.
        
        // Re-run the logic to place samples in EVERY preset's sample folder
        // OR more efficiently, follow the Python script's per-preset structure:
        for (const preset of presets) {
            const folderName = `${outputBase} ${preset.name.trim()} Samples`;
            zip.folder(folderName).file(`${SFZConverter.sanitize(sample.name)}.wav`, wavBuffer);
        }
      }

      setStatus({ stage: 'zipping', progress: 90, message: 'Building final archive...' });
      const content = await zip.generateAsync({ type: 'blob' }, (metadata: any) => {
          setStatus(prev => ({ ...prev, progress: 90 + (metadata.percent * 0.1) }));
      });

      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${outputBase}_sfz_bundle.zip`;
      link.click();
      window.URL.revokeObjectURL(url);

      setStatus({ stage: 'complete', progress: 100, message: 'Conversion successful!' });
    } catch (err: any) {
      console.error(err);
      setStatus({ stage: 'error', progress: 0, message: `Conversion error: ${err.message}` });
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-12 flex flex-col items-center bg-[#050505] selection:bg-blue-500/30">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600 rounded-full blur-[120px]" />
      </div>

      <header className="relative w-full max-w-5xl flex flex-col items-center mb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-widest uppercase mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Web Engine v2.0
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6">
          SF2 <span className="text-zinc-600">to</span> SFZ
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl leading-relaxed">
          The most precise SoundFont to SFZ converter for the browser. 
          Export presets with full sample mapping and parameter preservation.
        </p>
      </header>

      <main className="relative w-full max-w-5xl">
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]">
          {/* Main Action Bar */}
          <div className="p-10 border-b border-white/5">
            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative w-full h-64 border-2 border-dashed border-zinc-800 hover:border-blue-500/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-white/5 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col items-center">
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-blue-500 group-hover:text-white text-zinc-500">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <span className="text-xl font-bold text-white mb-2">Drop your SoundFont here</span>
                  <span className="text-zinc-500 font-medium">Click to browse your .sf2 library</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-1">{file.name}</h3>
                    <div className="flex items-center gap-3 text-zinc-500 text-sm font-medium">
                      <span className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 mono">SF2</span>
                      <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                      <span>{presets.length} Presets</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => { setFile(null); setPresets([]); setStatus({ stage: 'idle', progress: 0, message: '' }); }}
                    className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold transition-colors"
                  >
                    Replace
                  </button>
                  <button 
                    onClick={convertAndDownload}
                    disabled={status.stage !== 'idle' && status.stage !== 'complete'}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-xl shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    Convert Bundle
                  </button>
                </div>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".sf2" className="hidden" />
          </div>

          {/* Content Browser */}
          {file && (
            <div className="flex flex-col md:flex-row h-[600px]">
              <div className="flex-1 flex flex-col bg-black/20 border-r border-white/5">
                <div className="p-6 border-b border-white/5">
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Search presets..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 pl-10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    />
                    <svg className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                  {filteredPresets.length > 0 ? (
                    filteredPresets.map((preset, idx) => (
                      <div key={idx} className="group flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all cursor-default">
                        <div className="flex items-center gap-4">
                          <span className="text-zinc-700 font-bold mono text-xs w-6">{idx + 1}</span>
                          <span className="text-zinc-200 font-semibold group-hover:text-blue-400 transition-colors">{preset.name}</span>
                        </div>
                        <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter bg-zinc-800 px-2 py-0.5 rounded">
                            Bank {preset.bank}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                      <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium">No presets matching "{searchTerm}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Info / Status */}
              <div className="w-full md:w-80 p-8 bg-zinc-900/40">
                <div className="mb-10">
                  <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6">Process Status</h4>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status.stage !== 'idle' ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                        {status.stage === 'complete' ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        ) : <span className="text-xs font-bold">1</span>}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-200">Parse</p>
                        <p className="text-xs text-zinc-500">Analyze structure</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${['converting', 'zipping', 'complete'].includes(status.stage) ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                        <span className="text-xs font-bold">2</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-200">Convert</p>
                        <p className="text-xs text-zinc-500">Mapping & Logic</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status.stage === 'complete' ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                        <span className="text-xs font-bold">3</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-200">Package</p>
                        <p className="text-xs text-zinc-500">ZIP Compression</p>
                      </div>
                    </div>
                  </div>
                </div>

                {status.stage !== 'idle' && (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <p className={`text-sm font-bold mb-4 ${status.stage === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                      {status.message}
                    </p>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
                        style={{ width: `${status.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-20 py-10 border-t border-white/5 w-full max-w-5xl flex flex-col md:flex-row items-center justify-between text-zinc-500 text-sm gap-6">
        <div className="flex items-center gap-4">
          <span className="font-bold text-white tracking-tighter">SF2STUDIO</span>
          <span className="w-1 h-1 bg-zinc-800 rounded-full" />
          <p>Processing is done entirely on your machine.</p>
        </div>
        <div className="flex gap-8 font-medium">
          <a href="#" className="hover:text-white transition-colors">Documentation</a>
          <a href="#" className="hover:text-white transition-colors">SFZ Spec</a>
          <a href="#" className="hover:text-white transition-colors">Source Code</a>
        </div>
      </footer>
    </div>
  );
};

export default App;
