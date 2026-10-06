// Juicy LRC Studio UI: audio player down to 25 %, word list, timeline. Words are set with the mouse in the timeline
// (right click = listen, left click = set, drag = move while the word loops) or tapped with the space bar (tap mode T).
// An open line (edit or repair) plays inside its loop box. Model and file format live in lrc.js.

const $ = id => document.getElementById(id);
const audio = new Audio();
audio.preservesPitch = audio.mozPreservesPitch = audio.webkitPreservesPitch = true;
audio.addEventListener('timeupdate', () => loopCheck(clock()));

let doc = {meta: [], lines: [], warnings: []};
let sel = null;                 // {li, ti, end}: the slot Space places next (end = line end / pause mark of ti)
let issues = [], issueAt = new Map();
let undoStack = [], redoStack = [];
let fileName = '', fileHandle = null, audioName = '', dirty = false;
let peaks = null;               // Float32Array, 0..1, PEAK_RATE values per second
const PEAK_RATE = 200;
let holding = null;             // last word of a line held down: release = its end
let lastPlaced = null;          // {li, ti} tapped last (E sets its end)
let lastTap = 0, lastNudge = 0;
let view = {start: 0, span: 8}; // timeline window in seconds
let rate = 1;
let timed = [];                 // placed tokens in file order, rebuilt on every change
let vinfo = [];                 // LRC.voices(doc): per line {voice, bg, own}
let ends = new Map();           // 'li:ti' -> when the token stops (LRC.tokEnd), rebuilt on every change
let picked = new Set(), pickAnchor = null;    // lines chosen for repair
let repair = null;              // {lines, ghost: 'li:ti' -> old {t, end}, done: Set, jump, finish}
let version = 0;                // bumps on every change, the preview rebuilds on it
let marks = [];                 // timeline hit boxes of the last frame: start / end marks
let bodies = [];                // ... and word boxes {x0, x1, y0, y1, li, ti}
let drag = null;
let origin = null;              // snapshot as loaded / created: Zurücksetzen goes back to it
let edit = null;                // {li, before, free}: the one line being edited (B ... OK / Abbrechen), see startEdit
let hoverX = null;              // mouse x over the timeline
let snip = null;                // short audition running: {t, timer}
let replayT = null;             // last time set with the mouse or auditioned: Space replays it until normal playback
let loop = null;                // {kind: 'line', li} | {kind: 'zone'} (loop box of the open line) | {kind: 'word', li, ti}
let lanes = [];                 // line boxes in the timeline of the last frame: {x0, x1, y, h, li}
let lineBad = new Map();        // li -> 'err' | 'warn', rebuilt on every change
let sugg = new Map();           // li -> suggested end of a line whose end is missing (far from the next line)
let folder = null;              // opened folder: {name, songs: [{key, audio: [F], lrc: [F]}], lrcDir}, see openFolder
let newTarget = null;           // {dir, name}: a new LRC made from the folder list is saved there

const tapComp = () => (+$('tapComp').value || 0) / 1000;
const maxGap = () => Math.max(0, +$('maxGap').value || 0);
const endGap = () => Math.max(0, +$('endGap').value || 0);
const snipLen = () => Math.max(0.05, +$('snipLen').value || 0.5);
const tapMode = () => $('tapMode').checked;
const loopPad = () => Math.max(0, +$('loopPad').value || 0);
const preRoll = () => Math.max(0, +$('preRoll').value || 0);
const stemOf = n => n.replace(/\.[^.]+$/, '');
const cleanStem = s => s.trim().replace(/[ _.-]+(enhanced|karaoke|lyrics)$/i, '');

// LRC and audio belong together by file name (without extension, "_enhanced" etc. ignored)
function nameMismatch() {
	return !!(audioName && fileName && cleanStem(stemOf(fileName)).toLowerCase() !== cleanStem(stemOf(audioName)).toLowerCase());
}
const length = () => (isFinite(audio.duration) && audio.duration) ||
	Math.max(60, ...timed.map(e => e.k.end || e.k.t)) + 10;
const esc = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// ---------------------------------------------------------------- changes, undo, draft

function snapshot() {
	return JSON.stringify({meta: doc.meta, lines: doc.lines, sel});
}

function pushUndo() {
	undoStack.push(snapshot());
	if (undoStack.length > 300) undoStack.shift();
	redoStack = [];
}

function restore(s) {
	const o = JSON.parse(s);
	doc.meta = o.meta;
	doc.lines = o.lines;
	sel = o.sel;
	renderMeta();
	changed();
}

function undo() {
	if (!undoStack.length) return false;
	redoStack.push(snapshot());
	restore(undoStack.pop());
	return true;
}

function redo() {
	if (!redoStack.length) return;
	undoStack.push(snapshot());
	restore(redoStack.pop());
}

function recalc() {
	timed = LRC.flat(doc).filter(e => e.k.t != null);
	vinfo = LRC.voices(doc);
	ends = new Map();
	doc.lines.forEach((ln, li) => ln.tokens.forEach((k, ti) => ends.set(li + ':' + ti, LRC.tokEnd(doc, li, ti))));
	sugg = new Map();
	doc.lines.forEach((ln, li) => {
		const last = ln.tokens.length - 1, k = ln.tokens[last];
		if (ln.brk || !k || k.t == null || k.end != null) return;
		const nx = endOf(li, last);
		const e = nx == null || nx - k.t > endGap() ? LRC.suggestEnd(doc, li) : null;
		if (e != null) sugg.set(li, e);
	});
}

// where a token's box ends: its end mark, else the next word; a line's last word without end: the suggested end
function boxEnd(li, ti) {
	const ln = doc.lines[li];
	if (ti === ln.tokens.length - 1 && ln.tokens[ti].end == null && sugg.has(li)) return sugg.get(li);
	return endOf(li, ti);
}

function endOf(li, ti) {
	const v = ends.get(li + ':' + ti);
	return v === undefined ? null : v;
}

function changed(markDirty = true) {
	if (markDirty) dirty = true;
	version++;
	recalc();
	issues = LRC.check(doc, maxGap(), endGap());
	issueAt = new Map();
	lineBad = new Map();
	for (const i of issues) {
		const key = i.li + ':' + i.ti + (i.end ? ':e' : '');
		if (i.level !== 'info' && issueAt.get(key) !== 'err') issueAt.set(key, i.level);
		if (i.level !== 'info' && lineBad.get(i.li) !== 'err') lineBad.set(i.li, i.level);
	}
	renderWords();
	renderIssues();
	renderInfo();
	saveDraftSoon();
}

let draftTimer = 0;

function saveDraftSoon() {
	clearTimeout(draftTimer);
	draftTimer = setTimeout(() => {
		if (!dirty) return;
		try {
			localStorage.setItem('lrcEditorDraft', JSON.stringify({meta: doc.meta, lines: doc.lines, fileName,
				time: new Date().toLocaleString('de-DE')}));
		} catch (e) { /* storage blocked or full: no draft */ }
	}, 800);
}

function clearDraft() {
	try { localStorage.removeItem('lrcEditorDraft'); } catch (e) { /* ignore */ }
}

function checkDraft() {
	let d = null;
	try { d = JSON.parse(localStorage.getItem('lrcEditorDraft') || 'null'); } catch (e) { /* ignore */ }
	if (!d || !d.lines || !d.lines.length) return;
	$('draftTime').textContent = d.time + (d.fileName ? ' (' + d.fileName + ')' : '');
	$('draft').hidden = false;
	$('draftLoad').onclick = () => {
		setDoc({meta: d.meta, lines: d.lines, warnings: []}, d.fileName || '', null);
		dirty = true;
		renderInfo();
		$('draft').hidden = true;
	};
	$('draftDrop').onclick = () => { clearDraft(); $('draft').hidden = true; };
}

// ---------------------------------------------------------------- files

function setDoc(d, name, handle) {
	doc = d;
	fileName = name;
	fileHandle = handle;
	undoStack = [];
	redoStack = [];
	const first = LRC.flat(doc).find(e => e.k.t == null) || LRC.flat(doc)[0];
	sel = first ? {li: first.li, ti: first.ti, end: false} : null;
	lastPlaced = null;
	repair = null;
	edit = null;
	replayT = null;
	loop = null;
	clearPicked();
	origin = snapshot();
	renderMeta();
	changed(false);
	dirty = false;
	renderInfo();
	if (timed.length) view.start = Math.max(0, timed[0].k.t - 1);
}

async function loadLrcFile(file, handle = null) {
	if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
	const d = LRC.parse(LRC.decode(await file.arrayBuffer()));
	newTarget = null;
	setDoc(d, file.name, handle);
}

async function openLrc() {
	if (window.showOpenFilePicker) {
		try {
			const [h] = await showOpenFilePicker({types: [{description: 'LRC', accept: {'text/plain': ['.lrc', '.txt']}}]});
			await loadLrcFile(await h.getFile(), h);
			return;
		} catch (e) {
			if (e.name === 'AbortError') return;
		}
	}
	$('fileLrc').click();
}

async function loadAudio(file) {
	if (audio.src) URL.revokeObjectURL(audio.src);
	audio.src = URL.createObjectURL(file);
	audio.defaultPlaybackRate = audio.playbackRate = rate;
	audioName = file.name;
	peaks = null;
	renderInfo();
	if (nameMismatch()) hint('LRC „' + fileName + '“ und Audio „' + audioName + '“ heißen verschieden. Beim Speichern schlage ich „' +
		suggestName() + '“ vor, damit Player beide zusammen finden.');
	try {
		const ac = new (window.AudioContext || window.webkitAudioContext)();
		const buf = await ac.decodeAudioData(await file.arrayBuffer());
		ac.close();
		peaks = computePeaks(buf);
		overviewCache = null;
		renderInfo();
	} catch (e) {
		hint('Wellenform nicht verfügbar (' + e.message + '), Abspielen geht trotzdem.');
	}
}

function computePeaks(buf) {
	const n = Math.ceil(buf.duration * PEAK_RATE), step = buf.sampleRate / PEAK_RATE;
	const chans = [];
	for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chans.push(buf.getChannelData(c));
	const out = new Float32Array(n);
	let top = 1e-6;
	for (let i = 0; i < n; i++) {
		let m = 0;
		const a = Math.floor(i * step), b = Math.min(chans[0].length, Math.floor((i + 1) * step));
		for (const d of chans) for (let j = a; j < b; j += 3) { const v = Math.abs(d[j]); if (v > m) m = v; }
		out[i] = m;
		if (m > top) top = m;
	}
	for (let i = 0; i < n; i++) out[i] /= top;
	return out;
}

// the audio file name counts: players find the LRC for a track by it
function suggestName() {
	if (audioName) return stemOf(audioName) + '.lrc';
	const get = k => (doc.meta.find(m => m[0] === k) || [])[1] || '';
	return fileName || (get('ar') && get('ti') ? get('ar') + ' - ' + get('ti') + '.lrc' : 'lyrics.lrc');
}

async function save(as) {
	const text = LRC.write(doc), old = fileName;
	if (!as && nameMismatch() && confirm('Die LRC heißt „' + fileName + '“, das Audio „' + audioName + '“.\n' +
		'Player finden die LRC meist nur, wenn sie wie das Audio heißt. Als „' + suggestName() + '“ speichern?')) as = true;
	if (window.showSaveFilePicker) {
		try {
			let h = as ? null : fileHandle;
			if (!h && !as && newTarget && newTarget.dir) h = await newTarget.dir.getFileHandle(newTarget.name, {create: true});
			if (!h) h = await showSaveFilePicker({suggestedName: suggestName(),
				types: [{description: 'LRC', accept: {'text/plain': ['.lrc']}}]});
			const w = await h.createWritable();
			await w.write(text);
			await w.close();
			fileHandle = h;
			fileName = h.name;
			if (newTarget) folderAdd(h);
			newTarget = null;
			saved(old);
			return;
		} catch (e) {
			if (e.name === 'AbortError') return;
			console.warn('save via file picker failed, downloading instead', e);
		}
	}
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
	a.download = suggestName();
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	fileName = a.download;
	saved(old);
}

function saved(old) {
	dirty = false;
	clearDraft();
	renderInfo();
	let msg = 'Gespeichert: ' + fileName;
	if (old && cleanStem(stemOf(old)).toLowerCase() !== cleanStem(stemOf(fileName)).toLowerCase())
		msg += ' – die alte „' + old + '“ liegt noch im Ordner. Bitte löschen, sonst gibt es zwei LRCs.';
	if (nameMismatch()) msg += ' – Achtung: heißt nicht wie das Audio „' + audioName + '“.';
	hint(msg);
}

// ---------------------------------------------------------------- playback

// The media element reports its position only every few frames (coarser when slowed down), so the playhead
// runs on from the last report at the playback rate. Never backwards, except after a seek.
const clk = {ct: -1, wall: 0, val: 0};

function clock() {
	const ct = audio.currentTime || 0, wall = performance.now();
	if (audio.paused || audio.seeking) {
		clk.ct = ct;
		clk.wall = wall;
		clk.val = ct;
		return ct;
	}
	if (ct !== clk.ct) {
		clk.ct = ct;
		clk.wall = wall;
	}
	const est = clk.ct + (wall - clk.wall) / 1000 * audio.playbackRate;
	clk.val = Math.abs(est - clk.val) > 0.3 ? est : Math.max(clk.val, est);
	return clk.val;
}

// Speech filter for slow playback: high-pass, two low-passes and a soft compressor take the boom and the
// clicky top end out of the time-stretched audio. Built on the first play (needs a user gesture).
let ac = null, wet = null, dry = null, master = null;

