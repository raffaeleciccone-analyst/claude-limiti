# claude-limiti — SPEC (cosa e perché)

> Questo file dice COSA deve fare il programma, non COME. Il come sta in PIANO.md.
> Stato: APPROVATA il 17/11/2026 — spec retroattiva ricostruita dal progetto già fatto (v1.3.1), rivista con l'utente
> (6 domande). F14, F15 e F5 su macOS/Linux: approvate, da fare.
> Legenda: **[deciso]** = scelto dall'utente (data); **[dedotto]** = lo fa il codice, Claude l'ha scritto
> qui e l'utente deve confermarlo.

## 1. Problema
Chi usa Claude Code con un abbonamento (Pro, Max, Ultra) ha due limiti di utilizzo — una finestra
di 5 ore e una settimanale — ma Claude Code non li mostra mentre lavori. Te ne accorgi solo quando
sei bloccato. Serve vederli sempre, capire se stai consumando troppo in fretta ed essere avvisati
prima di finirli.

## 2. Uso principale
- U1. Sto lavorando in Claude Code e, senza fare niente, vedo sotto la chat quanto ho usato dei due
  limiti, quando si azzerano e se a questo ritmo li finisco prima.
- U2. Prima di iniziare un lavoro lungo chiedo `/limiti` e ho un report: storico, previsione,
  quanto posso usare al giorno fino al reset settimanale.
- U3. Mentre faccio altro (Claude Code in background o chiuso) mi arriva una notifica quando passo
  una soglia o quando il limite si azzera.
- U4. Voglio cambiare l'aspetto della barra chiedendolo a Claude in italiano ("barre più lunghe").
- U5. Uso anche Codex (OpenAI) e voglio vedere i suoi limiti nello stesso posto.

## 3. Cosa fa
- F1. **Barra dei limiti**: per 5h e settimanale mostra percentuale, ora del reset (con la data per il
  settimanale) e tempo che manca. Colore verde / giallo (dal 50%) / rosso (dall'80%).
- F2. **Ritmo e previsione**: confronta il consumato con il tempo passato nella finestra
  (margine ampio / nella media / consumi in fretta) e, se finirai prima del reset, dice quando.
- F3. **Più sessioni aperte insieme**: la barra mostra sempre il dato più recente dell'account;
  una sessione ferma con dati vecchi non può riportare indietro la barra.
- F4. **Notifiche** di sistema alle soglie (predefinite 80% e 95%) e all'azzeramento, una volta sola
  anche con più sessioni aperte.
- F5. **Notifica di azzeramento a sessioni chiuse** (facoltativa, spenta di default). Oggi solo Windows;
  macOS e Linux [deciso 17/11, da fare].
- F6. **Riga di contesto**: modello, effort, cartella, branch git, contesto usato, cache, durata e costo
  stimato della sessione.
- F7. **Report `/limiti`**: ultime 10 ore e ultima settimana, budget giornaliero, un consiglio se serve.
- F8. **Personalizzazione** a parole (tramite la skill) o da terminale: stile, larghezza, soglie,
  cosa mostrare. Nomi e valori in italiano o inglese.
- F9. **Si adatta alla larghezza** del terminale (versione compatta sotto 70 colonne).
- F10. **Lingua** italiana o inglese, scelta dalla lingua del sistema.
- F11. **Codex (sperimentale)**: legge i limiti di Codex e li mostra in una riga in più della barra
  e nel report; skill da usare dentro Codex ("quanto mi resta?").
- F12. **Installazione con un comando**, anche su un PC senza Node.js; disinstallazione che rimette
  tutto com'era (anche la status line precedente).
- F13. **Diagnosi**: registro facoltativo delle letture e comando che dice OK / DA GUARDARE sulle
  ipotesi del programma, verificate sui dati veri.
- F14. **Barra dentro Codex** [deciso 17/11, si fa quando Codex la rende disponibile in una versione
  stabile]: dentro Codex la stessa barra di Claude Code (percentuali, reset, ritmo, previsione, colori),
  con i limiti di Codex.
- F15. **Mod di Claude Code "usage-limits"** [deciso 17/11, come aggiunta]: avvisi dentro Claude Code
  (messaggio a comparsa nella finestra) quando passi una soglia o il limite si azzera. Non sostituisce la
  barra: la barra resta la status line (un mod non può sostituirla). Si installa con `/plugin install`.
  Nel pannello grafico di VS Code (dove la status line non c'è) il mod è l'unico modo di vedere i limiti:
  riga di stato con i limiti + riquadro + avvisi. [verificato 17/11]

## 3b. Da dove arrivano i dati
- D1. Claude Code passa alla status line, dopo ogni risposta, i limiti dell'account (percentuale e ora
  del reset per 5h e 7g), l'id della sessione e il tempo API totale della sessione. (confermato, non
  documentato da Anthropic)
