import { isValidIsbn, isbnTo13 } from './books';
export function extractPrintedIsbns(text: string): string[] {
  const found = new Set<string>();
  const clean = text.replace(/ISBN(?:-1[03])?\s*:?/gi, '').replace(/[‐‑–—−]/g, '-');
  for (const line of clean.split(/[\r\n]+/)) {
    const matches = line.match(/(?:97[89](?:[ \t-]*\d){10}|\d(?:[ \t-]*\d){8}[ \t-]*[\dXx])/g) ?? [];
    for (const raw of matches) if (isValidIsbn(raw)) found.add(isbnTo13(raw));
  }
  return [...found];
}