function audioGraph() {
	if (ac) return;
	try {
		ac = new (window.AudioContext || window.webkitAudioContext)();
		const src = ac.createMediaElementSource(audio);
		const f = (type, hz) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = hz; return b; };
		const comp = ac.createDynamicsCompressor();
		comp.threshold.value = -26;
		comp.ratio.value = 3;
		comp.attack.value = 0.01;
		comp.release.value = 0.25;
		dry = ac.createGain();
		wet = ac.createGain();
		master = ac.createGain();             // fades the short auditions in and out
		master.connect(ac.destination);
		src.connect(dry).connect(master);
		src.connect(f('highpass', 140)).connect(f('lowpass', 5500)).connect(f('lowpass', 5500)).connect(comp)
			.connect(wet).connect(master);
	} catch (e) {
		ac = null;
		hint('Sprachfilter nicht verfügbar: ' + e.message);
		return;
	}
	applyFilter();
}

function applyFilter() {
	if (!ac) return;
	const on = $('voiceFilter').checked && rate <= 0.5;
	wet.gain.setTargetAtTime(on ? 1.4 : 0, ac.currentTime, 0.05);
	dry.gain.setTargetAtTime(on ? 0 : 1, ac.currentTime, 0.05);
}

function play() {
	if (!audio.src) { hint('Erst Audio laden (♪ Audio oder ins Fenster ziehen).'); return; }
	if (loopOn() && sel) {                       // loop mode: play starts in the marked line
		followLoop(false);
		const r = loop && loop.kind === 'line' && loopRange(), now = clock();
		if (r && (now < r.a - 0.05 || now >= r.b)) seek(r.a);
	}
	stopSnip();
	replayT = null;
	audioGraph();
	if (ac && ac.state === 'suspended') ac.resume();
	audio.play().catch(() => {});        // a pause right after play rejects, harmless
}

function pause() { stopSnip(); audio.pause(); holding = null; }

// ---------------------------------------------------------------- lines: range, loop, next problem

// start and end of a line in seconds: first word (or line tag, or the old time in a repair) up to its end mark or
// where its last word stops. null while the line has no time at all.
function lineRange(li) {
	const ln = doc.lines[li];
	if (!ln || ln.brk || !ln.tokens.length) return null;
	let a = LRC.lineTime(ln);
	const g = repair && repair.ghost.get(li + ':0');
	if (a == null && g) a = g.t;
	if (a == null) return null;
	let b = boxEnd(li, ln.tokens.length - 1);
	for (const k of ln.tokens) b = Math.max(b == null ? a : b, k.t == null ? a : k.t, k.end == null ? a : k.end);
	return {a, b: b > a ? b : a + 1};
}

// where a line will start: its own time, else the end of the timed line before it
function lineStartGuess(li) {
	for (let i = li; i >= 0; i--) {
		const r = lineRange(i);
		if (r) return i === li ? r.a : r.b;
	}
	return 0;
}

function loopRange() {
	if (!loop) return null;
	if (loop.kind === 'zone') return edit ? edit.zone : null;
	if (loop.kind === 'word') {
		const k = doc.lines[loop.li] && doc.lines[loop.li].tokens[loop.ti];
		const e = k && k.t != null ? boxEnd(loop.li, loop.ti) : null;
		return e != null ? {a: Math.max(0, k.t - 0.12), b: Math.max(e, k.t + 0.1) + 0.12} : null;
	}
	const r = lineRange(loop.li);
	return r ? {a: Math.max(0, r.a - loopPad()), b: r.b + loopPad()} : null;
}

// loop box of an open line: from its start minus the pre-roll (Vorlauf) to the start of the next line
function makeZone(li) {
	const a = lineStartGuess(li);
	let b = null;
	for (let i = li + 1; i < doc.lines.length && b == null; i++)
		if (!doc.lines[i].brk && !LRC.isBg(doc.lines[i])) b = LRC.lineTime(doc.lines[i]);
	const r = lineRange(li);
	if (r) b = Math.max(b == null ? r.b : b, r.b);
	if (b == null || b < a + 0.5) b = a + 6;
	return {a: Math.max(0, a - preRoll()), b: b + 0.2, a0: a};
}

// Space while a line is open: play its loop box, from the playhead if it is inside, else from the box start
function playZone() {
	if (!audio.src) { hint('Erst Audio laden.'); return; }
	const z = edit.zone, now = clock();
	loop = {kind: 'zone'};
	if (now < z.a || now >= z.b - 0.05) seek(z.a);
	play();
}

// show a time range in the timeline (zooms out if it does not fit)
function showRange(a, b) {
	if (b - a + 0.6 > view.span) view.span = Math.min(180, b - a + 0.6);
	if (a < view.start || b > view.start + view.span) view.start = Math.max(0, a - Math.max(0.3, (view.span - (b - a)) / 2));
}

// L: the line plays over and over (with a short pre- and post-roll) until L, Esc or N
function setLoop(li) {
	if (li == null || li < 0) { loop = null; return; }
	if (!audio.src) { hint('Erst Audio laden.'); return; }
	if (!lineRange(li)) { hint('Zeile ' + (li + 1) + ' hat noch keine Zeit – erst ihr erstes Wort setzen.'); return; }
	loop = {kind: 'line', li};
	const r = loopRange();
	showRange(r.a, r.b);
	seek(r.a);
	play();
	hint('Zeile ' + (li + 1) + ' läuft im Loop – passt alles? N = weiter zum nächsten Satz mit Fehlern, L oder Esc = Loop aus.');
}

// Loop mode (↻ next to play, on by default): the marked line always plays in a loop. Marking another line moves the
// loop there (and jumps there if it is playing); with nothing to follow, the line under the playhead loops. Off = the
// whole track plays through. Not while a line is open (its loop box rules) or while tapping.
let loopMode = true;
const loopOn = () => loopMode && !edit && !tapMode();

function followLoop(go = !audio.paused) {
	if (!loopOn() || !sel || !audio.src || (loop && loop.kind !== 'line') || (loop && loop.li === sel.li)) return;
	if (!lineRange(sel.li)) return;
	loop = {kind: 'line', li: sel.li};
	if (go) seek(loopRange().a);
}

// the line under the playhead (main voice first), or null in a gap
function lineAt(t) {
	let hit = null;
	doc.lines.forEach((ln, li) => {
		const r = lineRange(li);
		if (r && t >= r.a && t < r.b && (hit == null || !LRC.isBg(ln))) hit = li;
	});
	return hit;
}

function setLoopMode(on) {
	loopMode = on;
	try { localStorage.setItem('lrcEditorLoopMode', on ? '1' : '0'); } catch (e) { /* ignore */ }
	$('btnLoopMode').classList.toggle('on', on);
	if (!on) { if (loop && loop.kind === 'line') loop = null; } else followLoop();
	hint(on ? 'Loop-Modus an: die markierte Zeile läuft immer im Loop.' : 'Loop-Modus aus: der ganze Track läuft durch.');
}

// back to the loop start at its end; a jump far away (overview click) ends the loop. Runs every frame and on
// timeupdate (which keeps coming while the tab is in the background).
function loopCheck(now) {
	if (!loop && loopOn() && !audio.paused && !snip) {    // loop mode with nothing looping: take the line under the playhead
		const li = lineAt(now);
		if (li != null) {
			loop = {kind: 'line', li};
			if (!sel || sel.li !== li) setSel({li, ti: 0, end: false}, false);
		}
	}
	if (!loop || audio.paused || snip) return;
	const r = loopRange();
	if (!r) loop = null;
	else if (loop.kind !== 'line' || drag) { if (now >= r.b || now < r.a - 0.05) seek(r.a); }     // box / word / dragged line: never leaves it
	else if (now >= r.b + 1.5 || now < r.a - 1) loop = null;
	else if (now >= r.b) seek(r.a);
}

function toggleLoop() {
	if (loop) { loop = null; pause(); return; }
	if (edit) playZone(); else setLoop(sel ? sel.li : playLi);
}

// first problem of a line (error, warning or unset word), else its first word
function lineProblem(li) {
	const own = issues.filter(i => i.li === li && (i.level !== 'info' || i.code === 'unset'));
	own.sort((a, b) => a.ti - b.ti || (a.end ? 1 : 0) - (b.end ? 1 : 0));
	return own[0] || null;
}

// N / Shift+N: next (previous) line with errors, warnings or unset words, wrapping round
function nextProblem(dir = 1, prefix = '') {
	if (edit) { lockedHint(); return; }
	const list = [...new Set(issues.filter(i => i.level !== 'info' || i.code === 'unset').map(i => i.li))].sort((a, b) => a - b);
	if (!list.length) { loop = null; hint('Keine Fehler und nichts mehr ungesetzt ✓'); return; }
	const from = sel ? sel.li : playLi;
	const li = dir > 0 ? (list.find(x => x > from) ?? list[0]) : ([...list].reverse().find(x => x < from) ?? list[list.length - 1]);
	goLine(li);
	const p = lineProblem(li);
	hint(prefix + 'Zeile ' + (li + 1) + (p ? ': „' + doc.lines[li].tokens[p.ti].text + '“ ' + p.msg : '') + '   (' + (list.indexOf(li) + 1) +
		' von ' + list.length + ' Zeilen mit Fehlern)' + (prefix ? ' – B öffnet sie.' : ''));
}

// mark the first problem of a line (or its first word), show it and put the playhead just before it
function goLine(li) {
	const p = lineProblem(li), going = !audio.paused;
	if (loop) { loop = null; pause(); } else if (!audio.paused) pause();
	setSel(p ? {li, ti: p.ti, end: !!p.end && p.code !== 'unset'} : {li, ti: 0, end: false});
	const t = lineStartGuess(li);
	view.start = Math.max(0, t - Math.min(1.5, view.span * 0.2));
	seek(Math.max(0, t - 0.05));
	if (going && loopOn()) play();                // loop mode: the new line goes on playing in its loop
}

function gain(v, tc) {
	if (!master) return;
	const now = ac.currentTime;
	master.gain.cancelScheduledValues(now);
	if (tc) master.gain.setTargetAtTime(v, now, tc); else master.gain.setValueAtTime(v, now);
}

// Right click / Space while placing: play snipLen seconds (song time) from t, once, faded in and out,
// then the playhead goes back to t.
function audition(t) {
	if (!audio.src) { hint('Erst Audio laden (♪ Audio oder ins Fenster ziehen).'); return; }
	t = Math.max(0, Math.min(t, length()));
	stopSnip();
	holding = null;
	loop = null;
	replayT = t;
	audioGraph();
	if (ac && ac.state === 'suspended') ac.resume();
	seek(t);
	gain(0);
	gain(1, 0.004);
	audio.play().catch(() => {});        // a pause right after play rejects, harmless
	const s = snip = {t, timer: 0};
	s.timer = setTimeout(() => {
		gain(0, 0.008);
		s.timer = setTimeout(() => {
			if (snip !== s) return;
			snip = null;
			audio.pause();
			gain(1);
			seek(s.t);
		}, 40);
	}, snipLen() / rate * 1000);
}

function stopSnip() {
	if (!snip) return;
	clearTimeout(snip.timer);
	snip = null;
	gain(1);
}

function seek(t) {
	if (!audio.src) return;
	audio.currentTime = Math.max(0, Math.min(t, length()));
	clk.val = clk.ct = audio.currentTime;
	clk.wall = performance.now();
	if (t < view.start || t > view.start + view.span) view.start = Math.max(0, t - view.span * 0.3);
}

function setRate(r) {
	rate = r;
	audio.defaultPlaybackRate = audio.playbackRate = r;
	document.querySelectorAll('.speed').forEach(b => b.classList.toggle('on', +b.dataset.rate === r));
	applyFilter();
}

// time near the selected slot: its own time, else the placed token before it
function selTime(s = sel) {
	if (!s) return null;
	const ln = doc.lines[s.li];
	const k = ln && ln.tokens[s.ti];
	if (k && s.end && k.end != null) return k.end;
	if (k && k.t != null) return k.t;
	const before = timed.filter(e => e.li < s.li || (e.li === s.li && e.ti < s.ti));
	if (before.length) return before[before.length - 1].k.end || before[before.length - 1].k.t;
	return ln ? ln.t : null;
}

function playFromSel() {
	const t = selTime();
	seek(Math.max(0, (t || 0) - 1.5));
	play();
}

// ---------------------------------------------------------------- tapping

function slots() {
	const out = [];
	doc.lines.forEach((ln, li) => {
		if (ln.brk) return;
		ln.tokens.forEach((k, ti) => out.push({li, ti, end: false}));
		out.push({li, ti: ln.tokens.length - 1, end: true});
	});
	return out;
}

function slotIndex(list, s) {
	return s ? list.findIndex(x => x.li === s.li && x.ti === s.ti && x.end === !!s.end) : -1;
}

function nextSlot(s) {
	const ln = doc.lines[s.li];
	if (!s.end && s.ti < ln.tokens.length - 1) return {li: s.li, ti: s.ti + 1, end: false};
	if (!s.end && $('tapEnds').checked) return {li: s.li, ti: s.ti, end: true};
	for (let li = s.li + 1; li < doc.lines.length; li++)      // background lines overlap: tap them with Repair
		if (!doc.lines[li].brk && !LRC.isBg(doc.lines[li])) return {li, ti: 0, end: false};
	return {li: s.li, ti: ln.tokens.length - 1, end: true};
}

function tapDown() {
	if (audio.paused) { play(); return; }
	if (!sel || !doc.lines[sel.li]) return;
	const now = LRC.q(Math.max(0, clock() - tapComp()));
	const ln = doc.lines[sel.li], k = ln.tokens[sel.ti];
	pushUndo();
	if (sel.end) {
		if (k.t != null && now > k.t) k.end = now;
		holding = null;
	} else {
		k.t = now;
		if (k.end != null && k.end <= now) k.end = null;
		const p = ln.tokens[sel.ti - 1];
		if (p && p.end != null && p.end > now) p.end = null;
		const last = sel.ti === ln.tokens.length - 1;
		holding = last && !$('tapEnds').checked ? {li: sel.li, ti: sel.ti, t: now} : null;
	}
	lastPlaced = {li: sel.li, ti: sel.ti};
	lastTap = performance.now();
	const nxt = nextSlot(sel);
	if (nxt) sel = nxt;
	changed();
	scrollToSel();
}

