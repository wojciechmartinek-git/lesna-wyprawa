# Leśna Wyprawa

Gra planszowa 2D zbudowana w Angularze. Plansza jest widziana z góry, jak tradycyjna gra leżąca na stole.

## Uruchomienie

Lokalnie na Windows:

```bash
npm start
```

Adres w przeglądarce:

```text
http://localhost:4200
```

Na Ubuntu w maszynie wirtualnej:

```bash
npm start -- --host 0.0.0.0
```

Adres z komputera hosta:

```text
http://10.40.30.164:4200
```

## Assety

Własne assety SVG znajdują się w `public/assets/`:

- `pionek.svg` - fizyczny pionek gracza,
- `card-back.svg` - rewers stosu kart zdarzeń,
- `token.svg` - żeton leśny,
- `dice.svg` - tło kostki,
- `table-bg.svg` - drewniane tło stołu.

## Dźwięki

Gra obsługuje pliki MP3 w `public/sounds/`:

- `click.mp3`
- `dice.mp3`
- `card.mp3`
- `bonus.mp3`
- `trap.mp3`
- `win.mp3`
- `forest.mp3`

Dźwięki są opcjonalne. Jeśli plik MP3 nie istnieje, jest pusty albo przeglądarka zablokuje odtwarzanie, gra łapie błąd i używa bezpiecznego fallbacku przez Web Audio API. Dzięki temu brak dźwięku nie zatrzymuje rozgrywki.
