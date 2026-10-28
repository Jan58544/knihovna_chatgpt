import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { catalogueResponse } from './knihovny.fixture';
const API = 'https://www.knihovny.cz/api/v1/search*';
async function addManual(page: Page, title: string, year = '1942', isbn = '') {
  await page.getByRole('button', { name: 'Přidat knihu', exact: true }).click();
  await page.getByRole('button', { name: /Kniha bez ISBN/ }).click();
  await page.getByLabel('Název knihy').fill(title);
  await page.getByLabel('Autor / autoři').fill('Zdeněk Jirotka');
  await page.getByLabel('Rok vydání', {exact:true}).fill(year);
  if (isbn) await page.getByLabel('ISBN (nepovinné)').fill(isbn);
  await page.getByRole('button', { name: 'Uložit knihu', exact:true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.route('https://www.knihovny.cz/**', r => r.abort());
  await page.route('https://covers.openlibrary.org/**', r => r.fulfill({status:404,body:''}));
});
test('manual books without ISBN: duplicates, copies, editing, different editions and combined filters', async ({ page }) => {
  await page.goto('/'); await addManual(page, 'Saturnin');
  await expect(page.getByRole('dialog', {name:'Detail knihy'})).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Bez ISBN', {exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Přidat další výtisk',exact:true}).click();
  await page.getByRole('button', {name:'Upravit knihu',exact:true}).click();
  await expect(page.getByLabel('Počet výtisků', {exact:true})).toHaveValue('2');
  await page.getByLabel('Nakladatel', {exact:true}).fill('Nový nakladatel');
  await page.getByRole('button', {name:'Uložit změny',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('Nový nakladatel',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape'); await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await addManual(page, 'Saturnin', '2025'); await page.keyboard.press('Escape');
  await expect(page.locator('.book-card')).toHaveCount(2);
  await addManual(page, 'Saturnin', '2025');
  await expect(page.getByRole('alert')).toContainText('Toto vydání už');
  await page.keyboard.press('Escape');
  await page.getByLabel('Filtrovat podle roku').selectOption('1942');
  await page.getByLabel('Filtrovat podle autora').selectOption('Zdeněk Jirotka');
  await page.getByLabel('Filtrovat podle ISBN').selectOption('without');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByLabel('Filtrovat podle ISBN').selectOption('with');
  await expect(page.locator('.book-card')).toHaveCount(0);
  await page.getByRole('button',{name:'Zrušit filtry',exact:true}).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
});
test('different ISBNs keep editions separate and editing cannot create an ISBN duplicate', async ({ page }) => {
  await page.goto('/'); await addManual(page, 'Stejné dílo', '2011', '9788025703670'); await page.keyboard.press('Escape');
  await addManual(page, 'Stejné dílo', '2025', '9780804429573');
  await page.getByRole('button',{name:'Upravit knihu',exact:true}).click();
  await page.getByLabel('ISBN (nepovinné)').fill('9788025703670');
  await page.getByRole('button',{name:'Uložit změny',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Toto vydání už');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(2);
});
test('catalogue title and author search uses allowed query and offers editions, not audio', async ({ page }) => {
  const requests: URL[]=[];
  await page.route(API, route => { requests.push(new URL(route.request().url())); return route.fulfill({json:{status:'OK',records:[catalogueResponse.records[0],{...catalogueResponse.records[0],id:'audio',title:'Audio only',formats:['0/AUDIO/']}]}}); });
  await page.goto('/');
  for (const type of ['Title','Author']) {
    await page.getByRole('button',{name:'Přidat knihu',exact:true}).click(); await page.getByRole('button',{name:/Hledat v katalogu/}).click();
    await page.getByLabel('Hledat podle').selectOption(type); await page.getByLabel('Hledaný text').fill('Nostredame'); await page.getByRole('button',{name:'Hledat v katalogu',exact:true}).click();
    await expect(page.locator('.catalog-result')).toHaveCount(1);
    expect(requests.at(-1)!.searchParams.get('type')).toBe(type); expect(requests.at(-1)!.searchParams.get('lookfor')).toBe('Nostredame');
    await page.locator('.catalog-result').click(); await expect(page.getByRole('dialog',{name:'Detail knihy'})).toBeVisible(); await page.keyboard.press('Escape');
  }
  await expect(page.locator('.book-card')).toHaveCount(1);
});
test('backup preview merges safely and keeps existing manual books', async ({ page }) => {
  await page.goto('/'); await addManual(page,'Původní kniha'); await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'O vaší knihovně',exact:true}).click();
  const imported={id:'imported',isbn:'',title:'Obnovená kniha',authors:[],status:'want',addedAt:'2026-01-01T00:00:00Z'};
  await page.getByLabel('Soubor zálohy knihovny').setInputFiles({name:'zaloha.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({books:[imported]}))});
  await expect(page.getByText(/Přidat 1 knih/)).toBeVisible();
  await page.getByRole('button',{name:'Potvrdit obnovu',exact:true}).click();await page.keyboard.press('Escape');await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(2);
});
test('reads an actual printed ISBN image with local OCR, without a barcode', async ({ page }) => {
  test.setTimeout(90_000);
  const external: string[]=[]; page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')&&!r.url().includes('www.knihovny.cz')&&!r.url().includes('covers.openlibrary.org'))external.push(r.url());});
  await page.route(API,r=>r.fulfill({json:catalogueResponse}));
  await page.goto('/');
  const png = await page.evaluate(() => {const c=document.createElement('canvas');c.width=1500;c.height=300;const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#000';ctx.font='80px Arial';ctx.fillText('978-80-257-0367-0',120,170);return c.toDataURL('image/png').split(',')[1];});
  await page.getByRole('button',{name:'Přidat knihu',exact:true}).click();await page.getByRole('button',{name:/Přečíst vytištěné číslo/}).click();
  await page.getByLabel('Fotografie vytištěného ISBN').setInputFiles({name:'cislo-bez-kodu.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('button',{name:'Použít ISBN 9788025703670',exact:true})).toBeVisible({timeout:60_000});
  await page.getByRole('button',{name:'Použít ISBN 9788025703670',exact:true}).click();await expect(page.locator('.book-card')).toHaveCount(1);
  expect(external).toEqual([]);
});

test('manual ISBN fallback can save a book even when catalogue is unavailable', async ({ page }) => {
  await page.route(API, route => route.fulfill({status:503,body:''}));
  await page.goto('/');await page.getByRole('button',{name:'Přidat knihu',exact:true}).click();await page.getByRole('button',{name:/Zadat ISBN ručně/}).click();
  await page.getByLabel('ISBN knihy',{exact:true}).fill('9788025703670');await page.getByRole('button',{name:'Najít a přidat knihu',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await page.getByRole('button',{name:'Vyplnit údaje knihy ručně',exact:true}).click();await expect(page.getByLabel('ISBN (nepovinné)')).toHaveValue('9788025703670');
  await page.getByLabel('Název knihy').fill('Ručně zapsaná kniha');await page.getByRole('button',{name:'Uložit knihu',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Detail knihy'})).toBeVisible();await page.keyboard.press('Escape');await page.reload();await expect(page.locator('.book-card h3')).toHaveText('Ručně zapsaná kniha');
});
