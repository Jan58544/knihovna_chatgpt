# Folio — osobní knihovna

Minimalistická česká webová aplikace pro knihy, které chcete přečíst, právě čtete nebo už máte za sebou. React, TypeScript a Vite.

## Spuštění

Vyžaduje Node.js 22 nebo novější a npm.

```sh
npm ci
npm run dev
```

Vývojový server naslouchá na portu 5173. Pro produkci spusťte `npm run build` a publikujte obsah `dist/` na statický hosting s HTTPS. Aplikace nepotřebuje vlastní server, API klíč ani proxy. `npm run preview` slouží k místní kontrole produkčního sestavení.

## Funkce

- Tlačítko **Scan** otevře fotoaparát a skenuje EAN-13 s platným knižním ISBN.
- Ruční zadání podporuje ISBN-10 i ISBN-13, včetně pomlček.
- Metadata knih se získávají přímo v prohlížeči z veřejného API **Knihovny.cz**.
- Kontroluje se přesná shoda ISBN vydání; opakované naskenování otevře již uloženou knihu.
- Vyhledávání ve vlastní knihovně, řazení podle názvu/autora/data přidání, mřížka i seznam.
- Stav čtení, detail knihy, potvrzované odstranění a stažení JSON zálohy.
- Responzivní rozhraní pro mobil i počítač, ovládání klávesnicí a respektování omezeného pohybu.

Knihovna se ukládá do `localStorage` pod klíčem `folio.books.v1`. Data jsou vázána na konkrétní prohlížeč a adresu webu; nesynchronizují se mezi zařízeními. Vymazání dat webu knihovnu odstraní. JSON export je záloha dat, aplikace zatím nemá import. Knihy nejsou předem naplněné ukázkovými záznamy. Generované typografické obálky jsou ilustrační, nejsou obálkami z katalogu.

## Fotoaparát

Prohlížeč vyžaduje **HTTPS** (při místním vývoji funguje také `localhost`) a souhlas uživatele. Na telefonu je třeba web otevřít přes HTTPS; nezabezpečená LAN adresa nestačí. Skener preferuje zadní kameru a po naskenování, přepnutí na ruční zadání nebo zavření dialogu kameru uvolní. Pokud kamera není k dispozici, lze zadat ISBN ručně. Video zůstává na zařízení a nikam se neodesílá. Pro čtení čárových kódů se používá ZXing.

## API Knihovny.cz

Používá se výhradně přímý prohlížečový `fetch` na:

```text
https://www.knihovny.cz/api/v1/search
```

Parametry jsou `lookfor=<ISBN-13>`, `type=ISN`, `limit=10` a opakované `field[]` pro `id`, `title`, `authors`, `publishers`, `placesOfPublication`, `publicationDates`, `physicalDescriptions`, `isbns`, `issns`, `cnb`, `formats`. Dotaz nemá vlastní hlavičky, má časový limit 8 sekund a nevyužívá jiného poskytovatele ani serverovou proxy. Z odpovědi se vybírá záznam s odpovídajícím ISBN po převodu na 13 číslic; jiná vydání se ignorují. Jména autorů se berou z klíčů `authors.primary`, nikoli z překladatelů či ilustrátorů v `secondary`.

**Živé API není z cloudového vývojového prostředí ověřováno.** Podle zadání zde vrací 502/504. Testy používají dodanou ukázkovou odpověď, nikdy nevolají katalog. Skutečné připojení a fyzické skenování je třeba ověřit v cílovém prohlížeči na HTTPS.

Fonty jsou součástí aplikace a načítají se ze stejné adresy jako web, bez požadavků na Google Fonts. Obrázky knih ani video se do externích služeb neposílají; při vyhledávání katalog obdrží ISBN.

## Kontroly

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Jednotkové testy ověřují ISBN, zpracování metadat, výběr správného vydání, chyby API a ukládání dat. Prohlížečové testy používají mock katalogu a pokrývají přidání knihy, změny stavu, trvalost dat, duplicity, odstranění i mobilní rozhraní. GitHub Actions spouští kontroly při pushi a pull requestu.

Aplikace neobsahuje účet, synchronizaci ani platební systém. Prémiový vzhled není napojen na skutečné předplatné.

## Veřejný web — GitHub Pages

Push do `main` spustí kontroly a následně nasazení na GitHub Pages. Ve workflow je prostředí `github-pages` s odkazem na aplikaci. Adresa webu je https://jan58544.github.io/knihovna_chatgpt/ .

Produkční sestavení pro Pages používá `VITE_BASE_PATH=/knihovna_chatgpt/`, takže skripty, fonty a ikona fungují i v podadresáři. Ostatní hosting a místní vývoj standardně používají `/`.

Pokud Pages nejsou v repozitáři zapnuté a automatické povolení nemá oprávnění, vlastník jednorázově zvolí **Settings → Pages → Build and deployment → Source: GitHub Actions**. Poté znovu spustí nasazení. Fotoaparát je na HTTPS adrese Pages dostupný po povolení v prohlížeči.
