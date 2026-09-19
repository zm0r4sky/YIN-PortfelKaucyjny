Jesteś Expert PWA Full-Stack Developerem. Twoim zadaniem jest stworzenie architektury i kodu dla aplikacji mobilnej PWA (Progressive Web App) do zarządzania kodami rabatowymi z recyklomatów (kaucja za butelki). Aplikacja będzie wdrażana w dwóch fazach. Rozpoczynamy od Fazy 1.

NAZWA PROJEKTU: Portfel Kaucyjny
KOD PROJEKTU: YIN-PortfelKaucyjny
AUTOR: MARIUSZ OPACH
LICENCJA: CPL

TECHNOLOGIE:
- Frontend: Vue 3 (Composition API) lub React (Hooks), zbudowane przez Vite z pluginem vite-plugin-pwa.
- Baza danych (Faza 1): Dexie.js (IndexedDB) do przechowywania danych lokalnie na urządzeniu.
- Skaner kodów: html5-qrcode lub @zxing/browser (optymalizacja pod format Code 128 z kamery telefonu).
- OCR (Opcjonalnie dla Fazy 1): Tesseract.js do czytania tekstu z paragonów (sklep, kwota, data).

KONTEKST BIZNESOWY I WYMAGANIA:
Aplikacja ma dwie fazy. Projektując kod w Fazie 1, zostaw "furtki" (interfejsy i serwisy) do łatwego podpięcia backendu w Fazie 2.

FAZA 1 (OFFLINE PWA, Hostowane na GitHub Pages):
1. Skaner: Fundamentalny MUST HAVE. Musi używać tylnej kamery, odczytywać kody kreskowe w formacie Code 128. Należy zaimplementować ograniczony obszar skanowania (scan area), aby odciążyć CPU telefonu.
2. Zapis: Użytkownik skanuje kod, opcjonalnie Tesseract.js podpowiada kwotę, datę ważności i sklep (korzystając z regexów i listy słów kluczowych jak Biedronka, Lidl). Użytkownik może edytować te dane przed zapisem.
3. Portfel: Lista zapisanych paragonów, pogrupowana po sklepach.
4. UI/UX: Wyraźne alerty (czerwone oznaczenia) dla paragonów, których termin ważności kończy się za mniej niż 3 dni. Możliwość ręcznego oznaczenia paragonu jako "wykorzystany" (przejście do historii/archiwum).

FAZA 2 (BACKEND, MARKETPLACE - Miej to na uwadze w architekturze):
1. Użytkownicy: CAŁKOWICIE ANONIMOWI (np. generowany hash lub losowa nazwa z kluczem odzyskiwania zapisanym w IndexedDB).
2. Market: Użytkownik może wystawić swój paragon za X punktów (1 pkt = 1 zł). Paragon widnieje na markecie aż do ostatniego dnia swojej ważności.
3. Wycofywanie: Użytkownik może w każdej chwili wycofać ofertę z marketu, jeśli nie została jeszcze kupiona.
4. Escrow (Mrożenie): Kiedy Użytkownik B kupuje paragon od Użytkownika A, punkty Użytkownika B są mrożone. Użytkownik A otrzymuje je dopiero po potwierdzeniu przez B, że paragon zadziałał, lub po upływie zdefiniowanego czasu.
5. Reputacja: Profil wyświetla tylko % udanych, potwierdzonych transakcji.
6. Kary: Moduł zgłaszania oszustw (fraud). Przy niskim % sukcesów lub wykryciu fraudu - automatyczne zawieszenie lub ban konta.
7. Feature na przyszłość (nie implementuj, ale przygotuj bazę danych): Mechanizm holenderskiej aukcji, gdzie wartość wystawionego paragonu spada o 1% każdego dnia.

ZADANIE DLA CIEBIE NA TERAZ:
1. Skonfiguruj projekt Vite PWA.
2. Stwórz strukturę folderów i serwisów z podziałem na UI, zarządzanie stanem i warstwę dostępu do danych (Dexie.js).
3. Zaimplementuj widok skanera (html5-qrcode) zoptymalizowany pod Code 128.
4. Dostarcz kod, zachowując czystą architekturę, aby w przyszłości łatwo podmienić Dexie.js na API calls (Axios/Fetch) do backendu.