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
- **✨ Simple-Modus mit Assistent** (Startseite oder oben neben Zurücksetzen): ein schlankes Studio für alle, die selten mit solchen Programmen arbeiten. Juicy führt live durch den Song und ein roter Pfeil zeigt, was als Nächstes dran ist: Audio-Ordner oder Audio und LRC wählen, Original-Lyrics einfügen, eine kurze erste Runde (Karte verschieben, Tempo-Tipp: kurz normal hören, dann 50 %, Wort einfügen und löschen, Wort per Doppelklick umschreiben, ↶ Zurück / ↷ Vor), dann jede Stelle von vorne nach hinten – falsche, fehlende und überzählige Wörter (ein eingefügtes Wort wird gleich auf seine Stelle geprüft), Wörter an der falschen Stelle im Satz, übereinanderliegende Wörter und Zeilen ohne Zeiten (nur die betroffenen Wörter neu einklicken, schwierige Stellen lassen sich auf später legen: Rechtsklick hört an, bei Touch lange drücken, Linksklick bzw. Tippen setzt, Hilfe zum langsameren Tempo bei den ersten Wörtern), fehlende Zeilenenden, Reihenfolge, zum Schluss einmal das ganze Lied anhören, speichern und 🎉 Fertig. Sichtbar ist immer nur die Zeile, um die es gerade geht (in der Wortliste und der Zeitleiste), dazu ein einfacher Zähler; die Zeitleiste blättert seitenweise weiter statt mitzulaufen (*Folgen* aus). 🛠 Profi-Modus = das volle Studio; dort schaltet der Juicy-Kopf den Assistenten dazu
- **?** öffnet Rundgang und Hilfe: die Seitenleiste klappt dafür rechts über die volle Höhe nach oben, nochmal **?** = zurück
- **📁 Ordner** (Button oder Ordner ins Fenster ziehen): zeigt, welches Audio zu welcher LRC gehört, und legt fehlende LRCs direkt im Ordner an;
  mit ◀ ▶ oder der Liste durch die Songs blättern (rundherum), vorher fragt es nach Speichern / Verwerfen.
  Chrome / Edge merken sich den Ordner: beim nächsten Besuch öffnet er sich wieder (mit dem Song von zuletzt), sonst holt ↺ neben Ordner ihn mit einem Klick zurück
- Rückgängig, Entwurf-Wiederherstellung, Speichern direkt in die Datei (Chrome / Edge)
- Startbildschirm mit Juicy und Jingle (unter ⚙ *Start-Sound* abschaltbar). Browser spielen Ton erst nach einem Klick,
  darum wartet der Startbildschirm notfalls auf *Studio öffnen*
- Gelöschte Wörter, Zeilen und Zeiten zerplatzen mit einem Blub in aufsteigende Seifenblasen (unter ⚙ abschaltbar)
- **✂ Klinge (X):** wie im Schnittprogramm in die Zeitleiste klicken: oben über einem Wort zeigen kleine Striche seine Silben, die Klinge springt an
  die nächste – ein Klick trennt das Wort dort und teilt seine Länge im Verhältnis der Silben auf; unten in die Zeilen-Box = die Zeile wird dort in zwei geteilt
  (links endet sie am Schnitt, rechts beginnt sie mit dem nächsten Wort)
