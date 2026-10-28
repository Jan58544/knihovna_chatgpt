import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
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
    const video = videoRef.current;

    const release = () => {
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
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        // Permission can resolve after a modal closes or StrictMode remounts.
        if (disposed) { release(); return; }

        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 500,
        });

        controls = await reader.decodeFromStream(stream, video, (result, _error, activeControls) => {
          if (disposed || detected || !result) return;
          const isbn = result.getText();
          if (!isValidIsbn(isbn)) {
            setHint('Tento čárový kód není ISBN knihy. Hledejte kód začínající 978 nebo 979.');
            return;
          }
          detected = true;
          activeControls.stop();
          release();
          detectedRef.current(isbn);
        });
        if (disposed || detected) { release(); return; }
        setPhase('scanning');
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
