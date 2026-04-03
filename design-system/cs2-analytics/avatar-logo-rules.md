# Avatar- og Logoregler (CS2 Analytics)

Dette dokumentet bygger på prinsippene i `frontend-design.md`: tydelig visuell hierarki, konsekvent komponentbruk, og funksjonell estetikk.

## 1) Kjerneprinsipper

- Identitet først: lag- og spilleridentitet skal være synlig der brukeren tar beslutninger.
- Konsekvens foran variasjon: samme tone/size/fallback uansett side.
- Diskret visuelt språk: identitetsikoner skal støtte data, ikke konkurrere med data.

## 2) Komponentstandard

- Bruk alltid felles komponenter:
  - `TeamLogo` for lag
  - `PlayerAvatar` for spillere
- Ikke bruk lokale engangsløsninger for fallback eller proxying.
- Bildelasting skal gå via BL-proxy (`/api/bl-image`) for stabile CSP/CORS-betingelser.

## 3) Størrelser og form

- Logo:
  - `sm` i tabeller/lister/kampoverskrifter
  - `md` i seksjonsoverskrifter/team-kort
  - `lg` kun for fremtidige hero-varianter
- Avatar:
  - `xs` i lister/tabeller/rader
  - `sm` i kompakte spillerkort
  - `md` kun i dedikerte profilvisninger
- Form: alltid rund (`rounded-full`) med diskret border.

## 4) Tonebruk

- `home`: accent-toner for hjemmelag/hjemmespillere.
- `away`: accent2-toner for bortelag/bortespillere.
- `neutral`: nøytral tone i generiske tabeller eller ukjent kontekst.

## 5) Fallback-regler

- Hvis bilde mangler eller feiler:
  - vis initialer med korrekt tone.
- Fallback skal være informativ, ikke dekorativ.
- Ingen tomme bildeflater eller ødelagte bildeikoner i UI.

## 6) Plassering (hvor identitet alltid skal vises)

- Match-visning:
  - matchup-header
  - prediksjonskort (lag + nøkkelspillere)
  - team-kort og spiller-rader
  - post-analysis spillerlister
  - lineup-simulator
- Home:
  - kampkort i "Ikke spilt ennå" og "Ferdigspilt"
  - søkeforslag
- Divisjon:
  - tabelloversikt
  - kamp-lister (mobil + desktop)

## 7) Implementasjonsplan (hele appen)

1. Datagrunnlag
- Les laglogo og spilleravatar fra BL metadata.
- Normaliser URL-er med `normalizeBlImageUrl`.
- Eksponer felter i typer og API-responser.

2. Presentasjonslag
- Erstatt lokale bilde/fallback-løsninger med `TeamLogo`/`PlayerAvatar`.
- Innfør tone og størrelse via tokens og props.

3. Sideutrulling
- Match-side først (høyest informasjonsverdi).
- Home og divisjon etterpå for navigasjonskonsistens.
- Sekundære komponenter (prediksjon, sammenligning, lineup) sist.

4. QA
- Verifiser fallback når `logo_url/avatar_url` mangler.
- Verifiser mobil/desktop for alle lister.
- Kjør `next build` med strict typing.

## 8) Ikke-mål for denne iterasjonen

- Ingen nye diagrambibliotek eller tunge animasjonsrammeverk.
- Ingen endringer i backend-kontrakt utover allerede tilgjengelige felt.
