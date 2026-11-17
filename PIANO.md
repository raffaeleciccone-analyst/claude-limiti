# claude-limiti — PIANO (come)

> Il COSA sta in SPEC.md. Qui c'è il COME.
> Ogni scelta tecnica cita la frase della spec che la giustifica.
> Se una scelta qui contraddice la spec, vince la spec: si corregge il piano.
> Scritto il 17/11/2026 a posteriori (il codice esisteva già, v1.3.1): descrive le scelte fatte e il loro motivo.

## 1. Architettura

```
Claude Code ──(JSON su stdin, a ogni risposta e ogni 60 s)──► statusline.mjs ──► testo della barra (stdout)
                                                                 │
                     ~/.claude/state/limiti-utilizzo.json ◄──────┤  stato condiviso tra le sessioni
                     ~/.claude/state/limiti-avvisi/       ◄──────┤  un file = un avviso già mandato
                     ~/.claude/state/limiti-diagnostica.jsonl ◄──┤  (solo con diagnostica accesa)
                     ~/.codex/sessions/**/rollout-*.jsonl ───────┘  solo lettura (Codex)
                                                                 │
                                         notifiche di sistema ◄──┘  (PowerShell / osascript / notify-send)

/limiti (skill) ──► report.mjs (report, diagnosi)   settings.mjs (impostazioni)
install.ps1 / install.sh ──► install.mjs (copia la skill, attiva la status line, --remove)
```

## 2. Porte d'ingresso
- **Limiti di Claude**: l'unico ingresso è il JSON che Claude Code passa alla status line (D1). Tutto il resto
  del programma usa la forma normalizzata `{ used_percentage, resets_at }` di `readWindow()`.
- **Limiti di Codex**: `codex.mjs` trasforma i file di Codex nella stessa forma, più `len` (durata della
  finestra, C19). **F14 (barra dentro Codex)** riceverà i limiti da Codex stesso in un altro formato: un solo
  adattatore nuovo verso questa stessa forma, il disegno della barra si riusa.

## 3. Dati

| File | Contenuto | Perché (spec) |
|---|---|---|
| `limiti-utilizzo.json` | ultimi limiti validi, storico 8 giorni, per ogni sessione `{t, a, v}` (ora, tempo API, firma dei limiti ricevuti) | F2 ritmo/previsione, F3 più sessioni (C8–C11) |
| `limiti-avvisi/<finestra>-<ora reset>-<soglia>` | file vuoto creato in modo esclusivo: chi lo crea per primo manda l'avviso | F4 "una volta sola" (C12, C13) |
| `statusline-limiti.config.json` | solo le impostazioni diverse dal predefinito | F8 |
| `limiti-codex.json` | ultimo valore letto da Codex (cache) | F11, C20: solo numeri, mai testo dei messaggi |
| `limiti-diagnostica.jsonl` | una riga per lettura (ora, sessione accorciata, tempo API, limiti) | F13 |

### Scelte e motivi
- **Node.js senza dipendenze.** Motivo: vincolo "nessuna dipendenza esterna"; gira su Windows, macOS, Linux.
- **Regola "dato fresco"**: un dato conta se la sessione ha appena ricevuto una risposta (tempo API cresciuto)
  **o se i limiti che riceve sono cambiati** (aggiunto in v1.3.1: al 100% la richiesta rifiutata non aggiunge
  tempo API). Altrimenti vince il valore già salvato, finché la sua finestra non scade. Motivo: F3, C8–C11.
- **Avvisi con file creati in modo esclusivo** invece di un registro condiviso. Motivo: più sessioni scrivono
  insieme, la creazione esclusiva di un file è atomica su tutti i sistemi (C12).
- **Notifiche lanciate in modo sincrono alla fine**, non in background. Motivo: Claude Code chiude i processi
  lasciati dalla status line (bug del 10/11) → F4.
- **Notifica a sessioni chiuse con attività di Windows una tantum** (`Register-ScheduledTask`, non `schtasks`:
  il formato della data dipende dalla lingua). Motivo: F5, C15. Spegnendo l'opzione o disinstallando,
  `cancelScheduledResets()` in `common.mjs` cancella quelle in attesa (C35, aggiunto 17/11).
- **Solo simboli larghi una colonna** (▲ ◷ » invece di emoji). Motivo: "Cosa NON fa: niente emoji".
- **Lingua: su Windows vince la lingua di sistema**, non `LANG`. Motivo: C17 (VS Code mette `LANG=en_US`).
- **Codex visibile solo se usato di recente** (24 h barra, 7 giorni report). Motivo: "chi non usa Codex non vede niente".
- **Installazione: Node privato scaricato da nodejs.org con controllo SHA-256** se manca. Motivo: F12.