function tapUp() {
	const h = holding;
	holding = null;
	const k = h && doc.lines[h.li] && doc.lines[h.li].tokens[h.ti];
	const now = LRC.q(clock() - tapComp());
	if (k && !audio.paused && now - h.t >= 0.12) {      // a quick tap leaves the end open (marked as missing)
		k.end = now;
		changed();
	}
}

// ---------------------------------------------------------------- edit mode: one line at a time, on purpose
//
// Outside edit mode nothing in the timeline changes a time: clicks only mark and jump, marks cannot be dragged.
// B (or a double click on its box) opens the marked line. Then its words hang at the mouse one by one, only its
// marks can be dragged, and the rest of the song is locked. OK (Enter) keeps it, Abbrechen (Esc) restores the line.

function firstUnset() {
	const e = LRC.flat(doc).find(x => x.k.t == null && !doc.lines[x.li].brk);
	return e ? {li: e.li, ti: e.ti, end: false} : null;
}

const editing = li => !!edit && (li == null || edit.li === li);
const placing = () => !!edit && !edit.free && !!sel && sel.li === edit.li;

function lockedHint() {
	hint('Du bearbeitest gerade Zeile ' + (edit.li + 1) + '. Erst OK (Enter) oder Abbrechen (Esc).');
}

function startEdit(li = sel ? sel.li : -1) {
	if (edit) { if (li !== edit.li) lockedHint(); return false; }
	const ln = doc.lines[li];
	if (!ln || ln.brk || !ln.tokens.length) { hint('Erst eine Zeile auswählen: Wort anklicken oder ihre Box in der Zeitleiste.'); return false; }
	edit = {li, before: JSON.stringify(ln), free: false};
	const p = lineProblem(li);
	sel = p ? {li, ti: p.ti, end: !!p.end && p.code !== 'unset'} : {li, ti: 0, end: false};
	openZone();
	return true;
}

// the open line gets its loop box; nothing plays until Space
function openZone() {
	if (loop) loop = null;
	pause();
	edit.zone = makeZone(edit.li);
	showRange(edit.zone.a, edit.zone.b);
	seek(edit.zone.a);
	renderWords();
	scrollToSel();
	renderMode();
}

// ok: keep the line and go on to the next line with problems (only marked, not opened); else put the line back
function endEdit(ok) {
	if (!edit) return;
	const li = edit.li;
	if (ok && sugg.has(li)) {                    // missing line end: the suggested box end becomes the end
		const ln = doc.lines[li];
		ln.tokens[ln.tokens.length - 1].end = sugg.get(li);
	}
	const touched = JSON.stringify(doc.lines[li]) !== edit.before;
	if (!ok && touched) {
		if (!repair && !confirm('Änderungen an Zeile ' + (li + 1) + ' verwerfen?')) return;
		pushUndo();
		doc.lines[li] = JSON.parse(edit.before);
	}
	edit = null;
	loop = null;
	pause();
	if (repair) {
		if (ok && repair.idx < repair.lines.length - 1) {
			repair.idx++;
			openRepairLine();
			return;
		}
		const n = repair.idx + (ok ? 1 : 0);
		repair = null;
		changed();
		renderMode();
		hint(ok ? 'Reparatur fertig: ' + n + ' Zeile(n) neu gesetzt.' : 'Reparatur abgebrochen: Zeile ' + (li + 1) + ' hat ihre alten Zeiten zurück' +
			(n ? ', ' + n + ' Zeile(n) davor bleiben neu.' : '.'));
		return;
	}
	changed(touched);
	renderMode();
	if (!ok) hint('Zeile ' + (li + 1) + (touched ? ' zurückgesetzt.' : ': nichts geändert.'));
	else if (issues.some(i => i.level !== 'info' || i.code === 'unset')) nextProblem(1, 'Zeile ' + (li + 1) + ' übernommen. Weiter: ');
	else hint('Zeile ' + (li + 1) + ' übernommen. Keine Fehler mehr ✓');
}

// bar under the timeline: says which mode you are in
function renderMode() {
	const bar = $('modeBar');
	document.body.classList.toggle('editing', !!edit);
	if (edit) {
		const ln = doc.lines[edit.li];
		$('modeText').innerHTML = '<b>' + (repair ? 'Reparieren (' + (repair.idx + 1) + ' / ' + repair.lines.length + ')' : 'Bearbeiten') +
			': Zeile ' + (edit.li + 1) + '</b> „' + esc(LRC.lineText(ln, false).replace(/\|/g, '')) + '“ ' +
			'<span>Leertaste = Loop-Box Start / Stop · Box-Kanten ziehen = Vorlauf / Ende · Rechtsklick = anhören · Linksklick = Wort setzen · ' +
			'Wort ziehen = verschieben, Wort-Kanten = länger / kürzer · Zeilen-Box ziehen = ganze Zeile verschieben (der Anfang spielt kurz an)</span>';
	} else {
		$('modeText').innerHTML = '<b>Ansehen</b> <span>Hier ändert sich nichts. Zeile auswählen (Wort oder Box anklicken), dann ' +
			'<b>✎ Zeile bearbeiten</b> (B oder Doppelklick auf die Box).</span>';
	}
	$('btnEdit').hidden = !!edit;
	$('btnOk').hidden = $('btnCancel').hidden = !edit;
	bar.classList.toggle('on', !!edit);
	lineEls.forEach((el, i) => el && el.classList.toggle('editing', editing(i)));
}

// left click while editing: the marked word (or its line end) gets time t, the next slot of the same line hangs at
// the mouse. After the line end the line plays in a loop (if "Fertige Zeile loopen" is on); nothing hangs any more.
function placeAt(t) {
	if (!placing() || !doc.lines[sel.li].tokens[sel.ti]) return;
	const ln = doc.lines[sel.li], k = ln.tokens[sel.ti];
	if (sel.end && (k.t == null || t <= k.t)) { hint('Das Ende muss hinter dem Anfang von „' + k.text + '“ liegen.'); return; }
	pushUndo();
	if (sel.end) {
		k.end = t;
	} else {
		k.t = t;
		if (k.end != null && k.end <= t) k.end = null;
		const p = ln.tokens[sel.ti - 1];
		if (p && p.end != null && p.end > t) p.end = null;
	}
	lastPlaced = {li: sel.li, ti: sel.ti};
	replayT = t;
	const li = sel.li, lineDone = sel.end && sel.ti === ln.tokens.length - 1;
	// next: the line end after the last word, the word after a pause mark, else the next word - never another line
	if (lineDone) edit.free = true;
	else sel = sel.end ? {li, ti: sel.ti + 1, end: false} : sel.ti === ln.tokens.length - 1 ? {li, ti: sel.ti, end: true} :
		{li, ti: sel.ti + 1, end: false};
	changed();
	scrollToSel();
	if (lineDone && $('autoLoop').checked && audio.src) playZone();
	if (lineDone) hint('Zeile fertig. Passt alles? OK (Enter) übernimmt, sonst ein Wort anklicken und neu setzen.');
}

// ---------------------------------------------------------------- reset

function resetDoc(how) {
	if (how === 'origin' && origin) {
		pushUndo();
		repair = null;
		edit = null;
		clearPicked();
		restore(origin);
		hint('Zurückgesetzt auf den geladenen Stand (Strg+Z holt die Änderungen zurück).');
	} else if (how === 'times') {
		pushUndo();
		repair = null;
		edit = null;
		clearPicked();
		popAll();
		for (const ln of doc.lines) for (const k of ln.tokens) { k.t = null; k.end = null; }
		sel = firstUnset();
		lastPlaced = null;
		replayT = null;
		changed();
		scrollToSel();
		hint('Alle Wortzeiten gelöscht, Zeilenzeiten bleiben als Orientierung (Strg+Z holt sie zurück).');
	}
}

// ---------------------------------------------------------------- repair: re-tap chosen lines only

function pickLine(li, e) {
	if (e.shiftKey && pickAnchor != null) {
		picked = new Set();
		for (let i = Math.min(li, pickAnchor); i <= Math.max(li, pickAnchor); i++) picked.add(i);
	} else if (e.ctrlKey || e.metaKey) {
		if (picked.has(li)) picked.delete(li); else picked.add(li);
		pickAnchor = li;
	} else {
		picked = picked.size === 1 && picked.has(li) ? new Set() : new Set([li]);
		pickAnchor = li;
	}
	renderPicked();
}

function renderPicked() {
	lineEls.forEach((el, i) => {
		if (!el) return;
		el.classList.toggle('picked', picked.has(i));
		el.classList.toggle('repair', !!repair && repair.lines.includes(i));
	});
	const b = $('btnRepair');
	b.classList.toggle('on', !!repair);
	b.textContent = repair ? 'Reparatur abbrechen (Esc)' : picked.size ? picked.size + ' Zeile' + (picked.size > 1 ? 'n' : '') +
		' reparieren' : 'Reparieren';
}

function clearPicked() {
	picked = new Set();
	pickAnchor = null;
}

// voice tag for the chosen lines (or the line of the marked word)
function setVoice() {
	let lines = [...picked].filter(li => doc.lines[li] && !doc.lines[li].brk).sort((a, b) => a - b);
	if (!lines.length && sel && doc.lines[sel.li] && !doc.lines[sel.li].brk) lines = [sel.li];
	if (!lines.length) { hint('Erst Zeilen auswählen: Zeilennummer anklicken, Shift = Bereich, Strg = einzeln dazu.'); return; }
	const raw = prompt('Stimme für ' + lines.length + ' Zeile(n): v1, v2, v3 … oder M, F, D (Duett) · bg = Hintergrund · ' +
		'leer = kein Tag (übernimmt die Stimme von oben)', doc.lines[lines[0]].vtag || '');
	if (raw == null) return;
	const {v} = LRC.stripVoice(raw.trim() ? raw.trim() + ': x' : 'x');
	if (raw.trim() && !v) { hint('Unbekannte Stimme „' + raw + '“ – erlaubt: v1 … v99, M, F, D, bg.'); return; }
	pushUndo();
	for (const li of lines) doc.lines[li].vtag = v;
	changed();
}

// R: the chosen lines are set again one after the other. Each opens like edit mode with its old times as grey
// ghosts and its loop box (pre-roll adjustable). OK = next chosen line, Abbrechen = this line gets its old times back.
function startRepair() {
	if (edit) { lockedHint(); return; }
	let lines = [...picked].filter(li => doc.lines[li] && !doc.lines[li].brk).sort((a, b) => a - b);
	if (!lines.length && sel && doc.lines[sel.li] && !doc.lines[sel.li].brk) lines = [sel.li];
	if (!lines.length) { hint('Erst Zeilen auswählen: Zeilennummer anklicken, Shift = Bereich, Strg = einzeln dazu.'); return; }
	if (!audio.src) { hint('Erst Audio laden.'); return; }
	repair = {lines, idx: 0, ghost: new Map()};
	clearPicked();
	openRepairLine();
}

function openRepairLine() {
	const li = repair.lines[repair.idx], ln = doc.lines[li];
	pushUndo();
	edit = {li, before: JSON.stringify(ln), free: false};
	ln.tokens.forEach((k, ti) => {
		repair.ghost.set(li + ':' + ti, {t: k.t, end: k.end});
		k.t = null;
		k.end = null;
	});
	sel = {li, ti: 0, end: false};
	lastPlaced = null;
	changed();
	openZone();
	hint('Zeile ' + (li + 1) + ' reparieren: Vorlauf mit der linken Kante der Loop-Box einstellen, Leertaste = Start / Stop. ' +
		'Rechtsklick hört an, Linksklick setzt das Wort. Enter = OK, Esc = Abbrechen.');
}

function endNow() {
	let target = lastPlaced && doc.lines[lastPlaced.li] && doc.lines[lastPlaced.li].tokens[lastPlaced.ti];
	if (!target || target.t == null) {         // after Backspace: the placed word before the cursor
		const before = sel ? timed.filter(e => e.li < sel.li || (e.li === sel.li && e.ti < sel.ti)) : [];
		target = before.length ? before[before.length - 1].k : null;
	}
	if (!target || !audio.src) return;
	const k = target;
	const now = LRC.q(clock() - tapComp());
	if (!k || k.t == null || now <= k.t) return;
	pushUndo();
	k.end = now;
	changed();
}

function backTap() {
	if (edit) { if (canTime()) setSelTime(null); return; }   // an open line: Backspace clears the marked time
	if (!undo()) return;
	const t = selTime();
	if (!audio.paused) seek(Math.max(0, (t != null ? t : clock()) - 1.0));
	scrollToSel();
}

function setSelTime(t) {
	if (!sel) return;
	const k = doc.lines[sel.li].tokens[sel.ti];
	pushUndo();
	const old = sel.end ? k.end : k.t;
	if (t == null && old != null) {                // a time is deleted: its mark and its time in the list burst
		popMark(old);
		const el = sel.end ? endEls[sel.li] : tokEls[sel.li] && tokEls[sel.li][sel.ti];
		popEl(el && el.querySelector('small'));
	}
	if (sel.end) k.end = t; else k.t = t;
	changed();
}

