import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidIsbn, isbnTo13, loadBooks, lookupBook, normalizeIsbn, saveBooks, STORAGE_KEY, type Book } from './books'

const fixture = {
  resultCount: 1,
  records: [{
    id: 'mkp.3521868',
    title: 'Životy slavných a starých provensálských básníků, kteří žili v dobách hrabat z kraje Provença',
    authors: { primary: { 'Jean de Nostredame, asi 1507-1577': [] }, secondary: { 'Josef Prokop, 1971-': [], 'Vojtěch Domlátil, 1979-': [] }, corporate: [] },
    publishers: ['Argo,'], placesOfPublication: ['Praha :'], publicationDates: ['2011'],
    physicalDescriptions: ['218 s. : il. ; 22 cm'], isbns: ['978-80-257-0367-0'], issns: [], cnb: 'cnb002163342', formats: ['0/BOOKS/'],
  }], status: 'OK',
}
const book: Book = { id: 'a', isbn: '9788025703670', title: 'Kniha', authors: ['Autor'], status: 'want', addedAt: '2026-01-01T00:00:00Z' }

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) })
  // Every test uses a mock: no test is allowed to contact the live catalogue.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unmocked catalogue request')))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('ISBN', () => {
  it('normalizes separators and lowercase checksum X', () => expect(normalizeIsbn(' 0-8044-2957-x ')).toBe('080442957X'))
  it('checks ISBN-10 and ISBN-13 checksums', () => {
    expect(isValidIsbn('0-8044-2957-X')).toBe(true)
    expect(isValidIsbn('978-80-257-0367-0')).toBe(true)
    expect(isValidIsbn('9788025703671')).toBe(false)
    expect(isValidIsbn('0804429570')).toBe(false)
    expect(isValidIsbn('4006381333931')).toBe(false)
    expect(isValidIsbn('123')).toBe(false)
  })
  it('converts ISBN-10 to canonical ISBN-13', () => {
    expect(isbnTo13('080442957X')).toBe('9780804429573')
    expect(isbnTo13('978-80-257-0367-0')).toBe('9788025703670')
    expect(() => isbnTo13('123')).toThrow('ISBN není platné')
  })
})

describe('Knihovny.cz browser lookup', () => {
  it('maps the supplied catalogue fixture, including only primary author names', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture)))
    const result = await lookupBook('978-80-257-0367-0')
    expect(result).toMatchObject({ isbn: '9788025703670', title: fixture.records[0].title, authors: ['Jean de Nostredame'], publisher: 'Argo', publicationPlace: 'Praha', year: '2011', pages: 218, cnb: 'cnb002163342', catalogId: 'mkp.3521868', status: 'want' })
    const [address, options] = vi.mocked(fetch).mock.calls[0]
    const url = new URL(String(address))
    expect(url.origin + url.pathname).toBe('https://www.knihovny.cz/api/v1/search')
    expect(url.searchParams.get('lookfor')).toBe('9788025703670')
    expect(url.searchParams.get('type')).toBe('ISN')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.getAll('field[]')).toEqual(['id', 'title', 'authors', 'publishers', 'placesOfPublication', 'publicationDates', 'physicalDescriptions', 'isbns', 'issns', 'cnb', 'formats'])
    expect(Object.keys(options!)).toEqual(['signal'])
  })
  it('matches actual ISBN instead of selecting the first result', async () => {
    const other = { ...fixture.records[0], title: 'Wrong book', isbns: ['9780804429573'] }
    const matching = { ...fixture.records[0], isbns: ['978-80-257-0367-0 (brož.)'], publicationDates: ['c2010'], placesOfPublication: ['[Praha] :'], physicalDescriptions: ['260 stran'], title: 'Správná kniha /' }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: 'OK', records: [other, matching] })))
    expect(await lookupBook(book.isbn)).toMatchObject({ title: 'Správná kniha', publicationPlace: 'Praha', year: '2010', pages: 260 })
  })
  it('parses bracketed publication year', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: 'OK', records: [{ ...fixture.records[0], publicationDates: ['[2025]'] }] })))
    expect((await lookupBook(book.isbn)).year).toBe('2025')
  })
  it('handles no records without crashing', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ resultCount: 0, status: 'OK' })))
    await expect(lookupBook(book.isbn)).rejects.toThrow('nenašli')
  })
  it('rejects mismatched catalogue results', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture)))
    await expect(lookupBook('9780804429573')).rejects.toThrow('nenašli')
  })
  it('distinguishes network failure from an empty catalogue result', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(lookupBook(book.isbn)).rejects.toThrow('Zkontrolujte připojení')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('reports HTTP errors without retrying another provider', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 429 }))
    await expect(lookupBook(book.isbn)).rejects.toThrow('HTTP 429')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not fetch invalid ISBNs', async () => {
    await expect(lookupBook('123')).rejects.toThrow('ISBN není platné')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('aborts after eight seconds', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const assertion = expect(lookupBook(book.isbn)).rejects.toThrow('neodpověděl včas')
    await vi.advanceTimersByTimeAsync(8_000)
    await assertion
  })
  it('propagates explicit user cancellation', async () => {
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const controller = new AbortController()
    const assertion = expect(lookupBook(book.isbn, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await assertion
  })
})

describe('local library storage', () => {
  it('roundtrips saved books and preserves optional catalogue details', () => {
    const item = { ...book, pages: 218, cnb: 'cnb002163342', publicationPlace: 'Praha' }
    expect(saveBooks([item])).toBe(true)
    expect(loadBooks()).toEqual([item])
  })
  it('handles corrupt storage and invalid records', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')
    expect(loadBooks()).toEqual([])
    localStorage.setItem(STORAGE_KEY, JSON.stringify([null, { ...book, isbn: '123' }, { ...book, status: 'invalid' }, book]))
    expect(loadBooks()).toEqual([book])
  })
  it('deduplicates equivalent ISBN-10 and ISBN-13 books', () => {
    saveBooks([{ ...book, isbn: '080442957X' }, { ...book, id: 'b', isbn: '9780804429573' }])
    expect(loadBooks()).toEqual([{ ...book, isbn: '9780804429573' }])
  })
  it('discards unsafe image URLs in stored data', () => {
    saveBooks([{ ...book, coverUrl: 'javascript:alert(1)' }])
    expect(loadBooks()[0].coverUrl).toBeUndefined()
  })
  it('reports a failed save without throwing', () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new DOMException('Quota exceeded') })
    expect(saveBooks([book])).toBe(false)
  })
})
