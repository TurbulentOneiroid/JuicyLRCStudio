# Juicy LRC Studio

<img src="assets/juicy.png" alt="Juicy" width="160" align="right">

Ein **kostenloser LRC-Editor** im Browser: Songtexte Wort für Wort und Silbe für Silbe auf das Audio legen (Enhanced LRC / A2 mit `<mm:ss.xx>`-Wortzeiten).
Dazu vergleicht es deine LRC mit den **Original-Lyrics** (z. B. von einer Lyrics-Seite) und zeigt falsche, fehlende und
überzählige Wörter. So lassen sich Fehler im Text direkt beheben: ein Klick auf Tauschen, Einfügen oder Löschen
(oder *Alle tauschen*) korrigiert die LRC.
Läuft komplett lokal im Browser, ohne Server, ohne Upload: Audio und Text verlassen deinen Rechner nicht.
**Free to use**, ohne Anmeldung, ohne Installation, Open Source (MIT).

`#LRC-Editor` `#LRC-Maker` `#LRC-Generator` `#free-LRC-tool` `#free-to-use` `#kostenlos` `#synced-lyrics` `#enhanced-LRC`
`#Songtext-synchronisieren` `#lyrics-editor` `#Lyrics-vergleichen` `#compare-lyrics` `#open-source`

**Online:** https://turbulentoneiroid.github.io/JuicyLRCStudio/ · **Offline:** `index.html` per Doppelklick öffnen (Chrome oder Edge empfohlen).

## Was es kann
- Audio laden (mp3, wav, flac, m4a, ogg …), Tempo 100 / 75 / 50 / 25 % ohne Tonhöhenänderung, Sprachfilter für langsames Abspielen
- Wörter mit der Maus setzen (Rechtsklick = anhören, rechte Taste halten = weiterhören bis zum Loslassen, Linksklick = setzen) oder mit der Leertaste mittippen
- **Loop-Modus** (↻ neben ▶): die markierte Zeile läuft immer im Loop, eine andere Zeile wählen = dort weiterloopen; aus = ganzen Track hören
- Zeile bearbeiten oder reparieren mit **Loop-Box** (Vorlauf einstellbar, die Wiedergabe bleibt in der Box)
- Wörter in der Zeitleiste ziehen (Box = verschieben, nach rechts wird sie kürzer, Kanten = länger / kürzer) und ganze Zeilen
  an ihrer Box verschieben (über Nachbarn hinweg geschoben, liegt ein Wort oder eine ganze Zeile samt Wörtern rot eine Ebene höher, bis wieder Platz ist),
  ohne Bestätigen; dabei spielt der Anfang der Box kurz an, solange die Maus gedrückt ist immer wieder, so sitzt jede Grenze genau.
  Wörter mit derselben Zeit (rot) liegen gestapelt übereinander und lassen sich einzeln anfassen,
  der Knopf „⇔ auffächern“ darüber (oder Doppelklick) legt sie nebeneinander (Länge nach Text, auch über Zeilen hinweg); der Rest der Zeile und ihr Ende rücken mit
- Zeilenenden (`Ende`), Pausen, Silben (`Lie|be`), mehrere Stimmen (`v1:`, `F:`, `bg:` …)
- Prüfung: gleiche Zeiten, zu lange Wörter, fehlende Zeilenenden (mit Vorschlag)
- Seitenleiste (Song, Prüfung, Original-Abgleich) neben den Wörtern: mit ⇆ links oder rechts
  andocken, mit » zu einem schmalen Streifen einklappen, der nur noch die Fehler zählt und zeigt, wo im Song sie liegen
- Liedtext-Anzeige, Zeitleiste (Griff darunter) und Seitenleiste lassen sich in der Größe ziehen, Doppelklick = Standard;
  ganz klein zeigt die Liedtext-Anzeige nur noch die aktuelle Zeile. Die Song-Felder lassen sich mit ▾ einklappen
