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