- **Satz direkt in die Waveform:** Doppelklick auf eine freie Stelle, Satz eintippen, Enter, ans Satzende klicken – wie ein Kommentar auf SoundCloud. Die Wörter teilen sich die Zeit nach ihrer Länge und sind Boxen wie Clips in einer DAW: Kanten ziehen = länger / kürzer, Mitte = verschieben
- **Ansicht schieben:** freie Stelle der Waveform ziehen, mittlere Maustaste überall, Touchpad seitlich wischen oder Shift+Mausrad
- **Runde Knöpfe in der Zeitleiste** (↓ einbetten, ⇔ auffächern, ⇊ fusionieren, ✂ Ende kürzen, ⇄ sortieren): klein, nur mit Symbol – bleibt die Maus kurz darauf, klappt der Text auf
- **↓ Wort in den Satz einbetten:** steht ein Wort im Satz an der falschen Stelle, liegt es in der Zeitleiste rot eine Ebene höher, eine gestrichelte Linie führt in seine Zeile – stimmt seine Zeit, rückt ↓ es im Text dorthin, wo es gesungen wird
- **Zeilenende ziehen:** das rechte Ende jeder Zeilen-Box hat einen Griff (bei markierten und hochgelegten Zeilen sichtbar, sonst beim Drüberfahren) – ziehen = die Zeile endet früher / später
- **⇊ doppelt – fusionieren:** steht dasselbe Wort zweimal fast genau übereinander (höchstens 0,1 s auseinander), schlägt ein Knopf darüber vor, beide zu einem Wort zu machen – das obere wird gelöscht; liegen viele davon übereinander, gibt es einen Knopf für alle
- **✂ Ende kürzen:** reicht ein Satzende unter den Anfang des nächsten Satzes (oder ein Wortende unter das nächste Wort), zeigt die Zeitleiste dort eine orange Linie mit Knopf – ein Klick kürzt das Ende genau bis dahin
- **Auswählen, Kopieren, Einfügen:** Zeilen mit Shift+Klick (Bereich), Strg+Klick (einzeln), Strg+A (alle) oder ☑ Auswählen wählen – in der Wortliste oder an ihrer Box in der Zeitleiste. Strg+C / ⧉ Kopieren kopiert sie mit allen Zeiten (auch als LRC-Text für andere Programme), Strg+V / 📋 Einfügen setzt sie an der Abspielmarke wieder ein – wie einen Clip. Entf / Backspace löscht die gewählten Zeilen oder das markierte Wort (beim Setzen und in einer offenen Zeile wie bisher die Zeit)
- **⌃ Kopfleiste einklappen** (oben rechts): alles oben in einer schmalen Zeile, nur mit Symbolen (die Wörter stehen im Tooltip), ⌄ klappt sie wieder aus
- **⤒ Aufklappen:** die Wortliste klappt nach oben auf und bekommt fast den ganzen Bildschirm (Liedtext-Anzeige und Zeitleiste klappen weg), ⤓ Zuklappen holt sie zurück. Dasselbe passiert, wenn man den Griff unter der Zeitleiste ganz nach oben zieht (wieder nach unten ziehen = zurück)
- **Wort in eine andere Zeile ziehen:** in der Wortliste ein Wort mit der Maus vor oder hinter ein anderes Wort (oder ans Ende einer Zeile) ziehen – es kommt mit seiner Zeit dorthin
- **Mehrere Wörter in der Wortliste:** Strg+Klick wählt einzelne Wörter, Shift+Klick alle bis dahin, oder neben den Wörtern eine Box aufziehen; eins davon ziehen schiebt alle in die Zielzeile
- **≈ Vergleichen:** an der Zeilennummer zeigt ≈, wie viele ähnliche Sätze es gibt; ein Klick blendet alle anderen Zeilen aus, die ähnlichen stehen untereinander mit Prozentwert und lassen sich verlinken. Ein gleicher Satz ohne Zeiten wird dabei gleich mitverlinkt und ab seinem Start aufgefächert
- **🔍 Ähnlich & Satzbau:** findet Sätze, die sich wiederholen – verglichen nach Text und Timing, mit Prozentwert – und verlinkt sie auf Klick. Dazu Sätze, die an der falschen Stelle getrennt sind (ein groß geschriebenes Wort am Zeilenende mit Pause davor, ein klein geschriebenes am Zeilenanfang dicht an der Zeile davor): ein Klick schiebt das Wort in die richtige Zeile. Sind Original-Lyrics geladen, richtet sich der Satzbau nach ihnen; steht derselbe Satz zweimal in einer Zeile, schlägt es vor, sie zu teilen
- **Mehrere Zeilen verschieben:** sind mehrere Zeilen gewählt, verschiebt das Ziehen einer ihrer Boxen in der Zeitleiste alle zusammen
- **Wörter mit der Box wählen:** in der Zeitleiste neben den Zeilenboxen (unter der Waveform) drücken und eine Box aufziehen – wie im Windows-Explorer. Alle Wörter darin sind gewählt (Shift / Strg = dazu): eins davon ziehen verschiebt alle, Strg+C kopiert sie, Entf löscht sie, Esc wählt ab
- **🔗 Gleiche Sätze verlinken:** das Studio erkennt Sätze mit gleichem Text (🔗 an der Zeilennummer). Verlinkte Sätze verhalten sich über den ganzen Track gleich: Wörter verschieben, länger machen, tauschen, neu setzen oder die ganze Zeile verschieben passiert in allen, jeweils mit demselben Abstand. Beim Verlinken bleibt jeder Satz, wo er ist (er springt nicht). Jede Gruppe hat ihre Farbe – auch in der Zeitleiste: Wortboxen und ein durchsichtiger Streifen über der Waveform zeigen, welche Stellen zusammengehören. Der erste Satz (der Master) vererbt beim Verlinken alle seine Wörter an die anderen, auch an Sätze, die noch keine Zeiten haben (sie bekommen sie ab ihrem Start); + neben dem 🔗 macht aus einem Satz eine neue Version (eigene Gruppe, eigene Farbe), gleiche Sätze verlinken sich dann mit der nächsten Version davor. Mit Strg+Klick gewählte Zeilen und 🔗 Verlinken kommen in die Gruppe der schon verlinkten unter ihnen. ⛓ Lösen hebt die Verlinkung auf. Die Verlinkung gilt in der Sitzung (und im Entwurf), sie steht nicht in der LRC
- **Zeiten aller Wörter** (⚙ → Zeitleiste, aus): die Zeitleiste zeigt die Zeit nur am markierten Wort, angeschaltet unter jedem Wort
- **Zoom-Tempo** (⚙ → Zeitleiste): wie stark Mausrad und Touchpad zoomen, Standard 15 %; das Touchpad zählt nach der Wischstrecke, nicht nach Ereignissen
- **Mitspringen** (neben Folgen): ein Wort anwählen holt die Zeitleiste zu ihm und setzt die Abspielmarke davor, die Leertaste spielt dann von dort.
  Aus: Zeitleiste und Abspielmarke bleiben, wo sie sind