- Prüf-Werkzeuge (Zeiten verteilen, Enden schätzen, Mit Original-Lyrics vergleichen) oben links neben ▶
- **🎓 Tutorial**: lädt einen kleinen Beispielsong und führt Schritt für Schritt durch alle Werkzeuge (Silben, Auffächern, Ziehen, Zeilenende, Reihenfolge, Original-Abgleich, Setzen, Pause, Klinge, Wörter einfügen); auch Audio und LRC wählen, Fehler in der Wortliste und den Loop; ein blinkender roter Pfeil zeigt, was zu bedienen ist, und jede Aufgabe hakt sich selbst ab. Startbar auch auf der Startseite; am Ende geht es direkt zum eigenen Ordner, Audio oder LRC
- **?** öffnet Rundgang und Hilfe: die Seitenleiste klappt dafür rechts über die volle Höhe nach oben, nochmal **?** = zurück
- **📁 Ordner** (Button oder Ordner ins Fenster ziehen): zeigt, welches Audio zu welcher LRC gehört, und legt fehlende LRCs direkt im Ordner an;
  mit ◀ ▶ oder der Liste durch die Songs blättern (rundherum), vorher fragt es nach Speichern / Verwerfen
- Rückgängig, Entwurf-Wiederherstellung, Speichern direkt in die Datei (Chrome / Edge)
- Startbildschirm mit Juicy und Jingle (unter ⚙ *Start-Sound* abschaltbar). Browser spielen Ton erst nach einem Klick,
  darum wartet der Startbildschirm notfalls auf *Studio öffnen*
- Gelöschte Wörter, Zeilen und Zeiten zerplatzen mit einem Blub in aufsteigende Seifenblasen (unter ⚙ abschaltbar)
- **✂ Klinge (X):** wie im Schnittprogramm in die Zeitleiste klicken, die Zeile wird dort in zwei geteilt (links endet sie
  am Schnitt, rechts beginnt sie mit dem nächsten Wort)
- **Wortliste:** × am Wort löscht es, + daneben fügt ein Wort danach ein, ✓ an einem fehlenden Zeilenende setzt es fest, ↔ über einem Wort tauscht es gegen das Original (und ↶ wieder zurück)
- **Silben vorschlagen** (Knopf Sil·ben, an / aus; Deutsch / Englisch / automatisch): lang gesungene Wörter ohne Silben zeigen orange Punkte (Lie·be), ✂ am Wort trennt sie, ein Klick auf einen Punkt nur dort (Lie|be) und teilt die Zeit auf
- **⏸ Pause (P):** genauso in ein Wort klicken, es endet dort, bis zum nächsten Wort ist Pause (grüne Pause-Marke)
- **Mit Original-Lyrics vergleichen:** Original-Songtext einfügen, falsche, fehlende und überzählige Wörter werden markiert, mit
  Vorschlag pro Wort (Tauschen / Einfügen / Löschen). `[Chorus]` usw. und Werbung von Lyrics-Seiten zählen nicht,
  Wiederholungen und Remix-Schnitte sind kein Fehler. *Neu aus Text* lässt diese Überschriften ebenfalls weg
- **🎉 Fertig:** fragt einmal nach deinem Namen, trägt ihn als `[by:]` und `[status:Fertig]` in die LRC ein, speichert –
  und feiert mit Konfetti, Blasen und Musik

Zum Kennenlernen am besten **🎓** (oben rechts) – das Tutorial mit Beispielsong. Unter **?** gibt es einen Rundgang durch die Bereiche (Maus auf einen Eintrag = der Bereich leuchtet auf) und alle Tasten.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seite |
| `app.js` | Oberfläche: Player, Zeitleiste, Bearbeiten, Reparieren, Ordner |
| `lrc.js` | LRC lesen, schreiben, prüfen (ohne DOM) |
| `style.css` | Aussehen |
| `assets/juicy.png` | Maskottchen (Logo, Favicon, Startbildschirm) |
| `assets/jingle.wav` | Start-Jingle |
| `assets/party.wav` | Musik zur Party nach 🎉 Fertig |
| `assets/blub.wav` | Blub beim Löschen |

## Lizenz
MIT, siehe [LICENSE](LICENSE).

---

**English:** Juicy LRC Studio is a **free LRC editor** (LRC maker / LRC generator) for word-timed (enhanced) LRC lyrics,
running entirely in your browser. It also compares your LRC with the original lyrics and points out wrong, missing
or extra words, which you fix with one click. Free to use, no sign-up, no install, no upload – everything stays on your machine.
Open https://turbulentoneiroid.github.io/JuicyLRCStudio/ or `index.html`, load an audio file and an LRC (or paste lyrics), then set words with the mouse or tap them.
UI language is German. MIT licensed.
