import { useEffect, useState } from 'react';
import type { Book } from '../lib/books';

const palette = ['sage', 'peach', 'lilac', 'blue', 'yellow'];
export function BookCover({ book }: { book: Book }) {
  const source = book.coverData || book.coverUrl || `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`;
  const [failed, setFailed] = useState(!book.isbn && !book.coverData && !book.coverUrl);
  useEffect(() => setFailed(!book.isbn && !book.coverData && !book.coverUrl), [source, book.isbn, book.coverData, book.coverUrl]);
  const color = palette[Array.from(book.isbn).reduce((sum, digit) => sum + Number(digit), 0) % palette.length];
  return <div className={`book-cover ${color} ${failed ? 'cover-unavailable' : 'has-image'}`}>
    <span className="cover-title">{book.title}</span>
    <div className="cover-art" aria-hidden="true"><i /><i /><i /></div>
    <span className="cover-author">{book.authors.join(' · ') || 'Autor neuveden'}</span>
    {failed ? <span className="cover-missing">Obálka není dostupná</span> : <img className="cover-image" src={source} alt={`Obálka: ${book.title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} onLoad={event => { if (event.currentTarget.naturalWidth <= 1) setFailed(true); }} />}
    <span className="book-spine" aria-hidden="true" />
  </div>;
}

export async function readCover(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Vyberte obrázek JPG, PNG nebo WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Obrázek může mít nejvýše 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 600 / image.width, 900 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('Obrázek se nepodařilo zpracovat.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .8);
    if (data.length > 700_000) throw new Error('Zkuste menší nebo jednodušší obrázek.');
    return data;
  } finally { URL.revokeObjectURL(url); }
}