## 4. Struttura del codice
```
limiti/statusline.mjs   la barra (F1–F6, F9, F10, F11 riga Codex)
limiti/report.mjs       report /limiti e diagnosi (F7, F13)
limiti/settings.mjs     impostazioni (F8)
limiti/common.mjs       percorsi, impostazioni, lingua, scrittura sicura, cancellazione attività (C35)
limiti/codex.mjs        lettore dei file di Codex (F11)
limiti/SKILL.md         la skill /limiti per Claude Code
codex-skill/SKILL.md    la skill per Codex (solo con --codex)
install.mjs             installazione / rimozione (F12)
install.ps1, install.sh comando unico, porta Node se manca (F12)
test/test.mjs           tutti i test (cartelle temporanee, mai la HOME vera)
tools/preview-svg.mjs   immagini di anteprima per il README
agensi/                 scheda per il marketplace Agensi (gratis)
```

## 5. Test
`node test/test.mjs` — 289 controlli, tutti in cartelle temporanee. CI su GitHub: Windows, macOS, Linux × Node 18 e 22.
Regola: **mai** far girare `statusline.mjs` con la HOME vera e dati finti (inquina `~/.claude/state`).

Dove sta il test di ogni criterio (sezione e nome in `test/test.mjs`):

| Criterio | Test |
|---|---|
| C1 | §13 `C1: 42% with reset in 2h…` |
| C2 | §13 `C2: bar green at 30%, yellow at 55%, red at 85%` |
| C3 | §3 `no input`, `broken JSON` |
| C4 | §3 `API-key account (answers, no limits)` |
| C5 | §6 `after the reset the 5h line says "azzerato"…` |
| C6 | §2 `… at N columns` (larghezze) |
| C7 | §13 `C7: pace at half window…` |
| C8 | §6 `idle session with an old lower value does not lower the bar` |
| C9 | §6 `a session seen for the first time cannot bring old values back` |
| C10 | §6 `plan upgrade: a new lower value is shown at once` |
| C11 | §6 `limit reached (99 → 100% with no new API time)…` |
| C12 | §6 `alert at 80% claimed once`, `no duplicate alert (other runs…)` |
| C13 | §6 `reset notification claimed…`, `reset notification is really sent` |
| C14 | §6 `notifications off: nothing sent` |
| C15 | §6 `scheduled_reset off by default…`, `over the threshold: one task…` |
| C16 | §9 `Italian key and value accepted`, `unknown style rejected` |
| C17 | §3 `Windows: system language wins over LANG set by VS Code` |
| C18 | §12 `with Codex: Claude and Codex rows…`, `Codex not used in the last 24h: no line` |
| C19 | §12 `Free plan: one 30-day window, labels 5h / 30g` |
| C20 | §13 `C20: Codex limits read, message text never shown or stored` |
| C21 | §10 `--force replaces it`, `--remove restores the previous status line` |
| C22 | §10 `status line enabled, other settings untouched` |
| C23 | §7 `diagnostics: reset at :20… not false alarms`, `moving reset time… still detected` |
| C24 | §4 `control characters from the input are removed`, `malicious branch name is cleaned` |
| C35 | §13 `C35: scheduled_reset turned off…`, `--remove cancels…` (solo la parte Windows esistente) |
| C25–C34 | da scrivere quando si iniziano F14, F15, F5 su macOS/Linux |

Prova che i test valgono (17/11): soglia del rosso spostata da 80 a 90 → fallisce solo C2; ripristinato.

## 6. Da fare
- [ ] **F14 barra dentro Codex**: aspettare una versione stabile di Codex con `status_line_provider` (PR del 17/11,
      vedi HANDOFF.md). Poi: piccolo server MCP in Node, stesso disegno della barra, test C25–C28.
- [ ] **F15 mod usage-limits**: Q6 verificata (sì, nel pannello di VS Code funziona; notifica di Windows no). Test C29–C32, C36.
      Riquadro: usare un valore reattivo (`atom`) perché si ridisegni quando arrivano i limiti (la prova non lo faceva).
- [ ] **F5 su macOS (launchd) e Linux (systemd-run)**: test C33–C35 per quei sistemi; prova reale su Linux con
      Docker Desktop (va acceso).
- [ ] Scheda gratis su Agensi (cartella `agensi/`, serve un account).
