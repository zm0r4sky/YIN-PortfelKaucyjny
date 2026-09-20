# TASK.md - Harmonogram Zadań i Postęp Prac

> **ZASADY PRACY Z TYM PLIKIEM:**
> - Agent AI ma obowiązek aktualizować ten plik po każdym zakończonym etapie.
> - Wykonane zadania oznaczaj jako `[x]`, ale **NIGDY NIE USUWAJ** ich wpisów z tego pliku. Historia zmian musi zostać zachowana.
> - Wszelkie nowe pomysły, poprawki i refaktoryzacje dopisuj jako nowe zadania na końcu odpowiedniego etapu.
> - Aktualnie skupiamy się **WYŁĄCZNIE NA FAZIE 1**. 

---

## 🏗️ FAZA 1: Offline-first PWA (Priorytet)
Budowa autonomicznej aplikacji działającej lokalnie w przeglądarce, z wykorzystaniem IndexedDB (Dexie.js).

### Etap 1.1: Repozytorium, Hosting i Szkielet Aplikacji
- [x] Utworzenie publicznego repozytorium o nazwie `YIN-PortfelKaucyjny`.
- [x] Konfiguracja i uruchomienie usługi GitHub Pages.
- [x] Utworzenie testowego pliku (np. prostego `index.html`) i weryfikacja, czy GitHub Pages poprawnie serwuje stronę online.
- [x] Utworzenie docelowego projektu przy pomocy Vite (szablon Vue 3 lub React) po pozytywnym teście hostingu.
- [x] Konfiguracja pluginu `vite-plugin-pwa` (generowanie manifestu, service workera do działania offline).
- [x] Stworzenie bazowej struktury katalogów (`/components`, `/views`, `/services`, `/store`).
- [x] Wdrożenie podstawowego layoutu mobilnego (np. nawigacja dolna).

### Etap 1.2: Warstwa Danych (Dexie.js)
- [x] Instalacja biblioteki Dexie.js.
- [x] Utworzenie serwisu bazy danych (`db.js` / `db.ts`).
- [x] Zdefiniowanie schematu tabeli `receipts` (id, sklep, kwota, data_waznosci, kod_kreskowy, status_uzycia).
- [x] Przygotowanie repozytorium (CRUD) z interfejsami, które w Fazie 2 pozwolą łatwo podmienić Dexie.js na zapytania API (Axios/Fetch).

### Etap 1.3: Skaner Kodów Kreskowych (MUST HAVE)
- [x] Integracja biblioteki `html5-qrcode` lub `@zxing/browser`.
- [x] Wymuszenie użycia tylnej kamery telefonu (`facingMode: "environment"`).
- [x] Optymalizacja obszaru skanowania (Scan Area) specjalnie pod jednowymiarowy format Code 128.
- [x] Stworzenie widoku skanera wyświetlającego zeskanowany ciąg znaków (Proof of Concept działania).
- [x] Wdrożenie hybrydowego silnika skanowania: Natywny sprzętowy `window.BarcodeDetector` (Google ML Kit na Androidzie) + `zxing-wasm` (ZXing-C++ WebAssembly dla iOS i trudnych ujęć).
- [x] Pełne wsparcie offline PWA: Lokalny moduł WebAssembly `zxing_reader.wasm` bez zależności od zewnętrznych CDN.
- [x] Sprzętowe sterowanie kamerą: Przyciski Zoom (1x, 2x, 3x) oraz przełącznik latarki (Torch) do ostrego kadrowania bez utraty ostrości makro.
- [x] Wieloprzebiegowy analizator zdjęć (Multi-Pass Engine): automatyczna normalizacja kontrastu papieru termicznego oraz analiza pasmowa długich paragonów.
- [x] Sygnalizacja sukcesu: Dźwięk Web Audio API + wibracje haptyczne urządzenia.
- [x] Opracowanie master dokumentacji `SCANER.md`: analiza, konfiguracja, gotowe wzorce i blueprint dla przyszłych projektów.

