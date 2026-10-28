# Shelfless — osobní knihovna

Minimalistická česká webová aplikace pro knihy, které chcete přečíst, právě čtete nebo už máte za sebou. React, TypeScript a Vite.

## Spuštění

Vyžaduje Node.js 22 nebo novější a npm.

```sh
npm ci
npm run dev
```

Vývojový server naslouchá na portu 5173. Pro produkci spusťte `npm run build` a publikujte obsah `dist/` na statický hosting s HTTPS. Aplikace nepotřebuje vlastní server, API klíč ani proxy. `npm run preview` slouží k místní kontrole produkčního sestavení.

## Funkce

- Tlačítko **Přidat knihu** nabídne fotoaparát nebo ruční zadání. Skenování otevře fotoaparát a skenuje EAN-13 s platným knižním ISBN.
- Ruční zadání podporuje ISBN-10 i ISBN-13, včetně pomlček.
- Metadata knih se získávají přímo v prohlížeči z veřejného API **Knihovny.cz**.
- Kontroluje se přesná shoda ISBN vydání; opakované naskenování otevře již uloženou knihu.
- Vyhledávání ve vlastní knihovně, řazení podle názvu/autora/data přidání, mřížka i seznam.
- Stav čtení, detail knihy, potvrzované odstranění a stažení JSON zálohy.
- Responzivní rozhraní pro mobil i počítač, ovládání klávesnicí a respektování omezeného pohybu.

Knihovna se ukládá do `localStorage` pod klíčem `folio.books.v1`. Data jsou vázána na konkrétní prohlížeč a adresu webu; nesynchronizují se mezi zařízeními. Vymazání dat webu knihovnu odstraní. JSON zálohu lze exportovat a v nabídce O aplikaci obnovit. Před obnovou se ukáže počet nových a duplicitních záznamů; stávající knihy se nepřepisují. Knihy nejsou předem naplněné ukázkovými záznamy. Skutečné obálky se načítají podle ISBN přes Open Library Covers API (pouze obrázky, bibliografická data zůstávají výhradně z Knihovny.cz). Pokud poskytovatel obálku nemá, zobrazí se označená náhrada a v detailu lze nahrát vlastní JPG, PNG nebo WebP. Vlastní obrázek se zmenší a uloží pouze v tomto prohlížeči.

## Fotoaparát

Prohlížeč vyžaduje **HTTPS** (při místním vývoji funguje také `localhost`) a souhlas uživatele. Na telefonu je třeba web otevřít přes HTTPS; nezabezpečená LAN adresa nestačí. Skener preferuje zadní kameru a po naskenování, přepnutí na ruční zadání nebo zavření dialogu kameru uvolní. Pokud kamera není k dispozici, lze zadat ISBN ručně. Video zůstává na zařízení a nikam se neodesílá. Na podporovaných zařízeních se používá nativní BarcodeDetector (EAN-13), jinak ZXing. Kamera se spouští po volbě skenování. Načtení katalogu stále závisí na připojení a odezvě API; okamžitý výsledek nelze zaručit.

## API Knihovny.cz

Používá se výhradně přímý prohlížečový `fetch` na:

```text
https://www.knihovny.cz/api/v1/search
```

Parametry jsou `lookfor=<ISBN-13>`, `type=ISN`, `limit=10` a opakované `field[]` pro `id`, `title`, `authors`, `publishers`, `placesOfPublication`, `publicationDates`, `physicalDescriptions`, `isbns`, `issns`, `cnb`, `formats`. Dotaz nemá vlastní hlavičky, má časový limit 8 sekund a nevyužívá jiného poskytovatele ani serverovou proxy. Z odpovědi se vybírá záznam s odpovídajícím ISBN po převodu na 13 číslic; jiná vydání se ignorují. Jména autorů se berou z klíčů `authors.primary`, nikoli z překladatelů či ilustrátorů v `secondary`.

**Živé API není z cloudového vývojového prostředí ověřováno.** Podle zadání zde vrací 502/504. Testy používají dodanou ukázkovou odpověď, nikdy nevolají katalog. Skutečné připojení a fyzické skenování je třeba ověřit v cílovém prohlížeči na HTTPS.