- **Folgen aus:** die Zeitleiste blättert eine Seite weiter, sobald die Wiedergabe rechts hinausläuft, und springt beim Loop zurück
- **Wortliste:** an einem Satz (beim Drüberfahren) fügt + am vorderen / hinteren Rand einen Satz davor / danach ein, × in der Ecke löscht ihn; × am Wort löscht es, + daneben fügt ein Wort danach ein, ✓ an einem fehlenden Zeilenende setzt es fest, ↔ über einem Wort tauscht es gegen das Original (und ↶ wieder zurück)
- **Silben vorschlagen** (Knopf Sil·ben, an / aus; Deutsch / Englisch / automatisch): lang gesungene Wörter ohne Silben zeigen orange Punkte (Lie·be), ✂ am Wort trennt sie, ein Klick auf einen Punkt nur dort (Lie|be) und teilt die Zeit auf
- **⏸ Pause (P):** genauso in ein Wort klicken, es endet dort, bis zum nächsten Wort ist Pause (grüne Pause-Marke)
- **Mit Original-Lyrics vergleichen:** Original-Songtext einfügen, falsche, fehlende und überzählige Wörter werden markiert, mit
  Vorschlag pro Wort (Tauschen / Einfügen / Löschen). `[Chorus]` usw. und Werbung von Lyrics-Seiten zählen nicht,
  Wiederholungen und Remix-Schnitte sind kein Fehler. *Neu aus Text* lässt diese Überschriften ebenfalls weg
- **🎉 Fertig:** fragt einmal nach deinem Namen, trägt ihn als `[by:]` und `[status:Fertig]` in die LRC ein, speichert –
  und feiert mit Konfetti, Blasen und Musik

Wer nur schnell einen Song sauber machen will, nimmt den **✨ Simple-Modus** – Juicy sagt, was zu tun ist. Zum Kennenlernen aller Werkzeuge am besten **🎓** (oben rechts) – das Tutorial mit Beispielsong. Unter **?** gibt es einen Rundgang durch die Bereiche (Maus auf einen Eintrag = der Bereich leuchtet auf) und alle Tasten.

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