function nudge(d) {
	if (!sel) return;
	const k = doc.lines[sel.li].tokens[sel.ti];
	const v = sel.end ? k.end : k.t;
	if (v == null) return;
	if (performance.now() - lastNudge > 1500) pushUndo();
	lastNudge = performance.now();
	const t = LRC.q(Math.max(0, v + d));
	if (sel.end) k.end = t; else k.t = t;
	changed();
	if (audio.paused) seek(Math.max(0, t - 0.4));
}

function moveSel(dir) {
	const list = slots().filter(s => !edit || s.li === edit.li);     // editing: stay in the open line
	if (!list.length) return;
	const i = slotIndex(list, sel);
	if (edit) edit.free = false;
	setSel(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + dir))]);
}

function setSel(s, scroll = true) {
	sel = s;
	followLoop();
	renderSelection();
	const t = selTime();
	if (t != null && audio.paused && (t < view.start || t > view.start + view.span)) view.start = Math.max(0, t - view.span * 0.3);
	if (scroll) scrollToSel();
}

// ---------------------------------------------------------------- editing text

function editToken(s = sel) {
	if (!s || s.end) return;
	const ln = doc.lines[s.li], k = ln.tokens[s.ti];
	const v = prompt('Wort bearbeiten – | trennt Silben, Leerzeichen trennt Wörter, leer = löschen', k.text);
	if (v == null || v === k.text) return;
	pushUndo();
	const nt = LRC.tokensOf(v);
	if (!nt.length) {
		popEl(ln.tokens.length === 1 ? lineEls[s.li] : tokEls[s.li] && tokEls[s.li][s.ti]);
		ln.tokens.splice(s.ti, 1);
		if (!ln.tokens.length) doc.lines.splice(s.li, 1);
		sel = null;
	} else {
		nt[0].t = k.t;
		nt[0].glue = k.glue;
		nt[nt.length - 1].end = k.end;
		ln.tokens.splice(s.ti, 1, ...nt);
	}
	changed();
}

function editLine(li) {
	const ln = doc.lines[li];
	const raw = prompt('Zeile bearbeiten – | trennt Silben (Lie|be), „v2: “ / „F: “ / „bg: “ davor = Stimme, leer = Zeile löschen. ' +
		'Zeiten bleiben der Reihe nach erhalten.', LRC.lineText(ln));
	if (raw == null) return;
	pushUndo();
	const {v: vtag, body: v} = LRC.stripVoice(raw);
	ln.vtag = vtag;
	const nt = LRC.tokensOf(v);
	clearPicked();
	if (!nt.length) {
		popEl(lineEls[li]);
		doc.lines.splice(li, 1);
	} else {
		nt.forEach((k, i) => { if (ln.tokens[i]) k.t = ln.tokens[i].t; });
		if (ln.tokens.length) nt[nt.length - 1].end = ln.tokens[ln.tokens.length - 1].end;
		ln.tokens = nt;
		ln.brk = false;
	}
	sel = null;
	changed();
}

function addLine(li) {
	clearPicked();
	const raw = prompt('Neue Zeile nach Zeile ' + (li + 1) + ' (| trennt Silben, „v2: “ / „bg: “ davor = Stimme / Hintergrund)');
	if (!raw || !raw.trim()) return;
	const {v: vtag, body: v} = LRC.stripVoice(raw);
	if (!v.trim()) return;
	pushUndo();
	doc.lines.splice(li + 1, 0, {t: null, tokens: LRC.tokensOf(v), brk: false, vtag});
	sel = {li: li + 1, ti: 0, end: false};
	changed();
}

function delLine(li) {
	pushUndo();
	clearPicked();
	popEl(lineEls[li]);
	doc.lines.splice(li, 1);
	sel = null;
	changed();
}

// ---------------------------------------------------------------- rendering: word list, issues, info

let lineEls = [], tokEls = [], endEls = [];

function renderWords() {
	const box = $('words');
	lineEls = [];
	tokEls = [];
	endEls = [];
	if (!doc.lines.length) {
		box.innerHTML = '<div class="empty"><img src="assets/juicy.png" alt=""><div class="steps">' +
			'<div><i>1</i><b>♪ Audio</b> laden</div>' +
			'<div><i>2</i><b>LRC öffnen</b> oder <b>Neu aus Text</b></div>' +
			'<div><i>3</i>Zeile wählen, <b>✎ Zeile bearbeiten</b>: <b>Rechtsklick</b> in die Zeitleiste spielt an, ' +
			'<b>Linksklick</b> setzt, <b>OK</b>. Oder <b>T</b> und mit der Leertaste mittippen.</div>' +
			'</div><p>Alles bleibt auf deinem Rechner. Audio und LRC lassen sich auch ins Fenster ziehen.</p></div>';
		return;
	}
	const html = [];
	doc.lines.forEach((ln, li) => {
		const t0 = LRC.lineTime(ln);
		const tools = '<span class="tools">' + (ln.brk ? '' : '<button data-act="edit" title="Zeile bearbeiten">✎</button>') +
			'<button data-act="add" title="Zeile darunter einfügen">＋</button>' +
			'<button data-act="del" title="Zeile löschen">✕</button></span>';
		const vi = vinfo[li] || {voice: '', bg: false, own: false};
		const vg = LRC.voiceGroup(vi.voice);
		const badge = vi.bg ? '<span class="vb bg" title="Hintergrund (bg:)">bg</span>' : vi.voice
			? '<span class="vb v' + vg + (vi.own ? '' : ' inh') + '" title="Stimme' + (vi.own ? '' : ' (von oben übernommen)') +
			'">' + esc(vi.voice) + '</span>' : '';
		html.push('<div class="line' + (ln.brk ? ' brk' : '') + (vi.bg ? ' bgline' : '') + (vg && !ln.brk ? ' voice' + vg : '') +
			'" data-li="' + li + '"><div class="ln">' + (li + 1) + ' ' + badge + ' ' + tools + '<br>' +
			(t0 != null ? LRC.fmt(t0) : '–') + '</div><div class="toks">');
		if (ln.brk) {
			html.push('— Pause / Zeilenende ' + (t0 != null ? LRC.fmt(t0) : '') + ' —');
		}
		ln.tokens.forEach((k, ti) => {
			const lv = issueAt.get(li + ':' + ti);
			const cls = 'tok' + (k.glue ? ' glue' : '') + (k.t == null ? ' unset' : '') + (lv ? ' ' + lv : '');
			html.push('<span class="' + cls + '" data-li="' + li + '" data-ti="' + ti + '"><span class="w">' + esc(k.text) +
				'</span><small>' + (k.t != null ? LRC.fmt(k.t) : ghostText(li, ti)) + '</small></span>');
			const last = ti === ln.tokens.length - 1;
			if (last || k.end != null) {
				const le = issueAt.get(li + ':' + ti + ':e');
				// no end mark: orange only when the check misses it, else faint (the next line follows right away)
				const auto = k.end == null && !le;
				const ecls = 'endmark' + (k.end == null ? (auto ? ' auto' : ' missing') : '') + (le === 'err' ? ' err' : '');
				const sym = last ? '⏹ Ende' : '⏸ Pause', sg = last && k.end == null ? sugg.get(li) : undefined;
				html.push('<span class="' + ecls + '" data-li="' + li + '" data-ti="' + ti + '" data-end="1" title="' +
					(sg != null ? 'Zeilenende fehlt. Vorschlag ' + LRC.fmt(sg) + ' (OK beim Bearbeiten übernimmt ihn)' :
						auto ? 'Kein Zeilenende nötig: die nächste Zeile folgt gleich' : last ? 'Zeilenende' : 'Pause') + '">' + sym +
					'<small>' + (k.end != null ? LRC.fmt(k.end) : sg != null ? '≈' + LRC.fmt(sg) : auto ? '–' : '?') + '</small></span>');
			}
		});
		html.push('</div></div>');
	});
	box.innerHTML = html.join('');
	box.querySelectorAll('.line').forEach(el => { lineEls[+el.dataset.li] = el; });
	box.querySelectorAll('.tok').forEach(el => {
		const li = +el.dataset.li;
		(tokEls[li] = tokEls[li] || [])[+el.dataset.ti] = el;
	});
	box.querySelectorAll('.endmark').forEach(el => {
		if (+el.dataset.ti === doc.lines[+el.dataset.li].tokens.length - 1) endEls[+el.dataset.li] = el;
	});
	playLi = -1;
	renderSelection();
	renderPicked();
	renderMode();
}

function ghostText(li, ti) {
	const g = repair && repair.ghost.get(li + ':' + ti);
	return g && g.t != null ? '(' + LRC.fmt(g.t) + ')' : '·';
}

function selEl(s = sel) {
	if (!s) return null;
	if (s.end) return $('words').querySelector('.endmark[data-li="' + s.li + '"][data-ti="' + s.ti + '"]');
	return tokEls[s.li] && tokEls[s.li][s.ti];
}

function renderSelection() {
	$('words').querySelectorAll('.sel').forEach(el => el.classList.remove('sel'));
	const el = selEl();
	if (el) el.classList.add('sel');
	lineEls.forEach((l, i) => l && l.classList.toggle('cur', !!sel && sel.li === i));
	version++;
}

function scrollToSel() {
	const el = selEl();
	if (el) el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
}

function renderIssues() {
	const err = issues.filter(i => i.level === 'err'), warn = issues.filter(i => i.level === 'warn');
	const unset = issues.filter(i => i.code === 'unset');
	const parts = [[err, ' Fehler'], [warn, ' Warnungen'], [unset, ' ungesetzt']].filter(p => p[0].length);
	$('sum').textContent = parts.length ? parts.map(p => p[0].length + p[1]).join(' · ') : 'alles ok ✓';
	const rows = [];
	if (unset.length)
		rows.push('<div class="issue" data-k="' + unset[0].li + ':' + unset[0].ti + '"><b>' + unset.length +
			' Wörter</b> noch nicht gesetzt (erstes in Zeile ' + (unset[0].li + 1) + ')</div>');
	for (const i of err.concat(warn).sort((a, b) => a.li - b.li || a.ti - b.ti).slice(0, 400)) {
		const k = doc.lines[i.li].tokens[i.ti];
		rows.push('<div class="issue ' + i.level + '" data-k="' + i.li + ':' + i.ti + (i.end ? ':e' : '') + '"><b>Z. ' + (i.li + 1) +
			' „' + esc(k.text) + '“</b> ' + esc(i.msg) + '</div>');
	}
	$('issues').innerHTML = rows.join('');
}

function renderMeta() {
	document.querySelectorAll('#meta input').forEach(inp => {
		const m = doc.meta.find(x => x[0] === inp.dataset.key);
		inp.value = m ? m[1] : '';
	});
}

function renderInfo() {
	$('fileInfo').textContent = 'LRC: ' + (fileName || (doc.lines.length ? 'neu' : '–')) + (dirty ? ' • ungespeichert' : '') +
		'   ·   Audio: ' + (audioName || '–') + (audioName && !peaks ? ' (Wellenform lädt …)' : '') +
		(nameMismatch() ? '   ·   ⚠ LRC heißt nicht wie das Audio' : '');
	document.title = (dirty ? '• ' : '') + (fileName || 'Juicy LRC Studio');
}

let hintTimer = 0;

function hint(msg) {
	$('hint').textContent = msg;
	clearTimeout(hintTimer);
	hintTimer = setTimeout(() => { $('hint').textContent = ''; }, 6000);
}

// ---------------------------------------------------------------- per frame: highlight, preview, canvases

let playLi = -1, pvKey = '';

function current(now) {
	let best = null;
	for (const e of timed) if (e.k.t <= now && (!best || e.k.t >= best.k.t)) best = e;
	return best;
}

function updatePlaying(now) {
	const cur = current(now);
	const li = cur ? cur.li : -1;
	if (li !== playLi) {
		if (lineEls[playLi]) {
			lineEls[playLi].classList.remove('playing');
			(tokEls[playLi] || []).forEach(el => el && el.classList.remove('sung', 'now'));
		}
		playLi = li;
		if (lineEls[li]) {
			lineEls[li].classList.add('playing');
			if ($('follow').checked && !audio.paused && !snip && performance.now() - lastTap > 3000)
				lineEls[li].scrollIntoView({block: 'center', behavior: 'smooth'});
		}
	}
	if (li < 0 || !tokEls[li]) return;
	doc.lines[li].tokens.forEach((k, ti) => {
		const el = tokEls[li][ti];
		if (!el) return;
		const on = k.t != null && k.t <= now;
		const end = endOf(li, ti);
		el.classList.toggle('sung', on);
		el.classList.toggle('now', on && (end == null || now < end));
	});
}

function previewLine(now) {
	if (sel && doc.lines[sel.li]) {
		const k = doc.lines[sel.li].tokens[sel.ti];
		if (audio.paused || (sel.end ? k.end == null : k.t == null)) return sel.li;     // stopped: the line you work on
	}
	let best = -1;
	doc.lines.forEach((ln, li) => {
		const t = LRC.lineTime(ln);
		if (t != null && t <= now + 0.3 && !LRC.isBg(ln)) best = li;
	});
	return best;
}

function updatePreview(now) {
	const li = previewLine(now);
	const ln = doc.lines[li];
	const key = li + ':' + version;
	if (key !== pvKey) {
		pvKey = key;
		if (!ln || ln.brk) {
			$('pvCur').innerHTML = '';
		} else {
			$('pvCur').innerHTML = ln.tokens.map((k, ti) => (ti && !k.glue ? ' ' : '') + '<span data-ti="' + ti + '"' +
				(sel && !sel.end && sel.li === li && sel.ti === ti ? ' style="text-decoration:underline var(--cursor) 3px"' : '') +
				'>' + esc(k.text) + '</span>').join('');
		}
		let nx = li + 1;
		while (doc.lines[nx] && (doc.lines[nx].brk || LRC.isBg(doc.lines[nx]))) nx++;
		$('pvNext').textContent = doc.lines[nx] ? LRC.lineText(doc.lines[nx], false).replace(/\|/g, '') : '';
	}
	if (!ln || ln.brk) return;
	$('pvCur').querySelectorAll('span').forEach(el => {
		const ti = +el.dataset.ti, k = ln.tokens[ti];
		let p = 0;
		if (k.t != null && now >= k.t) {
			const end = endOf(li, ti);
			p = end == null || end <= k.t ? 1 : Math.min(1, (now - k.t) / (end - k.t));
		}
		el.style.setProperty('--p', (p * 100).toFixed(1) + '%');
	});
}

