# Mobile Workspace

Private workspace for mobile Claude Code sessions.

## FutureTalk — trening komunikacji

`index.html` to samodzielna aplikacja webowa (bez zależności, działa offline):
15-lekcyjny kurs charyzmy, retoryki i small talku oparty na badaniach
(Arystoteles, Cialdini, Gottman, Voss, Rosenberg i in.).

Interfejs w stylu aplikacji do nauki języków (Duolingo/Brilliant):

- **Ścieżka lekcji** — 15 lekcji jako ikony na pionowej ścieżce, ze stanem
  ukończenia i wznowieniem w miejscu przerwania
- **Odtwarzacz lekcji** — pełnoekranowy, krótkie plansze (1–3 zdania),
  pasek postępu, przycisk „Dalej"; pytania wplecione między plansze
  z natychmiastowym feedbackiem (wybierz → Sprawdź → wyjaśnienie)
- **Ćwiczenie + notatka** — każda lekcja kończy się ćwiczeniem na dziś
  z opcjonalną notatką do dziennika i złotą zasadą
- **Fiszki** — powtórka złotych zasad i technik (PREP, SBI, ARE, looping…)
- **Dziennik treningu** — chronologiczne notatki z ćwiczeń
- **Postęp** — procent ukończenia, seria dni (🔥), status każdej lekcji
- Postęp zapisywany lokalnie w przeglądarce (localStorage), tryb jasny i ciemny

Uruchomienie: otwórz `index.html` w przeglądarce.

### Wdrożenie

Docelowy adres: `https://futureshow.pl/futuretalk/`. Aplikacja to jeden plik
bez zależności, więc wystarczy wgrać na hosting dwa pliki:

| Plik | Miejsce docelowe |
|---|---|
| `index.html` | `/futuretalk/index.html` |
| `og-futuretalk.png` | `/futuretalk/og-futuretalk.png` |

Adres jest zapisany w tagach `canonical`, `og:url` i `og:image` w `index.html`
— przy zmianie ścieżki lub przeniesieniu na subdomenę trzeba je poprawić,
inaczej podgląd linku w mediach społecznościowych pokaże zły obrazek.

`og-futuretalk.png` (1200×630) to grafika podglądu linku; jej źródło leży
w `tools/og-card.html` i renderuje się zrzutem ekranu w przeglądarce.

### Treści o studiu

Wszystko, co aplikacja mówi o FutureShow, siedzi w jednym obiekcie `STUDIO`
na początku skryptu w `index.html`:

- `pitch` — jedno–dwa zdania o studiu na kafelku pod ścieżką lekcji.
  Puste = kafelek pokazuje samą nazwę i link, bez żadnych obietnic.
- `finishHead`, `finishText` — nagłówek i tekst zaproszenia na ekranie
  po ukończeniu **całego** kursu (nie po pojedynczej lekcji)
- `sister` — druga aplikacja studia; `url: ''` ukrywa cały kafelek

`tools/make-artifact.mjs` generuje wersję dla Artifactu z `index.html`
(`index.html` jest źródłem, nie na odwrót).
