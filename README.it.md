# claude-limiti

**I limiti di utilizzo di Claude Code, in tempo reale, sotto la chat**: la finestra di 5 ore e
quella settimanale, quando si azzerano, se li stai consumando troppo in fretta e quando li
finirai. In più la skill `/limiti` per un report dettagliato e per personalizzare la barra
semplicemente chiedendolo a Claude.

![Anteprima della barra](docs/preview-it.svg)

*[Read in English](README.md)*

## Cosa fa

- **Barre dei limiti sempre visibili**: percentuale usata, ora del reset (con la data per il
  settimanale) e tempo che manca. La barra è verde, gialla (dal 50%) o rossa (dall'80%).
- **Ritmo**: confronta quanto hai consumato con il tempo passato nella finestra
  (`✓ margine ampio`, `● nella media`, `▲ consumi in fretta`).
- **Previsione**: se finirai il limite prima del reset, ti dice quando (5 ore: ritmo dell'ultima ora; settimanale: media dall'inizio della finestra).
- **Limite di spesa**: dietro un gateway Claude apps con limite di spesa, una terza barra lo mostra.
- **Budget giornaliero**: quanto puoi usare in media ogni giorno fino al reset settimanale.
- **Notifiche** quando superi le soglie (predefinite 80% e 95%) e quando il limite si azzera.
  Windows, macOS e Linux (`notify-send`).
- **Riga di contesto**: modello, effort, cartella, branch git, contesto usato, scadenza della cache,
  durata e costo stimato della sessione.
- **Skill `/limiti`**: report con le ultime 10 ore e l'ultima settimana, più un consiglio se serve.
- **Si adatta alla larghezza**: nei terminali stretti le righe si accorciano da sole.
- **Più sessioni insieme**: una sessione ferma non sovrascrive i dati più recenti e ogni
  notifica arriva una volta sola.
- **Italiano e inglese**, scelti in base alla lingua del sistema.
- **Anche Codex (OpenAI), sperimentale**: se usi Codex, vedi i suoi limiti in una riga in più
  della barra e nel report, e puoi chiederli direttamente a Codex. Vedi [Codex](#codex-openai).

## Requisiti

- [Claude Code](https://code.claude.com) con un abbonamento claude.ai **Pro, Max o Ultra**: solo
  in questo caso Claude Code fornisce i limiti, dopo la prima risposta di ogni sessione. Con una
  chiave API la barra dice che i limiti non sono disponibili.
- Niente da installare prima: se sul computer non c'è [Node.js](https://nodejs.org) 18 o
  successivo, l'installazione ne scarica una copia privata (vedi sotto).

Funziona in qualsiasi terminale, anche quello integrato di VS Code, su Windows, macOS e Linux.

## Installazione

Un solo comando, senza dover installare Node.js prima.

**Windows** (PowerShell):

```
irm https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.ps1 | iex
```

**macOS e Linux** (Terminale):

```
curl -fsSL https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.sh | sh
```

Poi riavvia Claude Code.

Cosa fa il comando: se il computer ha già Node.js 18 o successivo usa quello; altrimenti scarica la
versione LTS ufficiale da nodejs.org, ne controlla l'impronta SHA-256 e tiene solo l'eseguibile in
`~/.claude/limiti-runtime` (circa 100 MB, senza permessi di amministratore e senza installare nulla nel
sistema). Poi scarica l'ultima versione di claude-limiti da GitHub ed esegue `install.mjs`.
I file [install.ps1](install.ps1) e [install.sh](install.sh) sono brevi: puoi leggerli prima.

**In alternativa**, se hai già Node.js e git:

```
git clone https://github.com/raffaeleciccone-analyst/claude-limiti.git
cd claude-limiti
node install.mjs
```

Poi riavvia Claude Code.

L'installatore copia la skill in `~/.claude/skills/limiti` e attiva la status line in
`~/.claude/settings.json` (il file originale viene salvato una volta in `settings.json.bak-limiti`).
Se hai già una status line, l'installatore non la tocca e si ferma; con `node install.mjs --forza`
la sostituisce, la salva e la rimette se un giorno disinstalli.

**Aggiornare:** di nuovo lo stesso comando (oppure `git pull` e `node install.mjs`). Le tue preferenze restano.

## Personalizzazione

Basta chiederlo a Claude: *"/limiti cambia lo stile della barra"*, *"barre più lunghe"*,
*"togli il costo"*, *"avvisami al 70%"*. Oppure da terminale:

```
node ~/.claude/skills/limiti/settings.mjs                 # impostazioni attuali
node ~/.claude/skills/limiti/settings.mjs stili           # anteprima degli stili
node ~/.claude/skills/limiti/settings.mjs stile blocchi
node ~/.claude/skills/limiti/settings.mjs reset
```

Nomi e valori si possono scrivere in italiano o in inglese.

| Impostazione | Valori | Predefinito |
|---|---|---|
| `stile` (`style`) | `linea` ━━━ · `blocchi` ██░░ · `sottile` ━━── · `quadrati` ■■□□ · `pallini` ●●○○ · `rombi` ◆◆◇◇ · `ascii` ##-- | `linea` |
| `larghezza` (`width`) | da 8 a 40 caratteri | `20` |
| `spazio` (`gap`) | riga vuota tra la barra 5h e la 7g | `no` |
| `parentesi` (`brackets`) | barra tra `[ ]` | `no` |
| `compatto` (`compact`) | tutte le barre su una riga, con barre da 8 caratteri: `auto` (sotto 70 colonne) · `sempre` · `mai` | `auto` |
| `notifiche` (`notifications`) | `sì` · `no` | `sì` |
| `soglie` (`thresholds`) | percentuali a cui avvisare, es. `70,90` | `80,95` |
| `mostra_contesto` (`show_context`) | riga con modello, cartella e contesto | `sì` |
| `mostra_costo` (`show_cost`) | costo stimato della sessione | `sì` |
| `mostra_git` (`show_git`) | branch git | `sì` |
| `colori` (`colors`) | `auto` · `truecolor` · `256` · `nessuno` (spenti anche con `NO_COLOR`) | `auto` |
| `simboli` (`symbols`) | `unicode` · `ascii` (se vedi quadratini al posto dei simboli) | `unicode` |
| `lingua` (`language`) | `auto` · `it` · `en` | `auto` |
| `notifica_reset_programmata` (`scheduled_reset`) | Windows: quando un limite supera la prima soglia, un'attività di Windows una tantum mostra la notifica di azzeramento all'ora del reset anche a sessioni chiuse, poi si cancella da sola | `no` |
| `diagnostica` (`diagnostics`) | registra ogni lettura sul PC, per verificare il funzionamento (vedi sotto) | `no` |
| `mostra_codex` (`show_codex`) | riga con i limiti di Codex (OpenAI); compare solo se usi Codex | `sì` |
| `codex_compatto` (`codex_compact`) | con Codex ogni riga inizia con `Claude` o `Codex` e le colonne sono allineate; `auto`: una riga per limite, una riga sola nei terminali stretti · `sempre`: Codex tutto su una riga · `mai`: mai su una riga | `auto` |

Le modifiche si vedono dalla risposta successiva, senza riavviare. Le preferenze sono salvate in
`~/.claude/statusline-limiti.config.json`.

La barra usa solo simboli presenti nei font da terminale e larghi una colonna, mai emoji (vengono
disegnate larghe due colonne e si sovrappongono al testo), così tutto resta allineato.

## Problemi comuni

- **VS Code: niente barra nel pannello grafico.** Il pannello di Claude Code in VS Code non esegue le status line personalizzate (verificato con Claude Code 2.1.322). Lancia `claude` nel terminale integrato di VS Code, oppure attiva *Estensioni → Claude Code → Use Terminal*.
- **Non vedo la barra.** Riavvia Claude Code. Controlla che `node --version` funzioni nel
  terminale. Prova lo script a mano: `echo {} | node ~/.claude/skills/limiti/statusline.mjs`
  deve scrivere "limiti: in attesa della prima risposta".
- **"limiti non disponibili: servono Pro, Max o Ultra".** Stai usando una chiave API o un
  provider cloud: in questo caso Claude Code non invia i limiti dell'abbonamento.
- **Quadratini o punti di domanda al posto dei simboli.** Chiedi `simboli ascii` e `stile ascii`.
- **Colori strani.** Prova `colori 256`, oppure `colori nessuno`.
- **Niente notifiche su Linux.** Installa `notify-send` (pacchetto `libnotify-bin` o `libnotify`).
  Su Windows le notifiche risultano inviate da "Windows PowerShell".

## Codex (OpenAI)

*Sperimentale: provato il 10/11/2026 con Codex 0.167 (piano Free, app per Windows): dati veri letti,
skill usata da Codex da sola. Non ancora su un uso quotidiano né su piani a pagamento. Segnalazioni benvenute.*

Codex (CLI, estensione per l'editor e app) scrive i suoi limiti nei file delle sessioni, in
`~/.codex/sessions` (o `$CODEX_HOME`), dopo ogni risposta, solo se hai fatto l'accesso con un
account ChatGPT. claude-limiti li legge da lì, senza modificarli:

- **nella barra di Claude Code** compare una riga `Codex` con i suoi limiti, **solo se hai usato
  Codex nelle ultime 24 ore** (chi non lo usa non vede niente). Le finestre dipendono
  dal piano: 5 ore + settimanale sui piani a pagamento, una sola finestra di 30 giorni sul piano
  Free. Se il dato non è recente la riga dice di quando è (si aggiorna solo quando usi Codex).
  Notifiche alle soglie e all'azzeramento come per Claude;
- **nel report** `/limiti` c'è una sezione Codex con ritmo e budget giornaliero, se l'hai usato
  negli ultimi 7 giorni;
- **dentro Codex**: Codex non permette di personalizzare la sua barra, ma legge le skill.
  `node install.mjs --codex` installa la skill in `~/.agents/skills/limiti` (senza toccare Claude
  Code): in Codex chiedi *"quanto mi resta?"*.

Per nascondere Codex: `mostra_codex no`.

## Come funziona

Una spiegazione semplice, dal dato che arriva a quello che vedi: [docs/come-funziona.md](docs/come-funziona.md).

## Verificare il funzionamento

La barra si basa su alcune cose che Claude Code non documenta, per esempio come distinguere
un dato fresco da uno vecchio quando ci sono più sessioni aperte. Per verificarle con i tuoi
dati accendi `diagnostica`, usa Claude Code per qualche giorno e poi esegui:

```
node ~/.claude/skills/limiti/report.mjs diagnosi
```

Ogni riga dice OK o DA GUARDARE. Un DA GUARDARE merita una segnalazione su GitHub.

## Privacy e sicurezza

Tutto resta sul tuo computer: la barra non fa nessuna connessione di rete e non ha dipendenze esterne
(solo il comando di installazione scarica claude-limiti da GitHub e, se manca, Node.js da nodejs.org). I dati
arrivano da Claude Code stesso; lo storico è salvato in `~/.claude/state/limiti-utilizzo.json`
(percentuali, orari, identificativi delle sessioni di Claude Code e, con un gateway a limite di spesa, l'importo speso; ultimi 8 giorni). I testi che arrivano da fuori (nome del modello,
cartella, branch git) vengono ripuliti dai caratteri di controllo prima di essere stampati, e le
notifiche sono avviate con percorsi assoluti. Dei file di Codex vengono lette solo le righe dei
limiti (mai i messaggi), e l'ultimo valore letto è tenuto in `~/.claude/state/limiti-codex.json`.

## Disinstallazione

```
node install.mjs --rimuovi
```

Se hai installato con il comando unico: su Windows
`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.ps1))) --rimuovi`, su macOS e Linux
`curl -fsSL https://raw.githubusercontent.com/raffaeleciccone-analyst/claude-limiti/main/install.sh | sh -s -- --rimuovi`. Viene tolta anche la copia privata di Node.

Toglie la status line (rimettendo quella che avevi prima, se c'era) e la skill (anche quella per
Codex, se installata). Preferenze e
storico restano in `~/.claude`: cancellali a mano se non ti servono.

## Sviluppo

```
node test/test.mjs           # 226 controlli, tutti in cartelle temporanee
node tools/preview-svg.mjs   # rigenera le immagini in docs/
```

`CLAUDE_CONFIG_DIR` viene rispettata. I test girano su GitHub Actions su Windows, macOS e Linux con Node 18 e 22.

## Licenza

[MIT](LICENSE)
