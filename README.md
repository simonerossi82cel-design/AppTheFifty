# Note & Interviste

Applicazione per raccogliere gli appunti durante l'osservazione di un reality e trasformarli,
per ogni giornata, nella scaletta di domande da fare a ciascun concorrente.

Funziona nel browser del telefono e del PC, **senza account e senza server**: gli appunti
restano sul dispositivo su cui li scrivi.

---

## Come metterla online (una volta sola)

L'app è un sito statico. Il modo più semplice per averla sia sul telefono sia sul PC è
pubblicarla con GitHub Pages:

1. Su GitHub apri il repository → **Settings** → **Pages**.
2. Alla voce *Source* scegli **Deploy from a branch**.
3. Seleziona il branch che contiene questi file e la cartella `/ (root)`, poi **Save**.
4. Dopo un minuto la pagina mostra l'indirizzo, del tipo
   `https://<nome-utente>.github.io/AppTheFifty/`.

Quell'indirizzo è l'app. Aprilo dal telefono e dal computer.

> **Perché online e non un file da aprire in locale?** I browser conservano in modo affidabile
> i dati salvati da un indirizzo `https`, mentre quelli di un file aperto localmente sul
> telefono vengono cancellati con molta facilità. Sul server c'è **solo il programma**:
> le note non lasciano mai il tuo dispositivo.

### Installarla sulla schermata home (consigliato)

- **Android / Chrome**: apri l'indirizzo → menù ⋮ → *Aggiungi a schermata Home*.
- **iPhone / Safari**: apri l'indirizzo → Condividi → *Aggiungi alla schermata Home*.

Si comporta come un'app: schermo intero, avvio immediato e **funziona anche senza
connessione** (dopo la prima apertura i file restano in memoria).

---

## Come si usa

### 1. Setup (da fare prima di iniziare)

- **Concorrenti**: inserisci i nomi. Per ognuno viene creato un *tag*, cioè la parola da
  scrivere dopo la `@`. L'interruttore disattiva un concorrente senza cancellarne lo storico
  (utile per chi esce). Il pulsante ✕ lo elimina davvero.
  Se rinomini un concorrente, il tag viene aggiornato **anche dentro le note già scritte**.
- **Domande standard**: ogni giorno ha il suo elenco. Il menù *Copia le domande da…* riporta
  in un giorno le domande di un altro, così non le riscrivi otto volte.
- **Numero di giorni**: otto di base, modificabile.

### 2. Giorni — prendere appunti

Scegli la giornata e scrivi. Digitando `@` compare l'elenco dei concorrenti: filtra
scrivendo, scegli con le frecce e Invio, oppure tocca il nome. Da PC, `Ctrl+Invio`
aggiunge la nota.

- Una nota può citare **più concorrenti**: comparirà nella pagina di ciascuno di loro,
  con una spunta indipendente per ognuno.
- Una nota che non cita nessuno finisce nella sezione **Generali** del giorno.
- La ricerca funziona sul giorno corrente o su tutti gli otto.

### 3. Concorrenti — condurre l'intervista

Apri il concorrente e scegli il giorno: trovi le domande standard di quella giornata e tutte
le note che lo riguardano. Tocca una riga per spuntarla man mano che affronti l'argomento;
la barra in alto mostra quanto manca. Le frecce `‹ ›` passano al concorrente precedente o
successivo, *Solo da fare* nasconde ciò che hai già chiesto.

### 4. Importa — messaggi copiati da una chat

Incolla i messaggi (formato WhatsApp Android e iPhone, oppure testo qualsiasi).
L'app li riporta **parola per parola, senza interpretarli**: riconosce data, ora, autore e i
nomi dei concorrenti citati, e crea una nota per messaggio. Prima di confermare vedi
l'anteprima e puoi escludere ciò che non serve.

Le note importate restano marcate **“da rivedere”** finché non le modifichi.

L'interruttore *Considera anche il nome di chi scrive* va tenuto spento se in chat scrivono i
colleghi di produzione: evita che l'autore del messaggio venga scambiato per un concorrente.

### 5. Esporta — file ODT

Scegli concorrente, giorno e cosa includere, poi scarica il `.odt`. Si apre con LibreOffice,
OpenOffice, Word e Google Documenti; le spunte compaiono come ☑ e ☐. Puoi esportare un
singolo concorrente (una giornata o tutte), una giornata intera o l'intero lavoro.

---

## I dati e i backup — da leggere

Le note stanno **solo nella memoria del browser del dispositivo che stai usando**. Non
passano da internet, nessuno può leggerle da remoto, ma di conseguenza:

- se cancelli i dati di navigazione del browser, **le note spariscono**;
- telefono e PC hanno archivi separati e **non si sincronizzano da soli**.

Per questo, nel Setup:

- **Scarica backup** salva tutto in un file `.json`. Fallo a fine giornata. È anche il modo
  per portare il lavoro dal telefono al PC (e viceversa): scarichi da uno, carichi sull'altro.
- **Carica backup** chiede se *sostituire* tutto o *unire* i due archivi. Per spostare il
  lavoro fra dispositivi scegli **unisci**.
- L'app tiene anche **copie automatiche** sul dispositivo, una al giorno, le ultime otto.
  Sono un paracadute, non un backup: vivono nello stesso browser.

Un avviso giallo compare quando è passato più di un giorno dall'ultimo backup.

---

## Quello che l'app non fa

- Non **capisce** i contenuti: sui testi importati riconosce i nomi dei concorrenti, non il
  senso di quello che è scritto. Un nome comune (per esempio "gioia") può quindi essere
  scambiato per un concorrente: l'anteprima dell'importazione serve proprio a controllarlo.
- Non sincronizza fra dispositivi da sola: si usa il file di backup.
- Non legge messaggi vocali, immagini o screenshot.

---

## File del progetto

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina |
| `app.css` | aspetto grafico |
| `app.js` | tutta la logica: note, spunte, importazione, esportazione ODT, backup |
| `sw.js` | funzionamento senza connessione |
| `manifest.webmanifest`, `icon-*.png` | installazione sulla schermata home |

Nessuna libreria esterna: anche il file ODT viene costruito dall'app stessa.