function fitCanvas(c, cssH) {
	const dpr = window.devicePixelRatio || 1, w = c.clientWidth;
	if (c.width !== Math.round(w * dpr) || c.height !== Math.round(cssH * dpr)) {
		c.width = Math.round(w * dpr);
		c.height = Math.round(cssH * dpr);
	}
	const ctx = c.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return [ctx, w, cssH];
}

function css(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const C = {};
const UI_FONT = '"Segoe UI Variable Text", -apple-system, "SF Pro Text", Inter, system-ui, sans-serif';
const LANE_Y = 137;             // timeline: words and waveform above, line boxes from here, seconds at the bottom

function drawTimeline(now) {
	const [ctx, W, H] = fitCanvas($('timeline'), LANE_Y + 42);
	if (!audio.paused && $('follow').checked && !drag && !snip && !loop) view.start = Math.max(0, now - view.span * 0.25);
	const t0 = view.start, sp = view.span;
	const X = t => (t - t0) / sp * W;
	ctx.clearRect(0, 0, W, H);

	// edit mode: work area from the start of the open line to the slot being set (its old time, else the word before)
	const wr = edit && sel && sel.li === edit.li && lineRange(sel.li);
	if (wr) {
		const b = Math.max(wr.a, selTime() || wr.a);
		ctx.fillStyle = C.cursor;
		ctx.globalAlpha = 0.12;
		ctx.fillRect(X(wr.a), 0, Math.max(3, X(b) - X(wr.a)), LANE_Y - 2);
		ctx.globalAlpha = 1;
	}

	// loop box of the open line: the playhead never leaves it; its edges can be dragged (left = pre-roll)
	if (edit && edit.zone) {
		const z = edit.zone, za = X(z.a), zb = X(z.b), zl = loop && loop.kind === 'zone';
		ctx.fillStyle = C.accent;
		ctx.globalAlpha = zl ? 0.1 : 0.06;
		ctx.fillRect(za, 0, zb - za, H);
		ctx.globalAlpha = 0.25;
		ctx.fillRect(za, 0, Math.max(0, X(z.a0) - za), H);       // pre-roll part
		ctx.globalAlpha = 1;
		ctx.fillRect(za - 1, 0, 2, H);
		ctx.fillRect(zb - 1, 0, 2, H);
		for (const x of [za, zb]) ctx.fillRect(x - 4, 60, 8, 22);   // grips
		ctx.font = 'bold 11px ' + UI_FONT;
		ctx.fillText((zl ? '↻ ' : '') + 'Loop-Box', Math.max(za + 6, zb - 70), 56);
		if (X(z.a0) - za > 52) ctx.fillText('Vorlauf', za + 6, 56);
	}

	// line boxes under the words, one per line from start to end: marked line in the cursor colour, lines with
	// errors red / orange, the rest grey; background vocals as a thin bar below
	lanes = [];
	doc.lines.forEach((ln, li) => {
		const r = lineRange(li);
		if (!r || r.b < t0 || r.a > t0 + sp) return;
		const bg = LRC.isBg(ln), cur = sel && sel.li === li, bad = lineBad.get(li);
		const x0 = X(r.a), x1 = X(r.b), y = bg ? LANE_Y + 21 : LANE_Y, h = bg ? 6 : 19;
		const col = cur ? C.cursor : bad === 'err' ? C.err : bad === 'warn' ? C.warn : bg ? C.bgv : C.lane;
		ctx.fillStyle = col;
		ctx.globalAlpha = cur ? 0.25 : 0.1;
		ctx.fillRect(x0, y, Math.max(2, x1 - x0 - 1), h);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = col;
		ctx.lineWidth = cur ? 2 : 1;
		ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(2, x1 - x0 - 2), h - 1);
		ctx.lineWidth = 1;
		if (!bg) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(x0 + 3, y, Math.max(0, x1 - x0 - 6), h);
			ctx.clip();
			ctx.font = (cur ? 'bold ' : '') + '11px ' + UI_FONT;
			ctx.fillStyle = cur ? C.cursor : C.text;
			ctx.fillText((loop && loop.kind === 'line' && loop.li === li ? '↻ ' : '') + (li + 1) + '  ' + LRC.lineText(ln, false).replace(/\|/g, ''), x0 + 4, y + 13);
			ctx.restore();
		}
		lanes.push({x0, x1, y, h, li});
	});

	// waveform
	if (peaks) {
		ctx.fillStyle = C.wave;
		const mid = 88;
		for (let px = 0; px < W; px++) {
			const a = Math.floor((t0 + px / W * sp) * PEAK_RATE), b = Math.max(a + 1, Math.floor((t0 + (px + 1) / W * sp) * PEAK_RATE));
			let m = 0;
			for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) if (peaks[i] > m) m = peaks[i];
			const h = m * 46;
			ctx.fillRect(px, mid - h, 1, h * 2 || 1);
		}
	}

	// seconds
	ctx.fillStyle = C.dim;
	ctx.font = '10px ' + UI_FONT;
	for (let s = Math.ceil(t0); s < t0 + sp; s++) {
		if (sp > 30 && s % 5) continue;
		ctx.fillRect(X(s), H - 6, 1, 6);
		ctx.fillText(LRC.fmt(s).slice(0, 5), X(s) + 2, H - 2);
	}

	// line starts of lines without placed words (plain LRC)
	ctx.strokeStyle = C.lane;
	ctx.setLineDash([3, 3]);
	doc.lines.forEach(ln => {
		if (ln.t != null && (!ln.tokens.length || ln.tokens[0].t == null) && ln.t >= t0 && ln.t <= t0 + sp) {
			ctx.beginPath();
			ctx.moveTo(X(ln.t) + 0.5, 0);
			ctx.lineTo(X(ln.t) + 0.5, H);
			ctx.stroke();
		}
	});
	ctx.setLineDash([]);

	// words: bar from start to end, mark line, label
	marks = [];
	const vis = timed.filter(e => {
		const end = endOf(e.li, e.ti);
		return (end != null ? end : e.k.t) >= t0 - 1 && e.k.t <= t0 + sp + 1;
	});
	const lane = e => LRC.isBg(doc.lines[e.li]) ? 1 : 0;
	bodies = [];
	vis.forEach((e, n) => {
		const bgw = lane(e) === 1, ly = bgw ? 44 : 0;      // background vocals: second label row, upper bar
		const end = boxEnd(e.li, e.ti), last = e.ti === doc.lines[e.li].tokens.length - 1;
		const sg = last && e.k.end == null && sugg.has(e.li);
		const x = X(e.k.t), xe = end != null ? X(end) : x + 30;
		const lv = issueAt.get(e.li + ':' + e.ti);
		const isSel = sel && !sel.end && sel.li === e.li && sel.ti === e.ti;
		const sung = now >= e.k.t;
		ctx.fillStyle = lv === 'err' ? C.err : bgw ? (sung ? C.bgv : C.bgvDim) : sung ? C.sung : C.lane;
		const by = bgw ? 104 : 116, bh = bgw ? 9 : 14;
		ctx.globalAlpha = 0.55;
		ctx.fillRect(x, by, Math.max(2, xe - x - 1), bh);
		ctx.globalAlpha = 1;
		if (isSel || (loop && loop.kind === 'word' && loop.li === e.li && loop.ti === e.ti)) {
			ctx.strokeStyle = C.cursor;
			ctx.lineWidth = 2;
			ctx.strokeRect(x + 1, by - 1, Math.max(2, xe - x - 2), bh + 2);
			ctx.lineWidth = 1;
		}
		bodies.push({x0: x, x1: xe, y0: by - 4, y1: by + bh + 4, li: e.li, ti: e.ti});
		if (sg) {                                    // missing line end: suggested end, dashed, can be dragged
			const isSelE = sel && sel.end && sel.li === e.li && sel.ti === e.ti;
			ctx.strokeStyle = isSelE ? C.cursor : C.warn;
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(xe + 0.5, 40);
			ctx.lineTo(xe + 0.5, 134);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.font = '10px ' + UI_FONT;
			ctx.fillStyle = isSelE ? C.cursor : C.warn;
			ctx.fillText('Ende?', xe + 3, 52);
			marks.push({x: xe, li: e.li, ti: e.ti, end: true, sugg: true});
		}
		ctx.fillStyle = isSel ? C.cursor : lv === 'err' ? C.err : e.ti === 0 ? C.textHi : C.mark;
		ctx.fillRect(x - (isSel ? 1 : 0), 0, isSel ? 3 : 1, 132);
		const nxv = vis.slice(n + 1).find(o => lane(o) === lane(e));
		const nextX = nxv ? X(nxv.k.t) : W;
		ctx.save();
		ctx.beginPath();
		ctx.rect(x, ly, Math.max(0, nextX - x - 3), 40);
		ctx.clip();
		ctx.font = (bgw ? 'italic ' : e.ti === 0 ? 'bold ' : '') + '13px ' + UI_FONT;
		if (bgw) ctx.fillStyle = isSel ? C.cursor : C.bgv;
		ctx.fillText((e.k.glue ? '-' : '') + e.k.text, x + 3, ly + 15);
		ctx.font = '10px ' + UI_FONT;
		ctx.fillStyle = C.dim;
		ctx.fillText(LRC.fmt(e.k.t).slice(3), x + 3, ly + 28);
		ctx.restore();
		marks.push({x, li: e.li, ti: e.ti, end: false});
		if (e.k.end != null) {
			const xm = X(e.k.end);
			const isSelE = sel && sel.end && sel.li === e.li && sel.ti === e.ti;
			const le = issueAt.get(e.li + ':' + e.ti + ':e');
			ctx.fillStyle = isSelE ? C.cursor : le === 'err' ? C.err : C.ok;
			ctx.fillRect(xm - (isSelE ? 1 : 0), 40, isSelE ? 3 : 1, 92);
			ctx.fillRect(xm - 4, 128, 8, 6);
			ctx.font = '10px ' + UI_FONT;
			ctx.fillText(last ? 'Ende' : 'Pause', xm + 3, 52);
			marks.push({x: xm, li: e.li, ti: e.ti, end: true});
		}
	});

	// old marks of words still to re-tap in a repair
	if (repair) {
		ctx.setLineDash([2, 4]);
		ctx.strokeStyle = C.dim;
		ctx.fillStyle = C.dim;
		ctx.font = '11px ' + UI_FONT;
		for (const [key, g] of repair.ghost) {
			const [li, ti] = key.split(':').map(Number);
			const k = doc.lines[li] && doc.lines[li].tokens[ti];
			if (!k || k.t != null || g.t == null || g.t < t0 - 1 || g.t > t0 + sp) continue;
			ctx.beginPath();
			ctx.moveTo(X(g.t) + 0.5, 30);
			ctx.lineTo(X(g.t) + 0.5, 132);
			ctx.stroke();
			ctx.fillText(k.text, X(g.t) + 3, 44);
		}
		ctx.setLineDash([]);
	}

	// playhead
	ctx.fillStyle = C.play;
	ctx.fillRect(X(now) - 1, 0, 2, H);

	// mouse placement: the marked word as a flag at the mouse, its name centred on top
	const k = placing() && hoverX != null && sel && doc.lines[sel.li] && doc.lines[sel.li].tokens[sel.ti];
	if (k) {
		const label = sel.end ? '⏹ Ende ' + k.text : (k.glue ? '-' : '') + k.text;
		ctx.strokeStyle = C.cursor;
		ctx.setLineDash([4, 3]);
		ctx.beginPath();
		ctx.moveTo(hoverX + 0.5, 22);
		ctx.lineTo(hoverX + 0.5, H);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.font = 'bold 13px ' + UI_FONT;
		const tw = ctx.measureText(label).width, bx = Math.max(0, Math.min(W - tw - 12, hoverX - tw / 2 - 6));
		ctx.fillStyle = C.cursor;
		ctx.fillRect(bx, 1, tw + 12, 21);
		ctx.fillStyle = C.ink;
		ctx.fillText(label, bx + 6, 16);
		ctx.font = '10px ' + UI_FONT;
		ctx.fillStyle = C.cursor;
		ctx.fillText(LRC.fmt(LRC.q(t0 + hoverX / W * sp)).slice(3), hoverX + 4, 34);
	}
}

let overviewCache = null;

