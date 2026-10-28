import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { CameraOff, Keyboard, LoaderCircle, RotateCcw, ScanLine } from 'lucide-react';
import { isValidIsbn } from '../lib/books';

interface CameraScannerProps {
  onDetected: (isbn: string) => void;
  onManual: () => void;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Povolte přístup k fotoaparátu v nastavení prohlížeče a zkuste to znovu. ISBN můžete také zadat ručně.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Na tomto zařízení jsme nenašli fotoaparát. Otevřete knihovnu na telefonu nebo zadejte ISBN ručně.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Fotoaparát právě používá jiná aplikace nebo není dostupný. Zavřete ostatní aplikace s kamerou a zkuste to znovu.';
  }
  if (name === 'OverconstrainedError') {
    return 'Fotoaparát nepodporuje požadovaný režim. Zkuste jiný prohlížeč nebo zadejte ISBN ručně.';
  }
  return 'Fotoaparát se nepodařilo spustit. Zkuste to znovu nebo přidejte knihu pomocí ISBN.';
}

export function CameraScanner({ onDetected, onManual }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectedRef = useRef(onDetected);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('Namiřte fotoaparát na čárový kód ISBN na zadní straně knihy.');

  useEffect(() => { detectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    let disposed = false;
    let detected = false;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;
    let frame = 0;
    type Detector = { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const nativeApi = (window as unknown as { BarcodeDetector?: { new(options: { formats: string[] }): Detector; getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector;
    const video = videoRef.current;

    const release = () => {
      cancelAnimationFrame(frame);
      controls?.stop();
      stream?.getTracks().forEach(track => track.stop());
      if (video && video.srcObject === stream) video.srcObject = null;
    };

    const start = async () => {
      setPhase('starting');
      setError('');
      setHint('Namiřte fotoaparát na čárový kód ISBN na zadní straně knihy.');

      if (!window.isSecureContext) {
        setError('Skenování potřebuje zabezpečené připojení HTTPS. Otevřete zabezpečenou adresu aplikace nebo zadejte ISBN ručně.');
        setPhase('error');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !video) {
        setError('Tento prohlížeč nepodporuje přístup k fotoaparátu. Zkuste Safari nebo Chrome na telefonu, případně zadejte ISBN ručně.');
        setPhase('error');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 960 },
            height: { ideal: 540 },
          },
        });

        // Permission can resolve after a modal closes or StrictMode remounts.
        if (disposed) { release(); return; }

        const accept = (isbn: string) => {
          if (disposed || detected) return;
          if (!isValidIsbn(isbn)) {
            setHint('Hledejte knižní čárový kód začínající 978 nebo 979.');
            return;
          }
          detected = true;
          release();
          detectedRef.current(isbn);
        };
        const fallback = async () => {
          // Download the JS decoder only if the device cannot decode EAN-13 natively.
          const { startIsbnScanner } = await import('../lib/isbnScanner');
          if (disposed || detected) return;
          controls = await startIsbnScanner(stream!, video, accept);
          if (disposed || detected) { release(); return; }
          setPhase('scanning');
        };
        let nativeSupported = false;
        try { nativeSupported = !!nativeApi && (await nativeApi.getSupportedFormats()).includes('ean_13'); } catch { /* Fall back to ZXing. */ }
        if (disposed || detected) { release(); return; }
        if (nativeSupported && nativeApi) {
          try {
            const detector = new nativeApi({ formats: ['ean_13'] });
            video.srcObject = stream;
            await video.play();
            if (disposed) { release(); return; }
            setPhase('scanning');
            let lastScan = 0;
            const scan = async (now: number) => {
              if (disposed || detected) return;
              if (now - lastScan < 60 || video.readyState < 2) { frame = requestAnimationFrame(scan); return; }
              lastScan = now;
              try {
                const results = await detector.detect(video);
                if (disposed || detected) return;
                for (const result of results) { accept(result.rawValue); if (detected) return; }
                frame = requestAnimationFrame(scan);
              } catch {
                if (disposed || detected) return;
                try { await fallback(); } catch (error) {
                  release(); if (!disposed && !detected) { setError(cameraErrorMessage(error)); setPhase('error'); }
                }
              }
            };
            frame = requestAnimationFrame(scan);
          } catch { if (!disposed && !detected) await fallback(); }
        } else await fallback();
      } catch (cause) {
        release();
        if (disposed || detected) return;
        setError(cameraErrorMessage(cause));
        setPhase('error');
      }
    };

    void start();
    return () => { disposed = true; release(); };
  }, [attempt]);

  return (
    <div>
      <div className="camera-stage" hidden={phase === 'error'}>
        <video ref={videoRef} className="camera-video" autoPlay playsInline muted aria-label="Náhled fotoaparátu pro skenování ISBN" />
        {phase === 'scanning' && (
          <div className="camera-overlay" aria-hidden="true">
            <span className="camera-corner" /><span className="camera-corner" />
            <span className="camera-corner" /><span className="camera-corner" />
            <span className="scan-line" />
          </div>
        )}
        {phase === 'starting' && (
          <div className="camera-status" role="status">
            <LoaderCircle className="spin" size={26} aria-hidden="true" />
            <span>Spouštím fotoaparát…<br />Povolte prosím přístup ke kameře.</span>
          </div>
        )}
      </div>
      {phase === 'error' ? (
        <div className="camera-error" role="alert">
          <CameraOff size={32} aria-hidden="true" />
          <h3>Fotoaparát není dostupný</h3>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => setAttempt(value => value + 1)}>
            <RotateCcw size={16} aria-hidden="true" />Zkusit znovu
          </button>
          <button type="button" className="btn btn-secondary" onClick={onManual}>
            <Keyboard size={16} aria-hidden="true" />Zadat ISBN ručně
          </button>
        </div>
      ) : (
        <p className="camera-instruction" role="status"><ScanLine size={15} aria-hidden="true" /> {hint}</p>
      )}
    </div>
  );
}
