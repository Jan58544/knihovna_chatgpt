import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { catalogueResponse, requestedFields } from './knihovny.fixture';

const API = 'https://www.knihovny.cz/api/v1/search*';
const ISBN = '9788025703670';
const title = catalogueResponse.records[0].title;

async function enterIsbn(page: Page, isbn = ISBN) {
  await page.getByRole('button', { name: 'Přidat knihu', exact: true }).click();
  await page.getByRole('button', { name: /Zadat ISBN ručně/ }).click();
  await page.getByRole('textbox', { name: 'ISBN knihy' }).fill(isbn);
  await page.getByRole('button', { name: 'Najít a přidat knihu' }).click();
}

async function chooseFilter(page: Page, name: string) {
  const desktop = page.getByRole('navigation', { name: 'Knihovna' });
  if (await desktop.isVisible()) await desktop.getByRole('button', { name: new RegExp(name) }).click();
  else await page.locator('.mobile-dock').getByRole('button', { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  // Block the whole catalogue origin first; individual tests supply local fixtures.
  // Never let a missed mock result in a live request from the cloud environment.
  await page.route('https://www.knihovny.cz/**', route => route.abort());
  await page.route('https://covers.openlibrary.org/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test('ISBN lookup, exact API contract, reading status, persistence, duplicate, search and removal', async ({ page }) => {
  const urls: URL[] = [];
  await page.route(API, async route => {
    urls.push(new URL(route.request().url()));
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers()['authorization']).toBeUndefined();
    await route.fulfill({ json: catalogueResponse });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'První kniha. Nová kapitola.' })).toBeVisible();
  await enterIsbn(page, '978-80-257-0367-0');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card h3')).toHaveText(title);
  await expect(page.locator('.book-card .book-info p')).toHaveText('Jean de Nostredame');
  expect(urls).toHaveLength(1);
  expect(urls[0].origin + urls[0].pathname).toBe('https://www.knihovny.cz/api/v1/search');
  expect(urls[0].searchParams.get('lookfor')).toBe(ISBN);
  expect(urls[0].searchParams.get('type')).toBe('ISN');
  expect(urls[0].searchParams.get('limit')).toBe('10');
  expect(urls[0].searchParams.getAll('field[]')).toEqual(requestedFields);
  expect([...urls[0].searchParams.keys()].filter(key => key !== 'field[]')).toEqual(['lookfor', 'type', 'limit']);

  await page.locator('.book-card').click();
  const detail = page.getByRole('dialog', { name: 'Detail knihy' });
  await expect(detail.getByText('Argo', { exact: true })).toBeVisible();
  await expect(detail.getByText('2011', { exact: true })).toBeVisible();
  await expect(detail.getByText('218', { exact: true })).toBeVisible();
  await expect(detail.getByText('Praha', { exact: true })).toBeVisible();
  await expect(detail.getByText('cnb002163342', { exact: true })).toBeVisible();
  await expect(detail).not.toContainText('Josef Prokop');
  await expect(detail).not.toContainText('1507-1577');
  await detail.getByLabel('Moje čtení').selectOption('reading');
  await page.keyboard.press('Escape');
  await chooseFilter(page, 'Právě čtu');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await chooseFilter(page, 'Přečtené');
  await expect(page.locator('.book-card')).toHaveCount(0);
  await chooseFilter(page, 'Moje knihovna');

  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card .status-label')).toHaveText('Právě čtu');
  await enterIsbn(page);
  await expect(page.getByRole('dialog', { name: 'Detail knihy' })).toBeVisible();
  expect(urls).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.book-card')).toHaveCount(1);

  await page.getByRole('textbox', { name: 'Hledat v knihovně' }).fill('zivoty');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Hledat v knihovně' }).fill('neexistující kniha');
  await expect(page.locator('.book-card')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Hledat v knihovně' }).fill('nostredame');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Seznam', exact: true }).click();
  await expect(page.locator('.books-list .book-card')).toHaveCount(1);
  await page.locator('.book-card').click();
  await page.getByRole('button', { name: 'Odebrat z knihovny', exact: true }).click();
  await expect(page.getByText('Odebrat knihu z vaší knihovny?')).toBeVisible();
  await page.getByRole('button', { name: 'Ponechat', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Detail knihy' })).toBeVisible();
  await page.getByRole('button', { name: 'Odebrat z knihovny', exact: true }).click();
  await page.getByRole('button', { name: 'Odebrat knihu', exact: true }).click();
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'První kniha. Nová kapitola.' })).toBeVisible();
});

