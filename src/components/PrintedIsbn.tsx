import { useEffect, useRef, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import type { Worker } from 'tesseract.js';
import { extractPrintedIsbns } from '../lib/printedIsbn';

export function PrintedIsbn({ onDetected, onManual }: { onDetected: (isbn: string) => void; onManual: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const worker = useRef<Worker | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; void worker.current?.terminate(); worker.current = null; }; }, []);
  async function recognize(file: File) {
    if (busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) { setError('Vyberte JPG, PNG nebo WebP do 20 MB.'); return; }
    setBusy(true); setError(''); setCandidates([]); setMessage('Připravuji čtení textu…');
    let localWorker: Worker | null = null;
    try {
      const url = URL.createObjectURL(file);
      let canvas: HTMLCanvasElement;
      try {
        const image = new Image(); image.src = url; await image.decode();
        const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
        canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d'); if (!context) throw new Error('Obrázek nelze načíst.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } finally { URL.revokeObjectURL(url); }
      if (!active.current) return;
      const { createWorker, OEM } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.origin).href;
      localWorker = await createWorker('eng', OEM.LSTM_ONLY, { workerPath: `${base}worker.min.js`, corePath: base, langPath: base, workerBlobURL: false, logger: progress => { if (active.current) setMessage(progress.status === 'recognizing text' ? `Čtu číslo… ${Math.round(progress.progress * 100)} %` : 'Připravuji čtení textu…'); } });
      if (!active.current) return;
      worker.current = localWorker;
      await localWorker.setParameters({ tessedit_char_whitelist: '0123456789Xx- ', user_defined_dpi: '300' });
      const { data } = await localWorker.recognize(canvas);
      if (!active.current) return;
      const matches = extractPrintedIsbns(data.text);
      setCandidates(matches);
      if (!matches.length) setError('Platné ISBN se nepodařilo přečíst. Vyfoťte samotný řádek čísla ostřeji, nebo jej zadejte ručně.');
    } catch {
      if (active.current) setError('Text se nepodařilo přečíst. Zkuste jinou fotografii nebo ruční zadání.');
    } finally {
      if (localWorker) await localWorker.terminate();
      if (worker.current === localWorker) worker.current = null;
      if (active.current) setBusy(false);
    }
  }
  return <div className="printed-isbn">
    <p>Vyfoťte jen vytištěné číslo ISBN. Čárový kód není potřeba. Fotografii zpracujeme v zařízení.</p>
    <label className={`photo-input btn btn-dark ${busy ? 'disabled' : ''}`}><Camera size={18} /> Vyfotit nebo vybrat číslo<input aria-label="Fotografie vytištěného ISBN" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void recognize(file); }} /></label>
    {busy && <div className="ocr-progress" role="status"><LoaderCircle className="spin" size={20} /> {message}<small>První použití stáhne místní čtečku. Dialog můžete zavřít.</small></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {candidates.length > 0 && <div className="ocr-candidates"><p>Zkontrolujte přečtené číslo:</p>{candidates.map(isbn => <button className="btn btn-outline" key={isbn} onClick={() => onDetected(isbn)}>Použít ISBN {isbn}</button>)}</div>}
    <button className="text-button" onClick={onManual}>Raději zadat ISBN ručně</button>
  </div>;
}