function drawOverview(now) {
	const c = $('overview');
	const [ctx, W, H] = fitCanvas(c, 34);
	if (!c.width || !c.height) return;          // hidden tab / pane: nothing to draw
	const L = length();
	if (!overviewCache || overviewCache.w !== W || overviewCache.v !== version || overviewCache.L !== L) {
		const off = document.createElement('canvas');
		off.width = c.width;
		off.height = c.height;
		const o = off.getContext('2d');
		o.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
		if (peaks) {
			o.fillStyle = C.wave;
			for (let px = 0; px < W; px++) {
				const a = Math.floor(px / W * L * PEAK_RATE), b = Math.floor((px + 1) / W * L * PEAK_RATE);
				let m = 0;
				for (let i = a; i < Math.min(peaks.length, b); i += 4) if (peaks[i] > m) m = peaks[i];
				o.fillRect(px, H / 2 - m * H / 2, 1, m * H || 1);
			}
		}
		o.fillStyle = C.lane;
		doc.lines.forEach(ln => { const t = LRC.lineTime(ln); if (t != null && !ln.brk) o.fillRect(t / L * W, H - 7, 1, 7); });
		o.fillStyle = C.err;
		issues.forEach(i => {
			if (i.level !== 'err') return;
			const k = doc.lines[i.li].tokens[i.ti];
			if (k.t != null) o.fillRect(k.t / L * W - 1, 0, 2, 8);
		});
		overviewCache = {w: W, v: version, L, img: off};
	}
	ctx.clearRect(0, 0, W, H);
	ctx.drawImage(overviewCache.img, 0, 0, W, H);
	ctx.strokeStyle = C.cursor;
	ctx.strokeRect(view.start / L * W + 0.5, 0.5, Math.max(2, view.span / L * W), H - 1);
	ctx.fillStyle = C.play;
	ctx.fillRect(now / L * W - 1, 0, 2, H);
}

function frame() {
	requestAnimationFrame(frame);                 // first, so one bad frame never stops the loop
	const now = clock();
	$('clock').textContent = LRC.fmt(now) + ' / ' + LRC.fmt(length()) + (rate !== 1 ? '  ×' + rate : '');
	$('btnPlay').textContent = audio.paused ? '▶' : '❚❚';
	updatePlaying(now);
	updatePreview(now);
	loopCheck(now);
	$('btnLoop').classList.toggle('on', !!loop);
	drawTimeline(now);
	drawOverview(now);
}

// ---------------------------------------------------------------- input

function typing(e) {
	const t = e.target;
	return t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox') || $('dlgNew').open || $('dlgReset').open ||
		$('dlgFolder').open;
}

// times of the marked word change only inside edit mode (or while repairing / tapping)
function canTime() {
	if ((tapMode() && !edit) || (edit && sel && sel.li === edit.li)) return true;
	if (edit) lockedHint(); else hint('Zum Ändern erst die Zeile öffnen: ✎ Zeile bearbeiten (B).');
	return false;
}

