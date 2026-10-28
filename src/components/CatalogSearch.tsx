import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { searchCatalog } from '../lib/books';
import type { Book } from '../lib/books';
export function CatalogSearch({ onSelect }: { onSelect: (book: Book) => void }) {
  const [query, setQuery] = useState(''); const [type, setType] = useState<'Title' | 'Author'>('Title');
  const [results, setResults] = useState<Book[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [searched, setSearched] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault(); request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setResults([]); setSearched(false);
    try { const books = await searchCatalog(query, type, controller.signal); if (!controller.signal.aborted) { setResults(books); setSearched(true); } }
    catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Hledání se nezdařilo.'); }
    finally { if (request.current === controller) setBusy(false); }
  }
  return <div className="catalog-search"><form onSubmit={submit}><label>Hledat podle<select value={type} onChange={e => setType(e.target.value as 'Title' | 'Author')}><option value="Title">Názvu</option><option value="Author">Autora</option></select></label><label>Hledaný text<input value={query} onChange={e => setQuery(e.target.value)} required minLength={2} autoFocus maxLength={500} /></label><button className="btn btn-dark full-width" disabled={busy || query.trim().length < 2}>{busy ? 'Hledám…' : 'Hledat v katalogu'}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{searched && !results.length && <p role="status">Žádné knihy nenalezeny. Zkuste jiný dotaz nebo ruční přidání.</p>}<div className="catalog-results">{results.map((book, index) => <button className="catalog-result" key={`${book.id}-${index}`} onClick={() => onSelect(book)}><strong>{book.title}</strong><span>{book.authors.join(', ') || 'Autor neuveden'}</span><small>{[book.year, book.publisher, book.isbn || 'Bez ISBN'].filter(Boolean).join(' · ')}</small><span>Vybrat vydání →</span></button>)}</div></div>;
}