### Etap 1.4: Zarządzanie Portfelem (UI/UX)
- [x] Widok "Mój Portfel": Wyświetlanie listy paragonów z Dexie.js, grupowanie po sklepach oraz saldo sumaryczne.
- [x] Formularz dodawania/edycji: Możliwość szybkiego wyboru sklepu, kwoty i terminu ważności po skanowaniu oraz edycja w portfelu.
- [x] Logika terminów ważności: Oznaczanie kolorem czerwonym paragonów z terminem < 3 dni (alert pilny) oraz żółtym dla terminów 3-7 dni.
- [x] Zmiana statusu: Oznaczanie paragonu jako "wykorzystany" z przeniesieniem do Archiwum oraz opcja przywrócenia/usunięcia.
- [x] Prezenter Kodu Kreskowego dla Kasjera: Generowanie ostrego obrazu kodu w czasie rzeczywistym z zxing-wasm do zeskanowania przy kasie.

- [x] Detekcja duplikatów: Blokowanie ponownego dodania tego samego kodu z alertem o istniejącym aktywnym paragonie lub opcją przywrócenia z archiwum.
- [x] Inteligentny Parser Kodów Kreskowych: Dekodowanie sklepu, kwoty i daty bezpośrednio ze struktury kodu (np. 28-cyfrowy Code 128 z Biedronki: prefix, ID sklepu, timestamp unix, kwota w groszach).
- [x] Blokada rotacji ekranu w pionie (Portrait Lock w PWA Manifest, Screen Orientation API, meta tagi mobilne oraz bariera CSS landscape blocker).
- [x] Korekta warstw z-index okien modalnych: Wyniesienie dialogów zapisu paragonu i duplikatów ponad dolną nawigację (`z-index: 20000`) wraz z responsywnym przewijaniem na niskich ekranach.
- [x] Obsługa usuwania paragonów w Archiwum (Faza 1 tryb testowy): Zastąpienie blokowanego na urządzeniach mobilnych i w PWA natywnego `window.confirm()` dedykowanym modalem potwierdzenia trwałego usunięcia z bezpieczną konwersją klucza głównego w Dexie.js.

- [x] Ostateczne rozwiązanie problemu zasłaniania popupów przez dolne menu (`BottomNav`):
  - Użycie `<teleport to="body">` dla wszystkich okien modalnych w aplikacji (`ScannerView.vue` oraz `WalletView.vue`), co eliminuje pułapkę lokalnego kontekstu stosu (stacking context).
  - Skrócenie wysokości okien dialogowych (`max-height: min(78dvh, 560px)`), redukcja marginesów wewnętrznych oraz dodanie dolnego marginesu bezpieczeństwa overlayu (`padding-bottom: 95px`), co gwarantuje pełną widoczność przycisku "Anuluj" bez wchodzenia pod dolną belkę nawigacji na dowolnym telefonie.
  - Dodanie stałego przycisku zamknięcia `✕` (`.modal-close-btn`) w prawym górnym rogu każdego modala ułatwiającego natychmiastowe wyjście jednym dotknięciem.
  - Wdrożenie kontrastowego, czerwonego przycisku `.btn-cancel` dla szybkiej rezygnacji z zapisu.
- [x] Całkowita blokada przewijania poziomego (overflow-x) w oknach modalnych i formularzach:
  - Wdrożenie globalnego `box-sizing: border-box` oraz `overflow-x: hidden` na poziomie `html`, `body` i wszystkich nakładek modalnych.
  - Zabezpieczenie wszystkich kontenerów dialogowych (`.save-modal`, `.cashier-modal`, `.edit-modal`, `.delete-modal`) przed poziomym scrollem (`overflow-x: hidden`).
  - Wdrożenie zawijania długich ciągów znaków (`word-break: break-word` / `overflow-wrap: anywhere`), w tym numerów kodów kreskowych, bloków tekstu OCR (`pre`), tagów i pól formularzy, gwarantujące czytelne wyświetlanie całej treści na dowolnej szerokości ekranu.

