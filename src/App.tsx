import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Grid2X2, Library, List, LoaderCircle, Plus, ScanLine, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { isValidIsbn, isbnTo13, loadBooks, lookupBook, saveBooks, editionKey, findDuplicate, parseBackup, mergeBackup } from './lib/books';
import { BookEditor } from './components/BookEditor';
import { CatalogSearch } from './components/CatalogSearch';
import { BookCover as Cover, readCover } from './components/BookCover';
import type { Book, BookStatus } from './lib/books';

const PrintedIsbn = lazy(() => import('./components/PrintedIsbn').then(module => ({ default: module.PrintedIsbn })));
const CameraScanner = lazy(() => import('./components/CameraScanner').then(module => ({ default: module.CameraScanner })));

type Filter = 'all' | BookStatus;
type AddMode = 'choose' | 'camera' | 'manual' | 'loading' | 'printed' | 'catalog';
const STATUS: Record<BookStatus, string> = { want: 'Chci přečíst', reading: 'Právě čtu', read: 'Přečteno' };
const FILTERS: { id: Filter; label: string; icon: typeof Library }[] = [
  { id: 'all', label: 'Moje knihovna', icon: Library },
  { id: 'reading', label: 'Právě čtu', icon: BookOpen },
  { id: 'want', label: 'Chci přečíst', icon: Bookmark },
  { id: 'read', label: 'Přečtené', icon: CheckCheck },
];
function normalizeSearch(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, a[href], [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Zavřít"><X size={21} /></button></div>
      {children}
    </div>
  </div>;
}

function HeroArt() {
  return <div className="hero-art" aria-hidden="true">
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <div className="floating-star star-one">✳</div><div className="floating-star star-two">✳</div>
    <div className="art-book art-book-back"><span>KAŽDÝ PŘÍBĚH<br />SE POČÍTÁ.</span><div className="art-circle" /></div>
    <div className="art-book art-book-front"><span className="art-author">ANTOINE DE SAINT-EXUPÉRY</span><span className="art-title">Malý<br /><em>princ.</em></span><span className="art-sun" /><span className="art-hill hill-one" /><span className="art-hill hill-two" /><span className="art-caption">MALÁ KNIHA. VELKÝ SVĚT.</span></div>
    <div className="art-tag"><span className="art-tag-icon"><Check size={15} /></span> Příběh má své místo <span className="tag-dot" /></div>
  </div>;
}

export default function App() {
  const [books, setBooks] = useState<Book[]>(loadBooks);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [isbn, setIsbn] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [about, setAbout] = useState(false);
  const [manualIsbnSeed, setManualIsbnSeed] = useState('');
  const [editor, setEditor] = useState<Book | true | null>(null);
  const [authorFilter, setAuthorFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [isbnFilter, setIsbnFilter] = useState('all');
  const [backup, setBackup] = useState<Book[] | null>(null);
  const [backupError, setBackupError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const booksRef = useRef(books); booksRef.current = books;
  const requestRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const selected = books.find(book => book.id === selectedId);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    function key(e: KeyboardEvent) { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName) && !addMode && !selected && !about && !editor) { e.preventDefault(); searchRef.current?.focus(); } }
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [addMode, selected, about, editor]);
  useEffect(() => () => requestRef.current?.abort(), []);

  function persist(next: Book[]) {
    setBooks(next);
    const saved = saveBooks(next);
    setStorageError(saved ? '' : 'Knihy se nepodařilo uložit do prohlížeče. Před zavřením stránky si stáhněte zálohu.');
    return saved;
  }
  function openAdd(mode: AddMode = 'choose') { setError(''); setIsbn(''); setAddMode(mode); void import('./components/CameraScanner'); }
  function closeAdd() { requestRef.current?.abort(); requestRef.current = null; inFlight.current = false; setAddMode(null); setError(''); }
  async function addBook(raw: string) {
    if (inFlight.current) return;
    if (!isValidIsbn(raw)) { setError('Zadejte platné ISBN s 10 nebo 13 číslicemi. Najdete ho u čárového kódu knihy.'); setAddMode('manual'); return; }
    const normalized = isbnTo13(raw);
    setIsbn(normalized);
    const existing = booksRef.current.find(book => book.isbn === normalized);
    if (existing) { closeAdd(); setSelectedId(existing.id); setNotice('Tuto knihu už máte ve své knihovně.'); return; }
    inFlight.current = true;
    const controller = new AbortController(); requestRef.current = controller;
    setError(''); setAddMode('loading');
    try {
      const book = await lookupBook(normalized, controller.signal);
      if (controller.signal.aborted) return;
      const next = [...booksRef.current, book];
      persist(next); resetFilters(); setAddMode(null); setNotice(`„${book.title}“ přidáno do knihovny.`);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Knihu se nepodařilo načíst. Zkuste to znovu.'); setAddMode('manual');
    } finally { if (requestRef.current === controller) { inFlight.current = false; requestRef.current = null; } }
  }
  function submitIsbn(e: FormEvent) { e.preventDefault(); void addBook(isbn); }
  function exportBooks() {
    const blob = new Blob([JSON.stringify({ app: 'Shelfless', version: 1, books }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'shelfless-knihovna.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Záloha knihovny byla připravena ke stažení.');
  }
  function resetFilters() { setFilter('all'); setSearch(''); setAuthorFilter(''); setYearFilter(''); setIsbnFilter('all'); }
  function saveEdited(book: Book): string | undefined {
    const current = booksRef.current;
    if (findDuplicate(current, book)) return 'Toto vydání už v knihovně je. U původního záznamu můžete přidat další výtisk.';
    const existing = current.some(item => item.id === book.id);
    const saved = persist(existing ? current.map(item => item.id === book.id ? book : item) : [...current, book]);
    setEditor(null); setSelectedId(book.id); resetFilters();
    setNotice(saved ? (existing ? 'Změny byly uloženy.' : 'Kniha byla přidána.') : 'Kniha je v přehledu, ale nepodařilo se ji trvale uložit. Stáhněte zálohu.');
  }
  function addCatalogBook(book: Book) {
    const existing = booksRef.current.find(item => editionKey(item) === editionKey(book));
    closeAdd();
    if (existing) { setSelectedId(existing.id); setNotice('Toto vydání už máte v knihovně.'); return; }
    saveEdited({ ...book, id: crypto.randomUUID() });
  }
  const authorOptions = [...new Set(books.flatMap(book => book.authors))].sort((a,b) => a.localeCompare(b, 'cs'));
  const yearOptions = [...new Set(books.map(book => book.year).filter((year): year is string => !!year))].sort().reverse();
  const backupPreview = backup ? mergeBackup(books, backup) : null;
  const query = normalizeSearch(search);
  const visible = books.filter(book => (filter === 'all' || book.status === filter) && (!authorFilter || book.authors.includes(authorFilter)) && (!yearFilter || book.year === yearFilter) && (isbnFilter === 'all' || (isbnFilter === 'with' ? !!book.isbn : !book.isbn)) && normalizeSearch(`${book.title} ${book.authors.join(' ')} ${book.isbn}`).includes(query)).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'cs') : sort === 'author' ? (a.authors[0] ?? '').localeCompare(b.authors[0] ?? '', 'cs') : b.addedAt.localeCompare(a.addedAt));
  const count = (id: Filter) => id === 'all' ? books.length : books.filter(b => b.status === id).length;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setFilter('all'); setSearch(''); }} aria-label="Shelfless — moje knihovna"><span className="brand-symbol"><BookOpen size={23} strokeWidth={1.8} /></span>shelfless<span className="brand-period">.</span></a>
      <div className="sidebar-label">YOUR SHELVES, DIGITIZED.</div>
      <nav className="main-nav" aria-label="Knihovna">{FILTERS.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${filter === id ? 'active' : ''}`} onClick={() => { setFilter(id); setSearch(''); }}><Icon size={19} strokeWidth={1.7} /><span>{label}</span><span className="nav-count">{count(id)}</span></button>)}</nav>
      <div className="sidebar-note"><span className="note-star">✳</span><h3>Méně scrollování.<br />Více příběhů.</h3><span className="note-line" /></div>
      <div className="sidebar-bottom"><button className="subtle-button" onClick={() => setAbout(true)}><CircleHelp size={18} /> O aplikaci Shelfless <ChevronRight size={15} /></button><div className="local-note"><span /> Vaše knihy. Vaše zařízení.</div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><span className="topbar-title">Your shelves, digitized.</span><span className="mobile-brand">shelfless.</span><div className="topbar-right"><span className="private-label"><ShieldCheck size={14} /> Jen pro vás</span><button className="avatar" onClick={() => setAbout(true)} aria-label="O vaší knihovně">s.</button></div></header>
      <main>
        <section className="page-heading"><div><h1>Vaše knihovna<span className="heading-dot">.</span></h1><p>Všechny vaše příběhy. Konečně na jednom místě.</p></div><button className="btn btn-dark heading-add" onClick={() => openAdd()}><Plus size={18} /> Přidat knihu</button></section>

        {books.length === 0 && <section className="hero"><div className="hero-copy"><span className="hero-kicker">YOUR SHELVES, DIGITIZED.</span><h2>Celá police.<br /><em>V kapse.</em></h2><p>Doma, ve škole i v knihovně.<br />Vaše knihy, bez hledání v policích.</p></div><HeroArt /></section>}

        <section className="library-section" aria-label="Seznam knih"><div className="library-heading"><div className="library-title"><h2>{FILTERS.find(item => item.id === filter)?.label}</h2><span className="count-badge">{count(filter)}</span></div><div className="library-controls"><label className="sort-control"><span className="sr-only">Seřadit knihy</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Nejnovější</option><option value="title">Podle názvu</option><option value="author">Podle autora</option></select><ChevronDown size={14} /></label><div className="layout-toggle"><button aria-label="Mřížka" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'selected' : ''} onClick={() => setLayout('grid')}><Grid2X2 size={17} /></button><button aria-label="Seznam" aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : ''} onClick={() => setLayout('list')}><List size={18} /></button></div></div></div>
          <div className="search-row"><label className="search-field"><Search size={18} /><input ref={searchRef} placeholder="Hledat název, autora nebo ISBN…" aria-label="Hledat v knihovně" value={search} onChange={e => setSearch(e.target.value)} /><kbd>/</kbd></label>{books.length > 0 && <button className="export-button" onClick={exportBooks} aria-label="Stáhnout zálohu knihovny"><ArrowDownToLine size={17} /><span>Exportovat</span></button>}</div>
          {books.length > 0 && <div className="advanced-filters"><label><span className="sr-only">Filtrovat podle autora</span><select aria-label="Filtrovat podle autora" value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}><option value="">Všichni autoři</option>{authorOptions.map(author => <option key={author} value={author}>{author}</option>)}</select></label><label><span className="sr-only">Filtrovat podle roku</span><select aria-label="Filtrovat podle roku" value={yearFilter} onChange={e => setYearFilter(e.target.value)}><option value="">Všechny roky</option>{yearOptions.map(year => <option key={year}>{year}</option>)}</select></label><label><span className="sr-only">Filtrovat podle ISBN</span><select aria-label="Filtrovat podle ISBN" value={isbnFilter} onChange={e => setIsbnFilter(e.target.value)}><option value="all">S ISBN i bez</option><option value="with">S ISBN</option><option value="without">Bez ISBN</option></select></label>{(authorFilter || yearFilter || isbnFilter !== 'all') && <button className="text-button" onClick={resetFilters}>Zrušit filtry</button>}</div>}
          <div className="mobile-filters">{FILTERS.map(item => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
          {storageError && <div className="error-banner" role="alert">{storageError}<button onClick={exportBooks}>Stáhnout zálohu</button></div>}
          {visible.length > 0 ? <div className={`books-${layout}`}>{visible.map(book => <button className="book-card" key={book.id} onClick={() => { setSelectedId(book.id); setConfirmDelete(false); }}><Cover book={book} /><div className="book-info"><span className={`status-label status-${book.status}`}><span />{STATUS[book.status]}</span><h3>{book.title}</h3><p>{book.authors.join(', ') || 'Autor neuveden'}</p><span className="book-year">{book.year ?? 'Rok neuveden'}<ChevronRight size={16} /></span></div></button>)}</div> : <div className="empty-state">{books.length === 0 && !search ? <><div className="empty-books" aria-hidden="true"><div /><div><BookOpen size={27} strokeWidth={1.2} /></div><div /></div><h3>První kniha. Nová kapitola.</h3><p>Přidejte první knihu pomocí tlačítka nahoře.</p></> : <><Search size={32} strokeWidth={1.3} /><h3>{search ? 'Tady příběh nenacházíme.' : 'Tato police zatím čeká.'}</h3><p>{search ? 'Zkuste jiný název, autora nebo ISBN.' : 'Otevřete detail knihy a změňte její stav čtení.'}</p><button className="btn btn-outline" onClick={() => { resetFilters(); }}>Zobrazit všechny knihy</button></>}</div>}
        </section>

        <footer className="footer"><span>Vytvořeno z lásky ke knihám.</span><span>shelfless<span className="heading-dot">.</span> <span className="footer-divider">/</span> Méně hledání, více čtení.</span></footer>
      </main>
    </div>
    <nav className="mobile-dock" aria-label="Mobilní knihovna">{FILTERS.map(({ id, label, icon: Icon }) => <button key={id} className={filter === id ? 'active' : ''} aria-current={filter === id ? 'page' : undefined} onClick={() => { setFilter(id); setSearch(''); }}><Icon size={21} strokeWidth={1.7} /><span>{label}</span></button>)}</nav>
    {notice && <div className="toast" role="status"><span><Check size={18} /></span><p>{notice}</p><button onClick={() => setNotice('')} aria-label="Zavřít oznámení"><X size={16} /></button></div>}
    {addMode && <Modal title={addMode === 'loading' ? 'Hledáme váš příběh' : 'Přidat knihu'} onClose={closeAdd} className="add-modal">{['camera', 'manual'].includes(addMode) && <><div className="add-tabs"><button className={addMode === 'camera' ? 'active' : ''} onClick={() => { setError(''); setAddMode('camera'); }}><ScanLine size={17} /> Skenovat ISBN</button><button className={addMode === 'manual' ? 'active' : ''} onClick={() => setAddMode('manual')}><BookOpen size={17} /> Zadat ručně</button></div></>}
      {addMode === 'choose' && <div className="add-choices"><p>Jak chcete knihu přidat?</p><button className="add-choice" onClick={() => setAddMode('camera')}><span><ScanLine size={25} /></span><div><strong>Naskenovat ISBN</strong><small>Fotoaparátem ze zadní strany knihy</small></div><ChevronRight size={19} /></button><button className="add-choice" onClick={() => setAddMode('manual')}><span><BookOpen size={24} /></span><div><strong>Zadat ISBN ručně</strong><small>10 nebo 13 číslic</small></div><ChevronRight size={19} /></button><button className="add-choice" onClick={() => setAddMode('printed')}><span><ScanLine size={24} /></span><div><strong>Přečíst vytištěné číslo</strong><small>Fotografie ISBN bez čárového kódu</small></div><ChevronRight size={19} /></button><button className="add-choice" onClick={() => { closeAdd(); setManualIsbnSeed(''); setEditor(true); }}><span><Plus size={24} /></span><div><strong>Kniha bez ISBN</strong><small>Vyplnit údaje ručně</small></div><ChevronRight size={19} /></button><button className="add-choice" onClick={() => setAddMode('catalog')}><span><Search size={24} /></span><div><strong>Hledat v katalogu</strong><small>Podle názvu nebo autora</small></div><ChevronRight size={19} /></button></div>}
      {['printed', 'catalog'].includes(addMode) && <button className="text-button" onClick={() => setAddMode('choose')}><ArrowLeft size={14} /> Zpět na výběr</button>}
      {addMode === 'printed' && <Suspense fallback={<p role="status">Připravuji čtení čísla…</p>}><PrintedIsbn onDetected={value => void addBook(value)} onManual={() => setAddMode('manual')} /></Suspense>}
      {addMode === 'catalog' && <CatalogSearch onSelect={addCatalogBook} />}
      {addMode === 'camera' && <Suspense fallback={<div className="lookup-loading" role="status"><LoaderCircle className="spin" size={28} /><p>Připravujeme skener…</p></div>}><CameraScanner onDetected={value => void addBook(value)} onManual={() => setAddMode('manual')} /></Suspense>}
      {addMode === 'manual' && <form className="isbn-form" onSubmit={submitIsbn}><label htmlFor="isbn">ISBN knihy</label><input id="isbn" autoFocus inputMode="text" autoComplete="off" value={isbn} onChange={e => { setIsbn(e.target.value); setError(''); }} placeholder="Např. 978-80-257-0367-0" aria-invalid={!!error} aria-describedby={error ? 'isbn-error' : 'isbn-help'} /><p id="isbn-help">10 nebo 13 číslic ze zadní strany knihy. Pomlčky můžete ponechat.</p>{error && <div className="form-error" id="isbn-error" role="alert">{error}</div>}<button className="btn btn-dark full-width" type="submit" disabled={!isbn.trim()}><Plus size={18} /> Najít a přidat knihu <ArrowRight size={17} /></button><button className="text-button" type="button" onClick={() => { const seed = isValidIsbn(isbn) ? isbnTo13(isbn) : ''; closeAdd(); setManualIsbnSeed(seed); setEditor(true); }}>Vyplnit údaje knihy ručně</button></form>}
      {addMode === 'loading' && <div className="lookup-loading"><div className="loading-icon"><LoaderCircle className="spin" size={32} /></div><h3>Listujeme katalogem…</h3><p>Hledáme přesné vydání na Knihovny.cz.</p><code>{isbn}</code><button className="text-button" onClick={closeAdd}>Zrušit hledání</button></div>}
      <div className="modal-source"><ShieldCheck size={14} /><span>Údaje z Knihovny.cz · Uloženo ve vašem prohlížeči</span></div>
    </Modal>}
    {selected && !editor && <Modal title="Detail knihy" onClose={() => { setSelectedId(null); setConfirmDelete(false); }} className="detail-modal"><div className="detail-main"><Cover book={selected} /><div className="detail-heading"><span className={`status-label status-${selected.status}`}><span />{STATUS[selected.status]}</span><h2>{selected.title}</h2><p>{selected.authors.join(', ') || 'Autor neuveden'}</p></div></div><div className="detail-actions"><button className="btn btn-secondary" onClick={() => setEditor(selected)}>Upravit knihu</button><button className="btn btn-secondary" disabled={(selected.copies ?? 1) >= 999} onClick={() => { persist(booksRef.current.map(book => book.id === selected.id ? { ...book, copies: (book.copies ?? 1) + 1 } : book)); setNotice('Přidán další výtisk stejného vydání.'); }}>Přidat další výtisk</button></div><div className="detail-status"><label htmlFor="book-status">Moje čtení</label><select id="book-status" value={selected.status} onChange={e => persist(books.map(b => b.id === selected.id ? { ...b, status: e.target.value as BookStatus } : b))}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><dl className="detail-facts"><div><dt>ISBN</dt><dd>{selected.isbn || 'Bez ISBN'}</dd></div><div><dt>Počet výtisků v knihovně</dt><dd>{selected.copies ?? 1}</dd></div>{selected.edition && <div><dt>Vydání</dt><dd>{selected.edition}</dd></div>}<div><dt>Rok vydání</dt><dd>{selected.year ?? 'Neuveden'}</dd></div><div><dt>Nakladatel</dt><dd>{selected.publisher ?? 'Neuveden'}</dd></div><div><dt>Počet stran</dt><dd>{selected.pages ?? 'Neuveden'}</dd></div>{selected.publicationPlace && <div><dt>Místo vydání</dt><dd>{selected.publicationPlace}</dd></div>}{selected.cnb && <div><dt>Číslo ČNB</dt><dd>{selected.cnb}</dd></div>}</dl><div className="sales-facts"><div><span>Pořadí v prodejnosti</span><strong>Údaj není dostupný</strong></div><div><span>Prodané výtisky</span><strong>Údaj není dostupný</strong></div><p>Katalog neuvádí prodeje ani prodejní žebříček. Ověřené údaje pro toto ISBN nemáme.</p></div><label className="cover-upload"><Plus size={15} /> {selected.coverData ? 'Změnit obálku' : 'Nahrát obálku'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Nahrát vlastní obálku" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const id = selected.id; try { const coverData = await readCover(file); const saved = persist(booksRef.current.map(book => book.id === id ? { ...book, coverData } : book)); setNotice(saved ? 'Obálka byla uložena.' : 'Obálku se nepodařilo trvale uložit. Stáhněte si zálohu knihovny.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Obrázek se nepodařilo načíst.'); } }} /></label><div className="detail-source">Údaje: Knihovny.cz · Obálka: vlastní obrázek nebo Open Library</div>{confirmDelete ? <div className="delete-confirm"><p>Odebrat knihu z vaší knihovny?</p><div><button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Ponechat</button><button className="btn btn-danger" onClick={() => { persist(books.filter(b => b.id !== selected.id)); setSelectedId(null); setConfirmDelete(false); setNotice('Kniha byla odebrána z knihovny.'); }}>Odebrat knihu</button></div></div> : <button className="delete-button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Odebrat z knihovny</button>}</Modal>}
    {editor && <Modal title={editor === true ? 'Kniha bez ISBN' : 'Upravit knihu'} onClose={() => setEditor(null)}><BookEditor initialIsbn={manualIsbnSeed} book={editor === true ? undefined : editor} onSave={saveEdited} onCancel={() => setEditor(null)} /></Modal>}
    {about && <Modal title="Malý prostor. Velké příběhy." onClose={() => setAbout(false)}><div className="about-content"><span className="about-brand">shelfless.</span><p>Osobní knihovna pro knihy, které chcete přečíst, právě čtete nebo už máte za sebou.</p><div><ShieldCheck size={22} /><p><strong>Vaše knihy zůstávají u vás.</strong> Knihovna se ukládá v tomto prohlížeči. Při vymazání dat prohlížeče se smaže; mezi zařízeními se nesynchronizuje. Zálohu si můžete stáhnout tlačítkem Exportovat.</p></div><div><BookOpen size={22} /><p><strong>Údaje z Knihovny.cz.</strong> Hledáme konkrétní vydání podle ISBN. Obálky načítáme z Open Library podle ISBN. Pokud chybí, nahrajte vlastní obrázek v detailu knihy. Prodejní statistiky katalog neuvádí.</p></div><div><ScanLine size={22} /><p><strong>Fotoaparát slouží jen ke skenování.</strong> Video se nikam neodesílá. Fotoaparát vyžaduje HTTPS nebo localhost a váš souhlas.</p></div><div className="backup-restore"><label>Obnovit zálohu knihovny<input aria-label="Soubor zálohy knihovny" type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setBackupError(''); setBackup(null); try { if (file.size > 10 * 1024 * 1024) throw new Error('Záloha může mít nejvýše 10 MB.'); setBackup(parseBackup(await file.text())); } catch (error) { setBackupError(error instanceof Error ? error.message : 'Zálohu nelze přečíst.'); } }} /></label>{backupError && <p className="form-error" role="alert">{backupError}</p>}{backupPreview && <><p>Přidat {backupPreview.added} knih, přeskočit {backupPreview.skipped} duplicit. Stávající knihy se nepřepíší.</p><button className="btn btn-secondary" onClick={() => { const result = mergeBackup(booksRef.current, backup!); const saved = persist(result.books); setBackup(null); setNotice(saved ? `Obnoveno ${result.added} knih, přeskočeno ${result.skipped} duplicit.` : 'Obnovu nelze trvale uložit. Stáhněte si zálohu.'); }}>Potvrdit obnovu</button></>}</div><button className="btn btn-dark full-width" onClick={() => setAbout(false)}><ArrowLeft size={16} /> Zpět k příběhům</button></div></Modal>}
  </div>;
}