Fonty jsou součástí aplikace a načítají se ze stejné adresy jako web, bez požadavků na Google Fonts. Video ani nahrané obálky se nikam neposílají. Knihovny.cz při vyhledávání a Open Library při načítání obálky obdrží ISBN.

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

## Shelfless na mobilu

Mobilní rozhraní má spodní navigaci, přidávací dialog jako panel, safe-area okraje a zamezené vodorovné přetahování obsahu. Manifest umožňuje otevření v režimu samostatné aplikace po přidání na plochu; offline katalog ani synchronizace se neslibují. Desktop zachovává postranní panel a rozložení pro větší obrazovky.

## Prodejní údaje

Knihovny.cz nevrací počet prodaných výtisků ani pořadí v prodejnosti. Neexistuje zde napojený ověřený zdroj s vymezeným trhem, obdobím a konkrétním ISBN. Detail tyto položky zobrazuje jako **Údaj není dostupný**, nikoli nulu či odhad. Čtenost, hodnocení a počet vydání se nezaměňují za prodeje. Automatické skutečné statistiky vyžadují další ověřený zdroj dat.

## Funkce pro školní zadání

1. **ISBN z vytištěného čísla bez čárového kódu:** Přidat knihu → Přečíst vytištěné číslo → pořídit fotografii nebo vybrat obrázek. Lokální OCR navrhne platná ISBN (s kontrolním součtem), uživatel zkontroluje číslo a potvrdí výběr. Rozmazané nebo poškozené číslo nemusí být rozpoznáno; vždy je dostupné ruční zadání. Tesseract.js, jazykový model a WASM jsou načítané ze stejného webu; obraz neopouští zařízení. První použití může trvat déle kvůli stažení čtečky.
2. **Ruční ISBN:** Přidat knihu → Zadat ISBN ručně. Podporuje 10 i 13 znaků a pomlčky. Při nenalezení knihy či výpadku katalogu lze přepnout na ruční vyplnění údajů s již zadaným ISBN.
3. **Kniha bez ISBN:** Přidat knihu → Kniha bez ISBN. Název je povinný, autor, ISBN, rok, vydání, nakladatel a počet stran jsou volitelné. ISBN může zůstat prázdné.
4. **Správa knih:** Detail → Upravit knihu nebo Přidat další výtisk. Více kopií stejného vydání má jeden záznam s počtem výtisků. Opakované ISBN (i v ekvivalentním ISBN-10/13 tvaru) je duplicita, jiné ISBN představuje jiné vydání. U knih bez ISBN se porovnává název, autoři, rok, nakladatel a označení vydání (případně identita katalogového záznamu). Lze upravovat údaje, mazat záznamy a kombinovat stav čtení, autora, rok a přítomnost ISBN s textovým hledáním.

**Bonus:** Přidat knihu → Hledat v katalogu. Volba názvu/autor používá přesně `Title`/`Author`, `limit=10` a původní seznam `field[]`. Výsledky jsou omezené na `0/BOOKS/`. Uživatel vybírá konkrétní vydání a údaje se doplní. Testy stále používají pouze fixture, živé API se z cloudu nevolá.

Dvě rozšíření nad povinné zadání jsou bonusové katalogové hledání a bezpečná obnova záloh s náhledem a vynecháním duplicit. Původní vzhled i stávající data pod klíčem `folio.books.v1` jsou zachované. Exportovaný formát zachovává kompatibilitu; ISBN je u knih bez ISBN prázdný řetězec a počet výtisků je nepovinné pole `copies` (výchozí 1).

OCR soubory jsou generované do ignorované složky `public/ocr/` skriptem `scripts/prepare-ocr.mjs`, který běží před `npm run dev` a `npm run build`. Nevyžaduje CDN ani další síťový přístup mimo instalaci npm. Jsou distribuované s přiloženými licenčními soubory knihoven. Aplikace neodesílá fotografii žádné OCR službě.

Automatické prohlížečové testy čtou skutečný testovací obrázek vytištěných číslic pomocí skutečného OCR. Testují také ruční knihy, editaci, kopie, různé edice, filtry, bonusové hledání a obnovu záloh. Skenování telefonem v různém osvětlení a živou odezvu katalogu je před výukou potřeba vyzkoušet na cílovém zařízení; automatický test není fyzický zátěžový test s cizím uživatelem.