### Etap 1.5: Rozpoznawanie Danych (OCR) - ZADANIE DODATKOWE
- [x] Integracja `Tesseract.js` (wsparcie języka polskiego i angielskiego z lazy workerem).
- [x] Wdrożenie analizy Regex na zrobionym zdjęciu w celu automatycznego wyciągnięcia Daty i Kwoty (wzorce paragonowe: SUMA, RAZEM, ZWROT KAUCJI, daty ISO/kropkowe/kreskowe).
- [x] Rozpoznawanie sklepu na podstawie słów kluczowych i NIP (Biedronka, Lidl, Dino, Kaufland, Carrefour, itp.).
- [x] Panel testowy OCR w widoku skanera: wskaźnik postępu, rozpoznane tagi, pewność (confidence %) oraz podgląd surowego tekstu z możliwością przeniesienia do formularza.
- [x] Kalibracja silnika OCR na podstawie rzeczywistych zdjęć paragonów termicznych Lidl/Tomra:
  - Obsługa formatu `HH:MM:SS DD-MMM-YYYY` z tolerancją zniekształceń matrycy termicznej (np. `URZ`/`VRZ` dla `WRZ`, `LU1`/`LU7` dla `LUT`, `CRU` dla `GRU`).
  - Inteligentne wyliczanie roku przy urwanej końcówce wydruku (np. `12-GRU-?`).
  - Rozszerzenie bazy rozpoznawania sieci Lidl o NIP (`7811897358`) i adres centrali (`Jankowice`, `Tarnowo Podgórne`).
  - Obsługa etykiet kwot wieloliniowych i sum rabatowych (`SUMA RABATU`).
  - Podgląd przetworzonego filtru obrazu bezpośrednio w interfejsie testowym skanera.
- [x] Obsługa cyklu życia i powiadomień ratunkowego trybu OCR:
  - Płynne raportowanie postępu analizy OCR na ekranie skanera (dynamiczny toast z animowanym wskaźnikiem `⏳ Trwa analiza tekstu OCR (X%)...`).
  - Wyraźny komunikat końcowy, gdy OCR przestał pracować i nie udało mu się nic znaleźć (np. `OCR zakończył pracę: Nie udało się odnaleźć kodu ani danych paragonu...`).
  - Usunięcie przedwczesnego ukrywania powiadomienia w trakcie trwania procedury OCR.
- [x] Głęboka kalibracja OCR i wieloprzebiegowego silnika pod kątem zdjęć z automatu (Lidl/Tomra):
  - Umożliwienie upscalingu zdjęć niskorozdzielczych w silniku ZXing (scale > 1 dla ujęć poniżej 1600px), gwarantujące natychmiastowe rozkodowanie kodu 128 z pełną precyzją.
  - Obsługa identyfikatorów zastosowań GS1 w kodach Lidl (oczyszczanie nawiasów `(20)01(94)...`) w `BarcodeParserService.js`.
  - Automatyczne kadrowanie obszaru paragonu (Auto-crop ROI) odcinające ciemne tło automatu recyklingowego.
  - Inwersja negatywowa czarnych belek nagłówkowych z białym drukiem (np. `PLN 0.35`).
  - Rozszerzenie słowników OCR o adresy lokalne i linie paragonowe (Braniborska, Wrocław, Tomra 90, `7x Butelka plastikowa 0.35`).
- [x] Blokada zapisu podczas analizy OCR i interfejs oczekiwania:
  - Blokada kliknięcia przycisków zapisu (`:disabled="isOcrRunning"`) oraz asynchroniczny strażnik w `confirmSave()`.
  - Dynamiczna zmiana etykiet przycisków w modalu na `⏳ Jeszcze chwila...` oraz `⏳ Ładowanie...` na czas pracy OCR.
  - Dodanie wizualnych stylów dla stanu zablokowanego `.btn:disabled` (opacity, brak cieni, cursor: not-allowed).
- [x] Pełna inżynieria odwrotna kodów Biedronki (28 cyfr, Code 128) i cyfry kontrolnej GS1 Modulo 10:
  - Rozkodowanie struktury 28-cyfrowej: prefiks (4c), ID sklepu (5c), ID terminala (4c), 10-cyfrowy znacznik czasu Unix timestamp z sekundową dokładnością (10c), kwota w jednostkach 10 groszy (4c) oraz 28. cyfra jako suma kontrolna GS1 Modulo 10 (1c).
  - Odkrycie i wdrożenie algorytmu sumy kontrolnej GS1 Modulo 10 z wagami 3 i 1 naprzemiennie od prawej do lewej (100% zgodności ze wszystkimi 5 zweryfikowanymi paragonami z Biedronki).
  - Wdrożenie metod `calculateBiedronkaCheckDigit()` i `validateBiedronkaCheckDigit()` w `BarcodeParserService.js`.
  - Wzbogacenie bazy próbek `smaples_to_analize.txt` i `receipt_samples.json` o 4 nowe rzeczywiste paragony z Biedronki (Zielonka, 20-09-2026).
