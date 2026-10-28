import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractPrintedIsbns } from './printedIsbn';
import { editionKey, findDuplicate, mergeBackup, parseBackup, searchCatalog, type Book } from './books';
const book: Book = { id: 'one', title: 'Saturnin', authors: ['Zdeněk Jirotka'], isbn: '', year: '1942', status: 'want', addedAt: '2026-01-01T00:00:00Z' };
afterEach(() => vi.unstubAllGlobals());
describe('printed ISBN without barcode', () => {
  it('extracts valid printed ISBN-13 and converts ISBN-10', () => {
    expect(extractPrintedIsbns('ISBN 978-80-257-0367-0')).toEqual(['9788025703670']);
    expect(extractPrintedIsbns('ISBN-10: 0-8044-2957-X')).toEqual(['9780804429573']);
    expect(extractPrintedIsbns('ISBN 9788025703671')).toEqual([]);
    expect(extractPrintedIsbns('218 stran\nRok 2011')).toEqual([]);
  });
  it('deduplicates OCR repetitions and allows selecting between valid ISBNs', () => expect(extractPrintedIsbns('9788025703670\n9788025703670\n080442957X')).toEqual(['9788025703670', '9780804429573']));
});
describe('editions and backups', () => {
  it('keeps separate books without ISBN and rejects a duplicate of the same edition', () => {
    expect(findDuplicate([book], { ...book, id: 'two' })).toEqual(book);
    expect(findDuplicate([book], { ...book, id: 'two', year: '2025' })).toBeUndefined();
    expect(findDuplicate([book], { ...book, id: 'two', edition: '2. vydání' })).toBeUndefined();
    expect(findDuplicate([book], { ...book, id: 'two', title: 'Jiná kniha' })).toBeUndefined();
  });
  it('normalizes ISBN10 and 13 for duplicate identity but preserves different editions', () => {
    expect(editionKey({ ...book, isbn: '080442957X' })).toBe(editionKey({ ...book, isbn: '9780804429573' }));
    expect(findDuplicate([{ ...book, isbn: '9780804429573' }], { ...book, id: 'two', isbn: '9788025703670' })).toBeUndefined();
  });
  it('restores manual books, copies and editions and merges without overwriting', () => {
    const imported = parseBackup(JSON.stringify({ books: [{ ...book, copies: 3, edition: '2.' }, { ...book, id: 'two', title: 'Další kniha' }] }));
    const merged = mergeBackup([book], [...imported, book]);
    expect(merged.added).toBe(2); expect(merged.skipped).toBe(1); expect(merged.books[0]).toEqual(book);
    expect(new Set(merged.books.map(book => book.id)).size).toBe(3);
  });
  it('rejects corrupt backups instead of silently losing books', () => {
    expect(() => parseBackup('{')).toThrow();
    expect(() => parseBackup(JSON.stringify({books: [{ ...book, isbn: 'invalid' }]}))).toThrow('neplatné');
  });
});
describe('bonus catalogue search', () => {
  it.each(['Title', 'Author'] as const)('uses the allowed %s type and filters out audio/CD records', async type => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'OK', records: [
      { id: 'a', title: 'Saturnin /', formats: ['0/BOOKS/'], authors: { primary: { 'Zdeněk Jirotka, 1911-2003': [] } }, publicationDates: ['1942'] },
      { id: 'b', title: 'Saturnin audio', formats: ['0/AUDIO/'] },
    ] }))));
    const results = await searchCatalog('Saturnin', type);
    expect(results).toHaveLength(1); expect(results[0]).toMatchObject({ title: 'Saturnin', isbn: '', year: '1942', authors: ['Zdeněk Jirotka'] });
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string); expect(url.searchParams.get('type')).toBe(type); expect(url.searchParams.get('limit')).toBe('10'); expect(url.searchParams.getAll('field[]')).toContain('formats');
  });
});
