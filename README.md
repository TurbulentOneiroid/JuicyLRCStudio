# Juicy LRC Studio

<img src="assets/juicy.png" alt="Juicy" width="160" align="right">

Ein LRC-Editor im Browser: Songtexte Wort für Wort und Silbe für Silbe auf das Audio legen (Enhanced LRC / A2 mit `<mm:ss.xx>`-Wortzeiten).
Läuft komplett lokal im Browser, ohne Server, ohne Upload: Audio und Text verlassen deinen Rechner nicht.

**Online:** https://turbulentoneiroid.github.io/JuicyLRCStudio/ · **Offline:** `index.html` per Doppelklick öffnen (Chrome oder Edge empfohlen).

## Was es kann
- Audio laden (mp3, wav, flac, m4a, ogg …), Tempo 100 / 75 / 50 / 25 % ohne Tonhöhenänderung, Sprachfilter für langsames Abspielen
- Wörter mit der Maus setzen (Rechtsklick = anhören, Linksklick = setzen) oder mit der Leertaste mittippen
- **Loop-Modus** (↻ neben ▶): die markierte Zeile läuft immer im Loop, eine andere Zeile wählen = dort weiterloopen; aus = ganzen Track hören
- Zeile bearbeiten oder reparieren mit **Loop-Box** (Vorlauf einstellbar, die Wiedergabe bleibt in der Box)
- Wörter in der Zeitleiste ziehen (Box = verschieben, Kanten = länger / kürzer) und ganze Zeilen an ihrer Box verschieben,
  ohne Bestätigen; dabei spielt der Anfang der Box kurz an, so sitzt jede Grenze genau
- Zeilenenden (`Ende`), Pausen, Silben (`Lie|be`), mehrere Stimmen (`v1:`, `F:`, `bg:` …)
- Prüfung: gleiche Zeiten, zu lange Wörter, fehlende Zeilenenden (mit Vorschlag)
- **📁 Ordner:** zeigt, welches Audio zu welcher LRC gehört, und legt fehlende LRCs direkt im Ordner an
- Rückgängig, Entwurf-Wiederherstellung, Speichern direkt in die Datei (Chrome / Edge)
- Startbildschirm mit Juicy und Jingle (unter ⚙ *Start-Sound* abschaltbar). Browser spielen Ton erst nach einem Klick,
  darum wartet der Startbildschirm notfalls auf *Studio öffnen*
- Gelöschte Wörter, Zeilen und Zeiten zerplatzen in aufsteigende Seifenblasen (unter ⚙ *Blasen beim Löschen* abschaltbar)

Alle Tasten stehen im Programm unter **?**.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seite |
| `app.js` | Oberfläche: Player, Zeitleiste, Bearbeiten, Reparieren, Ordner |
| `lrc.js` | LRC lesen, schreiben, prüfen (ohne DOM) |
| `style.css` | Aussehen |
| `assets/juicy.png` | Maskottchen (Logo, Favicon, Startbildschirm) |
| `assets/jingle.wav` | Start-Jingle |

## Lizenz
MIT, siehe [LICENSE](LICENSE).

---

**English:** Juicy LRC Studio is a browser-only editor for word-timed (enhanced) LRC lyrics. Everything stays on your machine.
Open https://turbulentoneiroid.github.io/JuicyLRCStudio/ or `index.html`, load an audio file and an LRC (or paste lyrics), then set words with the mouse or tap them.
UI language is German. MIT licensed.
