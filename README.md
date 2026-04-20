# Sanatreeni

Mobiiliystavallinen PWA, jolla lapsi voi harjoitella sanakokeisiin.

Ensivaiheessa tuettu:
- englanti ja saksa
- suomi -> vieras kieli
- vieras kieli -> suomi
- monivalinta
- puuttuva sana
- sanojen lisays kasin ja massana
- kuvasta tunnistus ja tarkistus ennen tallennusta (OpenAI API)

## Kehityskaytto

1. Asenna riippuvuudet:

```bash
npm install
```

2. Luo ymparistomuuttujatiedosto:

```bash
cp .env.example .env.local
```

3. Lisaa OpenAI-avain tiedostoon `.env.local`:

```bash
OPENAI_API_KEY=your_api_key_here
```

4. Kaynnista dev-palvelin:

```bash
npm run dev
```

5. Avaa selaimessa:

```text
http://localhost:3000
```

## Kuvasta sanalistaksi

Kuvatuonti toimii palvelinpuolella API-reitin kautta:
- POST `/api/import-words`
- input: `image` (tiedosto), `targetLanguage` (`en` tai `de`)
- output: `{ words: [{ fi, target }] }`

Kayttovirta:
1. Valitse kuva oppikirjan sivusta
2. API tunnistaa ehdotetut sanaparit
3. Tarkista ja korjaa rivit selaimessa
4. Tallenna vasta sen jalkeen sanalistaan

Jos avain puuttuu, API palauttaa ohjeviestin eika yrita OCR-kasittelya.

## Seuraavat askeleet

- vahvistusnakyma OCR-tuloksille ennen tallennusta
- spaced repetition -pisteytys
- listojen jakaminen per kirjajakso