test('ISBN-10 is converted before requesting and a matching edition is selected after a wrong one', async ({ page }) => {
  const wrong = { ...catalogueResponse.records[0], id: 'other.edition', title: 'Jiné vydání', isbns: ['9780306406157'] };
  let requested = '';
  await page.route(API, async route => {
    requested = new URL(route.request().url()).searchParams.get('lookfor') ?? '';
    await route.fulfill({ json: { ...catalogueResponse, resultCount: 2, records: [wrong, catalogueResponse.records[0]] } });
  });
  await page.goto('/');
  await enterIsbn(page, '80-257-0367-3');
  await expect(page.locator('.book-card h3')).toHaveText(title);
  expect(requested).toBe(ISBN);
});

test('a wrong edition is not added', async ({ page }) => {
  await page.route(API, route => route.fulfill({ json: { ...catalogueResponse, records: [{ ...catalogueResponse.records[0], isbns: ['9780306406157'] }] } }));
  await page.goto('/');
  await enterIsbn(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'ISBN knihy' })).toHaveValue(ISBN);
});

test('HTTP 200 with missing records shows not found and leaves the library empty', async ({ page }) => {
  await page.route(API, route => route.fulfill({ json: { resultCount: 0, status: 'OK' } }));
  await page.goto('/');
  await enterIsbn(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.book-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Najít a přidat knihu' })).toBeEnabled();
});

test('invalid ISBN is rejected without requesting the catalogue', async ({ page }) => {
  let requests = 0;
  await page.route(API, route => { requests++; return route.abort(); });
  await page.goto('/');
  await enterIsbn(page, '9788025703671');
  await expect(page.getByRole('alert')).toContainText('platné ISBN');
  expect(requests).toBe(0);
  await expect(page.locator('.book-card')).toHaveCount(0);
});

test('denied camera permission offers manual entry and Escape closes the dialog', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
    });
  });
  await page.route(API, route => route.fulfill({ json: catalogueResponse }));
  await page.goto('/');
  const scan = page.getByRole('button', { name: 'Přidat knihu', exact: true });
  await scan.click();
  await page.getByRole('button', { name: /Naskenovat ISBN/ }).click();
  await expect(page.getByRole('dialog', { name: 'Přidat knihu' })).toBeVisible();
  await expect(page.locator('.camera-error')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Zadat ručně', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'ISBN knihy' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(scan).toBeFocused();
});

test('layout fits the viewport and an accessible dialog contains keyboard focus', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Přidat knihu', exact: true }).click();
  await page.getByRole('button', { name: /Zadat ISBN ručně/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Scan decodes an EAN-13 camera frame, adds the book and releases camera tracks', async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, '__folioTestStreams', { value: streams });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const isbn = '9788025703670';
        const left = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
        const alternate = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
        const right = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
        const parities = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
        const parity = parities[Number(isbn[0])];
        let bits = '101';
        for (let index = 1; index <= 6; index++) bits += (parity[index - 1] === 'L' ? left : alternate)[Number(isbn[index])];
        bits += '01010';
        for (let index = 7; index <= 12; index++) bits += right[Number(isbn[index])];
        bits += '101';
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const context = canvas.getContext('2d')!;
        const draw = () => {
          context.fillStyle = '#fff'; context.fillRect(0, 0, 640, 480);
          context.fillStyle = '#000';
          for (let index = 0; index < bits.length; index++) if (bits[index] === '1') context.fillRect(130 + index * 4, 140, 4, 200);
        };
        draw();
        const stream = canvas.captureStream(15);
        streams.push(stream);
        const timer = setInterval(() => {
          if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer);
          else draw();
        }, 60);
        return stream;
      },
    });
  });
  await page.route(API, route => route.fulfill({ json: catalogueResponse }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Přidat knihu', exact: true }).click();
  await page.getByRole('button', { name: /Naskenovat ISBN/ }).click();
  await expect(page.locator('.book-card h3')).toHaveText(title, { timeout: 15_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const streams = (window as unknown as { __folioTestStreams: MediaStream[] }).__folioTestStreams;
    return streams.length > 0 && streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'));
  })).toBe(true);
});

