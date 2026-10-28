import { BrowserCodeReader } from '@zxing/browser';
import { EAN13Reader, DecodeHintType } from '@zxing/library';
import { isValidIsbn } from './books';

export function startIsbnScanner(stream: MediaStream, video: HTMLVideoElement, onCode: (isbn: string) => void) {
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  const reader = new BrowserCodeReader(new EAN13Reader(), hints, { delayBetweenScanAttempts: 60, delayBetweenScanSuccess: 100 });
  return reader.decodeFromStream(stream, video, (result, _error, controls) => {
    if (!result) return;
    const isbn = result.getText();
    if (isValidIsbn(isbn)) controls.stop();
    onCode(isbn);
  });
}