- [x] Kalibracja silnika OCR pod kątem fizycznych paragonów Biedronki:
  - Rozpoznawanie dat w formacie ISO `YYYY-MM-DD` (Biedronka: `DATA WYDRUKU: 2026-09-20 13:20` oraz `Do wykorzystania do dnia:\n2026-10-20`).
  - Udoskonalenie inwersji czarnej belki `[ Suma:0,50zł ]`: precyzyjna detekcja ciemnego pasma poziomego z białym tekstem bez inwersji marginesów papieru i pasków kodu kreskowego (ochrona przed zniekształceniem kodu przy zachowaniu kontrastu napisu Suma).
  - Wzbogacenie słownika detekcji sieci Biedronka o dane adresowe spółki: `Kostrzyn`, `ul. Żniwna 5`, `Codziennie niskie ceny`.
  - Elastyczne wykrywanie kwoty kaucji z linii asortymentowej `1 x Butelka plastikowa 0.50zl  0,50zl` oraz bloku `Suma:0,50zł`.
  - Wzmocnienie ekstraktora 28-cyfrowego kodu kreskowego z tekstu OCR (`extractBarcode`) o zamiany literówkowe cyfr (S->5, Z->2, !->1, B->8).
- [x] Precyzyjne formatowanie kwoty oraz reguły walidacji wielokrotności (Biedronka / Lidl):
  - Wymuszenie formatu dwumiejscowego (np. `0,50` zamiast `0,5` oraz `1,00` zamiast `1`) w polach wprowadzania i edycji kwoty.
  - Reguła walidacji Biedronka: wyłącznie wielokrotność 0,50 zł (min. 0,50 zł) z blokadą przycisków zapisu i czytelnym ostrzeżeniem w modalu.
  - Reguła walidacji Lidl: wielokrotność 0,10 zł (min. 0,10 zł, z uwagi na butelki/puszki bez kaucji po 10 gr).
  - Dynamiczne przyciski szybkiego dodawania kwot (`btn-quick`) dostosowujące się do wybranego sklepu (+0.50, +1.00, +2.50, +5.00 dla Biedronki; +0.10, +0.50, +1.00, +5.00 dla Lidla).
  - Zastosowanie tych samych reguł walidacji w oknie edycji paragonu w portfelu (`WalletView.vue`).

---

## 🌐 FAZA 2: Integracja Backend i Marketplace (Zaplanowane)
Ta faza zostanie rozpoczęta dopiero po całkowitym ustabilizowaniu i zatwierdzeniu Fazy 1.

### Etap 2.1: Migracja i Autoryzacja
- [ ] Generowanie anonimowych tokenów/hashy użytkowników zapisywanych w pamięci urządzenia.
- [ ] Mechanizm "Bulk Upload" synchronizujący lokalne paragony z nowym serwerem backendowym.
- [ ] Podmiana warstwy serwisów: Dexie.js -> Axios REST API.

### Etap 2.2: Market i Transakcje (Escrow)
- [ ] Widok Giełdy: Publiczna tablica ofert wystawionych paragonów.
- [ ] Logika wirtualnego portfela punktowego (1 pkt = 1 zł).
- [ ] Implementacja mechanizmu Escrow (mrożenie punktów kupującego do momentu potwierdzenia działania kodu).
- [ ] Moduł wycofywania ofert z Marketu (powrót do prywatnego portfela).

### Etap 2.3: Zaufanie i Reputacja
- [ ] Obliczanie % udanych transakcji dla anonimowych ID.
- [ ] System zgłaszania fraudów.
- [ ] Algorytmy karzące / automatyczne bany.