test('one add entry, preserved copy, and no horizontal dragging at small widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Přidat knihu', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toHaveCount(0);
  await expect(page.locator('.steps')).toHaveCount(0);
  await expect(page.getByText('Vytvořeno z lásky ke knihám.', { exact: true })).toBeVisible();
  await expect(page.getByText('Všechny vaše příběhy. Konečně na jednom místě.')).toBeVisible();
  for (const width of [320, 375, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollBy(100, 0));
    expect(await page.evaluate(() => scrollX)).toBe(0);
  }
});

test('real ISBN cover displays; missing cover can be replaced locally and survives reload', async ({ page }) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="#b6c7a2"/><text x="20" y="80" font-size="24">Test cover</text></svg>';
  await page.route('https://covers.openlibrary.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.route(API, route => route.fulfill({ json: catalogueResponse }));
  await page.goto('/'); await enterIsbn(page);
  const image = page.locator('.book-card .cover-image');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', `https://covers.openlibrary.org/b/isbn/${ISBN}-L.jpg?default=false`);
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 1)).toBe(true);
  await page.locator('.book-card').click();
  const detail = page.getByRole('dialog', { name: 'Detail knihy' });
  await expect(detail.getByText('Pořadí v prodejnosti', { exact: true })).toBeVisible();
  await expect(detail.getByText('Údaj není dostupný', { exact: true })).toHaveCount(2);
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 30;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#aaa'; ctx.fillRect(0, 0, 20, 30);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Nahrát vlastní obálku').setInputFiles({ name: 'obalka.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(detail.locator('.cover-image')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.locator('.book-card .cover-image')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await page.route('https://covers.openlibrary.org/**', route => route.fulfill({ status: 404, body: '' }));
  await page.evaluate(() => {
    const books = JSON.parse(localStorage.getItem('folio.books.v1')!); delete books[0].coverData;
    localStorage.setItem('folio.books.v1', JSON.stringify(books));
  });
  await page.reload(); await expect(page.locator('.cover-missing')).toBeVisible();
});

test('native barcode decoder is used without downloading ZXing and releases camera on close', async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.defineProperty(window, '__nativeStreams', { value: streams });
    Object.defineProperty(window, '__nativeCalls', { value: { count: 0 } });
    Object.defineProperty(window, 'BarcodeDetector', { value: class {
      static async getSupportedFormats() { return ['ean_13']; }
      async detect() { (window as unknown as { __nativeCalls: {count:number} }).__nativeCalls.count++; return []; }
    }, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d')!; ctx.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(10); streams.push(stream); return stream;
    } });
  });
  const decoderRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('zxing')) decoderRequests.push(request.url()); });
  await page.goto('/'); await page.getByRole('button', { name: 'Přidat knihu', exact: true }).click();
  await page.getByRole('button', { name: /Naskenovat ISBN/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nativeCalls: {count:number} }).__nativeCalls.count)).toBeGreaterThan(0);
  expect(decoderRequests).toHaveLength(0);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { __nativeStreams: MediaStream[] }).__nativeStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
});
