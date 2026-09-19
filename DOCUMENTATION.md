# Dokumentacja Techniczna - YIN-PortfelKaucyjny

## Architektura Fazy 1 (Offline-First)
Projekt rozwijany jest jako PWA działające całkowicie w środowisku klienta za pomocą technologii IndexedDB (`Dexie.js`).

### Decyzje Techniczne (ADR)
1. **Framework**: Wybrano **Vue 3 z Composition API** ze względu na lekkość i wydajność w połączeniu z `Vite`.
2. **Warstwa Danych**: **Dexie.js**. Jest to wraper na IndexedDB, który z racji swojego obietnicowego podejścia (Promises) umożliwia bardzo łatwe zastąpienie callów z `Dexie` na zapytania HTTP `Axios` w Fazie 2.
3. **Biblioteka Skanera**: **html5-qrcode**. Posiada szerokie wsparcie i umożliwia nakładanie warstwy z "obszarem skanowania" redukując użycie zasobów urządzenia na poszukiwanie Code 128 tylko w wąskim kwadracie obiektywu.
4. **PWA**: Plugin `vite-plugin-pwa` z wymuszonym buforowaniem plików statycznych (`Service Worker`), co umożliwia uruchomienie bez dostępu do sieci.

## Integracja Backendu (Faza 2)
W przyszłych releasach planowane jest przeniesienie użytkowników na rozproszony Marketplace (Escrow). Należy zachować następujące zasady tworzenia komponentów w Fazie 1:
- Wszelkie metody pobierania, aktualizacji, dodawania i usuwania paragonów muszą przechodzić przez warstwę `ReceiptService` (lub podobną).
- Repozytoria nie mogą być ściśle sprzęgnięte z Vue. Komponenty Vue muszą operować na interfejsach.
- W Fazie 2, implementacja serwisów zostanie przepisana na wysyłanie żądań uwierzytelnionych do serwera REST API (na bazie wygenerowanego anonimowego hash'u w localStorage).

## Moduł Tesseract.js (OCR) - Zastrzeżenia
Analiza optyczna znaków z paragonów, z powodu wysokiego obciążenia CPU, ma być wywoływana **na żądanie użytkownika** (nie automatycznie przy każdym zeskanowanym paragonie) lub docelowo przeniesiona do Web Workerów, aby zapobiec "zawieszaniu" (block) głównego wątku UI w PWA.

*Ten dokument będzie rozwijany w miarę postępów w projekcie.*
