export type BookStatus = 'want' | 'reading' | 'read'

export interface Book {
  id: string
  isbn: string
  title: string
  authors: string[]
  coverUrl?: string
  year?: string
  publisher?: string
  status: BookStatus
  addedAt: string
  description?: string
  pages?: number
  publicationPlace?: string
  cnb?: string
  catalogId?: string
}

export const STORAGE_KEY = 'folio.books.v1'

export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s\-–−]/g, '').toUpperCase()
}

export function isValidIsbn(raw: string): boolean {
  const isbn = normalizeIsbn(raw)
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, digit, index) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0
  }
  return /^97[89]\d{10}$/.test(isbn) && [...isbn].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10 === 0
}

export function isbnTo13(raw: string): string {
  const isbn = normalizeIsbn(raw)
  if (!isValidIsbn(isbn)) throw new Error('ISBN není platné. Zkontrolujte všech 10 nebo 13 znaků.')
  if (isbn.length === 13) return isbn
  const firstTwelve = `978${isbn.slice(0, 9)}`
  const sum = [...firstTwelve].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  return firstTwelve + ((10 - sum % 10) % 10)
}

type CatalogRecord = {
  id?: unknown
  title?: unknown
  authors?: { primary?: Record<string, unknown>; secondary?: unknown; corporate?: unknown }
  publishers?: unknown
  placesOfPublication?: unknown
  publicationDates?: unknown
  physicalDescriptions?: unknown
  isbns?: unknown
  issns?: unknown
  cnb?: unknown
  formats?: unknown
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? [value] : []
}

function cleanCatalogText(value: string): string {
  return value.trim().replace(/[\s,;:/=]+$/g, '').replace(/^\[([^\]]+)\]$/, '$1').trim()
}

function catalogIsbn(value: string): string | undefined {
  // Catalogues can append binding notes such as "(brož.)" or prices.
  const match = value.match(/^(?:ISBN(?:-1[03])?\s*:?\s*)?([\dXx][\dXx\s\-–−]*[\dXx])/)
  if (!match || !isValidIsbn(match[1])) return undefined
  return isbnTo13(match[1])
}

function authorName(value: string): string {
  return value.replace(/,\s*(?:(?:asi|ca\.?|nar\.?)\s*)?\d{3,4}.*$/, '').trim()
}

function bookFromRecord(record: CatalogRecord, isbn: string): Book | undefined {
  if (typeof record.title !== 'string' || !record.title.trim()) return undefined
  const title = cleanCatalogText(record.title)
  if (!title) return undefined
  const primary = record.authors?.primary
  const authors = primary && typeof primary === 'object' && !Array.isArray(primary)
    ? Object.keys(primary).map(authorName).filter(Boolean) : []
  const year = stringList(record.publicationDates).join(' ').match(/(?<!\d)[12]\d{3}(?!\d)/)?.[0]
  const pageMatch = stringList(record.physicalDescriptions).join(' ').match(/\b(\d+)\s*(?:s\.|stran(?:y)?\b)/i)
  return {
    id: `isbn-${isbn}`,
    isbn,
    title,
    authors,
    publisher: stringList(record.publishers).map(cleanCatalogText).filter(Boolean).join(', ') || undefined,
    publicationPlace: stringList(record.placesOfPublication).map(cleanCatalogText).filter(Boolean).join(', ') || undefined,
    year,
    pages: pageMatch ? Number(pageMatch[1]) : undefined,
    cnb: stringList(record.cnb)[0],
    catalogId: typeof record.id === 'string' ? record.id : undefined,
    status: 'want',
    addedAt: new Date().toISOString(),
  }
}

export async function lookupBook(raw: string, signal?: AbortSignal): Promise<Book> {
  const isbn = isbnTo13(raw)
  const params = new URLSearchParams({ lookfor: isbn, type: 'ISN', limit: '10' })
  for (const field of ['id', 'title', 'authors', 'publishers', 'placesOfPublication', 'publicationDates', 'physicalDescriptions', 'isbns', 'issns', 'cnb', 'formats']) {
    params.append('field[]', field)
  }
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort(signal?.reason)
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 8_000)
  try {
    let response: Response
    try {
      response = await fetch(`https://www.knihovny.cz/api/v1/search?${params}`, { signal: controller.signal })
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Vyhledávání bylo zrušeno.', 'AbortError')
      if (timedOut) throw new Error('Katalog neodpověděl včas. Zkuste hledání znovu.')
      throw new Error('Katalog se nepodařilo načíst. Zkontrolujte připojení a zkuste to znovu.', { cause: error })
    }
    if (!response.ok) throw new Error(`Katalog je nyní nedostupný (HTTP ${response.status}). Zkuste to později.`)
    let data: { records?: CatalogRecord[]; status?: string }
    try {
      data = await response.json()
    } catch {
      if (signal?.aborted) throw new DOMException('Vyhledávání bylo zrušeno.', 'AbortError')
      if (timedOut) throw new Error('Katalog neodpověděl včas. Zkuste hledání znovu.')
      throw new Error('Katalog vrátil nečitelnou odpověď. Zkuste to později.')
    }
    if (!data || (data.status && data.status !== 'OK')) throw new Error('Katalog je nyní nedostupný. Zkuste to později.')
    const records = data.records ?? []
    if (!Array.isArray(records)) throw new Error('Katalog vrátil nečitelnou odpověď. Zkuste to později.')
    for (const record of records) {
      if (!record || !stringList(record.isbns).some(value => catalogIsbn(value) === isbn)) continue
      const book = bookFromRecord(record, isbn)
      if (book) return book
    }
    throw new Error('Knihu s tímto ISBN jsme v katalogu nenašli. Zkontrolujte číslo a zkuste to znovu.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

function sanitizeBook(value: unknown): Book | undefined {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<Book>
  if (typeof item.isbn !== 'string' || !isValidIsbn(item.isbn) || typeof item.title !== 'string' || !item.title.trim()) return undefined
  if (!Array.isArray(item.authors) || !item.authors.every(author => typeof author === 'string')) return undefined
  if (!['want', 'reading', 'read'].includes(item.status ?? '') || typeof item.addedAt !== 'string' || Number.isNaN(Date.parse(item.addedAt))) return undefined
  const isbn = isbnTo13(item.isbn)
  const book: Book = { id: typeof item.id === 'string' && item.id ? item.id : `isbn-${isbn}`, isbn, title: item.title, authors: item.authors, status: item.status as BookStatus, addedAt: item.addedAt }
  for (const key of ['year', 'publisher', 'description', 'publicationPlace', 'cnb', 'catalogId'] as const) {
    if (typeof item[key] === 'string') book[key] = item[key]
  }
  if (typeof item.pages === 'number' && Number.isInteger(item.pages) && item.pages > 0) book.pages = item.pages
  if (typeof item.coverUrl === 'string') {
    try { if (new URL(item.coverUrl).protocol === 'https:') book.coverUrl = item.coverUrl } catch { /* Ignore malformed image URLs. */ }
  }
  return book
}

export function loadBooks(): Book[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(data)) return []
    const seen = new Set<string>()
    return data.flatMap(value => {
      const book = sanitizeBook(value)
      if (!book || seen.has(book.isbn)) return []
      seen.add(book.isbn)
      return [book]
    })
  } catch { return [] }
}

export function saveBooks(books: Book[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(books))
    return true
  } catch { return false }
}