- D2. I limiti sono **dell'account**: includono l'uso da altri PC. Questo PC li vede aggiornati solo
  quando riceve una risposta qui. (confermato 17/11)
- D3. Codex scrive i suoi limiti nei file delle sessioni in `~/.codex/sessions`; le finestre dipendono
  dal piano (Free = una sola da 30 giorni). (confermato 10/11)

## 4. Cosa NON fa
- Nessuna connessione di rete dalla barra; nessun dato mandato fuori dal PC. [deciso 17/11]
- Non funziona con chiave API o provider cloud: lì Claude Code non fornisce i limiti, e la barra lo dice. [deciso 17/11]
- Non disegna la barra nel pannello grafico di VS Code (Claude Code non lo permette). [verificato 10/11]
- Oggi non disegna la barra **dentro** Codex: Codex non lo permette ancora in una versione stabile (vedi F14). [verificato 17/11]
- Non sovrascrive una status line che l'utente aveva già, a meno che lo chieda (`--forza`). [deciso 17/11]
- Chi non usa Codex non vede niente di Codex: riga solo se usato nelle ultime 24 ore, nel report solo
  negli ultimi 7 giorni, skill per Codex solo con `--codex`. [deciso 10/11]
- Niente emoji nella barra (larghe due colonne, si sovrappongono al testo). [deciso 10/11]
- Non si vende: gratis su GitHub e su Agensi. [deciso 10/11]

## 5. Criteri di controllo
Ogni criterio è (o diventa) un test automatico in `test/test.mjs`. "Finito" = tutti passano.

**Barra (F1, F9)**
- C1 (F1). Arriva 5h al 42% con reset tra 2 ore → la barra mostra `42%`, l'ora del reset e "2h".
- C2 (F1). 5h al 55% → barra gialla; all'85% → rossa; al 30% → verde. (La percentuale scritta ha invece una sfumatura continua.)
- C3 (F1). Nessun dato sui limiti (prima risposta non ancora arrivata) → "limiti: in attesa della prima risposta".
- C4 (F1). Dati da chiave API (nessun limite) → "limiti non disponibili: servono Pro, Max o Ultra".
- C5 (F1). Il reset è già passato → la riga dice "azzerato · riparte alla prossima richiesta", non la percentuale vecchia.
- C6 (F9). Terminale di 60 colonne → tutte le barre su una riga, nessuna riga più larga del terminale.

**Ritmo e previsione (F2)**
- C7 (F2). A metà finestra 5h con il 20% usato → "margine ampio"; con l'80% → "consumi in fretta" e l'ora in cui finirai.

**Più sessioni (F3)**
- C8 (F3). Sessione A ferma al 17%, sessione B lavora e arriva al 67% → la barra resta al 67% anche quando A si aggiorna.
- C9 (F3). Sessione vista per la prima volta con valori vecchi più alti → non alza la barra.
- C10 (F3). Cambio piano: una risposta nuova con valori più bassi → mostrati subito.
- C11 (F3). Limite raggiunto: 99% → 100% senza tempo API nuovo (richiesta rifiutata) → la barra mostra 100% subito. *(bug trovato dalla diagnosi, corretto in v1.3.1)*

**Notifiche (F4, F5)**
- C12 (F4). Passo l'80% con due sessioni aperte → una sola notifica.
- C13 (F4). Il limite si azzera con una finestra aperta → notifica "azzerato" una volta sola.
- C14 (F4). `notifiche no` → nessuna notifica.
- C15 (F5). Con l'opzione accesa e il limite oltre la soglia → viene programmata un'attività all'ora del reset; con l'opzione spenta → niente.

- C33 (F5, da fare). Su macOS con l'opzione accesa e il limite oltre la soglia → viene programmato un avviso
  all'ora del reset che parte anche a Claude Code chiuso, e poi si cancella da solo; su Linux idem.
- C34 (F5, da fare). Su Linux senza il programmatore di sistema (systemd) → nessun errore, la barra
  continua a funzionare e l'opzione dice che lì non è disponibile.
- C35 (F5). Spengo l'opzione o disinstallo → gli avvisi programmati e non ancora partiti vengono cancellati.

**Personalizzazione e lingua (F8, F10)**
- C16 (F8). `stile blocchi` oppure `style blocks` → stesso risultato; valore sbagliato → messaggio d'errore, impostazioni invariate.
- C17 (F10). Sistema in italiano anche con `LANG=en_US` (terminale di VS Code su Windows) → testi in italiano.

