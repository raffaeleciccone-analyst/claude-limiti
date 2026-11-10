# Come funziona claude-limiti

Una spiegazione senza gergo, dal dato che arriva a quello che vedi.

## 1. Da dove arrivano i numeri

Claude Code, ogni volta che aggiorna la barra in basso (a ogni messaggio e comunque ogni 60
secondi), lancia il nostro script `statusline.mjs` e gli passa un pacchetto di dati in formato
JSON. Dentro ci sono, tra le altre cose:

- `rate_limits`: per la finestra di 5 ore e per quella settimanale, la **percentuale usata** e
  l'**ora del reset**;
- `session_id`: un codice che identifica la sessione (ogni finestra di Claude Code aperta ne ha uno);
- `cost.total_api_duration_ms`: quanti millisecondi, in totale, la sessione ha passato ad
  aspettare risposte dal modello. **Cresce solo quando arriva una risposta nuova.**

Lo script non si collega a niente: usa solo questi dati.

## 2. Il problema delle sessioni multiple (il bug del 17%)

Se hai due finestre di Claude Code aperte, entrambe lanciano lo script e scrivono nello stesso
file di stato. Il guaio: a una sessione **ferma** Claude Code continua a passare **l'ultimo dato
che quella sessione ha ricevuto**, anche se è vecchio di ore.

Caso reale: una sessione ferma da ore ripeteva "17%", quella attiva diceva "69%". La barra
mostrava 17%, cioè il dato sbagliato.

**La regola che risolve:** un valore conta solo se è **fresco**, oppure se non c'è niente di meglio.

- **Fresco** = il `total_api_duration_ms` di quella sessione è cresciuto dall'ultima volta che
  l'abbiamo vista → ha appena ricevuto una risposta → i suoi limiti sono aggiornati.
- **Niente di meglio** = nel file non c'è un valore valido (vuoto, o finestra già azzerata).
- Una sessione vista per la prima volta non è ancora "fresca": aspetta la sua risposta successiva.

Così il dato ripetuto da una sessione ferma viene ignorato, e un calo vero (per esempio dopo un
passaggio da Pro a Max) si vede subito, perché arriva come dato fresco.

È un problema di **qualità del dato**: due fonti dicono cose diverse e bisogna sapere quale è
più recente, non quale è più grande.

## 3. Salvare senza rovinare il file

Claude Code può interrompere lo script a metà (per esempio se arriva un nuovo aggiornamento).
Se succede mentre scrive il file, il file resterebbe tagliato e illeggibile.

Per questo lo script scrive prima un **file temporaneo** e poi lo **rinomina** al posto di quello
vero: la rinomina è istantanea, quindi il file è sempre o il vecchio intero o il nuovo intero.
Prima di salvare rilegge anche quello che le altre sessioni hanno scritto nel frattempo e lo unisce.

## 4. Notifiche una volta sola

Con più sessioni aperte, ognuna vedrebbe "sei all'80%" e manderebbe la sua notifica. Per evitarlo,
ogni avviso "prenota" un piccolo file vuoto con un nome preciso (es. `five_hour-…-80`), creato in
un modo che il sistema operativo garantisce **riuscire a una sola sessione**. Solo chi riesce a
crearlo manda la notifica.

## 5. Previsione e ritmo

- **Ritmo:** confronta la percentuale usata con il tempo passato nella finestra. Se è passato il
  50% del tempo e hai usato il 70%, stai consumando in fretta.
- **Previsione 5 ore:** guarda quanto è salito l'uso nell'ultima ora e prolunga la linea. Se
  arriva al 100% prima del reset, ti dice a che ora.
- **Previsione settimanale:** usa la media dall'inizio della settimana, perché prolungare un'ora
  intensa su sette giorni (notti comprese) darebbe numeri assurdi.

Sono stime semplici: dicono la direzione, non l'ora esatta.

## 6. Perché niente emoji

Alcuni simboli (come ⚠) non sono nel font del terminale: il terminale li disegna come emoji
larghe due colonne ma ne conta una, e finiscono sopra la lettera dopo. La barra usa solo simboli
larghi una colonna e presenti nei font da terminale; un test controlla che non ne entrino altri.

## 7. Come si verifica che funzioni

- **Test automatici** (`node test/test.mjs`): oltre 200 controlli, compresi casi ostili (dati
  rotti, file corrotti, terminale stretto, più sessioni). Girano su Windows, macOS e Linux a ogni
  modifica pubblicata.
- **Il limite dei test:** verificano che il codice faccia quello che pensiamo faccia Claude Code.
  Alcune cose però Claude Code non le documenta (per esempio che i reset cadono allo scoccare
  dell'ora, o che il tempo API cresce solo con risposte nuove).
- **Il registro di diagnostica** serve proprio a questo: acceso con `diagnostics true`, salva ogni
  lettura sul PC; dopo qualche giorno `report.mjs diagnosi` dice se quelle ipotesi reggono con i
  dati veri.
