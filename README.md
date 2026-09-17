# Galleria Almanacco della Sardegna

Applicazione statica per consultare i numeri dell’Almanacco della Sardegna, filtrare il catalogo per decennio e aprire una scheda fronte-retro con copertina, indice e collegamento al PDF.

I dati principali vengono letti dal CSV pubblico di Google Drive configurato in `assets/config.js`. Gli indici dettagliati sono uniti al catalogo JSON generato dal file Excel.

## Pubblicazione su GitHub Pages

1. Crea un nuovo repository GitHub e carica l’intero contenuto di questa cartella nella radice.
2. Apri **Settings → Pages** e scegli **GitHub Actions** come sorgente.
3. Esegui un commit sul ramo `main`. Il flusso `Pubblica la galleria su GitHub Pages` genera il catalogo, sincronizza il CSV pubblico e pubblica il sito.
4. Il sito sarà disponibile all’indirizzo `https://NOME-UTENTE.github.io/NOME-REPOSITORY/`.

Il flusso usa le azioni ufficiali previste per GitHub Pages, richiede i permessi `pages: write` e `id-token: write` e viene eseguito anche ogni ora per aggiornare la copia del CSV.

## Sorgente Google Drive

Il collegamento è configurato in `assets/config.js`:

```text
https://docs.google.com/spreadsheets/d/e/2PACX-1vTVCyWIc4k5EzJWDY7qYKxP0xkYfrbbUVsg65Av05ZXnqFCbyNrSMEeIcTBpbkyDr1T2mJwgQQVukeF/pub?output=csv
```

All’apertura, l’app prova a leggere direttamente questo CSV. Se il browser non riesce a raggiungerlo, usa `data/numeri.csv`, aggiornato automaticamente dal workflow GitHub ogni ora. Se anche la copia non è disponibile, utilizza il catalogo JSON incluso.

Il CSV deve contenere una riga con l’intestazione `ID numero` e le stesse colonne della scheda `Numeri`. Possono essere presenti righe introduttive sopra l’intestazione: l’app le riconosce e le ignora.

## Aggiornamento dei dati

Il file sorgente si trova in `source/Archivio_Almanacco_Sardegna_WordPress.xlsx`.

1. Compila nel foglio Google le colonne `URL download numero` e `URL immagine copertina`.
2. Le modifiche diventano disponibili direttamente dal CSV pubblico; la copia ospitata su GitHub viene aggiornata entro un’ora.
3. Quando cambiano gli indici annuali, sostituisci anche il file Excel nella cartella `source` e crea un commit.

Per generare i dati localmente:

```bash
python -m pip install -r requirements.txt
python scripts/export_xlsx.py
python -m http.server 8080
```

Apri `http://localhost:8080`. Il progetto deve essere servito via HTTP; l’apertura diretta di `index.html` può impedire il caricamento del JSON.

## Incorporamento in WordPress

Apri `embed-wordpress.html`, sostituisci `NOME-UTENTE` e `NOME-REPOSITORY`, quindi incolla il contenuto in un blocco **HTML personalizzato** di WordPress. Lo script incluso adegua automaticamente l’altezza dell’iframe.

Se WordPress rimuove il tag `script`, usa soltanto l’iframe e assegna un’altezza fissa, per esempio `1200px`, oppure autorizza lo script attraverso il tema o un plugin per gli snippet.

## Struttura

- `index.html`: interfaccia della galleria.
- `assets/styles.css`: impaginazione responsive e grafica.
- `assets/config.js`: collegamento al CSV pubblico.
- `assets/app.js`: filtri, ricerca, popup e collegamenti PDF.
- `data/almanacco.json`: catalogo generato dal foglio Excel.
- `data/numeri.csv`: copia di sicurezza del CSV pubblico.
- `scripts/export_xlsx.py`: convertitore Excel → JSON.
- `.github/workflows/deploy-pages.yml`: pubblicazione automatica.
- `embed-wordpress.html`: codice pronto per WordPress.

## Comportamento degli URL mancanti

Quando l’immagine non è disponibile, l’app genera una copertina tipografica coerente con il decennio. Quando manca il PDF, il pulsante resta disabilitato e comunica che il documento non è ancora disponibile. Non appena gli URL vengono aggiunti al foglio, la pubblicazione successiva li attiva automaticamente.