**Codex (F11)**
- C18 (F11). Codex usato 2 ore fa → riga "Codex" con le sue percentuali; usato 2 giorni fa → nessuna riga.
- C19 (F11). Piano Free con una finestra da 30 giorni → mostrata come finestra da 30 giorni, non come 5h.
- C20 (F11). Dei file di Codex si leggono solo le righe dei limiti, mai i messaggi.

**Barra dentro Codex (F14)** — test da scrivere quando si inizia F14
- C25 (F14). Codex passa 5h al 42% con reset tra 2 ore → dentro Codex la barra mostra `42%`, l'ora del reset e "2h", come C1.
- C26 (F14). Piano Free con una finestra da 30 giorni → una sola barra "30g", non "5h".
- C27 (F14). Il programma della barra non risponde o va in errore → Codex continua a funzionare (al massimo mostra "Status line failed").
- C28 (F14). Chi non attiva la barra in Codex non vede nessuna differenza (coerente con la regola "chi non usa Codex non vede niente").

**Mod usage-limits (F15)** — test da scrivere quando si inizia F15
- C29 (F15). Passo l'80% → dentro Claude Code compare un avviso "Limite 5 ore all'80%", una volta sola anche con due finestre aperte.
- C30 (F15). Il limite si azzera mentre Claude Code è aperto → avviso "Limite 5 ore azzerato", una volta sola.
- C32 (F15, F4). Nel terminale, mod e status line installati, passo l'80% → arrivano la notifica di Windows E l'avviso
  dentro Claude Code, ciascuno una volta sola (non due notifiche di Windows).
- C36 (F15). Pannello grafico di VS Code (dove la barra non c'è), passo l'80% → avviso dentro il pannello e
  riga di stato con i limiti; nessun errore se la notifica di Windows non è disponibile lì. [verificato fattibile 17/11]
- C31 (F15). Installo il mod senza la status line (o il contrario) → ognuno funziona da solo, nessun errore.

**Installazione (F12)**
- C21 (F12). Installo su un PC con un'altra status line → si ferma e non la tocca; con `--forza` la sostituisce; con `--rimuovi` la rimette.
- C22 (F12). Le altre impostazioni di `settings.json` restano invariate dopo installazione e rimozione.

**Diagnosi (F13)**
- C23 (F13). Registro con un reset alle 14:20 → non è un allarme; un reset che si sposta nella stessa finestra → DA GUARDARE.

**Sicurezza**
- C24. Un nome di cartella o di branch con caratteri di controllo (es. codici colore) → stampato ripulito.

## 6. Vincoli
- Gira dentro Claude Code come status line (un programma chiamato a ogni risposta e ogni 60 s): deve
  essere veloce e non bloccare mai la chat.
- Windows, macOS, Linux; Node.js 18 o successivo (scaricato privatamente se manca).
- Nessuna dipendenza esterna (niente `npm install`).
- Pubblico su GitHub, licenza MIT; commit senza attribuzione a Claude.

## 7. Domande aperte
- ~~Q1. Barra dentro Codex~~ → RISOLTA 17/11: sì, stessa barra di Claude Code (F14, C25–C28).
  Resta da sapere QUANDO: aspettiamo una versione stabile di Codex che la contenga.
- ~~Q2. Mod "usage-limits"~~ → RISOLTA 17/11: sì, come aggiunta per gli avvisi dentro Claude Code (F15, C29–C31).
- ~~Q5. Doppio avviso col mod~~ → RISOLTA 17/11: tutti e due (Windows serve se sei su un'altra finestra,
  l'avviso interno se guardi Claude Code). Vedi C32.
- ~~Q6. Il mod si vede nel pannello di VS Code?~~ → RISOLTA 17/11 con prova reale (mod di prova, Claude Code 2.1.326):
  SÌ. Nel pannello grafico di VS Code il mod riceve i limiti e mostra avviso a comparsa, riga di stato e
  riquadro. È il vantaggio principale del mod: lì la status line non c'è. La notifica di Windows dal mod
  invece NON parte in VS Code (`no-surface`). Vedi C36.
- ~~Q3. Notifica a sessioni chiuse su macOS e Linux~~ → RISOLTA 17/11: sì (F5, C33–C35).
- ~~Q4. Prova su Mac/Linux veri~~ → RISOLTA 17/11 a metà: Linux si prova in una macchina Linux nel PC
  dell'utente (Docker Desktop, già installato: va acceso). Il Mac resta NON provato: nel README resta scritto.
