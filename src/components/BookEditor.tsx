import { useState } from 'react';
import type { FormEvent } from 'react';
import { isValidIsbn, isbnTo13 } from '../lib/books';
import type { Book, BookStatus } from '../lib/books';

export function BookEditor({ book, initialIsbn, onSave, onCancel }: { book?: Book; initialIsbn?: string; onSave: (book: Book) => string | undefined; onCancel: () => void }) {
  const [title, setTitle] = useState(book?.title ?? '');
  const [authors, setAuthors] = useState(book?.authors.join('; ') ?? '');
  const [isbn, setIsbn] = useState(book?.isbn ?? initialIsbn ?? '');
  const [year, setYear] = useState(book?.year ?? '');
  const [publisher, setPublisher] = useState(book?.publisher ?? '');
  const [edition, setEdition] = useState(book?.edition ?? '');
  const [pages, setPages] = useState(book?.pages?.toString() ?? '');
  const [copies, setCopies] = useState(book?.copies ?? 1);
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'want');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError('Vyplňte název knihy.'); return; }
    if (isbn.trim() && !isValidIsbn(isbn)) { setError('ISBN není platné. Opravte jej nebo nechte prázdné.'); return; }
    if (year && !/^\d{4}$/.test(year)) { setError('Rok zadejte čtyřmi číslicemi.'); return; }
    if ((pages && (!Number.isInteger(Number(pages)) || Number(pages) < 1)) || !Number.isInteger(copies) || copies < 1 || copies > 999) { setError('Zkontrolujte počet stran a výtisků (1–999).'); return; }
    const next: Book = { ...book, id: book?.id ?? crypto.randomUUID(), title: title.trim(), authors: authors.split(';').map(name => name.trim()).filter(Boolean), isbn: isbn.trim() ? isbnTo13(isbn) : '', year: year || undefined, publisher: publisher.trim() || undefined, edition: edition.trim() || undefined, pages: pages ? Number(pages) : undefined, copies, status, addedAt: book?.addedAt ?? new Date().toISOString() };
    // Changing identifiers should not retain a catalogue identity for another edition.
    if (book && (next.isbn !== book.isbn || next.title !== book.title || next.year !== book.year || next.edition !== book.edition)) {
      delete next.catalogId; delete next.cnb;
      if (next.isbn !== book.isbn) { delete next.coverUrl; delete next.coverData; }
    }
    setError(onSave(next) ?? '');
  }
  return <form className="book-editor" onSubmit={submit}>
    <label>Název knihy *<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={1000} autoFocus /></label>
    <label>Autor / autoři<input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Více autorů oddělte středníkem" maxLength={1000} /></label>
    <label>ISBN (nepovinné)<input value={isbn} onChange={e => setIsbn(e.target.value)} placeholder="Kniha bez ISBN? Nechte prázdné." /></label>
    <div className="editor-grid"><label>Rok vydání<input inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} maxLength={4} /></label><label>Vydání<input value={edition} onChange={e => setEdition(e.target.value)} placeholder="Např. 2. vydání" maxLength={100} /></label></div>
    <label>Nakladatel<input value={publisher} onChange={e => setPublisher(e.target.value)} maxLength={300} /></label>
    <div className="editor-grid"><label>Počet stran<input type="number" min="1" value={pages} onChange={e => setPages(e.target.value)} /></label><label>Počet výtisků<input type="number" min="1" max="999" value={copies} onChange={e => setCopies(Number(e.target.value))} required /></label></div>
    <label>Stav čtení<select value={status} onChange={e => setStatus(e.target.value as BookStatus)}><option value="want">Chci přečíst</option><option value="reading">Právě čtu</option><option value="read">Přečteno</option></select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="btn btn-secondary" type="button" onClick={onCancel}>Zrušit</button><button className="btn btn-dark" type="submit">{book ? 'Uložit změny' : 'Uložit knihu'}</button></div>
  </form>;
}