window.addEventListener('keydown', e => {
	const k = e.key, low = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
	if (ctrl && low === 's') { e.preventDefault(); save(e.shiftKey); return; }
	if (typing(e)) return;
	if (ctrl && low === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
	if (ctrl && (low === 'y' || (low === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
	if (k === ' ') { e.preventDefault(); if (!e.repeat) spaceDown(); return; }
	if (ctrl && !e.shiftKey) return;
	let used = true;
	if (k === 'Backspace') backTap();
	else if (low === 'e') { if (edit || tapMode()) endNow(); else canTime(); }
	else if (low === 'p') audio.paused ? play() : pause();
	else if (k === 'Escape') {
		if (loop && loop.kind !== 'zone') { loop = null; pause(); } else if (edit) endEdit(false); else { loop = null; pause(); }
	}
	else if (low === 'b') startEdit();
	else if (low === 'l') toggleLoop();
	else if (low === 'n') nextProblem(e.shiftKey ? -1 : 1);
	else if (low === 'r') startRepair();
	else if (low === 'v') setVoice();
	else if (low === 't') {
		$('tapMode').checked = !tapMode();
		saveTapMode();
	}
	else if (k === 'Enter') edit ? endEdit(true) : playFromSel();
	else if (k === 'ArrowLeft' || k === 'ArrowRight') {
		const d = k === 'ArrowLeft' ? -1 : 1;
		if (e.shiftKey) { if (canTime()) nudge(d * (ctrl ? 0.1 : 0.01)); } else moveSel(d);
	} else if (low === 's') { if (canTime()) setSelTime(LRC.q(clock())); }
	else if (k === 'Delete') { if (canTime()) setSelTime(null); }
	else if (k === 'F2') editToken();
	else if (k >= '1' && k <= '4' && k.length === 1) setRate([1, 0.75, 0.5, 0.25][+k - 1]);
	else used = false;
	if (used) e.preventDefault();
}, true);

// Space: play / pause. Right after setting a word with the mouse (or a right click) it plays that point once
// more instead, as often as you like, until normal playback starts. In tap mode (T) or while repairing: set the
// marked word now.
function spaceDown() {
	if (edit) { if (audio.paused || snip) playZone(); else pause(); return; }
	if (tapMode()) { tapDown(); return; }
	if ((audio.paused || snip) && replayT != null && !loopOn()) { audition(replayT); return; }
	audio.paused ? play() : pause();
}

window.addEventListener('keyup', e => {
	if (e.key === ' ' && !typing(e)) { e.preventDefault(); if (!edit && tapMode()) tapUp(); }
}, true);

function saveTapMode() {
	try { localStorage.setItem('lrcEditorTapMode', tapMode() ? '1' : ''); } catch (e) { /* ignore */ }
	hint(tapMode() ? 'Leertaste tippt: läuft das Lied, setzt sie das markierte Wort.' : 'Leertaste = Abspielen / Pause.');
}

// buttons and checkboxes must not keep the focus, or Space would press them
document.addEventListener('click', e => { if (e.target.closest('button, input[type=checkbox]')) e.target.blur(); });
document.addEventListener('change', e => { if (e.target.type === 'checkbox') e.target.blur(); });

$('words').addEventListener('click', e => {
	const btn = e.target.closest('button[data-act]');
	if (!btn && e.target.closest('.ln')) {
		pickLine(+e.target.closest('.line').dataset.li, e);
		return;
	}
	if (btn) {
		const li = +btn.closest('.line').dataset.li;
		if (edit && !(btn.dataset.act === 'edit' && li === edit.li)) { lockedHint(); return; }
		({edit: editLine, add: addLine, del: delLine})[btn.dataset.act](li);
		return;
	}
	const el = e.target.closest('.tok, .endmark'), row = e.target.closest('.line');
	if (!el && !row) return;
	const li = +(el || row).dataset.li;
	if (edit && li !== edit.li) { lockedHint(); return; }
	if (edit) edit.free = false;                  // a word of the open line: it hangs at the mouse again
	if (el) setSel({li, ti: +el.dataset.ti, end: !!el.dataset.end}, false);
	else if (doc.lines[li].tokens.length) setSel({li, ti: 0, end: false}, false);
	showLine(li);
	if (audio.paused) { const t = selTime(); if (t != null) seek(Math.max(0, t - 0.05)); }
});

// right click in the word list: select the word (or the line) and listen from there
$('words').addEventListener('contextmenu', e => {
	const el = e.target.closest('.tok, .endmark'), row = e.target.closest('.line');
	if (!el && !row) return;
	e.preventDefault();
	const li = +(el || row).dataset.li;
	if (edit && li !== edit.li) { lockedHint(); return; }
	if (!doc.lines[li].tokens.length) return;
	setSel(el ? {li, ti: +el.dataset.ti, end: !!el.dataset.end} : {li, ti: 0, end: false}, false);
	showLine(li);
	const t = selTime();
	if (t != null && !(loopOn() && !audio.paused)) audition(t);
});

function showLine(li) {
	const r = lineRange(li);
	if (r && (r.a < view.start || r.b > view.start + view.span)) view.start = Math.max(0, r.a - Math.min(1.5, view.span * 0.2));
}

$('words').addEventListener('dblclick', e => {
	const el = e.target.closest('.tok');
	if (el) editToken({li: +el.dataset.li, ti: +el.dataset.ti, end: false});
});

$('issues').addEventListener('click', e => {
	const el = e.target.closest('.issue');
	if (!el) return;
	const [li, ti, end] = el.dataset.k.split(':');
	setSel({li: +li, ti: +ti, end: end === 'e'});
	const t = selTime();
	if (t != null) { view.start = Math.max(0, t - view.span * 0.4); if (audio.paused) seek(Math.max(0, t - 0.05)); }
});

// timeline: click = jump there (near a mark: mark that word), drag = scroll, wheel = zoom, right click = listen.
// Edit mode: left click sets the hanging word (Ctrl+click only jumps), marks of the open line can be dragged.
const tl = $('timeline');
const tlTime = x => LRC.q(Math.max(0, view.start + x / tl.clientWidth * view.span));
tl.addEventListener('contextmenu', e => e.preventDefault());
tl.addEventListener('mousemove', e => {
	hoverX = e.offsetX;
	if (!drag) tl.style.cursor = tlCursor(e.offsetX, e.offsetY);
});

// what a press would do here: edges resize (ew-resize), word and line boxes move (grab), else the CSS default
function tlCursor(x, y) {
	const open = li => !edit || edit.li === li;
	if (y >= LANE_Y - 1) {
		const b = lanes.find(l => x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1);
		return b && open(b.li) ? 'grab' : '';
	}
	if (edit && edit.zone) {
		const ex = t => (t - view.start) / view.span * tl.clientWidth;
		if (Math.abs(ex(edit.zone.a) - x) < 7 || Math.abs(ex(edit.zone.b) - x) < 7) return 'ew-resize';
	}
	const m = marks.find(o => Math.abs(o.x - x) < 7);
	if (m) return open(m.li) ? 'ew-resize' : '';
	const b = bodies.find(o => x > o.x0 + 4 && x < o.x1 - 4 && y >= o.y0 && y <= o.y1);
	return b && open(b.li) ? 'grab' : '';
}

// while a box (word, word edge, line) is dragged, its start plays briefly like a right click whenever the mouse
// rests, and once more when it is let go
let dragSnipTimer = 0;
function dragSnip(t, now = false) {
	clearTimeout(dragSnipTimer);
	if (t == null || !audio.src) return;
	if (now) audition(t); else dragSnipTimer = setTimeout(() => { if (drag) audition(t); }, 140);
}

// a word box dragged: the word keeps its length and cannot pass the word before it. Moved right it pushes the
// start of the next word ahead of it; moved left it leaves a pause after it. Always computed from the line as it
// was at the press, so going back and forth leaves nothing behind.
function moveWord(h, dt) {
	const ln = doc.lines[h.li], o = drag.w, ok = o[h.ti], prev = o[h.ti - 1], next = o[h.ti + 1];
	ln.tokens.forEach((x, i) => { x.t = o[i].t; x.end = o[i].end; });
	let lo = -ok.t, hi = Infinity;
	if (prev && prev.t != null) lo = Math.max(lo, prev.t + 0.05 - ok.t);
	if (next && next.t != null && drag.nb0 != null && drag.b0 != null) hi = Math.max(lo, drag.nb0 - 0.05 - drag.b0);
	dt = LRC.q(Math.max(lo, Math.min(hi, dt)));
	const k = ln.tokens[h.ti];
	k.t = LRC.q(ok.t + dt);
	if (prev && prev.end != null && prev.end > k.t) ln.tokens[h.ti - 1].end = k.t;
	if (drag.b0 == null) return;
	const e = LRC.q(drag.b0 + dt);
	if (ok.end != null || !next || next.t == null) {        // own end (or the suggested one): it moves along
		if (drag.e0 != null) k.end = e;
		return;
	}
	if (e >= next.t) ln.tokens[h.ti + 1].t = e;
	else k.end = e;
}

// a line box dragged sideways: all its times move together, it stops at the lines before and after it, and it
// loops meanwhile so you hear where it sits. A click without moving marks the line (its first problem) as before.
function dragLine(li, x0) {
	const ln = doc.lines[li], o = JSON.parse(JSON.stringify(ln)), W = tl.clientWidth;
	const times = [o.t, ...o.tokens.flatMap(k => [k.t, k.end])].filter(t => t != null);
	let lo = times.length ? -Math.min(...times) : 0, hi = Infinity;
	if (times.length && !LRC.isBg(ln)) {
		const main = i => doc.lines[i] && !doc.lines[i].brk && !LRC.isBg(doc.lines[i]);
		for (let i = li - 1; i >= 0; i--) {
			if (!main(i)) continue;
			const ts = doc.lines[i].tokens.flatMap(k => [k.t, k.end]).filter(t => t != null);
			if (ts.length) { lo = Math.max(lo, Math.max(...ts) + 0.05 - Math.min(...times)); break; }
		}
		for (let i = li + 1; i < doc.lines.length; i++) {
			if (!main(i)) continue;
			const t = LRC.lineTime(doc.lines[i]);
			if (t != null) { hi = t - 0.05 - Math.max(...times); break; }
		}
		lo = Math.min(lo, 0);                     // already overlapping: it never jumps, it only cannot get worse
		hi = Math.max(hi, 0);
	}
	const z0 = edit && edit.zone ? {...edit.zone} : null;
	drag = {x0, start0: view.start, line: li, moved: false, undo: false};
	const move = ev => {
		const xx = ev.clientX - tl.getBoundingClientRect().left;
		if (Math.abs(xx - x0) > 3 && times.length) drag.moved = true;
		if (!drag.moved) return;
		if (!drag.undo) {
			pushUndo();
			drag.undo = true;
			tl.style.cursor = 'grabbing';
			if (!edit) setSel({li, ti: 0, end: false});
		}
		const dt = LRC.q(Math.max(lo, Math.min(hi, (xx - x0) / W * view.span)));
		const sh = t => t == null ? t : LRC.q(t + dt);
		if (o.t != null) ln.t = sh(o.t);
		ln.tokens.forEach((k, i) => { k.t = sh(o.tokens[i].t); k.end = sh(o.tokens[i].end); });
		if (z0) Object.assign(edit.zone, {a: Math.max(0, z0.a + dt), b: z0.b + dt, a0: z0.a0 + dt});
		recalc();
		dragSnip(LRC.lineTime(ln));
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		tl.style.cursor = '';
		const moved = drag.moved;
		drag = null;
		if (moved) { changed(); dragSnip(LRC.lineTime(ln), true); return; }
		if (edit) return;
		const looping = !!loop;
		goLine(li);
		if (looping) setLoop(li);
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}
tl.addEventListener('mouseleave', () => { hoverX = null; });
tl.addEventListener('mousedown', e => {
	const x = e.offsetX, y = e.offsetY;
	if (e.button === 2) {
		audition(tlTime(x));
		return;
	}
	if (e.button !== 0) return;
	if (y >= LANE_Y - 1) {                       // line box: click = mark that line, drag = move the whole line
		const b = lanes.find(l => x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1) ||
			lanes.find(l => x >= l.x0 && x <= l.x1);
		if (b && edit && b.li !== edit.li) lockedHint();
		else if (b) dragLine(b.li, x);
		return;
	}
	let hit = null, bd = 7;
	for (const m of marks) {
		const d = Math.abs(m.x - x) - (sel && m.li === sel.li && m.ti === sel.ti && m.end === !!sel.end ? 2 : 0);
		if (d < bd) { bd = d; hit = m; }
	}
	if (!hit) {                                  // inside a word box: move the whole word
		const b = bodies.find(o => x > o.x0 + 4 && x < o.x1 - 4 && y >= o.y0 && y <= o.y1);
		if (b) hit = {li: b.li, ti: b.ti, end: false, body: true};
	}
	if (hit && !edit) {                          // a word of a closed line: marked, and it moves at once (no OK needed)
		setSel({li: hit.li, ti: hit.ti, end: hit.end}, false);
		if (e.ctrlKey || e.metaKey) hit = null;   // Ctrl+click only jumps
	}
	if (hit && edit && !editing(hit.li)) hit = null;    // another line is open: locked
	let zoneEdge = null;
	if (!hit && edit && edit.zone) {
		const W0 = tl.clientWidth, ex = t => (t - view.start) / view.span * W0;
		if (Math.abs(ex(edit.zone.a) - x) < 7) zoneEdge = 'a'; else if (Math.abs(ex(edit.zone.b) - x) < 7) zoneEdge = 'b';
	}
	if (!hit && edit && !zoneEdge && y < LANE_Y - 1 && !placing()) {    // empty spot outside the open line: nothing to set
		const b = lanes.find(l => x >= l.x0 && x <= l.x1);
		if (b && b.li !== edit.li) { lockedHint(); return; }
	}
	if (!hit && !edit && y < LANE_Y - 1) {      // empty spot above a line box: that line is marked
		const b = lanes.find(l => x >= l.x0 && x <= l.x1);
		if (b && (!sel || sel.li !== b.li)) setSel({li: b.li, ti: 0, end: false}, true);
	}
	const k0 = hit && doc.lines[hit.li].tokens[hit.ti];
	const last0 = hit && hit.ti === doc.lines[hit.li].tokens.length - 1;
	drag = {x0: x, start0: view.start, hit, zoneEdge, moved: false, undo: false, ctrl: e.ctrlKey || e.metaKey,
		t0: k0 ? k0.t : null, e0: k0 ? (k0.end != null ? k0.end : last0 && sugg.has(hit.li) ? sugg.get(hit.li) : null) : null};
	if (hit && hit.body) {
		drag.w = JSON.parse(JSON.stringify(doc.lines[hit.li].tokens));
		drag.b0 = boxEnd(hit.li, hit.ti);
		drag.nb0 = last0 ? null : boxEnd(hit.li, hit.ti + 1);
		tl.style.cursor = 'grabbing';
	}
	const W = tl.clientWidth;
	const move = ev => {
		const xx = ev.clientX - tl.getBoundingClientRect().left;
		if (Math.abs(xx - drag.x0) > 3) drag.moved = true;
		if (!drag.moved) return;
		const t = LRC.q(Math.max(0, view.start + xx / W * view.span));
		if (drag.zoneEdge) {
			const z = edit.zone;
			if (drag.zoneEdge === 'a') {
				z.a = Math.min(t, z.b - 0.5);
				$('preRoll').value = Math.max(0, z.a0 - z.a).toFixed(1);
				try { localStorage.setItem('lrcEditorPreRoll0', $('preRoll').value); } catch (er) { /* ignore */ }
			} else z.b = Math.max(t, z.a + 0.5);
		} else if (drag.hit) {
			if (!drag.undo) { pushUndo(); drag.undo = true; }
			const h = drag.hit, k = doc.lines[h.li].tokens[h.ti];
			if (h.body) moveWord(h, (xx - drag.x0) / W * view.span);
			else if (h.end) k.end = t; else k.t = t;
			recalc();
			dragSnip(doc.lines[h.li].tokens[h.ti].t);
		} else {
			view.start = Math.max(0, drag.start0 - (xx - drag.x0) / W * view.span);
		}
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		tl.style.cursor = '';
		if (drag.hit && drag.moved) {
			changed();
			dragSnip(doc.lines[drag.hit.li].tokens[drag.hit.ti].t, true);
		}
		else if (drag.zoneEdge && drag.moved) { /* loop box changed */ }
		else if (!drag.moved && drag.hit && drag.hit.body) {   // click into a word box: mark it (hangs at the mouse again)
			if (edit) edit.free = false;
			setSel({li: drag.hit.li, ti: drag.hit.ti, end: false});
		}
		else if (!drag.moved && placing() && !drag.ctrl) placeAt(tlTime(drag.x0));
		else if (!drag.moved && drag.hit) {          // nothing hanging: pick this mark (to set it again in edit mode)
			if (edit) edit.free = false;
			setSel({li: drag.hit.li, ti: drag.hit.ti, end: drag.hit.end});
		} else if (!drag.moved) seek(view.start + drag.x0 / W * view.span);
		drag = null;
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
});

tl.addEventListener('dblclick', e => {           // double click on a line box: open it
	if (e.offsetY < LANE_Y - 1) return;
	const b = lanes.find(l => e.offsetX >= l.x0 && e.offsetX <= l.x1);
	if (b) startEdit(b.li);
});

tl.addEventListener('wheel', e => {
	e.preventDefault();
	const W = tl.clientWidth;
	if (e.shiftKey) {
		view.start = Math.max(0, view.start + (e.deltaY || e.deltaX) / W * view.span);
		return;
	}
	const at = view.start + e.offsetX / W * view.span;
	view.span = Math.max(1, Math.min(180, view.span * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
	view.start = Math.max(0, at - e.offsetX / W * view.span);
}, {passive: false});

const ov = $('overview');
const ovSeek = e => {
	const t = e.offsetX / ov.clientWidth * length();
	view.start = Math.max(0, t - view.span * 0.3);
	seek(t);
};
ov.addEventListener('mousedown', e => {
	ovSeek(e);
	const mv = ev => ovSeek({offsetX: ev.clientX - ov.getBoundingClientRect().left});
	const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
	window.addEventListener('mousemove', mv);
	window.addEventListener('mouseup', up);
});

// header
$('btnAudio').onclick = () => $('fileAudio').click();
$('fileAudio').onchange = e => { if (e.target.files[0]) loadAudio(e.target.files[0]); e.target.value = ''; };
$('btnOpen').onclick = openLrc;
$('fileLrc').onchange = e => { if (e.target.files[0]) loadLrcFile(e.target.files[0]); e.target.value = ''; };
$('btnSave').onclick = () => save(false);
$('btnSaveAs').onclick = () => save(true);
$('btnPlay').onclick = () => audio.paused ? play() : pause();
try { loopMode = localStorage.getItem('lrcEditorLoopMode') !== '0'; } catch (e) { /* ignore */ }
$('btnLoopMode').classList.toggle('on', loopMode);
$('btnLoopMode').onclick = () => setLoopMode(!loopMode);
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;
$('btnRepair').onclick = () => repair ? endEdit(false) : startRepair();
$('btnVoice').onclick = setVoice;
$('btnEdit').onclick = () => startEdit();
$('btnOk').onclick = () => endEdit(true);
$('btnCancel').onclick = () => endEdit(false);
$('btnLoop').onclick = toggleLoop;
$('btnNext').onclick = () => nextProblem(1);
$('btnReset').onclick = () => { $('dlgReset').returnValue = ''; $('dlgReset').showModal(); };
$('dlgReset').addEventListener('close', () => resetDoc($('dlgReset').returnValue));
$('tapMode').onchange = saveTapMode;
$('endGap').onchange = () => {
	try { localStorage.setItem('lrcEditorEndGap', $('endGap').value); } catch (e) { /* ignore */ }
	changed(false);
};
try { const g = localStorage.getItem('lrcEditorEndGap'); if (g) $('endGap').value = g; } catch (e) { /* ignore */ }
for (const [id, key] of [['snipLen', 'lrcEditorSnip'], ['loopPad', 'lrcEditorLoopPad'], ['preRoll', 'lrcEditorPreRoll0']]) {
	$(id).onchange = () => { try { localStorage.setItem(key, $(id).value); } catch (e) { /* ignore */ } };
	try { const s = localStorage.getItem(key); if (s) $(id).value = s; } catch (e) { /* ignore */ }
}
$('autoLoop').onchange = () => { try { localStorage.setItem('lrcEditorAutoLoop', $('autoLoop').checked ? '1' : '0'); } catch (e) { /* ignore */ } };
try {
	$('autoLoop').checked = localStorage.getItem('lrcEditorAutoLoop') !== '0';
	$('tapMode').checked = localStorage.getItem('lrcEditorTapMode') === '1';
} catch (e) { /* ignore */ }
$('voiceFilter').onchange = applyFilter;
$('maxGap').onchange = () => {
	try { localStorage.setItem('lrcEditorMaxGap', $('maxGap').value); } catch (e) { /* ignore */ }
	changed(false);
};
try { const g = localStorage.getItem('lrcEditorMaxGap'); if (g) $('maxGap').value = g; } catch (e) { /* ignore */ }
$('btnHelp').onclick = () => { $('help').hidden = !$('help').hidden; $('btnHelp').classList.toggle('on', !$('help').hidden); };
document.querySelectorAll('.speed').forEach(b => { b.onclick = () => setRate(+b.dataset.rate); });

$('btnNew').onclick = () => {
	if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
	newTarget = null;
	openNew('', '');
};

function openNew(ti, ar) {
	$('newTi').value = ti;
	$('newAr').value = ar;
	$('newText').value = '';
	$('dlgNew').showModal();
}
$('dlgNew').addEventListener('close', () => {
	if ($('dlgNew').returnValue !== 'ok' || !$('newText').value.trim()) return;
	setDoc(LRC.fromText($('newText').value, [['ti', $('newTi').value.trim()], ['ar', $('newAr').value.trim()]]), '', null);
	dirty = true;
	renderInfo();
	if (newTarget) { hint('Neue LRC für „' + audioName + '“. Speichern legt „' + newTarget.name + '“ im Ordner an. ' +
		'Zeile auswählen und ✎ Zeile bearbeiten (B): Rechtsklick spielt an, Linksklick setzt, OK übernimmt.'); return; }
	hint('Jetzt Audio laden. Dann Zeile auswählen und ✎ Zeile bearbeiten (B): Rechtsklick in die Zeitleiste spielt an, Linksklick setzt, OK übernimmt.');
});

document.querySelectorAll('#meta input').forEach(inp => {
	inp.addEventListener('input', () => {
		const key = inp.dataset.key, v = inp.value.trim();
		const m = doc.meta.find(x => x[0] === key);
		if (m && v) m[1] = v;
		else if (m) doc.meta = doc.meta.filter(x => x !== m);
		else if (v) doc.meta.push([key, v]);
		dirty = true;
		renderInfo();
		saveDraftSoon();
	});
});

$('fixSame').onclick = () => {
	pushUndo();
	const n = LRC.spreadSame(doc);
	if (n) changed(); else undoStack.pop();
	hint(n ? n + ' Wörter verteilt – bitte nachhören.' : 'Keine gleichen Zeiten gefunden.');
};
$('fixEnds').onclick = () => {
	pushUndo();
	const n = LRC.guessEnds(doc);
	if (n) changed(); else undoStack.pop();
	hint(n ? n + ' Zeilenenden geschätzt – bitte nachhören.' : 'Kein Zeilenende fehlt.');
};

document.querySelectorAll('.tab').forEach(b => {
	b.onclick = () => {
		document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
		const raw = b.dataset.tab === 'raw';
		$('words').hidden = raw;
		$('raw').hidden = !raw;
		if (raw) $('rawText').value = LRC.write(doc);
	};
});
$('rawApply').onclick = () => {
	pushUndo();
	edit = null;
	const d = LRC.parse($('rawText').value);
	doc.meta = d.meta;
	doc.lines = d.lines;
	sel = null;
	clearPicked();
	renderMeta();
	changed();
	document.querySelector('.tab[data-tab="words"]').click();
};

// ---------------------------------------------------------------- folder: which audio belongs to which LRC
//
// Pairs by file name (without extension, "_enhanced" etc. ignored), in any subfolder. With the folder
// picker (Chrome / Edge) a new LRC is written straight into the folder; otherwise the files are only read.

const AUDIO_RE = /\.(mp3|wav|flac|m4a|aiff?|ogg)$/i, LRC_RE = /\.lrc$/i;

async function openFolder() {
	if (window.showDirectoryPicker) {
		try {
			const dir = await showDirectoryPicker({id: 'juicyLrc', mode: 'readwrite'});
			const files = [];
			await walk(dir, '', files, 0);
			setFolder(dir.name, files);
			return;
		} catch (e) {
			if (e.name === 'AbortError') return;
			console.warn('folder picker failed, using the file input', e);
		}
	}
	$('fileFolder').click();
}

async function walk(dir, path, out, depth) {
	for await (const [name, h] of dir.entries()) {
		if (h.kind === 'directory') { if (depth < 4 && !name.startsWith('.')) await walk(h, path + name + '/', out, depth + 1); }
		else if (AUDIO_RE.test(name) || LRC_RE.test(name)) out.push({name, path: path + name, dir, handle: h, get: () => h.getFile()});
	}
}

function setFolder(name, files) {
	const by = new Map();
	for (const f of files) {
		const key = cleanStem(stemOf(f.name)).toLowerCase();
		if (!by.has(key)) by.set(key, {key, audio: [], lrc: []});
		by.get(key)[AUDIO_RE.test(f.name) ? 'audio' : 'lrc'].push(f);
	}
	const anyLrc = files.find(f => LRC_RE.test(f.name) && f.dir);   // new LRCs go where the others are
	folder = {name, songs: [...by.values()].sort((a, b) => a.key.localeCompare(b.key)), lrcDir: anyLrc ? anyLrc.dir : null};
	renderFolder();
	$('dlgFolder').showModal();
}

// a new LRC was saved into the folder: show it in the list
function folderAdd(h) {
	if (!folder || !newTarget) return;
	const key = cleanStem(stemOf(h.name)).toLowerCase();
	let s = folder.songs.find(x => x.key === key);
	if (!s) folder.songs.push(s = {key, audio: [], lrc: []});
	if (!s.lrc.some(f => f.name === h.name))
		s.lrc.push({name: h.name, path: h.name, dir: newTarget.dir, handle: h, get: () => h.getFile()});
}

function renderFolder() {
	const songs = folder.songs, noLrc = songs.filter(s => s.audio.length && !s.lrc.length).length;
	const noAudio = songs.filter(s => !s.audio.length).length, twice = songs.filter(s => s.lrc.length > 1).length;
	$('folderName').textContent = folder.name;
	$('folderSum').textContent = songs.length + ' Songs · ' + (songs.length - noLrc - noAudio) + ' komplett' +
		(noLrc ? ' · ' + noLrc + ' ohne LRC' : '') + (noAudio ? ' · ' + noAudio + ' LRC ohne Audio' : '') +
		(twice ? ' · ' + twice + ' mit mehreren LRCs' : '');
	$('folderList').innerHTML = songs.map((s, i) => {
		const a = s.audio[0], l = s.lrc[0];
		const state = !s.audio.length ? '<span class="fs warn">kein Audio</span>' : !s.lrc.length ? '<span class="fs err">keine LRC</span>' :
			s.lrc.length > 1 ? '<span class="fs warn">' + s.lrc.length + ' LRCs</span>' : '<span class="fs ok">✓</span>';
		const btn = s.audio.length && !s.lrc.length ? '<button type="button" data-i="' + i + '" data-act="new">LRC erstellen</button>' :
			'<button type="button" data-i="' + i + '" data-act="open">Öffnen</button>';
		return '<div class="frow">' + state + '<span class="fn" title="' + esc((a || l).path) + '">' + esc(stemOf((a || l).name)) +
			'</span><span class="fd">' + (l ? esc(l.path) : '–') + '</span>' + btn + '</div>';
	}).join('') || '<p>Keine Audio- oder LRC-Dateien gefunden.</p>';
}

async function openSong(s, create) {
	if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
	dirty = false;
	$('dlgFolder').close();
	if (s.audio.length) await loadAudio(await s.audio[0].get());
	if (s.lrc.length) {
		await loadLrcFile(await s.lrc[0].get(), s.lrc[0].handle || null);
		if (s.lrc.length > 1) hint('Achtung: ' + s.lrc.length + ' LRCs für diesen Song (' + s.lrc.map(f => f.path).join(', ') +
			'). Player nehmen nur eine – die übrigen bitte löschen.');
		return;
	}
	if (!create && !confirm('Für „' + s.audio[0].name + '“ gibt es noch keine LRC. Jetzt eine erstellen?')) return;
	const st = stemOf(s.audio[0].name), m = st.match(/^(.+?)\s+-\s+(.+)$/);
	newTarget = {dir: folder.lrcDir || s.audio[0].dir, name: st + '.lrc'};
	openNew(m ? m[2] : st, m ? m[1] : '');
}

$('btnFolder').onclick = () => folder ? (renderFolder(), $('dlgFolder').showModal()) : openFolder();
$('folderOther').onclick = () => { $('dlgFolder').close(); openFolder(); };
$('fileFolder').onchange = e => {
	const files = [...e.target.files].filter(f => AUDIO_RE.test(f.name) || LRC_RE.test(f.name))
		.map(f => ({name: f.name, path: f.webkitRelativePath || f.name, dir: null, handle: null, get: async () => f}));
	const top = e.target.files[0] ? (e.target.files[0].webkitRelativePath || '').split('/')[0] : '';
	e.target.value = '';
	setFolder(top || 'Ordner', files);
};
$('folderList').addEventListener('click', e => {
	const b = e.target.closest('button[data-i]');
	if (b) openSong(folder.songs[+b.dataset.i], b.dataset.act === 'new');
});

// drag & drop of audio / lrc
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; document.body.classList.add('drop'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
	e.preventDefault();
	dragDepth = 0;
	document.body.classList.remove('drop');
	for (const f of e.dataTransfer.files) {
		if (/\.(lrc|txt)$/i.test(f.name)) loadLrcFile(f);
		else if (f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aiff?|ogg)$/i.test(f.name)) loadAudio(f);
	}
});

window.addEventListener('beforeunload', e => {
	if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

for (const [k, v] of [['dim', '--dim'], ['err', '--err'], ['ok', '--ok'], ['sung', '--sung'], ['cursor', '--cursor'], ['warn', '--warn'],
	['accent', '--accent'], ['text', '--text'], ['textHi', '--text-hi'], ['mark', '--mark'], ['lane', '--lane'], ['wave', '--wave'],
	['bgv', '--bgv'], ['bgvDim', '--bgv-dim'], ['play', '--play'], ['ink', '--ink']]) C[k] = css(v);
setRate(1);
changed(false);
checkDraft();
requestAnimationFrame(frame);

// ---------------------------------------------------------------- bubbles: deleted things burst into rising soap bubbles
// One fixed canvas over the page, drawn only while bubbles are alive. Each bubble is a pre-rendered sprite
// (thin iridescent rim, soft inside, highlight), so even a few hundred stay cheap.
const fx = {cv: null, ctx: null, list: [], run: false, last: 0, sprites: null};
const bubblesOn = () => $('bubblesOn').checked && !matchMedia('(prefers-reduced-motion: reduce)').matches;

function bubbleSprites() {
	const out = [];
	for (const hue of [195, 280, 330, 25, 160]) {
		const c = document.createElement('canvas'), s = 64, g = c.getContext('2d');
		c.width = c.height = s;
		const r = s / 2 - 1;
		let gr = g.createRadialGradient(s / 2, s / 2, r * 0.45, s / 2, s / 2, r);
		gr.addColorStop(0, 'hsla(' + hue + ',100%,80%,0.06)');
		gr.addColorStop(0.7, 'hsla(' + hue + ',100%,75%,0.3)');
		gr.addColorStop(0.9, 'hsla(' + (hue + 60) + ',100%,82%,1)');
		gr.addColorStop(1, 'hsla(' + (hue + 120) + ',100%,85%,0)');
		g.fillStyle = gr;
		g.beginPath();
		g.arc(s / 2, s / 2, r, 0, Math.PI * 2);
		g.fill();
		gr = g.createRadialGradient(s * 0.36, s * 0.32, 0, s * 0.36, s * 0.32, r * 0.35);
		gr.addColorStop(0, 'rgba(255,255,255,0.95)');
		gr.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = gr;
		g.fillRect(0, 0, s, s);
		out.push(c);
	}
	return out;
}

function burst(x, y, w, h, n) {
	if (!bubblesOn()) return;
	if (!fx.cv) {
		fx.cv = $('fx');
		fx.ctx = fx.cv.getContext('2d');
		fx.sprites = bubbleSprites();
	}
	n = Math.min(n, 700 - fx.list.length);
	for (let i = 0; i < n; i++) {
		const big = Math.random() < 0.18;
		fx.list.push({
			x: x + Math.random() * w, y: y + Math.random() * h,
			r: big ? 11 + Math.random() * 9 : 4 + Math.random() * 6,
			vx: (Math.random() - 0.5) * 60, vy: -(30 + Math.random() * 70),
			ph: Math.random() * 6.3, wob: 0.6 + Math.random() * 1.6,
			age: -Math.random() * 0.12, life: 1.1 + Math.random() * 1.5,
			sp: fx.sprites[(Math.random() * fx.sprites.length) | 0],
		});
	}
	if (!fx.run) {
		fx.run = true;
		fx.last = performance.now();
		requestAnimationFrame(fxFrame);
	}
}

function fxFrame(ts) {
	const dt = Math.max(0, Math.min(0.05, (ts - fx.last) / 1000));
	fx.last = ts;
	const cv = fx.cv, dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
	if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
		cv.width = Math.round(W * dpr);
		cv.height = Math.round(H * dpr);
	}
	const g = fx.ctx;
	g.setTransform(dpr, 0, 0, dpr, 0, 0);
	g.clearRect(0, 0, W, H);
	fx.list = fx.list.filter(b => {
		b.age += dt;
		if (b.age < 0) return true;
		const k = b.age / b.life;
		if (k >= 1) return false;
		b.vy -= 40 * dt;                               // buoyancy: they speed up while rising
		b.vx *= 1 - 1.5 * dt;
		b.x += (b.vx + Math.sin(b.ph + b.age * 5 * b.wob) * 22) * dt;
		b.y += b.vy * dt;
		const r = b.r * (0.4 + 0.6 * Math.min(1, b.age * 8)) * (1 + k * 0.25);
		if (k > 0.9) {                                 // pop: a quick ring
			const q = (k - 0.9) / 0.1;
			g.globalAlpha = 0.6 * (1 - q);
			g.strokeStyle = '#fff';
			g.lineWidth = 1;
			g.beginPath();
			g.arc(b.x, b.y, r * (1 + q * 0.8), 0, Math.PI * 2);
			g.stroke();
		} else {
			g.globalAlpha = Math.min(1, b.age * 10) * (k > 0.7 ? 1 - (k - 0.7) * 1.5 : 1);
			const sx = 1 + Math.sin(b.ph + b.age * 9) * 0.06;  // a little wobble
			g.drawImage(b.sp, b.x - r * sx, b.y - r / sx, r * 2 * sx, r * 2 / sx);
		}
		return true;
	});
	g.globalAlpha = 1;
	if (fx.list.length) requestAnimationFrame(fxFrame);
	else { fx.run = false; g.clearRect(0, 0, W, H); }
}

// an element about to disappear: a copy squishes and fades where it was, bubbles rise out of it
function popEl(el) {
	if (!el || !bubblesOn()) return;
	const r = el.getBoundingClientRect();
	if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
	const ghost = el.cloneNode(true);
	ghost.classList.add('popping');
	Object.assign(ghost.style, {left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'});
	document.body.appendChild(ghost);
	setTimeout(() => ghost.remove(), 400);
	burst(r.left, r.top, r.width, r.height, Math.max(3, Math.min(35, Math.round(r.width * r.height / 180))));
}

// a deleted mark in the timeline: bubbles rise out of its line
function popMark(t) {
	const r = $('timeline').getBoundingClientRect();
	const x = r.left + (t - view.start) / view.span * r.width;
	if (x < r.left || x > r.right) return;
	burst(x - 4, r.top + 10, 8, LANE_Y - 14, 11);
}

// reset of all word times: every visible timed word gives a few bubbles, the timeline a cloud
function popAll() {
	if (!bubblesOn()) return;
	let n = 0;
	for (const row of tokEls) for (const el of row || []) {
		if (n >= 120 || !el || el.classList.contains('unset')) continue;
		const r = el.getBoundingClientRect();
		if (r.bottom > 0 && r.top < innerHeight) { n++; burst(r.left, r.top, r.width, r.height, 2); }
	}
	const c = $('timeline').getBoundingClientRect();
	burst(c.left, c.top, c.width, LANE_Y, 40);
}

// ---------------------------------------------------------------- splash: Juicy and the start jingle
// Browsers only let a page make sound after a click or key, so if the jingle is blocked the splash waits for one.
(function splash() {
	const el = $('splash'), box = $('jingleOn');
	let on = true;
	try { on = localStorage.getItem('lrcEditorJingle') !== '0'; } catch (e) { /* ignore */ }
	box.checked = on;
	box.onchange = () => {
		try { localStorage.setItem('lrcEditorJingle', box.checked ? '1' : '0'); } catch (e) { /* ignore */ }
	};
	const bub = $('bubblesOn');
	try { bub.checked = localStorage.getItem('lrcEditorBubbles') !== '0'; } catch (e) { /* ignore */ }
	bub.onchange = () => {
		try { localStorage.setItem('lrcEditorBubbles', bub.checked ? '1' : '0'); } catch (e) { /* ignore */ }
		const r = bub.getBoundingClientRect();
		if (bub.checked) burst(r.left, r.top, r.width, r.height, 15);
	};
	const snd = new Audio('assets/jingle.wav');
	snd.volume = 0.8;
	let gone = false, timer = 0;
	const close = () => {
		if (gone) return;
		gone = true;
		clearTimeout(timer);
		el.classList.add('out');
		window.removeEventListener('keydown', key, true);
		setTimeout(() => el.remove(), 650);
	};
	const go = () => {
		if (on && snd.paused && !el.classList.contains('playing')) snd.play().catch(() => {});
		close();
	};
	const key = e => { e.preventDefault(); e.stopPropagation(); go(); };
	window.addEventListener('keydown', key, true);
	el.addEventListener('click', go);
	if (!on) { timer = setTimeout(close, 1400); return; }
	snd.play().then(() => {
		el.classList.add('playing');
		timer = setTimeout(close, 1900);
	}).catch(() => el.classList.add('wait'));
})();
