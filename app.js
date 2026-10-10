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
let picked = new Set(), pickAnchor = null;    // lines chosen (repair, copy, link)
let delTarget = 'word';         // what Entf / Backspace deletes outside tapping: 'word' (the marked one) or 'lines' (the chosen ones)
let wpick = new Set();          // words chosen with the box in the timeline ('li:ti'): dragged, copied, deleted together
let band = null;
let wpickAt = null;             // the word last Strg+clicked in the word list, where a Shift+click range starts
const PILL = 16;                 // size of the round buttons in the timeline
let lastDir = null;             // the folder opened last time (kept in this browser), see reopenDir
let pillHov = {k: '', at: 0};   // the round button in the timeline the mouse rests on (its words open after a moment)
let jumpSel = true;             // Mitspringen: marking a word brings the timeline and the playhead to it (setting)
let tlTimes = false;            // every word's time under it in the timeline (setting), else only the marked word's
let qline = null;               // a sentence typed into the timeline: {t0, inp, text}, waiting for its end click                // that box while it is drawn {x0, y0, x1, y1}
let cmp = null;                 // ≈ compare view in the word list: {ln} = the line the others are compared with
let simMemo = {key: '', map: new Map()};   // similar lines, kept until the next change (see simOf)
const SIM_MIN = 0.6;            // from here two lines count as alike
let pickMode = false;           // ☑ Auswählen on: a click on a line adds it to the chosen ones (or takes it out)
let clip = null;                // lines copied with Strg+C / Kopieren: {json, text}
let linkPat = new Map();        // linked lines: group id -> their shared pattern (words, times from the line's base), see linkSync
let repair = null;              // {lines, ghost: 'li:ti' -> old {t, end}, done: Set, jump, finish}
let version = 0;                // bumps on every change, the preview rebuilds on it
let marks = [];                 // timeline hit boxes of the last frame: start / end marks
let bodies = [];                // ... and word boxes {x0, x1, y0, y1, li, ti}
let fanBtns = [];               // ... and the "fan out" buttons over stacks {x0, x1, y0, y1, li, ti}
let orderBtns = [];             // ... and the "sort by time" signs under lines in the wrong place {x0, x1, y0, y1}
let wordBtns = [];              // ... and the "put it here" buttons over words out of place in their line {x0, x1, y0, y1, li}
let trimBtns = [];              // ... and the "cut the end back" buttons where an end reaches under the next word {x0, x1, y0, y1, li, ti, to}
let fuseBtns = [];              // ... and the "fuse" buttons over the same word twice almost on top of itself {x0, x1, y0, y1, li, ti}
let drag = null;
let origin = null;              // snapshot as loaded / created: Zurücksetzen goes back to it
let edit = null;                // {li, before, free}: the one line being edited (B ... OK / Abbrechen), see startEdit
let hoverX = null;              // mouse x over the timeline
let hoverY = null;              // ... and y
let blade = false;              // ✂ on: a click into the timeline cuts the line there, see cutLine
let pauser = false;             // ⏸ on: a click into the timeline starts a pause there, see pauseAt
let pvH = 96;                   // lyrics preview height, splitter under it, see setPvH
let snip = null;                // short audition running: {t, timer}
let replayT = null;             // last time set with the mouse or auditioned: Space replays it until normal playback
let loop = null;                // {kind: 'line', li} | {kind: 'zone'} (loop box of the open line) | {kind: 'word', li, ti}
let lanes = [];                 // line boxes in the timeline of the last frame: {x0, x1, y, h, li}
let lineBad = new Map();        // li -> 'err' | 'warn', rebuilt on every change
let sugg = new Map();           // li -> suggested end of a line whose end is missing (far from the next line)
let audioHandle = null;         // file handle of the audio when known: Speichern unter starts in its folder
let folder = null;              // opened folder: {name, songs: [{key, audio: [F], lrc: [F]}], lrcDir}, see openFolder
let newTarget = null;           // {dir, name}: a new LRC made from the folder list is saved there
let refRaw = '', refLines = null;  // original lyrics as pasted / cleaned lines (null = no comparison), see runRef
let refDiffs = [], refAt = new Map(), refSkip = new Set();
let tut = null;                 // tutorial running: {i, s, done} (step, its state), see startTut
let simple = false;             // ✨ simple mode: slim studio, the assistant leads, see setSimple
// assistant: on, current step and its key, when it started / the user last did something, song state, see asstStep
const asst = {on: false, step: null, key: '', at: 0, act: 0, noRef: false, listened: false, listening: false, skip: new WeakMap(),
	later: new WeakSet(), check: null, demo: null, intro: 0, focus: null, left: 0, placed: 0, fix: 0};
let touchHeldAt = 0;            // a long press on a touch screen just played: the tap that follows sets nothing
let sylAt = new Map();          // 'li:ti' -> syllables suggested for a word sung as one piece (option Silben vorschlagen)

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
	return JSON.stringify({meta: doc.meta, lines: doc.lines, sel, links: [...linkPat]});
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
	linkPat = new Map(o.links || []);
	wpick = new Set();
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

// the line time always sits on the first word, an end mark always after its word (the line end behind the last word)
function tidy() {
	for (const ln of doc.lines) {
		if (ln.tokens.length && ln.tokens[0].t != null) ln.t = ln.tokens[0].t;
		for (const k of ln.tokens) if (k.t != null && k.end != null && k.end < k.t + 0.05) k.end = LRC.q(k.t + 0.05);
	}
}

function changed(markDirty = true) {
	if (markDirty) dirty = true;
	version++;
	tidy();
	linkSync();
	tidy();
	recalc();
	issues = LRC.check(doc, maxGap(), endGap());
	issueAt = new Map();
	lineBad = new Map();
	for (const i of issues) {
		const key = i.li + ':' + i.ti + (i.end ? ':e' : '');
		if (i.level !== 'info' && issueAt.get(key) !== 'err') issueAt.set(key, i.level);
		if (i.level !== 'info' && lineBad.get(i.li) !== 'err') lineBad.set(i.li, i.level);
	}
	runRef();
	runSyl();
	renderWords();
	renderIssues();
	renderRef();
	renderMini();
	renderInfo();
	saveDraftSoon();
}

let draftTimer = 0;

function saveDraftSoon() {
	clearTimeout(draftTimer);
	if (tut) return;                         // the tutorial song never becomes a draft
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
	wpick = new Set();
	const first = LRC.flat(doc).find(e => e.k.t == null) || LRC.flat(doc)[0];
	sel = first ? {li: first.li, ti: first.ti, end: false} : null;
	lastPlaced = null;
	repair = null;
	edit = null;
	replayT = null;
	loop = null;
	refLines = null;
	clearPicked();
	linkPat = new Map();
	origin = snapshot();
	renderMeta();
	changed(false);
	dirty = false;
	renderInfo();
	if (timed.length) view.start = Math.max(0, timed[0].k.t - 1);
	asstReset();
}

async function loadLrcFile(file, handle = null) {
	if (!await askSave()) return;
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

async function loadAudio(file, handle = null) {
	audioHandle = handle;
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
			if (!h) {
				const opt = {suggestedName: safeName(suggestName()), types: [{description: 'LRC', accept: {'text/plain': ['.lrc']}}]};
				const start = fileHandle || (newTarget && newTarget.dir) || songDir() || audioHandle || (folder && folder.lrcDir);
				if (start) opt.startIn = start; else opt.id = 'juicyLrcSave';
				try { h = await showSaveFilePicker(opt); }
				catch (e) {                                  // a stale handle as start folder: once more without it
					if (e.name === 'AbortError' || !opt.startIn) throw e;
					delete opt.startIn;
					h = await showSaveFilePicker(opt);
				}
			}
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
			saveErr = e.name + ': ' + e.message;
		}
	}
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
	a.download = safeName(suggestName());
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	fileName = a.download;
	saved(old);
	if (as || saveErr) hint('Gespeichert in Downloads als „' + a.download + '“. ' + (window.showSaveFilePicker ?
		'Der Speichern-Dialog ging nicht auf (' + (saveErr || '?') + ').' : navigator.brave ?
		'Brave sperrt den Ordner-Dialog: brave://flags → „File System Access API“ einschalten, oder Chrome / Edge nehmen.' :
		'Einen Ordner wählen geht nur in Chrome oder Edge (Firefox: Einstellungen → Dateien → „Immer fragen, wo Dateien gespeichert werden“).'));
	saveErr = '';
}
let saveErr = '';

// the folder of the song open from the folder list (its LRC's, else its audio's)
function songDir() {
	const s = folder && folder.songs[folder.cur];
	return s ? (s.lrc[0] && s.lrc[0].dir) || (s.audio[0] && s.audio[0].dir) || null : null;
}

// characters a file name may not contain on Windows / macOS
const safeName = n => n.replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '').trim() || 'lyrics.lrc';

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
const loopOn = () => loopMode && !edit && !tapMode() && !asst.listening;

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
// then the playhead goes back to t. hold (right button held in the timeline): plays on, past any loop, until
// the button is let go (releaseSnip), but at least snipLen.
function audition(t, hold = false) {
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
	const s = snip = {t, timer: 0, hold, t0: performance.now()};
	if (!hold) s.timer = setTimeout(() => endSnip(s), snipLen() / rate * 1000);
}

// fade out, stop, playhead back to where the audition started
function endSnip(s) {
	if (snip !== s) return;
	clearTimeout(s.timer);
	gain(0, 0.008);
	s.timer = setTimeout(() => {
		if (snip !== s) return;
		snip = null;
		audio.pause();
		gain(1);
		seek(s.t);
		if (drag && drag.snipT != null) audition(drag.snipT);    // box still held: play it again, where it is now
	}, 40);
}

// right button let go: a short click still plays the whole snipLen, a long hold stops now
function releaseSnip() {
	const s = snip;
	if (!s || !s.hold) return;
	s.hold = false;
	const left = snipLen() / rate * 1000 - (performance.now() - s.t0);
	if (left > 0) s.timer = setTimeout(() => endSnip(s), left); else endSnip(s);
}
window.addEventListener('mouseup', e => { if (e.button === 2) releaseSnip(); });
window.addEventListener('blur', releaseSnip);

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
	if (asst.on && asst.placed < 9) try { localStorage.setItem('lrcEditorAsstPlaced', ++asst.placed); } catch (e) { /* ignore */ }
	const li = sel.li, lineDone = (sel.end && sel.ti === ln.tokens.length - 1) ||
		(edit.upto != null && !sel.end && sel.ti >= edit.upto && sel.ti < ln.tokens.length - 1);      // only some words: after the last of them
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
	delTarget = 'lines';
	const from = pickAnchor != null ? pickAnchor : sel ? sel.li : null;
	if (e.shiftKey && from != null) {
		picked = new Set();
		for (let i = Math.min(li, from); i <= Math.max(li, from); i++) picked.add(i);
		pickAnchor = from;
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
	renderWpick();
	$('words').querySelectorAll('.cmpp').forEach(x => x.remove());
	renderCmp();
	lineEls.forEach((el, i) => {
		if (!el) return;
		el.classList.toggle('picked', picked.has(i));
		el.classList.toggle('repair', !!repair && repair.lines.includes(i));
	});
	const b = $('btnRepair');
	b.classList.toggle('on', !!repair);
	renderLinkBtn();
	$('btnPick').classList.toggle('on', pickMode);
	$('btnPick').textContent = '☑ Auswählen' + (picked.size ? ' (' + picked.size + ')' : '');
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
	delTarget = 'word';
	if (wpick.size) { wpick = new Set(); renderWpick(); }
	followLoop();
	renderSelection();
	const t = selTime();
	if (jumpSel && t != null && audio.paused && (t < view.start || t > view.start + view.span)) view.start = Math.max(0, t - view.span * 0.3);
	if (scroll) scrollToSel();
}

// Mitspringen: the timeline shows the marked word (its line, li) and the playhead waits just before it, so Space plays
// from there (not the point heard last). Off: view and playhead stay where they are.
function jumpToSel(li = null) {
	if (!jumpSel) return;
	if (li != null) showLine(li);
	const t = selTime();
	if (t != null && audio.paused) { seek(Math.max(0, t - 0.05)); replayT = null; }
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

function addLine(li, before = false) {
	clearPicked();
	const raw = prompt('Neuer Satz ' + (before ? 'vor' : 'nach') + ' Zeile ' + (li + 1) + ' (| trennt Silben, „v2: “ / „bg: “ davor = Stimme / Hintergrund)');
	if (!raw || !raw.trim()) return;
	const {v: vtag, body: v} = LRC.stripVoice(raw);
	if (!v.trim()) return;
	pushUndo();
	if (before) li--;
	doc.lines.splice(li + 1, 0, {t: null, tokens: LRC.tokensOf(v), brk: false, vtag});
	sel = {li: li + 1, ti: 0, end: false};
	changed();
}

// X / ✂: the line is split before the marked word, the rest becomes a line of its own (same voice); in the
// timeline its box becomes two
// ✂ blade, like cutting a clip in a video editor: while it is on, a click into the timeline cuts the line box
// there into two lines. Cut inside a word: the left line ends at the cut, the right one starts with the next word
// (a word is never cut in half, syllables stay with their word). Cut in a pause: the pause stays the left end.
function setBlade(on) {
	if (on && edit) { lockedHint(); return; }
	if (on && pauser) setPauser(false);
	blade = on;
	$('btnSplit').classList.toggle('on', on);
	tl.style.cursor = on ? 'crosshair' : '';
	if (on) hint('✂ Klinge an: oben in ein Wort klicken trennt es an der Silbe (die Striche zeigen wo), unten in die Zeilen-Box klicken teilt die Zeile. X, Esc oder ✂ = aus.');
}

// ⏸ pause tool, used like the blade: while it is on, a click into the timeline ends the word sung there at that
// point, so a pause runs from there to the next word (a green Pause mark, to drag on as usual)
function setPauser(on) {
	if (on && edit) { lockedHint(); return; }
	if (on && blade) setBlade(false);
	pauser = on;
	$('btnPause').classList.toggle('on', on);
	tl.style.cursor = on ? 'crosshair' : '';
	if (on) hint('⏸ Pause-Werkzeug an: Klick in ein Wort lässt es dort enden, bis zum nächsten Wort ist Pause. P, Esc oder ⏸ = aus.');
}

function pauseAt(li, c) {
	if (edit) { setPauser(false); lockedHint(); return; }
	const ln = li != null && doc.lines[li];
	if (!ln || ln.brk) { hint('⏸ Hier ist keine Zeile – in ein Wort klicken.'); return; }
	const tk = ln.tokens;
	let j = -1;
	tk.forEach((k, i) => { if (k.t != null && k.t <= c) j = i; });
	if (j < 0) { hint('⏸ Vor dem ersten Wort der Zeile – hier gibt es nichts zu pausieren.'); return; }
	const k = tk[j], nx = tk[j + 1];
	if (!nx) { hint('⏸ Im letzten Wort: dort ist das Ende der Zeile (E oder die Ende-Marke ziehen), keine Pause.'); return; }
	if (nx.glue) { hint('⏸ Mitten im Wort „' + k.text + '“ – eine Pause geht nur zwischen zwei Wörtern.'); return; }
	if (k.end != null && c >= k.end - 0.005) { hint('⏸ Hier ist schon Pause.'); return; }
	if (nx.t != null && c > nx.t - 0.1) { hint('⏸ Zu knapp vor dem nächsten Wort – etwas weiter links klicken.'); return; }
	pushUndo();
	k.end = LRC.q(Math.max(c, k.t + 0.05));
	changed();
	hint('⏸ Pause nach „' + k.text + '“ ab ' + LRC.fmt(k.end).slice(3) + '  (Strg+Z = zurück)');
}

// the line box at timeline x (and y, if it is in the line box row); main lines before background vocals
function lineAtX(x, y) {
	const u = y != null && liftAt(x, y);
	if (u) return u.li;
	if (y != null && y >= LANE_Y - 1) {
		const b = lanes.find(l => x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1);
		if (b) return b.li;
	}
	const hits = lanes.filter(l => x >= l.x0 && x <= l.x1);
	const b = hits.find(l => !LRC.isBg(doc.lines[l.li])) || hits[0];
	return b ? b.li : lineAt(view.start + x / tl.clientWidth * view.span);   // boxes not drawn yet: by time
}

function cutLine(li, c) {
	if (edit) { setBlade(false); lockedHint(); return; }
	const ln = li != null && doc.lines[li];
	if (!ln || ln.brk) { hint('✂ Hier ist keine Zeile – in eine Zeilen-Box klicken.'); return; }
	const tk = ln.tokens;
	let j = -1;
	tk.forEach((k, i) => { if (k.t != null && k.t <= c) j = i; });
	if (j < 0) { hint('✂ Vor dem ersten Wort der Zeile – da gibt es nichts zu teilen.'); return; }
	let s = j + 1;
	while (s < tk.length && tk[s].glue) s++;      // syllables stay with their word
	if (s >= tk.length) { hint('✂ Im letzten Wort – rechts davon beginnt kein Wort mehr, das eine neue Zeile tragen könnte.'); return; }
	pushUndo();
	clearPicked();
	const left = tk[s - 1], nx = tk[s];
	let e = c;
	if (nx.t != null) e = Math.min(e, nx.t);
	if (left.t != null) e = Math.max(e, left.t + 0.05);
	if (left.end == null || left.end > e) left.end = LRC.q(e);   // cut in a pause: the pause end stays
	const tail = tk.splice(s);
	tail[0].glue = false;
	doc.lines.splice(li + 1, 0, {t: tail[0].t != null ? null : LRC.q(c), tokens: tail, brk: false, vtag: ln.vtag});
	sel = {li: li + 1, ti: 0, end: false};
	changed();
	hint('✂ Zeile ' + (li + 1) + ' geteilt: „' + LRC.lineText(ln, false).replace(/\|/g, '') + '“ | „' +
		LRC.lineText(doc.lines[li + 1], false).replace(/\|/g, '') + '“  (Strg+Z = zurück)');
}

// Entf / Backspace (not while tapping or in an open line): the chosen lines go, else the marked word
function delMarked() {
	if (delTarget === 'words' && wpick.size) { delWords(); return; }
	const lis = [...picked].filter(li => doc.lines[li]).sort((a, b) => b - a);
	if (delTarget === 'lines' && lis.length) {
		pushUndo();
		lis.forEach(li => doc.lines.splice(li, 1));
		clearPicked();
		sel = doc.lines.length ? {li: Math.min(lis[lis.length - 1], doc.lines.length - 1), ti: 0, end: false} : null;
		changed();
		hint(lis.length + (lis.length === 1 ? ' Satz' : ' Sätze') + ' gelöscht  (Strg+Z = zurück)');
		return;
	}
	if (!sel || !doc.lines[sel.li] || !doc.lines[sel.li].tokens[sel.ti]) { hint('Erst ein Wort markieren oder Zeilen auswählen.'); return; }
	const word = doc.lines[sel.li].tokens[sel.ti].text;
	tokAction('del', sel.li, sel.ti);
	hint('„' + word.replace(/\|/g, '') + '“ gelöscht  (Strg+Z = zurück)');
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

// a word with suggested syllables: an orange dot at every split, hover shows ✂ under it, a click splits just there
function sylHtml(ps) {
	let at = 0;
	return ps.map((p, i) => {
		at += p.length;
		return esc(p) + (i < ps.length - 1 ? '<i class="sdot" data-tact="cut" data-at="' + at + '" title="Nur hier trennen">·</i>' : '');
	}).join('');
}

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
			'</div><p>Alles bleibt auf deinem Rechner. Audio und LRC lassen sich auch ins Fenster ziehen.</p>' +
			'<button class="primary tut-start" type="button">🎓 Neu hier? Tutorial mit Beispielsong starten</button></div>';
		return;
	}
	const html = [];
	doc.lines.forEach((ln, li) => {
		const t0 = LRC.lineTime(ln);
		const tw = !ln.brk && !ln.link ? twinOf(li) : -1;
		const lk = ln.link ? '<button class="lk" data-act="link" style="--lc:' + linkColor(ln.link.id) + '" title="Verlinkt (Gruppe ' + ln.link.id +
			'): alle Sätze dieser Farbe verhalten sich gleich – Klick: Verlinkung lösen">🔗' + ln.link.id + '</button>' +
			'<button class="lk plus" data-act="version" style="--lc:' + linkColor(ln.link.id) + '" title="Neue Version dieses Satzes: ' +
			'er verlässt die Gruppe und bekommt eine eigene Farbe – gleiche Sätze lassen sich dann mit ihr verlinken">+</button>' :
			tw >= 0 ? '<button class="lk twin" data-act="link" title="Gleicher Satz wie Zeile ' + (tw + 1) + ' – Klick: mit ihm verlinken">🔗</button>' : '';
		const sc = !ln.brk && !simple ? (simOf().get(li) || []).length : 0;
		const cb = sc ? '<button class="lk cmpb" data-act="cmp" title="Mit ' + sc + (sc === 1 ? ' ähnlichem Satz' : ' ähnlichen Sätzen') +
			' vergleichen: nur sie bleiben in der Liste, untereinander, mit % und Verlinken">≈' + sc + '</button>' : '';
		const tools = '<span class="tools">' + (ln.brk ? '' : '<button data-act="edit" title="Zeile bearbeiten">✎</button>') + '</span>';
		// as on a word: + at the front / back edge adds a sentence before / after it, × in the corner deletes it
		const lbtn = '<button class="lpre" data-act="addpre" title="Satz davor einfügen">+</button>' +
			'<button class="lpost" data-act="add" title="Satz danach einfügen">+</button>' +
			'<button class="lx" data-act="del" title="Satz löschen">×</button>';
		const vi = vinfo[li] || {voice: '', bg: false, own: false};
		const vg = LRC.voiceGroup(vi.voice);
		const badge = vi.bg ? '<span class="vb bg" title="Hintergrund (bg:)">bg</span>' : vi.voice
			? '<span class="vb v' + vg + (vi.own ? '' : ' inh') + '" title="Stimme' + (vi.own ? '' : ' (von oben übernommen)') +
			'">' + esc(vi.voice) + '</span>' : '';
		html.push('<div class="line' + (ln.brk ? ' brk' : '') + (vi.bg ? ' bgline' : '') + (vg && !ln.brk ? ' voice' + vg : '') + (ln.link ? ' linked' : '') +
			'" data-li="' + li + '"' + (ln.link ? ' style="--lc:' + linkColor(ln.link.id) + '"' : '') + '><div class="ln">' + (li + 1) + ' ' + badge + ' ' + lk + cb + ' ' + tools + '<br>' +
			(t0 != null ? LRC.fmt(t0) : '–') + '</div>' + lbtn + '<div class="toks">');
		if (ln.brk) {
			html.push('— Pause / Zeilenende ' + (t0 != null ? LRC.fmt(t0) : '') + ' —');
		}
		ln.tokens.forEach((k, ti) => {
			const lv = issueAt.get(li + ':' + ti);
			const rd = refAt.get(li + ':' + ti), rm = refAt.get(li + ':' + ti + ':m');
			const ra = ti === ln.tokens.length - 1 && refAt.get(li + ':' + (ti + 1) + ':m');
			const sy = sylAt.get(li + ':' + ti);
			const cls = 'tok' + (k.glue ? ' glue' : '') + (k.t == null ? ' unset' : '') + (lv ? ' ' + lv : '') + (sy ? ' sylw' : '') +
				(rd ? ' rd-' + rd.kind : '') + (rm ? ' rd-miss' : '') + (ra ? ' rd-miss-after' : '');
			const rt = [rd, rm, ra].filter(Boolean).map(refTitle).join(' · ');
			html.push('<span class="' + cls + '" data-li="' + li + '" data-ti="' + ti + '"' + (rt ? ' title="' + esc(rt) + '"' : '') +
				'><span class="w">' + (sy ? sylHtml(sy) : esc(k.text)) +
				'</span><small>' + (k.t != null ? LRC.fmt(k.t) : ghostText(li, ti)) + '</small>' +
				'<b class="tx" data-tact="del" title="Wort löschen">×</b><b class="tadd" data-tact="add" title="Wort danach einfügen">+</b>' +
				(rd && rd.kind === 'sub' && rd.ti0 === ti ? '<b class="tsug" data-tact="swap" title="Gegen das Original tauschen">↔ ' + esc(rd.want) + '</b>'
					: k.was != null ? '<b class="tsug back" data-tact="swap" title="Zurück zum Wort von vorher">↶ ' + esc(k.was.replace(/\|/g, '')) + '</b>'
					: '') + (sy ? '<b class="tsyl" data-tact="split" title="In Silben trennen: ' + esc(sy.join('|')) + ' – die Zeit des Wortes wird aufgeteilt">✂</b>' : '') +
				'</span>');
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
					'<small>' + (k.end != null ? LRC.fmt(k.end) : sg != null ? '≈' + LRC.fmt(sg) : auto ? '–' : '?') + '</small>' +
					(last && k.end == null && !auto ? '<b class="tok-ok" data-tact="endok" title="Passt so: das Ende hier festsetzen">✓</b>' : '') + '</span>');
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
	asstLines();
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
	if ($('btnLink')) renderLinkBtn();
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
	metaSum();
}

// folded Song panel: artist – title · status in its heading
function metaSum() {
	const v = k => (doc.meta.find(x => x[0] === k) || [])[1] || '';
	$('metaSum').textContent = [[v('ar'), v('ti')].filter(Boolean).join(' – '), v('status')].filter(Boolean).join(' · ');
}

function foldMeta(closed) {
	$('metaFold').classList.toggle('closed', closed);
	$('metaFold').setAttribute('aria-expanded', !closed);
	$('meta').hidden = closed;
	try { localStorage.setItem('lrcEditorMetaFold', closed ? '1' : '0'); } catch (e) { /* ignore */ }
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
			if ($('follow').checked && !audio.paused && (!snip || snip.hold) && performance.now() - lastTap > 3000)
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
		fitPreview();
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
let LANE_Y = 137;               // timeline: words and waveform above, line boxes from here, seconds at the bottom;
                                // grows with the timeline height (splitter under it, see setTlH)

const LIFT_DY = -42;             // a lifted (overlapping) line: its box and its words this far up, a layer over the others

// main lines that start before the line before them ends: the 'overlap' rule of LRC.check, worked out live while dragging
// Of two such lines the later one is lifted, unless the earlier one was just moved or fanned out: then that one.
let liftLine = null;
function overlapLines() {
	const out = new Set(), ls = [];
	doc.lines.forEach((ln, li) => {
		if (ln.brk || !ln.tokens.length || LRC.isBg(ln) || ln.tokens[0].t == null) return;
		const last = ln.tokens[ln.tokens.length - 1];
		ls.push({li, a: ln.tokens[0].t, b: last.end != null ? last.end : last.t != null ? last.t : ln.tokens[0].t});
	});
	ls.sort((x, y) => x.a - y.a || x.li - y.li);         // by time: only a real overlap counts, not the order in the text
	let pe = null, pli = null;
	for (const {li, a, b} of ls) {
		if (pe != null && a < pe - 0.005) out.add(doc.lines[pli] === liftLine ? pli : li);
		if (pe == null || b > pe) { pe = b; pli = li; }
	}
	return out;
}

// main lines that come earlier than a line above them in the text: li -> that line
function lineOrder() {
	const out = new Map();
	let pt = null, pli = null;
	doc.lines.forEach((ln, li) => {
		if (ln.brk || LRC.isBg(ln)) return;
		const t = LRC.lineTime(ln);
		if (t == null) return;
		if (pt != null && t < pt - 0.005) out.set(li, pli);
		else { pt = t; pli = li; }
	});
	return out;
}

// all lines in the order of their times (a line without time stays behind the one before it); marks follow along
function sortLines() {
	if (edit || repair) { hint('Erst die offene Zeile schließen, dann sortieren.'); return false; }
	let key = -Infinity;
	const order = doc.lines.map((ln, i) => {
		const t = LRC.lineTime(ln);
		if (t != null) key = t;
		return {ln, i, key};
	}).sort((x, y) => x.key - y.key || x.i - y.i);
	if (order.every((o, n) => o.i === n)) return false;
	pushUndo();
	const to = new Map(order.map((o, n) => [o.i, n]));
	doc.lines = order.map(o => o.ln);
	if (sel) sel = {...sel, li: to.get(sel.li)};
	if (loop && loop.li != null) loop = {...loop, li: to.get(loop.li)};
	picked = new Set();
	changed();
	renderSelection();
	return true;
}

// a lifted line box under the mouse
const liftAt = (x, y) => lanes.find(l => l.up && x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1);

// a small timeline label on a dark backdrop, so it reads over the waveform and the marks
function tag(ctx, s, x, y, col, bold = false) {
	ctx.font = (bold ? 'bold ' : '') + '10px ' + UI_FONT;
	const w = ctx.measureText(s).width;
	ctx.fillStyle = C.ink;
	ctx.globalAlpha = 0.85;
	ctx.fillRect(x - 2, y - 10, w + 4, 13);
	ctx.globalAlpha = 1;
	ctx.fillStyle = col;
	ctx.fillText(s, x, y);
}

function drawTimeline(now) {
	const [ctx, W, H] = fitCanvas($('timeline'), LANE_Y + 42);
	if (!audio.paused && !drag && $('follow').checked) { if ((!snip || snip.hold) && !loop) view.start = Math.max(0, now - view.span * 0.25); }
	else if (!audio.paused && !drag && (now > view.start + view.span || now < view.start)) view.start = Math.max(0, now - view.span * 0.05);   // Folgen off: page on
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
	// errors red / orange, the rest grey; background vocals as a thin bar below. A line that starts before the line
	// before it ends (same rule as the check) is lifted above the words and glows red until it fits again.
	const lift = overlapLines(), lifted = [];
	// lines a lifted line lies over: their word labels go a row down, the lifted line keeps the top row
	const under = new Set();
	for (const li of lift) {
		const r = lineRange(li);
		if (r) doc.lines.forEach((ln, j) => {
			if (lift.has(j) || ln.brk || LRC.isBg(ln)) return;
			const q = lineRange(j);
			if (q && q.a < r.b - 0.005 && q.b > r.a + 0.005) under.add(j);
		});
	}
	lanes = [];
	const drawLane = (ln, li, up) => {
		const r = lineRange(li);
		if (!r || r.b < t0 || r.a > t0 + sp || tlHidden(li)) return;
		const bg = LRC.isBg(ln), cur = sel && sel.li === li, bad = lineBad.get(li);
		const x0 = X(r.a), x1 = X(r.b), y = up ? LANE_Y + LIFT_DY : bg ? LANE_Y + 21 : LANE_Y, h = bg ? 6 : 19;
		const pk = picked.has(li), lc = ln.link ? linkColor(ln.link.id) : null;
		const col = up ? C.err : cur || pk ? C.cursor : bad === 'err' ? C.err : bad === 'warn' ? C.warn : lc || (bg ? C.bgv : C.lane);
		if (up) {                                    // solid, so the word lines and the waveform do not run through it
			ctx.fillStyle = C.ink;
			ctx.fillRect(x0, y, Math.max(2, x1 - x0 - 1), h);
		}
		if (lc && !up && !bg) {                         // linked: its time span tinted in the colour of its group, under the waveform
			ctx.fillStyle = lc;
			ctx.globalAlpha = 0.08;
			ctx.fillRect(x0, 22, Math.max(2, x1 - x0 - 1), y - 22);
		}
		ctx.fillStyle = up ? C.err : col;
		ctx.globalAlpha = up ? 0.35 : cur || pk ? 0.25 : lc ? 0.18 : 0.1;
		ctx.fillRect(x0, y, Math.max(2, x1 - x0 - 1), h);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = col;
		ctx.lineWidth = up ? 3 : cur ? 2 : 1;
		if (up) { ctx.shadowColor = C.err; ctx.shadowBlur = 14; }
		ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(2, x1 - x0 - 2), h - 1);
		ctx.shadowBlur = 0;
		ctx.lineWidth = 1;
		if (lc && !bg) {                                // linked: a bar in the colour of its group
			ctx.fillStyle = lc;
			ctx.fillRect(x0 + 1, y + h - 4, Math.max(1, x1 - x0 - 3), 3);
		}
		if (!bg) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(x0 + 3, y, Math.max(0, x1 - x0 - 6), h);
			ctx.clip();
			ctx.font = (cur || up ? 'bold ' : '') + '11px ' + UI_FONT;
			ctx.fillStyle = cur ? C.cursor : up ? C.textHi : C.text;
			ctx.fillText((loop && loop.kind === 'line' && loop.li === li ? '↻ ' : '') + (ln.link ? '🔗' + ln.link.id + ' ' : '') + (li + 1) + '  ' +
				LRC.lineText(ln, false).replace(/\|/g, ''), x0 + 4, y + 13);
			ctx.restore();
		}
		if (!bg && (up || cur || pk || (hoverX != null && Math.abs(hoverX - x1) < 10 && hoverY != null && hoverY >= y - 2 && hoverY <= y + h + 2))) {
			ctx.fillStyle = up ? C.textHi : col;                 // grip at its end
			ctx.fillRect(x1 - 4, y + 2, 3, h - 4);
		}
		lanes.push({x0, x1, y, h, li, up});
	};
	doc.lines.forEach((ln, li) => { if (lift.has(li)) lifted.push(li); else drawLane(ln, li, false); });

	// waveform
	if (peaks) {
		ctx.fillStyle = C.wave;
		const mid = (LANE_Y + 39) / 2, amp = (LANE_Y - 45) / 2;   // between the labels and the word bars
		for (let px = 0; px < W; px++) {
			const a = Math.floor((t0 + px / W * sp) * PEAK_RATE), b = Math.max(a + 1, Math.floor((t0 + (px + 1) / W * sp) * PEAK_RATE));
			let m = 0;
			for (let i = Math.max(0, a); i < Math.min(peaks.length, b); i++) if (peaks[i] > m) m = peaks[i];
			const h = m * amp;
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
	ctx.strokeStyle = C.mark;
	ctx.lineWidth = 1.5;
	ctx.setLineDash([5, 4]);
	doc.lines.forEach((ln, li) => {
		if (!tlHidden(li) && ln.t != null && (!ln.tokens.length || ln.tokens[0].t == null) && ln.t >= t0 && ln.t <= t0 + sp) {
			ctx.beginPath();
			ctx.moveTo(X(ln.t) + 0.5, 0);
			ctx.lineTo(X(ln.t) + 0.5, H);
			ctx.stroke();
		}
	});
	ctx.setLineDash([]);
	ctx.lineWidth = 1;

	// words: bar from start to end, mark line, label
	marks = [];
	const vis = timed.filter(e => {
		const end = endOf(e.li, e.ti);
		return (end != null ? end : e.k.t) >= t0 - 1 && e.k.t <= t0 + sp + 1 && !tlHidden(e.li);
	});
	const lane = e => LRC.isBg(doc.lines[e.li]) ? 1 : 0;
	// words starting at the same time (red, no length) stack above the one that really runs, so each can be grabbed
	const lvl = vis.map((e, n) => {
		let l = 0;
		for (let j = n + 1; j < vis.length && Math.abs(vis[j].k.t - e.k.t) < 0.005; j++) if (lane(vis[j]) === lane(e)) l++;
		return l;
	});
	// words out of order (moved over a neighbour) lie a level up: of the two, the one moved last, else the later one
	const outTok = new Set();
	for (const ln of doc.lines) {
		const tk = ln.tokens.filter(k => k.t != null);
		for (let i = 1; i < tk.length; i++) if (tk[i].t < tk[i - 1].t - 0.005) outTok.add(tk[i - 1] === liftTok ? tk[i - 1] : tk[i]);
	}
	vis.forEach((e, n) => { if (outTok.has(e.k) && !lvl[n]) lvl[n] = 1; });
	bodies = [];
	vis.forEach((e, n) => {
		const bgw = lane(e) === 1, ly = bgw ? 44 : under.has(e.li) ? 34 : 0;    // background vocals / under a lifted line: lower row
		const end = boxEnd(e.li, e.ti), last = e.ti === doc.lines[e.li].tokens.length - 1;
		const sg = last && e.k.end == null && sugg.has(e.li);
		const x = X(e.k.t), xe = end != null ? X(end) : x + 30;
		const lv = issueAt.get(e.li + ':' + e.ti);
		const isSel = sel && !sel.end && sel.li === e.li && sel.ti === e.ti;
		const sung = now >= e.k.t;
		const lkc = doc.lines[e.li].link && !bgw && lv !== 'err' ? linkColor(doc.lines[e.li].link.id) : null;    // linked: the group's colour
		ctx.fillStyle = lv === 'err' ? C.err : bgw ? (sung ? C.bgv : C.bgvDim) : lkc || (sung ? C.sung : C.lane);
		const stack = lvl[n] > 0;
		let bh = bgw ? 9 : 14, by = (bgw ? LANE_Y - 33 : LANE_Y - 21) + (lift.has(e.li) ? LIFT_DY : 0), bw = Math.max(2, xe - x - 1);
		if (stack) {
			let hi = lvl[n];
			for (let j = n - 1; j >= 0 && Math.abs(vis[j].k.t - e.k.t) < 0.005; j--) hi = Math.max(hi, lvl[j]);
			const step = Math.min(bh + 3, (by - 2) / hi);       // a high stack is squeezed so it stays on screen
			by -= lvl[n] * step;
			bh = Math.max(2, Math.min(bh, step - 1));
			ctx.font = 'bold 10px ' + UI_FONT;
			bw = Math.max(bw, 24, ctx.measureText(e.k.text).width + 8);
		}
		ctx.globalAlpha = stack ? 0.9 : lkc ? (sung ? 0.8 : 0.42) : 0.55;
		ctx.fillRect(x, by, bw, bh);
		ctx.globalAlpha = 1;
		if (stack && bh >= 12) {
			ctx.fillStyle = C.ink;
			ctx.fillText(e.k.text, x + 4, by + bh - 3);
		}
		if (isSel || (loop && loop.kind === 'word' && loop.li === e.li && loop.ti === e.ti)) {
			ctx.strokeStyle = C.cursor;
			ctx.lineWidth = 2;
			ctx.strokeRect(x + 1, by - 1, Math.max(2, bw - 1), bh + 2);
			ctx.lineWidth = 1;
		}
		bodies.push({x0: x, x1: x + bw, y0: stack ? by - 1 : by - 4, y1: stack ? by + bh + 1 : by + bh + 4, li: e.li, ti: e.ti, stack, out: outTok.has(e.k)});
		if (sg) {                                    // missing line end: suggested end, dashed, can be dragged
			const isSelE = sel && sel.end && sel.li === e.li && sel.ti === e.ti;
			ctx.strokeStyle = isSelE ? C.cursor : C.warn;
			ctx.lineWidth = 2;
			ctx.setLineDash([6, 4]);
			ctx.beginPath();
			ctx.moveTo(xe, 40);
			ctx.lineTo(xe, LANE_Y - 3);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.lineWidth = 1;
			ctx.fillStyle = isSelE ? C.cursor : C.warn;
			ctx.fillRect(xe - 4, LANE_Y - 9, 8, 6);             // grip like a real end mark
			tag(ctx, 'Ende?', xe + 4, 52, isSelE ? C.cursor : C.warn, true);
			marks.push({x: xe, li: e.li, ti: e.ti, end: true, sugg: true});
		}
		ctx.fillStyle = isSel ? C.cursor : lv === 'err' ? C.err : e.ti === 0 ? C.textHi : C.mark;
		ctx.fillRect(x - (isSel ? 1 : 0), 0, isSel ? 3 : 1, LANE_Y - 5);
		const row = o => lane(o) === 1 ? 2 : under.has(o.li) ? 1 : 0;
		const nxv = vis.slice(n + 1).find(o => row(o) === row(e));
		const nextX = nxv ? X(nxv.k.t) : W;
		ctx.save();
		ctx.beginPath();
		ctx.rect(x, ly, Math.max(0, nextX - x - 3), 40);
		ctx.clip();
		ctx.font = (bgw ? 'italic ' : e.ti === 0 ? 'bold ' : '') + '13px ' + UI_FONT;
		if (bgw) ctx.fillStyle = isSel ? C.cursor : C.bgv;
		ctx.fillText((e.k.glue ? '-' : '') + e.k.text, x + 3, ly + 15);
		if (tlTimes || isSel) {
			ctx.font = '10px ' + UI_FONT;
			ctx.fillStyle = isSel ? C.cursor : C.dim;
			ctx.fillText(LRC.fmt(e.k.t).slice(3), x + 3, ly + 28);
		}
		ctx.restore();
		marks.push({x, li: e.li, ti: e.ti, end: false});
		if (e.k.end != null) {
			const xm = X(e.k.end);
			const isSelE = sel && sel.end && sel.li === e.li && sel.ti === e.ti;
			const le = issueAt.get(e.li + ':' + e.ti + ':e');
			ctx.fillStyle = isSelE ? C.cursor : le === 'err' ? C.err : C.ok;
			ctx.fillRect(xm - (isSelE ? 1 : 0), 40, isSelE ? 3 : 1, LANE_Y - 45);
			ctx.fillRect(xm - 4, LANE_Y - 9, 8, 6);
			tag(ctx, last ? 'Ende' : 'Pause', xm + 4, 52, isSelE ? C.cursor : le === 'err' ? C.err : C.ok, true);
			marks.push({x: xm, li: e.li, ti: e.ti, end: true});
		}
	});

	// a button over every stack of same-time words: one click lays them out side by side
	fanBtns = [];
	const tops = new Map();
	for (const o of bodies) {
		if (!o.stack || o.out || simple) continue;      // simple mode: a stack is clicked in again instead
		const key = (LRC.isBg(doc.lines[o.li]) ? 'b' : 'm') + doc.lines[o.li].tokens[o.ti].t;
		const c = tops.get(key);
		if (!c) tops.set(key, {o, n: 2});
		else { c.n++; if (o.y0 < c.o.y0) c.o = o; }
	}
	ctx.font = 'bold 10px ' + UI_FONT;
	const placed = [], free = (bx, by, bw, bh) => {      // a spot for a button that covers none placed before (tries below, then above)
		const hits = yy => placed.some(r => bx < r.x1 + 2 && bx + bw > r.x0 - 2 && yy < r.y1 + 1 && yy + bh > r.y0 - 1);
		for (const d of [0, 1, 2, 3, -1, -2, 4, 5]) {
			const yy = by + d * (bh + 2);
			if (yy >= 1 && yy + bh <= LANE_Y - 2 && !hits(yy)) { placed.push({x0: bx, x1: bx + bw, y0: yy, y1: yy + bh}); return yy; }
		}
		placed.push({x0: bx, x1: bx + bw, y0: by, y1: by + bh});
		return by;
	};
	const dups = dupPairs(), dupAt = new Set(dups.map(d => d.li + ':' + d.ti));
	for (const {o, n} of tops.values()) {
		if (n === 2 && (dupAt.has(o.li + ':' + o.ti) || dupAt.has(o.li + ':' + (o.ti - 1)))) continue;
		const bw = PILL, bh = PILL;
		let bx = o.x0, by = o.y0 - bh - 2;
		if (by < 1) { bx = o.x1 + 4; by = Math.max(1, o.y0); }    // no room above a squeezed stack: beside it
		by = free(bx, by, bw, bh);
		const r = pillBtn(ctx, 'fan' + o.li + ':' + o.ti, '⇔', n + ' Wörter auffächern', bx, by, C.accent);
		fanBtns.push(Object.assign(r, {li: o.li, ti: o.ti}));
	}
	// the same word twice, almost on top of itself: a button over the pair fuses them (the upper one goes)
	// many of the same word on top of each other: one button for all of them (per word, where they lie close)
	fuseBtns = [];
	const fuseGroups = [], fnorm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
	for (const d of dups) {
		const pair = bodies.filter(o => o.li === d.li && (o.ti === d.ti || o.ti === d.ti + 1));
		if (!pair.length) continue;
		const w = fnorm(doc.lines[d.li].tokens[d.ti].text), x0 = Math.min(...pair.map(o => o.x0)), x1 = Math.max(...pair.map(o => o.x1));
		const top = pair.reduce((x, y) => (y.y0 < x.y0 ? y : x));
		const g = fuseGroups.find(g => g.w === w && x0 <= g.x1 + 30 && x1 >= g.x0 - 30);
		if (g) { g.pairs.push(d); g.x0 = Math.min(g.x0, x0); g.x1 = Math.max(g.x1, x1); if (top.y0 < g.top.y0) g.top = top; }
		else fuseGroups.push({w, pairs: [d], x0, x1, top, text: doc.lines[d.li].tokens[d.ti].text.replace(/\|/g, '')});
	}
	for (const g of fuseGroups) {
		const n = g.pairs.length, top = g.top;
		const label = n > 1 ? (n + 1) + '× „' + g.text + '“ fusionieren' : 'doppelt – fusionieren', bw = PILL, bh = PILL;
		let bx = Math.max(2, Math.min(W - bw - 2, g.x0)), by = top.y0 - bh - 2;
		if (by < 1) { bx = Math.min(W - bw - 2, g.x1 + 4); by = Math.max(1, top.y0); }
		by = free(bx, by, bw, bh);
		const r = pillBtn(ctx, 'fuse' + g.pairs[0].li + ':' + g.pairs[0].ti, '⇊', label, bx, by, C.err);
		fuseBtns.push(Object.assign(r, {li: g.pairs[0].li, ti: g.pairs[0].ti, pairs: g.pairs}));
	}
	// a word lifted because it stands in the wrong place of its line: a button over it puts it there in the text
	wordBtns = [];
	const seen = new Set();
	for (const o of bodies) {
		if (!o.out || seen.has(o.li) || !sortWords(o.li, true)) continue;
		seen.add(o.li);
		const bw = PILL, bh = PILL;
		const bx = Math.max(2, Math.min(W - bw - 2, o.x0)), by = free(bx, Math.max(1, o.y0 - bh - 3), bw, bh);
		const ln = lanes.find(l => l.li === o.li && !l.up);
		ctx.save();                                        // the way down into its line
		ctx.strokeStyle = C.err;
		ctx.globalAlpha = 0.6;
		ctx.setLineDash([3, 3]);
		ctx.beginPath();
		ctx.moveTo(bx + bw / 2, by + bh);
		ctx.lineTo(bx + bw / 2, ln ? ln.y : LANE_Y);
		ctx.stroke();
		ctx.restore();
		const r = pillBtn(ctx, 'word' + o.li, '↓', 'Wort hier in den Satz einbetten', bx, by, C.err);
		wordBtns.push(Object.assign(r, {li: o.li}));
	}
	// lifted line boxes last, on top of the words
	for (const li of lifted) drawLane(doc.lines[li], li, true);

	// a line earlier in time than a line above it in the text: a sign with an arrow to that line, a click sorts
	orderBtns = [];
	ctx.font = 'bold 10px ' + UI_FONT;
	for (const [li, pli] of lineOrder()) {
		const l = lanes.find(o => o.li === li);
		if (!l) continue;
		const pt = LRC.lineTime(doc.lines[pli]);
		const label = 'steht im Text nach Zeile ' + (pli + 1) + ' (' + LRC.fmt(pt).slice(0, 5) + ' →) · Klick: nach Zeit sortieren';
		const bx = Math.max(2, Math.min(W - PILL - 2, l.x0)), by = l.y + l.h + 2;
		const r = pillBtn(ctx, 'order' + li, '⇄', label, bx, by, C.warn);
		orderBtns.push(Object.assign(r, {li}));
	}

	ctx.font = 'bold 10px ' + UI_FONT;
	// an end that reaches under the next word or the start of the next line: a button under the line boxes
	// (drawn last, so no lifted line covers it), its arrow pointing left to where the end should go, cuts it back to that start
	trimBtns = [];
	for (const o of overhangs()) {
		if (tlHidden(o.li) || o.to < t0 || o.to > t0 + sp) continue;
		const label = 'Ende bis ' + (o.line ? 'zum nächsten Satz' : '„' + o.word + '“') + ' kürzen', bh = PILL;
		const bx = Math.max(2, Math.min(W - PILL - 2, X(o.to) + 1)), by = LANE_Y + 22;
		ctx.fillStyle = C.warn;
		ctx.globalAlpha = 0.7;
		ctx.fillRect(X(o.to) - 1, 40, 2, by + bh - 40);              // where the end would go
		ctx.globalAlpha = 1;
		const r = pillBtn(ctx, 'trim' + o.li + ':' + o.ti, '✂', label, bx, by, C.warn);
		trimBtns.push(Object.assign(r, {li: o.li, ti: o.ti, to: o.to}));
	}
	const hb = hoverX != null && hoverY != null && !fanAt(hoverX, hoverY) && bodyAt(hoverX, hoverY);
	if (hb && hb.stack) {
		const k = doc.lines[hb.li].tokens[hb.ti];
		ctx.font = 'bold 12px ' + UI_FONT;
		const s = k.text + '  ' + LRC.fmt(k.t).slice(3), w = ctx.measureText(s).width + 12;
		const bx = Math.min(W - w - 2, hoverX + 12), by = Math.max(1, hoverY - 22);
		ctx.fillStyle = C.ink;
		ctx.fillRect(bx, by, w, 18);
		ctx.strokeStyle = C.err;
		ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, 17);
		ctx.fillStyle = C.textHi;
		ctx.fillText(s, bx + 6, by + 13);
	}

	// old marks of words still to re-tap in a repair
	if (repair) {
		ctx.setLineDash([4, 4]);
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = C.mark;
		ctx.fillStyle = C.mark;
		ctx.font = '11px ' + UI_FONT;
		for (const [key, g] of repair.ghost) {
			const [li, ti] = key.split(':').map(Number);
			const k = doc.lines[li] && doc.lines[li].tokens[ti];
			if (!k || k.t != null || g.t == null || g.t < t0 - 1 || g.t > t0 + sp) continue;
			ctx.beginPath();
			ctx.moveTo(X(g.t) + 0.5, 30);
			ctx.lineTo(X(g.t) + 0.5, LANE_Y - 5);
			ctx.stroke();
			ctx.fillText(k.text, X(g.t) + 3, 44);
		}
		ctx.setLineDash([]);
		ctx.lineWidth = 1;
	}

	// playhead
	ctx.fillStyle = C.play;
	ctx.fillRect(X(now) - 1, 0, 2, H);

	// ⏸ pause tool: a green line at the mouse with its time
	if (pauser && hoverX != null) {
		ctx.strokeStyle = C.ok;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(hoverX, 0);
		ctx.lineTo(hoverX, H);
		ctx.stroke();
		ctx.lineWidth = 1;
		ctx.font = 'bold 12px ' + UI_FONT;
		ctx.fillStyle = C.ok;
		ctx.fillText('⏸ ' + LRC.fmt(LRC.q(t0 + hoverX / W * sp)).slice(3), Math.min(W - 70, hoverX + 5), 14);
	}

	// ✂ blade: a red cut line at the mouse with its time
	// over a word (above the line boxes) it snaps to the syllable it would cut: small ticks at every syllable, the
	// chosen one red; over the line boxes it cuts the line right at the mouse
	if (blade && hoverX != null) {
		const cb = !edit && hoverY != null && cutColAt(hoverX, hoverY), cs = cb && cutSplit(cb.li, cb.ti, LRC.q(t0 + hoverX / W * sp));
		const bx = cs ? X(cs.t) : hoverX;
		if (cs) {
			for (const c of cs.cuts) {
				if (c === cs.cuts.find(o => o.at === cs.at)) continue;
				ctx.strokeStyle = C.err;
				ctx.globalAlpha = 0.55;
				ctx.setLineDash([3, 3]);
				ctx.beginPath();
				ctx.moveTo(X(c.t) + 0.5, 20);
				ctx.lineTo(X(c.t) + 0.5, LANE_Y - 3);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;
			}
			ctx.globalAlpha = 0.3;                      // the mouse itself, faint
			ctx.fillStyle = C.err;
			ctx.fillRect(hoverX, 20, 1, LANE_Y - 23);
			ctx.globalAlpha = 1;
		}
		ctx.strokeStyle = C.err;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(bx, 0);
		ctx.lineTo(bx, cs ? LANE_Y - 3 : H);
		ctx.stroke();
		ctx.lineWidth = 1;
		ctx.font = 'bold 12px ' + UI_FONT;
		ctx.fillStyle = C.err;
		const lb = cs ? '✂ ' + cs.a + ' | ' + cs.b : '✂ Zeile teilen ' + LRC.fmt(LRC.q(t0 + hoverX / W * sp)).slice(3);
		ctx.fillText(lb, Math.max(0, Math.min(W - ctx.measureText(lb).width - 6, bx + 5)), 14);
	}

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
	drawWpick();
	drawQline();
	drawOverview(now);
}

// ---------------------------------------------------------------- input

function typing(e) {
	const t = e.target;
	return t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox') || $('dlgNew').open || $('dlgReset').open ||
		$('dlgFolder').open || $('dlgRef').open || $('dlgSim').open || $('dlgSave').open || $('dlgName').open;
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
	if (ctrl && low === 'a') { e.preventDefault(); picked = new Set(doc.lines.map((_, i) => i)); pickAnchor = 0; delTarget = 'lines'; renderPicked(); return; }
	if (k === ' ') { e.preventDefault(); if (!e.repeat) spaceDown(); return; }
	if (ctrl && !e.shiftKey) return;
	let used = true;
	if ((k === 'Backspace' || k === 'Delete') && !edit && !tapMode() && !repair) delMarked();
	else if (k === 'Backspace') backTap();
	else if (low === 'e') { if (edit || tapMode()) endNow(); else canTime(); }
	else if (low === 'p') setPauser(!pauser);
	else if (k === 'Escape' && qline) { quickClose(); hint('Satz verworfen.'); }
	else if (k === 'Escape' && cmp) closeCmp();
	else if (k === 'Escape' && wpick.size) { wpick = new Set(); renderWpick(); hint('Wörter abgewählt.'); }
	else if (k === 'Escape' && pickMode) setPickMode(false);
	else if (k === 'Escape' && blade) setBlade(false);
	else if (k === 'Escape' && pauser) setPauser(false);
	else if (k === 'Escape') {
		if (loop && loop.kind !== 'zone') { loop = null; pause(); } else if (edit) endEdit(false); else { loop = null; pause(); }
	}
	else if (low === 'b') startEdit();
	else if (low === 'l') toggleLoop();
	else if (low === 'n') nextProblem(e.shiftKey ? -1 : 1);
	else if (low === 'r') startRepair();
	else if (low === 'x') setBlade(!blade);
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

// new words inserted after token at of line li get times evenly between that word and the next one (in a pause after
// it: within the pause; after the last word: up to the line end), so they show in the timeline at once. Call after
// the splice; nothing to share (no times around): they stay unset.
function timeInserted(li, at, n, endB = null) {
	const tk = doc.lines[li].tokens, prev = tk[at], next = tk[at + n + 1];
	if (!prev || prev.t == null) return;
	const last = !next, a = prev.end != null && !last ? prev.end : prev.t;
	let b = next && next.t != null ? next.t : null;
	if (last) b = tk[at + n].end != null ? tk[at + n].end : endB;      // endB: where the line ended before
	if (b == null || b - a < 0.05 * (n + 1)) return;
	for (let i = 1; i <= n; i++) tk[at + i].t = LRC.q(a + (b - a) * i / (n + 1));
}

// the small buttons on a word: × deletes it, + adds a word after it; ✓ on a missing line end takes it as it is
function tokAction(act, li, ti, at0 = null) {
	const ln = doc.lines[li], k = ln.tokens[ti];
	if (act === 'del') {
		pushUndo();
		popEl(ln.tokens.length === 1 ? lineEls[li] : tokEls[li] && tokEls[li][ti]);
		ln.tokens.splice(ti, 1);
		const nx = ln.tokens[ti];
		if (nx && nx.glue && !k.glue) nx.glue = false;          // the first syllable gone: the next one starts the word
		if (k.end != null && ti === ln.tokens.length && ti > 0 && ln.tokens[ti - 1].end == null) ln.tokens[ti - 1].end = k.end;
		if (!ln.tokens.length) doc.lines.splice(li, 1);
		sel = null;
		changed();
		hint('„' + k.text + '“ gelöscht  (Strg+Z = zurück)');
	} else if (act === 'add') {
		let at = ti;
		while (ln.tokens[at + 1] && ln.tokens[at + 1].glue) at++;   // after the whole word, not between its syllables
		const v = prompt('Wort nach „' + ln.tokens.slice(ti, at + 1).map(x => x.text).join('') + '“ einfügen (Leerzeichen = mehrere, | trennt Silben)', '');
		const nt = v ? LRC.tokensOf(v) : [];
		if (!nt.length) return;
		pushUndo();
		nt[0].glue = false;
		const last = ln.tokens[at], endB = at === ln.tokens.length - 1 ? boxEnd(li, at) : null;
		if (at === ln.tokens.length - 1 && last.end != null) { nt[nt.length - 1].end = last.end; last.end = null; }    // the line end moves behind
		ln.tokens.splice(at + 1, 0, ...nt);
		timeInserted(li, at, nt.length, endB);
		sel = {li, ti: at + 1, end: false};
		changed();
		hint('„' + v.trim() + '“ eingefügt' + (nt[0].t != null ? ' bei ' + LRC.fmt(nt[0].t) + ', mitten zwischen den Nachbarn – zum Feinstellen ziehen' :
			' – noch ohne Zeit: setzen wie gewohnt') + '  (Strg+Z = zurück)');
	} else if (act === 'swap') {                  // the original's word over it, or back to the word before
		const d = refAt.get(li + ':' + ti);
		if (d && d.kind === 'sub' && d.ti0 === ti) {
			const was = ln.tokens.slice(d.ti0, d.ti1 + 1).map((x, i) => (i ? '|' : '') + x.text).join('');
			applyRef(d);
			const nk = doc.lines[li].tokens[ti];
			nk.was = was;
			renderWords();
			hint('„' + was.replace(/\|/g, '') + '“ → „' + nk.text + '“  (noch mal auf den Vorschlag = zurück)');
		} else if (k.was != null) {
			pushUndo();
			const nt = LRC.tokensOf(k.was);
			nt[0].t = k.t;
			nt[0].glue = k.glue;
			nt[nt.length - 1].end = k.end;
			const now = k.text;
			ln.tokens.splice(ti, 1, ...nt);
			sel = {li, ti, end: false};
			changed();
			hint('„' + now + '“ → „' + k.was.replace(/\|/g, '') + '“ zurückgetauscht');
		}
	} else if (act === 'split' || act === 'cut') {   // syllables: the word's time shared by the length of each piece
		let ps = sylAt.get(li + ':' + ti);
		if (!ps) return;
		if (act === 'cut') ps = [k.text.slice(0, at0), k.text.slice(at0)];      // just at this one point
		const e = k.t != null ? boxEnd(li, ti) : null;
		pushUndo();
		const nt = ps.map((text, i) => ({text, t: null, end: null, glue: i ? true : k.glue}));
		nt[0].t = k.t;
		nt[nt.length - 1].end = k.end;
		if (e != null && e > k.t + 0.05 * ps.length) {
			const wt = ps.map(p => Math.max(1, p.replace(/[^\p{L}]/gu, '').length)), sum = wt.reduce((x, w) => x + w, 0);
			let acc = 0;
			nt.forEach((x, i) => { x.t = LRC.q(k.t + (e - k.t) * acc / sum); acc += wt[i]; });
		}
		ln.tokens.splice(ti, 1, ...nt);
		sel = {li, ti, end: false};
		changed();
		hint('„' + k.text + '“ getrennt: ' + ps.join('|') + ' – die Silben in der Zeitleiste fein ziehen  (Strg+Z = zurück)');
	} else if (act === 'endok') {
		const e = boxEnd(li, ti);
		if (e == null) { hint('Hier gibt es noch keine Zeit fürs Ende – mit E oder in der Zeitleiste setzen.'); return; }
		pushUndo();
		k.end = LRC.q(e);
		changed();
		hint('Zeilenende bei ' + LRC.fmt(k.end) + ' festgesetzt  (Strg+Z = zurück)');
	}
}

$('words').addEventListener('click', e => {
	const ta = e.target.closest('[data-tact]');
	if (ta) {
		const host = ta.closest('.tok, .endmark'), li = +host.dataset.li;
		if (edit && li !== edit.li) { lockedHint(); return; }
		tokAction(ta.dataset.tact, li, +host.dataset.ti, ta.dataset.at != null ? +ta.dataset.at : null);
		return;
	}
	const btn = e.target.closest('button[data-act]');
	if (!btn && e.target.closest('.ln')) {
		pickLine(+e.target.closest('.line').dataset.li, e);
		return;
	}
	if (btn) {
		const li = +btn.closest('.line').dataset.li;
		if (edit && !(btn.dataset.act === 'edit' && li === edit.li)) { lockedHint(); return; }
		({edit: editLine, add: addLine, addpre: j => addLine(j, true), del: delLine, link: linkToggle, version: linkVersion, cmp: openCmp})[btn.dataset.act](li);
		return;
	}
	const tk0 = e.target.closest('.tok');
	if (tk0 && !edit && !simple && (e.shiftKey || e.ctrlKey || e.metaKey)) { wordPick(+tk0.dataset.li, +tk0.dataset.ti, e.shiftKey); return; }
	if ((e.shiftKey || e.ctrlKey || e.metaKey || pickMode) && e.target.closest('.line')) {
		pickLine(+e.target.closest('.line').dataset.li, e.shiftKey || e.ctrlKey || e.metaKey ? e : {ctrlKey: true});
		return;
	}
	const el = e.target.closest('.tok, .endmark'), row = e.target.closest('.line');
	if (!el && !row) return;
	const li = +(el || row).dataset.li;
	if (edit && li !== edit.li) { lockedHint(); return; }
	if (edit) edit.free = false;                  // a word of the open line: it hangs at the mouse again
	if (wpick.size && el && !wpick.has(li + ':' + el.dataset.ti)) { wpick = new Set(); renderWpick(); }
	if (el) setSel({li, ti: +el.dataset.ti, end: !!el.dataset.end}, false);
	else if (doc.lines[li].tokens.length) setSel({li, ti: 0, end: false}, false);
	jumpToSel(li);
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
	if (t != null && jumpSel) { view.start = Math.max(0, t - view.span * 0.4); jumpToSel(); }
});

// timeline: click = jump there (near a mark: mark that word), drag = scroll, wheel = zoom, right click = listen.
// Edit mode: left click sets the hanging word (Ctrl+click only jumps), marks of the open line can be dragged.
const tl = $('timeline');
const tlTime = x => LRC.q(Math.max(0, view.start + x / tl.clientWidth * view.span));
tl.addEventListener('contextmenu', e => e.preventDefault());
tl.addEventListener('mousemove', e => {
	hoverX = e.offsetX;
	hoverY = e.offsetY;
	if (!drag) tl.style.cursor = blade || pauser || (qline && qline.text) ? 'crosshair' : tlCursor(e.offsetX, e.offsetY);
});

// a small round button in the timeline: just its symbol; when the mouse rests on it, it opens to the right and
// tells what it does. -> its hit box {x0, x1, y0, y1}
function pillBtn(ctx, key, icon, label, bx, by, col) {
	ctx.font = 'bold 10px ' + UI_FONT;
	const lw = ctx.measureText(label).width + PILL + 10, H = PILL;
	const on = w => hoverX != null && hoverY != null && hoverX >= bx && hoverX <= bx + w && hoverY >= by && hoverY <= by + H;
	const hov = on(PILL) || (pillHov.k === key && on(lw));
	if (hov && pillHov.k !== key) pillHov = {k: key, at: performance.now()};
	else if (!hov && pillHov.k === key) pillHov = {k: '', at: 0};
	const open = hov && performance.now() - pillHov.at > 350;
	const w = open ? Math.min(lw, tl.clientWidth - bx - 2) : PILL;
	ctx.save();
	ctx.fillStyle = col;
	ctx.globalAlpha = hov ? 1 : 0.9;
	ctx.beginPath();
	if (ctx.roundRect) ctx.roundRect(bx, by, w, H, H / 2); else ctx.rect(bx, by, w, H);
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.fillStyle = C.ink;
	ctx.font = 'bold 11px ' + UI_FONT;
	ctx.fillText(icon, bx + (PILL - ctx.measureText(icon).width) / 2, by + 12);
	if (open) {
		ctx.font = 'bold 10px ' + UI_FONT;
		ctx.fillText(label, bx + PILL + 2, by + 11.5);
	}
	ctx.restore();
	return {x0: bx, x1: bx + w, y0: by, y1: by + H};
}

// the right edge of a line box (a lifted one first): pulled, it sets where the line ends
function laneEndAt(x, y) {
	const ok = l => Math.abs(x - l.x1) < 6 && y >= l.y - 2 && y <= l.y + l.h + 2 && !LRC.isBg(doc.lines[l.li]) && (!edit || edit.li === l.li);
	return lanes.find(l => l.up && ok(l)) || lanes.find(l => ok(l)) || null;
}

function dragLineEnd(li, x0) {
	const ln = doc.lines[li], k = ln.tokens[ln.tokens.length - 1];
	if (!k || k.t == null) return;
	let undo = false, moved = false;
	drag = {x0, moved: false};
	tl.style.cursor = 'ew-resize';
	const move = ev => {
		const xx = ev.clientX - tl.getBoundingClientRect().left;
		if (!moved && Math.abs(xx - x0) < 3) return;
		moved = drag.moved = true;
		if (!undo) { pushUndo(); undo = true; }
		k.end = Math.max(LRC.q(k.t + 0.05), tlTime(xx));
		recalc();
		dragSnip(k.end);
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		tl.style.cursor = '';
		drag = null;
		if (!moved) { setSel({li, ti: ln.tokens.length - 1, end: true}); return; }
		changed();
		hint('Zeile ' + (li + 1) + ' endet jetzt bei ' + LRC.fmt(k.end) + '  (Strg+Z = zurück)');
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}

// what a press would do here: edges resize (ew-resize), word and line boxes move (grab), else the CSS default
function tlCursor(x, y) {
	const open = li => !edit || edit.li === li;
	if (fanAt(x, y) || orderAt(x, y) || wordAt(x, y) || fuseAt(x, y) || trimAt(x, y)) return 'pointer';
	if (laneEndAt(x, y)) return 'ew-resize';
	const u = liftAt(x, y);
	if (u || y >= LANE_Y - 1) {
		const b = u || lanes.find(l => x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1);
		return b && open(b.li) ? 'grab' : !edit ? 'crosshair' : '';
	}
	if (edit && edit.zone) {
		const ex = t => (t - view.start) / view.span * tl.clientWidth;
		if (Math.abs(ex(edit.zone.a) - x) < 7 || Math.abs(ex(edit.zone.b) - x) < 7) return 'ew-resize';
	}
	const sb = bodyAt(x, y);
	if (sb && sb.stack) return open(sb.li) ? 'grab' : '';
	const m = marks.find(o => Math.abs(o.x - x) < 7);
	if (m) return open(m.li) ? 'ew-resize' : '';
	return sb && open(sb.li) ? 'grab' : '';
}

// word box under the mouse: a stacked one (same time as the next word) anywhere on it, a normal one off its edges
const bodyAt = (x, y) => bodies.find(o => o.stack && x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1) ||
	bodies.find(o => !o.stack && x > o.x0 + 4 && x < o.x1 - 4 && y >= o.y0 && y <= o.y1);

// while a box (word, word edge, line) is dragged, its start plays briefly like a right click once the mouse
// rests, then again and again from where the box is now until the button is let go, and once more after that
let dragSnipTimer = 0;
function dragSnip(t, now = false) {
	clearTimeout(dragSnipTimer);
	if (drag) drag.snipT = t;
	if (t == null || !audio.src) return;
	if (now) audition(t); else dragSnipTimer = setTimeout(() => { if (drag) audition(t); }, 140);
}

// a word box dragged: moved right it gets shorter and the next word stays where it is; moved left it leaves a pause
// after it. Pushed past a neighbour it does not stop: it keeps its length and lies a level up (red) until it is put
// back in place, so the words below can be fixed first. The last word (nothing placed after it) keeps its length.
// Always computed from the line as it was at the press, so going back and forth leaves nothing behind.
let liftTok = null;             // the word moved last: of two words out of order, this one is lifted
function moveWord(h, dt) {
	const ln = doc.lines[h.li], o = drag.w, ok = o[h.ti], prev = o[h.ti - 1], next = o[h.ti + 1];
	ln.tokens.forEach((x, i) => { x.t = o[i].t; x.end = o[i].end; });
	const nt = next && next.t != null ? next.t : null, pt = prev && prev.t != null ? prev.t : null;
	dt = LRC.q(Math.max(-ok.t, dt));
	const k = ln.tokens[h.ti];
	liftTok = k;
	k.t = LRC.q(ok.t + dt);
	const len = drag.b0 != null ? Math.max(0.1, drag.b0 - ok.t) : 0.3;
	if ((pt != null && k.t < pt + 0.05) || (nt != null && k.t > nt - 0.05)) {    // over a neighbour: lifted, own length
		k.end = LRC.q(k.t + len);
		return;
	}
	if (prev && prev.end != null && prev.end > k.t) ln.tokens[h.ti - 1].end = k.t;
	if (drag.b0 == null) return;
	const e = LRC.q(drag.b0 + dt);
	if (nt == null) {                                       // own end (or the suggested one): it moves along
		if (drag.e0 != null) k.end = e;
		return;
	}
	// reaches the next word (or had no length, stacked): no end mark, the box ends where the next word starts
	k.end = e < nt && e > k.t + 0.02 ? e : null;
}

// a line box dragged sideways: all its times move together; pushed over the lines before or after it, it lies a
// level up (see overlapLines) until there is room. It loops meanwhile so you hear where it sits. A click without moving marks the line (its first problem) as before.
// Several lines chosen (Shift / Strg+Klick, Strg+A) and one of them dragged: they all move together.
function dragLine(li, x0) {
	const ln = doc.lines[li], W = tl.clientWidth;
	const group = (!edit && picked.size > 1 && picked.has(li) ? [...picked] : [li]).map(j => doc.lines[j]).filter(x => x && !x.brk);
	const os = group.map(x => JSON.parse(JSON.stringify(x)));
	const times = os.flatMap(o => [o.t, ...o.tokens.flatMap(k => [k.t, k.end])]).filter(t => t != null);
	let lo = times.length ? -Math.min(...times) : 0, hi = Infinity;
	liftLine = ln;
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
		group.forEach((g, n) => {
			const o = os[n];
			if (o.t != null) g.t = sh(o.t);
			g.tokens.forEach((k, i) => { k.t = sh(o.tokens[i].t); k.end = sh(o.tokens[i].end); });
		});
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
		if (moved) {
			changed();
			const lo = lineOrder(), at = doc.lines.indexOf(ln);
			if (!overlapLines().has(at) && (lo.has(at) || [...lo.values()].includes(at))) sortLines();    // moved past: into place
			dragSnip(LRC.lineTime(ln), true);
			return;
		}
		if (edit) return;
		const looping = !!loop;
		goLine(li);
		if (looping) setLoop(li);
		picked = new Set([li]);
		pickAnchor = li;
		delTarget = 'lines';
		renderPicked();
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}
tl.addEventListener('mouseleave', () => { hoverX = null; hoverY = null; });
tl.addEventListener('mousedown', e => {
	const x = e.offsetX, y = e.offsetY;
	if (performance.now() - touchHeldAt < 700) return;
	if (e.button === 2) {                        // right button: plays while held, a click plays snipLen
		audition(tlTime(x), true);
		return;
	}
	if (e.button === 1) { e.preventDefault(); panDrag(x); return; }
	if (e.button !== 0) return;
	if (qline) { if (qline.text) quickEnd(tlTime(x)); else quickClose(); return; }
	if (blade) {                                 // in a word box: syllables there, else the line is cut
		const wb0 = !edit && cutColAt(x, y);
		if (!(wb0 && cutWord(wb0.li, wb0.ti, tlTime(x)))) cutLine(lineAtX(x, y), tlTime(x));
		return;
	}
	if (pauser) { pauseAt(lineAtX(x, y), tlTime(x)); return; }
	const fb = fanAt(x, y);
	if (fb) { fanClick(fb); return; }
	if (orderAt(x, y)) { sortLines(); return; }
	const tb = trimAt(x, y);
	if (tb) { trimEnd(tb.li, tb.ti, tb.to); return; }
	const fb2 = fuseAt(x, y);
	if (fb2) { fuseWords(fb2.pairs); return; }
	const wb = wordAt(x, y);
	if (wb) { sortWords(wb.li); return; }
	const le = laneEndAt(x, y);
	if (le) { dragLineEnd(le.li, x); return; }
	const u = liftAt(x, y);
	if (u || y >= LANE_Y - 1) {                  // line box: click = mark that line, drag = move the whole line
		const on = u || lanes.find(l => !l.up && x >= l.x0 && x <= l.x1 && y >= l.y - 1 && y <= l.y + l.h + 1);
		if (!on && !edit) { startBand(x, y, e.shiftKey || e.ctrlKey || e.metaKey); return; }    // beside the boxes: choose words
		const b = on || lanes.find(l => !l.up && x >= l.x0 && x <= l.x1);
		if (b && !edit && (e.shiftKey || e.ctrlKey || e.metaKey || pickMode)) pickLine(b.li, e.shiftKey || e.ctrlKey || e.metaKey ? e : {ctrlKey: true});
		else if (b && edit && b.li !== edit.li) lockedHint();
		else if (b) dragLine(b.li, x);
		return;
	}
	const gb = !edit && wpick.size && !(e.shiftKey || e.ctrlKey || e.metaKey) && bodyAt(x, y);
	if (gb && wpick.has(gb.li + ':' + gb.ti)) { dragWords(x, gb); return; }
	const pb = !edit && (e.shiftKey || e.ctrlKey || e.metaKey || pickMode) && bodyAt(x, y);
	if (pb) { pickLine(pb.li, e.shiftKey || e.ctrlKey || e.metaKey ? e : {ctrlKey: true}); return; }
	let hit = null, bd = 7;
	const sb = bodyAt(x, y);
	if (sb && sb.stack) hit = {li: sb.li, ti: sb.ti, end: false, body: true};
	else for (const m of marks) {
		const d = Math.abs(m.x - x) - (sel && m.li === sel.li && m.ti === sel.ti && m.end === !!sel.end ? 2 : 0);
		if (d < bd) { bd = d; hit = m; }
	}
	if (!hit) {                                  // inside a word box: move the whole word
		const b = bodyAt(x, y);
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
		w0: k0 ? {t: k0.t, end: k0.end} : null,
		t0: k0 ? k0.t : null, e0: k0 ? (k0.end != null ? k0.end : last0 && sugg.has(hit.li) ? sugg.get(hit.li) : null) : null};
	if (hit && hit.body) {
		drag.w = JSON.parse(JSON.stringify(doc.lines[hit.li].tokens));
		drag.b0 = boxEnd(hit.li, hit.ti);
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
			else if (h.end) k.end = Math.max(t, LRC.q(k.t + 0.05));
			else {
				const o = drag.w0;
				k.t = t;
				if (o.end != null) k.end = Math.max(o.end, LRC.q(t + Math.max(0.05, o.end - o.t)));    // the end stays behind it
			}
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
		} else if (!drag.moved) {                   // empty spot: just the playhead, Space then plays on normally
			seek(view.start + drag.x0 / W * view.span);
			replayT = null;
		}
		drag = null;
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
});

// words that start at the same time as word ti, also across lines (main and background vocals apart): the stack it
// sits in, as entries of timed in order
function sameTimeGroup(li, ti) {
	const bg = LRC.isBg(doc.lines[li]), row = timed.filter(e => LRC.isBg(doc.lines[e.li]) === bg);
	const n = row.findIndex(e => e.li === li && e.ti === ti);
	if (n < 0) return null;
	const t = row[n].k.t, same = e => Math.abs(e.k.t - t) < 0.005;
	let a = n, b = n;
	while (a > 0 && same(row[a - 1])) a--;
	while (b < row.length - 1 && same(row[b + 1])) b++;
	return b > a ? {g: row.slice(a, b + 1), next: row[b + 1] || null} : null;
}

// a stack fanned out: each word gets a length by its text, the rest of the line (and its end) moves along so all
// stays in one row. Where there is more room up to the next word, the words share it. If the line now runs into the
// next one, it is the fanned line that gets lifted (see overlapLines), the next line stays where it is.
function fanOut(li, ti) {
	const s = sameTimeGroup(li, ti);
	if (!s) return false;
	const {g} = s, t0 = g[0].k.t, n = g.length, last = g[n - 1], lk = last.k, ln = doc.lines[last.li];
	const rest = ln.tokens.slice(last.ti + 1).filter(k => k.t != null);
	const wt = g.map(e => Math.max(0.2, 0.08 * e.k.text.trim().length));      // natural length in seconds
	const need = wt.reduce((x, w) => x + w, 0);
	let room;                                        // the time the stack has now, up to the next word / its end
	if (rest.length) room = rest[0].t - t0;
	else if (lk.end != null && lk.end > t0 + 0.005) room = lk.end - t0;
	else if (s.next) room = Math.min(s.next.k.t - t0, need);                 // line end: never further than needed
	else room = need;
	const span = Math.max(room, need), sc = span / need;
	pushUndo();
	let acc = 0;
	g.forEach((e, i) => {
		e.k.t = LRC.q(t0 + acc * sc);
		if (i < n - 1 && e.k.end != null && e.k.end <= e.k.t + 0.02) e.k.end = null;    // zero-length end: the box runs on
		acc += wt[i];
	});
	const sh = span - room;                          // the rest of the line moves along, with its end marks
	if (rest.length) {
		if (sh > 0) for (const k of ln.tokens.slice(last.ti + 1)) {
			if (k.t != null) k.t = LRC.q(k.t + sh);
			if (k.end != null) k.end = LRC.q(k.end + sh);
		}
	} else lk.end = LRC.q(t0 + span);               // the line end sits right after the last word
	liftLine = ln;
	changed();
	return true;
}

const orderAt = (x, y) => orderBtns.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);
const wordAt = (x, y) => wordBtns.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);
const fuseAt = (x, y) => fuseBtns.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);
const trimAt = (x, y) => trimBtns.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);

// ends that reach too far: under the next word of the line (pause mark / end), or the line end under the start of the
// next line -> [{li, ti, to, line, word}], to = where the end should be (that start). Only when the word itself starts
// before it, else there is nothing to cut.
function overhangs() {
	const out = [];
	doc.lines.forEach((ln, li) => {
		if (ln.brk) return;
		ln.tokens.forEach((k, ti) => {
			const nx = ln.tokens[ti + 1];
			if (k.end != null && k.t != null && nx && nx.t != null && k.end > nx.t + 0.01 && nx.t > k.t + 0.05)
				out.push({li, ti, to: nx.t, line: false, word: nx.text.replace(/\|/g, '')});
		});
		const last = ln.tokens.length - 1, k = ln.tokens[last];
		if (!k || k.end == null || k.t == null || LRC.isBg(ln)) return;
		let j = li + 1;
		while (doc.lines[j] && (doc.lines[j].brk || LRC.isBg(doc.lines[j]))) j++;
		const s = doc.lines[j] ? LRC.lineTime(doc.lines[j]) : null;
		if (s != null && k.end > s + 0.01 && s > k.t + 0.05) out.push({li, ti: last, to: s, line: true, word: ''});
	});
	return out;
}

function trimEnd(li, ti, to) {
	const k = doc.lines[li] && doc.lines[li].tokens[ti];
	if (!k || k.end == null) return;
	if (edit && edit.li !== li) { lockedHint(); return; }
	pushUndo();
	k.end = LRC.q(to);
	changed();
	hint('Ende von „' + k.text + '“ auf ' + LRC.fmt(k.end) + ' gekürzt  (Strg+Z = zurück)');
}

// the same word twice in a row, almost at the same time (DUP_GAP): most likely put in twice by mistake -> [{li, ti}],
// ti = the first (upper) of the two. Syllables are left alone (la|la).
const DUP_GAP = 0.1;
function dupPairs() {
	const out = [], norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
	doc.lines.forEach((ln, li) => ln.tokens.forEach((k, ti) => {
		const n = ln.tokens[ti + 1];
		if (!n || k.glue || n.glue || (ln.tokens[ti + 2] && ln.tokens[ti + 2].glue) || k.t == null || n.t == null) return;
		if (norm(k.text) && norm(k.text) === norm(n.text) && Math.abs(n.t - k.t) <= DUP_GAP) out.push({li, ti});
	}));
	return out;
}

// fuse such pairs [{li, ti}] into one word each: the upper (first) one is deleted, the other keeps its time; a line
// end on the deleted one goes over. A row of the same word (pairs one after the other) becomes one word.
function fuseWords(pairs) {
	pairs = pairs.filter(d => doc.lines[d.li] && doc.lines[d.li].tokens[d.ti + 1]).sort((a, b) => b.li - a.li || b.ti - a.ti);
	if (!pairs.length) return;
	if (edit && pairs.some(d => d.li !== edit.li)) { lockedHint(); return; }
	pushUndo();
	let word = '';
	for (const {li, ti} of pairs) {
		const ln = doc.lines[li], a = ln.tokens[ti], b = ln.tokens[ti + 1];
		popEl(tokEls[li] && tokEls[li][ti]);
		if (a.end != null && b.end == null && a.end > b.t) b.end = a.end;
		ln.tokens.splice(ti, 1);
		word = b.text;
	}
	const last = pairs[pairs.length - 1];
	sel = {li: last.li, ti: last.ti, end: false};
	changed();
	hint('„' + word.replace(/\|/g, '') + '“ fusioniert – ' + (pairs.length > 1 ? pairs.length + ' doppelte Wörter sind' : 'das doppelte Wort ist') + ' weg  (Strg+Z = zurück)');
}

// the words of a line in the order of their times: a word that stands too early or too late in the text moves to
// where it is sung (with its syllables; a word without time stays behind the one before it). The line end stays at
// the end of the line. dry: only tell whether anything would move.
function sortWords(li, dry = false) {
	const ln = doc.lines[li];
	if (!ln || ln.tokens.length < 2) return false;
	const groups = [];
	ln.tokens.forEach(k => { if (k.glue && groups.length) groups[groups.length - 1].push(k); else groups.push([k]); });
	let key = -Infinity;
	const order = groups.map((g, i) => {
		const k = g.find(x => x.t != null);
		if (k) key = k.t;
		return {g, i, key};
	}).sort((x, y) => x.key - y.key || x.i - y.i);
	if (order.every((o, n) => o.i === n)) return false;
	if (dry) return true;
	if (edit && edit.li !== li) { lockedHint(); return false; }
	pushUndo();
	const last = ln.tokens[ln.tokens.length - 1];
	ln.tokens = order.flatMap(o => o.g);
	const nl = ln.tokens[ln.tokens.length - 1], nx = ln.tokens[ln.tokens.indexOf(last) + 1];
	if (nl !== last && last.end != null && nx && nx.t != null && last.end > nx.t) {     // the old line end goes to the new last word
		if (nl.end == null) nl.end = last.end;
		last.end = null;
	}
	const w = order.find((o, n) => o.i !== n);
	sel = {li, ti: ln.tokens.indexOf(w.g[0]), end: false};
	changed();
	hint('„' + w.g.map(k => k.text).join('') + '“ steht jetzt im Satz da, wo es gesungen wird  (Strg+Z = zurück)');
	return true;
}
const fanAt = (x, y) => fanBtns.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);

// fan out the stack word b sits in (button or double click); a stack reaching into a locked line stays
function fanClick(b) {
	const s = sameTimeGroup(b.li, b.ti);
	if (!s) return;
	if (edit && s.g.some(e => !editing(e.li))) { lockedHint(); return; }
	if (fanOut(b.li, b.ti)) {
		setSel({li: b.li, ti: b.ti, end: false});
		audition(doc.lines[b.li].tokens[b.ti].t);    // the clicked word, now at its own time
	}
}

tl.addEventListener('dblclick', e => {
	const x = e.offsetX, y = e.offsetY;
	if (fanAt(x, y)) return;                      // the button already did it on the first click
	const u = liftAt(x, y);
	if (u) { startEdit(u.li); return; }
	if (y < LANE_Y - 1) {                         // double click on a stack: fan it out
		const b = bodyAt(x, y);
		if (b) fanClick(b);
		else if (!edit && !blade && !pauser && !tapMode() && !marks.some(m => Math.abs(m.x - x) < 7)) quickLine(x, y);    // a free spot: type a sentence
		return;
	}
	const b = lanes.find(l => !l.up && x >= l.x0 && x <= l.x1);    // double click on a line box: open it
	if (b) startEdit(b.li);
});

tl.addEventListener('wheel', e => {
	e.preventDefault();
	const W = tl.clientWidth;
	if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {     // Shift or a sideways swipe on the touchpad: scroll
		view.start = Math.max(0, view.start + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / W * view.span);
		return;
	}
	const at = view.start + e.offsetX / W * view.span;
	// Zoom-Tempo in % of one 1.2 step per wheel notch; a touchpad sends many small deltas, they count by their size
	const z = Math.max(0.01, (+$('zoomSens').value || 15) / 100), d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
	view.span = Math.max(1, Math.min(180, view.span * Math.pow(1.2, Math.max(-1, Math.min(1, d / 100)) * z)));
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
$('btnSplit').onclick = () => setBlade(!blade);
$('btnPause').onclick = () => setPauser(!pauser);
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
// ? opens the help: the side panel folds up to full height on the right, so the tour can point at everything;
// closing it puts the panel back where it was (left / right, folded or not)
let helpSide = null;
$('btnHelp').onclick = () => {
	const open = $('help').hidden;
	const b = document.body.classList;
	if (open) {
		helpSide = [b.contains('side-left'), b.contains('side-mini')];
		sideLayout(false, false, false);
		document.documentElement.style.setProperty('--help-top', Math.max(12, Math.round(document.querySelector('header').getBoundingClientRect().bottom + 12)) + 'px');
	} else if (helpSide) sideLayout(helpSide[0], helpSide[1], false);
	$('help').hidden = !open;
	b.toggle('help-open', open);
	$('btnHelp').classList.toggle('on', open);
	if (open) setTimeout(() => $('help').scrollIntoView({block: 'start', behavior: 'smooth'}), 50);
	fitPreview();
};
// tour in the help: pointing at an entry outlines its area on the page
document.querySelectorAll('#tour [data-area]').forEach(li => {
	const area = () => document.querySelector(li.dataset.area);
	li.addEventListener('mouseenter', () => area()?.classList.add('tour-hl'));
	li.addEventListener('mouseleave', () => area()?.classList.remove('tour-hl'));
});
document.querySelectorAll('.speed').forEach(b => { b.onclick = () => setRate(+b.dataset.rate); });

$('btnNew').onclick = async () => {
	if (!await askSave()) return;
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
		metaSum();
		saveDraftSoon();
	});
});
$('metaFold').onclick = () => foldMeta(!$('meta').hidden);
try { foldMeta(localStorage.getItem('lrcEditorMetaFold') === '1'); } catch (e) { foldMeta(false); }

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

// ---------------------------------------------------------------- choose words with a box in the timeline
// A press beside the line boxes (under the waveform) draws a box, like in a file manager: every word in it is chosen
// (Shift / Strg: added to the ones chosen before). A chosen word dragged moves all of them, Strg+C copies them,
// Entf deletes them, Esc lets them go. A click without dragging just sets the playhead as before.

function wpickList() {
	return [...wpick].map(s => s.split(':').map(Number)).filter(([li, ti]) => doc.lines[li] && doc.lines[li].tokens[ti]);
}

// the words in the box: their word box touches it, or it covers their line box where they start
function bandWords() {
	const x0 = Math.min(band.x0, band.x1), x1 = Math.max(band.x0, band.x1), y0 = Math.min(band.y0, band.y1), y1 = Math.max(band.y0, band.y1);
	const out = new Set(), W = tl.clientWidth, X = t => (t - view.start) / view.span * W;
	for (const o of bodies) if (o.x1 >= x0 && o.x0 <= x1 && o.y1 >= y0 && o.y0 <= y1) out.add(o.li + ':' + o.ti);
	for (const l of lanes) {
		if (l.x1 < x0 || l.x0 > x1 || l.y + l.h < y0 || l.y > y1) continue;
		doc.lines[l.li].tokens.forEach((k, ti) => { if (k.t != null && X(k.t) >= x0 && X(k.t) <= x1) out.add(l.li + ':' + ti); });
	}
	return out;
}

function startBand(x, y, add) {
	const base = add ? new Set(wpick) : new Set();
	band = {x0: x, y0: y, x1: x, y1: y};
	const move = ev => {
		const r = tl.getBoundingClientRect();
		band.x1 = ev.clientX - r.left;
		band.y1 = ev.clientY - r.top;
		wpick = new Set(base);
		if (Math.abs(band.x1 - band.x0) > 3 || Math.abs(band.y1 - band.y0) > 3) for (const id of bandWords()) wpick.add(id);
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		const moved = Math.abs(band.x1 - band.x0) > 3 || Math.abs(band.y1 - band.y0) > 3;
		band = null;
		if (!moved) {                                // a click: the playhead goes there, as on any empty spot
			if (!add) wpick = new Set();
			seek(tlTime(x));
			replayT = null;
		} else if (wpick.size) {
			delTarget = 'words';
			hint(wpick.size + (wpick.size === 1 ? ' Wort' : ' Wörter') + ' gewählt: eins davon ziehen = alle verschieben, Strg+C = kopieren, ' +
				'Entf = löschen, Esc = abwählen');
		}
		renderWpick();
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}

// the chosen words dragged together: each keeps its length and its distance to the others
function dragWords(x0, at) {
	const ws = wpickList().map(([li, ti]) => doc.lines[li].tokens[ti]).filter(k => k.t != null)
		.map(k => ({k, t: k.t, end: k.end}));
	if (!ws.length) return;
	const lo = Math.min(...ws.map(w => w.t)), W = tl.clientWidth;
	drag = {x0, moved: false, undo: false, words: true};
	tl.style.cursor = 'grabbing';
	const move = ev => {
		const xx = ev.clientX - tl.getBoundingClientRect().left;
		if (Math.abs(xx - x0) > 3) drag.moved = true;
		if (!drag.moved) return;
		if (!drag.undo) { pushUndo(); drag.undo = true; }
		const dt = LRC.q(Math.max(-lo, (xx - x0) / W * view.span));
		drag.dt = dt;
		ws.forEach(w => { w.k.t = LRC.q(w.t + dt); if (w.end != null) w.k.end = LRC.q(w.end + dt); });
		recalc();
		dragSnip(LRC.q(lo + dt));
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		tl.style.cursor = '';
		const moved = drag.moved, dt = drag.dt || 0;
		drag = null;
		if (!moved) { setSel({li: at.li, ti: at.ti, end: false}); return; }    // a click: just that word
		changed();
		dragSnip(LRC.q(lo + dt), true);
		hint(ws.length + ' Wörter um ' + (dt > 0 ? '+' : '') + dt.toFixed(2) + ' s verschoben  (Strg+Z = zurück)');
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}

// the chosen words as lines of their own (one per line they come from), for Strg+C
function wordsAsLines() {
	const by = new Map();
	for (const [li, ti] of wpickList().sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
		if (!by.has(li)) by.set(li, []);
		by.get(li).push(ti);
	}
	return [...by].map(([li, tis]) => {
		const ln = doc.lines[li];
		const tokens = tis.map(ti => {
			const k = Object.assign({}, ln.tokens[ti]), nx = ln.tokens[ti + 1];
			if (k.end == null && nx && nx.t != null && !tis.includes(ti + 1)) k.end = nx.t;   // it keeps its length
			return k;
		});
		tokens[0].glue = false;
		return {t: tokens[0].t, tokens, brk: false, vtag: ln.vtag};
	});
}

function delWords() {
	const ws = wpickList().sort((a, b) => b[0] - a[0] || b[1] - a[1]);
	pushUndo();
	for (const [li, ti] of ws) {
		const ln = doc.lines[li], k = ln.tokens[ti];
		ln.tokens.splice(ti, 1);
		const nx = ln.tokens[ti];
		if (nx && nx.glue && !k.glue) nx.glue = false;
		if (k.end != null && ti === ln.tokens.length && ti > 0 && ln.tokens[ti - 1].end == null) ln.tokens[ti - 1].end = k.end;
		if (!ln.tokens.length) doc.lines.splice(li, 1);
	}
	wpick = new Set();
	sel = doc.lines.length ? {li: Math.min(ws[ws.length - 1][0], doc.lines.length - 1), ti: 0, end: false} : null;
	changed();
	hint(ws.length + (ws.length === 1 ? ' Wort' : ' Wörter') + ' gelöscht  (Strg+Z = zurück)');
}

// chosen words in the word list
function renderWpick() {
	$('words').querySelectorAll('.tok.wpick').forEach(el => el.classList.remove('wpick'));
	for (const [li, ti] of wpickList()) { const el = tokEls[li] && tokEls[li][ti]; if (el) el.classList.add('wpick'); }
}

// ... and in the timeline: their boxes framed, and the box while it is drawn
function drawWpick() {
	if (!wpick.size && !band) return;
	const ctx = tl.getContext('2d');
	ctx.save();
	ctx.strokeStyle = C.cursor;
	ctx.fillStyle = C.cursor;
	ctx.lineWidth = 2;
	for (const o of bodies) {
		if (!wpick.has(o.li + ':' + o.ti)) continue;
		ctx.globalAlpha = 0.3;
		ctx.fillRect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0);
		ctx.globalAlpha = 1;
		ctx.strokeRect(o.x0 + 1, o.y0 + 1, Math.max(2, o.x1 - o.x0 - 2), o.y1 - o.y0 - 2);
	}
	if (band) {
		const x = Math.min(band.x0, band.x1), y = Math.min(band.y0, band.y1), w = Math.abs(band.x1 - band.x0), h = Math.abs(band.y1 - band.y0);
		ctx.globalAlpha = 0.12;
		ctx.fillRect(x, y, w, h);
		ctx.globalAlpha = 0.9;
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 3]);
		ctx.strokeRect(x + 0.5, y + 0.5, w, h);
	}
	ctx.restore();
}


// ---------------------------------------------------------------- similar sentences and how the sentences are built
// 🔍 Ähnlich & Satzbau: every sentence is compared with the ones before it - by its words (in order) and, where both
// are set, by its rhythm (the times of the words from the first one they share). The best match per sentence is shown
// with a % and can be linked. Besides that it looks for sentences cut in the wrong place: a word at the end of a line
// that starts the next sentence (capital letter, a pause before it, close to the next line) or a word at the start of
// a line that ends the sentence before (small letter, close to the line before, a pause after it).

function wnorm(s) { return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }

// the words of a line, syllables joined: [{w, text, t, end, a, b}] (a..b = its tokens)
function lineWords(ln) {
	const out = [];
	ln.tokens.forEach((k, i) => {
		const o = out[out.length - 1];
		if (k.glue && o) { o.text += k.text; o.w = wnorm(o.text); o.b = i; o.end = k.end; return; }
		out.push({text: k.text, w: wnorm(k.text), t: k.t, end: k.end, a: i, b: i});
	});
	return out.filter(o => o.w || o.text.trim());
}

// pairs [i, j] of the words both lines share, in order (longest common run)
function wordMatch(a, b) {
	const d = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
		d[i][j] = a[i].w === b[j].w ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
	const out = [];
	for (let i = 0, j = 0; i < a.length && j < b.length;) {
		if (a[i].w === b[j].w) { out.push([i, j]); i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++;
	}
	return out;
}

// -> {text, rhythm (null = not both set), score} as 0..1
function lineSim(A, B) {
	const a = lineWords(A), b = lineWords(B);
	if (!a.length || !b.length) return null;
	const m = wordMatch(a, b), lo = Math.min(a.length, b.length), hi = Math.max(a.length, b.length);
	let text = 2 * m.length / (a.length + b.length);
	if (lo >= 3 && hi <= lo * 1.7) text = Math.max(text, 0.9 * m.length / lo);      // its end missing: what is there still counts
	const tm = m.filter(([i, j]) => a[i].t != null && b[j].t != null);
	let rhythm = null;
	if (tm.length >= 2) {
		const [i0, j0] = tm[0];
		const diff = tm.reduce((s, [i, j]) => s + Math.abs((a[i].t - a[i0].t) - (b[j].t - b[j0].t)), 0) / tm.length;
		rhythm = Math.max(0, 1 - diff / 0.5);
	}
	return {text, rhythm, score: rhythm == null ? text : 0.75 * text + 0.25 * rhythm};
}

// every sentence with its best match before it: [{li, to, sim}], best first
function similarLines() {
	const out = [];
	doc.lines.forEach((B, j) => {
		if (B.brk || lineWords(B).length < 2) return;
		let best = null;
		for (let i = 0; i < j; i++) {
			const A = doc.lines[i];
			if (A.brk || lineWords(A).length < 2) continue;
			if (A.link && B.link && A.link.id === B.link.id) { best = null; break; }      // linked already
			const s = lineSim(A, B);
			if (s && s.text >= 0.5 && s.score >= SIM_MIN && (!best || s.score > best.sim.score + 0.001)) best = {li: j, to: i, sim: s};
		}
		if (best) out.push(best);
	});
	return out.sort((x, y) => y.sim.score - x.sim.score || x.li - y.li);
}

// sentences cut in the wrong place -> [{li, dir, word, pct, why}]: dir +1 = the last word of line li goes to the start
// of the next line, -1 = the first word of line li goes to the end of the line before
let buildMemo = {key: '', out: []};
function buildIssues() {
	const key = version + ':' + doc.lines.length + ':' + undoStack.length + ':' + (refLines ? refLines.length : 0);
	if (buildMemo.key !== key) buildMemo = {key, out: buildIssuesNow()};
	return buildMemo.out.map(o => Object.assign({}, o));
}

function buildIssuesNow() {
	const pre = [...refBuildIssues(), ...repeatIssues()];
	const own = buildIssuesOwn().filter(o => !pre.some(p => p.li === o.li || (o.dir > 0 && p.li === o.li + 1) || (o.dir < 0 && p.li === o.li - 1)));
	return [...pre.filter((p, i) => !pre.slice(0, i).some(q => q.li === p.li && q.kind === p.kind && q.dir === p.dir)), ...own]
		.sort((x, y) => y.pct - x.pct || x.li - y.li);
}

function buildIssuesOwn() {
	const main = doc.lines.map((ln, li) => ({ln, li})).filter(o => !o.ln.brk && !LRC.isBg(o.ln) && lineWords(o.ln).length);
	const firsts = main.map(o => lineWords(o.ln)[0].text.replace(/^[^\p{L}]+/u, '')).filter(s => /^\p{L}/u.test(s));
	const capStyle = firsts.length >= 3 && firsts.filter(s => /^\p{Lu}/u.test(s)).length / firsts.length >= 0.7;
	const up = s => /^\p{Lu}/u.test(s.replace(/^[^\p{L}]+/u, '')) && !/^I('|$)/.test(s);
	const low = s => /^\p{Ll}/u.test(s.replace(/^[^\p{L}]+/u, ''));
	// sentences sung elsewhere in the song: a move that makes a line just like one of them is likely right
	const keys = new Set(main.map(o => lineWords(o.ln).map(w => w.w).join(' ')));
	const known = ws => ws.length >= 3 && keys.has(ws.map(w => w.w).join(' '));
	const out = [];
	for (let n = 0; n + 1 < main.length; n++) {
		const A = main[n], B = main[n + 1], a = lineWords(A.ln), b = lineWords(B.ln);
		if (/[.!?…]["“”']?$/.test(a[a.length - 1].text)) continue;          // the sentence before ends properly
		const aEnd = a[a.length - 1].end != null ? a[a.length - 1].end : a[a.length - 1].t;
		// the last word of A starts the next sentence
		if (a.length >= 3) {
			const L = a[a.length - 1], P = a[a.length - 2];
			const pe = P.end != null ? P.end : P.t;
			const before = L.t != null && pe != null ? L.t - pe : null, after = L.t != null && b[0].t != null ? b[0].t - (L.end != null ? L.end : L.t) : null;
			const capEv = capStyle && up(L.text), lowB = capStyle && low(b[0].text);
			const timeEv = before != null && after != null && before >= 0.4 && before >= 2 * Math.max(0.05, after);
			const simEv = known([L, ...b]) || (known(a.slice(0, -1)) && !known(a));
			let pct = capEv && lowB && timeEv ? 92 : capEv && timeEv ? 80 : capEv && lowB ? 70 : timeEv && before >= 0.8 ? 60 : 0;
			if (simEv) pct = Math.min(97, Math.max(pct, 65) + 20);
			if (pct) out.push({li: A.li, dir: 1, word: L.text, pct, why: [capEv && 'groß geschrieben', lowB && 'die nächste Zeile beginnt klein',
				timeEv && 'eine Pause davor (' + before.toFixed(1) + ' s), dicht an der nächsten Zeile',
				simEv && 'danach sind die Zeilen wie andere Sätze im Song'].filter(Boolean).join(', ')});
		}
		// the first word of B ends the sentence before
		if (b.length >= 3) {
			const F = b[0], N = b[1];
			const fe = F.end != null ? F.end : F.t;
			const gapIn = F.t != null && aEnd != null ? F.t - aEnd : null, gapOut = N.t != null && fe != null ? N.t - fe : null;
			const lowEv = capStyle && low(F.text);
			const timeEv = gapIn != null && gapOut != null && gapOut >= 0.4 && gapOut >= 2 * Math.max(0.05, gapIn);
			const simEv = known([...a, F]) || (known(b.slice(1)) && !known(b));
			let pct = lowEv && timeEv ? 90 : lowEv ? 65 : timeEv && gapOut >= 0.8 ? 60 : 0;
			if (simEv) pct = Math.min(97, Math.max(pct, 65) + 20);
			if (pct && !out.some(o => o.li === A.li && o.dir === 1 && o.pct >= pct)) out.push({li: B.li, dir: -1, word: F.text, pct,
				why: [lowEv && 'klein geschrieben', timeEv && 'dicht an der Zeile davor, danach eine Pause (' + gapOut.toFixed(1) + ' s)',
					simEv && 'danach sind die Zeilen wie andere Sätze im Song'].filter(Boolean).join(', ')});
		}
	}
	return out.sort((x, y) => y.pct - x.pct || x.li - y.li);
}

// move a whole word (with its syllables) over the line break: dir +1 = last word of li to the start of the next main
// line, -1 = first word of li to the end of the main line before. The two lines lose their links (their text changes).
function shiftWord(li, dir) {
	const nb = j => { do j += dir; while (doc.lines[j] && (doc.lines[j].brk || LRC.isBg(doc.lines[j]))); return j; };
	const oi = nb(li), A = doc.lines[li], B = doc.lines[oi];
	if (!A || !B) return;
	pushUndo();
	delete A.link;
	delete B.link;
	const w = lineWords(A), o = dir > 0 ? w[w.length - 1] : w[0];
	const moved = A.tokens.splice(o.a, o.b - o.a + 1);
	moved[0].glue = false;
	const last = moved[moved.length - 1];
	if (dir > 0) {
		const pv = A.tokens[A.tokens.length - 1];
		if (pv && pv.end == null && moved[0].t != null) pv.end = moved[0].t;      // the line now ends where the word began
		const nx = B.tokens[0];
		if (last.end != null && nx && nx.t != null && last.end >= nx.t - 0.3) last.end = null;   // no pause before the next word
		B.tokens.unshift(...moved);
		if (moved[0].t != null) B.t = moved[0].t;
	} else {
		const pv = B.tokens[B.tokens.length - 1];
		if (pv && pv.end != null && moved[0].t != null && moved[0].t - pv.end < 0.3) pv.end = null;   // no pause before it
		const nx = A.tokens[0];
		if (last.end == null) last.end = nx && nx.t != null ? nx.t : last.t != null ? LRC.q(last.t + 0.4) : null;   // it ends the line now
		B.tokens.push(...moved);
		if (A.tokens.length && A.tokens[0].t != null) A.t = A.tokens[0].t;
	}
	if (!A.tokens.length) doc.lines.splice(li, 1);
	sel = {li: Math.min(li, oi), ti: 0, end: false};
	changed();
	hint('„' + moved.map(k => k.text).join('') + '“ ' + (dir > 0 ? 'an den Anfang der nächsten Zeile' : 'ans Ende der Zeile davor') + ' geschoben  (Strg+Z = zurück)');
}

function simRender() {
	const box = $('simList'), pc = x => Math.round(x * 100) + ' %';
	const txt = li => esc(LRC.lineText(doc.lines[li], false).replace(/\|/g, ''));
	const sims = similarLines(), bi = buildIssues();
	const h = [];
	h.push('<h4>Satzbau <span class="dim">(' + (bi.length || 'nichts gefunden') + ')</span></h4>');
	for (const o of bi) {
		if (o.kind === 'split') {
			const ln = doc.lines[o.li], a = ln.tokens.slice(0, o.ti), b = ln.tokens.slice(o.ti), s = x => esc(x.map((k, i) => (i && !k.glue ? ' ' : '') + k.text).join(''));
			h.push('<div class="simrow"><span class="pct' + (o.pct >= 80 ? ' hi' : '') + '">' + o.pct + ' %</span><div class="simtx">' +
				'Zeile ' + (o.li + 1) + ': vor „<b>' + esc(o.word) + '</b>“ teilen<br><span class="dim">' + esc(o.why) + '</span><br><span class="dim">' +
				s(a) + ' │ ' + s(b) + '</span></div><button data-sim="hear" data-li="' + o.li + '">▶</button><button data-sim="split" data-li="' + o.li +
				'" data-ti="' + o.ti + '">✂ teilen</button></div>');
			continue;
		}
		const oi = o.dir > 0 ? o.li + 1 : o.li - 1;
		h.push('<div class="simrow"><span class="pct' + (o.pct >= 80 ? ' hi' : '') + '">' + o.pct + ' %</span><div class="simtx">' +
			'Zeile ' + (o.li + 1) + ': „<b>' + esc(o.word) + '</b>“ gehört wahrscheinlich ' + (o.dir > 0 ? 'an den Anfang der nächsten Zeile' : 'ans Ende der Zeile davor') +
			'<br><span class="dim">' + esc(o.why) + '</span><br><span class="dim">' + (o.dir > 0 ? txt(o.li) + ' │ ' + txt(Math.min(doc.lines.length - 1, oi)) :
				txt(Math.max(0, oi)) + ' │ ' + txt(o.li)) + '</span></div>' +
			'<button data-sim="hear" data-li="' + o.li + '">▶</button><button data-sim="shift" data-li="' + o.li + '" data-dir="' + o.dir + '">' +
			(o.dir > 0 ? '↓ rüberschieben' : '↑ rüberschieben') + '</button></div>');
	}
	h.push('<h4>Ähnliche Sätze <span class="dim">(' + (sims.length || 'keine') + ')</span></h4>');
	if (sims.some(s => s.sim.text === 1)) h.push('<div class="row end"><button data-sim="all">🔗 Alle mit gleichem Text verlinken</button></div>');
	for (const s of sims) {
		const same = s.sim.text === 1;
		h.push('<div class="simrow"><span class="pct' + (s.sim.score >= 0.9 ? ' hi' : '') + '">' + pc(s.sim.score) + '</span><div class="simtx">' +
			'Zeile ' + (s.li + 1) + ' ≈ Zeile ' + (s.to + 1) + ' <span class="dim">· Text ' + pc(s.sim.text) +
			(s.sim.rhythm != null ? ' · Timing ' + pc(s.sim.rhythm) : ' · Timing –') + '</span><br>' + txt(s.li) + (same ? '' : '<br><span class="dim">' + txt(s.to) +
			' – beim Verlinken bekommt Zeile ' + (s.li + 1) + ' diesen Text</span>') + '</div>' +
			'<button data-sim="hear" data-li="' + s.li + '">▶</button><button data-sim="hear" data-li="' + s.to + '">▶ ' + (s.to + 1) + '</button>' +
			'<button data-sim="cmp" data-li="' + s.to + '" title="In der Wortliste nur diesen Satz und die ähnlichen zeigen">≈ vergleichen</button>' +
			'<button data-sim="link" data-li="' + s.li + '" data-to="' + s.to + '">🔗 Verlinken</button></div>');
	}
	box.innerHTML = h.join('');
}

$('btnSim').onclick = () => {
	if (edit) { lockedHint(); return; }
	if (!doc.lines.length) { hint('Erst Lyrics laden.'); return; }
	autoLinkUntimed();
	simRender();
	$('dlgSim').showModal();
};
$('simList').addEventListener('click', e => {
	const b = e.target.closest('button[data-sim]');
	if (!b) return;
	const li = +b.dataset.li, act = b.dataset.sim;
	if (act === 'hear') {
		const r = lineRange(li);
		if (r) asstHear(r.a - 0.2, r.b - r.a + 0.5);
		return;
	}
	if (act === 'cmp') { $('dlgSim').close(); openCmp(li); return; }
	if (act === 'split') splitAt(li, +b.dataset.ti);
	else if (act === 'shift') shiftWord(li, +b.dataset.dir);
	else if (act === 'link') linkLines([+b.dataset.to, li], false);
	else if (act === 'all') {
		const sims = similarLines().filter(s => s.sim.text === 1).sort((x, y) => x.li - y.li);
		pushUndo();
		const keep = undoStack.length;
		for (const s of sims) {
			const A = doc.lines[s.to], B = doc.lines[s.li];
			if (A.link && B.link && A.link.id === B.link.id) continue;
			linkLines([s.to, s.li], false);
		}
		undoStack.length = keep;                       // one step back undoes them all
		hint(sims.length + ' Sätze verlinkt  (Strg+Z = zurück)');
	}
	simRender();
});


// ---------------------------------------------------------------- similar lines side by side, words dragged between lines
// ≈ at a line number: only this line and the lines like it stay in the word list, one under the other, each with how
// alike it is (%), to compare and link them. Esc or ✕ shows all lines again.

// every line -> the lines like it [{li, sim}] (both ways), kept until the next change
function simOf() {
	const key = version + ':' + doc.lines.length + ':' + undoStack.length;
	if (simMemo.key === key) return simMemo.map;
	const map = new Map(), ws = doc.lines.map(ln => ln.brk ? [] : lineWords(ln));
	doc.lines.forEach((A, i) => {
		if (ws[i].length < 2) return;
		for (let j = i + 1; j < doc.lines.length; j++) {
			if (ws[j].length < 2) continue;
			const s = lineSim(A, doc.lines[j]);
			if (!s || s.text < 0.5 || s.score < SIM_MIN) continue;
			if (!map.has(i)) map.set(i, []);
			if (!map.has(j)) map.set(j, []);
			map.get(i).push({li: j, sim: s});
			map.get(j).push({li: i, sim: s});
		}
	});
	simMemo = {key, map};
	return map;
}

function openCmp(li) {
	if (edit) { lockedHint(); return; }
	if (!(simOf().get(li) || []).length) { hint('Zu Zeile ' + (li + 1) + ' gibt es keinen ähnlichen Satz.'); return; }
	autoLinkUntimed();
	cmp = {ln: doc.lines[li]};
	renderWords();
	$('words').scrollTop = 0;
}

function closeCmp() {
	if (!cmp) return;
	cmp = null;
	renderWords();
	scrollToSel();
}

// the compare view: which lines it shows {li, rows: [{li, sim}]}, null = none (any more)
function cmpRows() {
	if (!cmp) return null;
	const li = doc.lines.indexOf(cmp.ln);
	if (li < 0) { cmp = null; return null; }
	const rows = (simOf().get(li) || []).slice().sort((a, b) => a.li - b.li);
	return {li, rows};
}

function renderCmp() {
	const bar = $('cmpBar'), c = cmpRows();
	bar.hidden = !c;
	document.body.classList.toggle('comparing', !!c);
	if (!c) return;
	const show = new Set([c.li, ...c.rows.map(r => r.li)]);
	lineEls.forEach((el, i) => { if (el) el.classList.toggle('cmp-hide', !show.has(i)); });
	const A = doc.lines[c.li], open = c.rows.filter(r => !(A.link && doc.lines[r.li].link && doc.lines[r.li].link.id === A.link.id));
	bar.innerHTML = '<b>≈ Vergleich mit Zeile ' + (c.li + 1) + '</b> <span class="dim">„' + esc(LRC.lineText(A, false).replace(/\|/g, '')) + '“ – ' +
		c.rows.length + (c.rows.length === 1 ? ' ähnlicher Satz' : ' ähnliche Sätze') + ', die anderen Zeilen sind ausgeblendet</span>' +
		(open.length ? '<button data-cmp="all">🔗 Alle mit Zeile ' + (c.li + 1) + ' verlinken</button>' : '<span class="ok">✓ alle verlinkt</span>') +
		'<button data-cmp="close">✕ Vergleich beenden (Esc)</button>';
	for (const r of c.rows) {
		const el = lineEls[r.li], ln = el && el.querySelector('.ln');
		if (!ln) continue;
		const same = A.link && doc.lines[r.li].link && doc.lines[r.li].link.id === A.link.id;
		const pc = x => Math.round(x * 100) + ' %';
		ln.insertAdjacentHTML('beforeend', '<div class="cmpp" title="Text ' + pc(r.sim.text) + (r.sim.rhythm != null ? ' · Timing ' + pc(r.sim.rhythm) : ' · Timing –') +
			'">' + pc(r.sim.score) + (same ? ' 🔗' : ' <button data-cmp="link" data-li="' + r.li + '" title="Mit Zeile ' + (c.li + 1) +
			' verlinken – sie ist die Vorlage">🔗</button>') + '</div>');
	}
	const el = lineEls[c.li], ln = el && el.querySelector('.ln');
	if (ln) ln.insertAdjacentHTML('beforeend', '<div class="cmpp anchor" title="Vorlage für den Vergleich">Vorlage</div>');
}

$('cmpBar').addEventListener('click', e => {
	const b = e.target.closest('button[data-cmp]');
	if (!b) return;
	const c = cmpRows();
	if (!c) return;
	if (b.dataset.cmp === 'close') closeCmp();
	else if (b.dataset.cmp === 'all') linkLines([c.li, ...c.rows.map(r => r.li)], false);
});
$('words').addEventListener('click', e => {
	const b = e.target.closest('button[data-cmp="link"]');
	if (!b) return;
	e.stopPropagation();
	const c = cmpRows();
	if (c) linkLines([c.li, +b.dataset.li], false);
}, true);

// a line like another one but without word times: linked to it at once, its words laid out from its start to the right
// (the line time, else just after the line before). Done when the comparison opens.
function autoLinkUntimed() {
	const map = simOf(), done = [];
	doc.lines.forEach((ln, li) => {
		if (ln.brk || ln.link || ln.tokens.some(k => k.t != null)) return;
		const best = (map.get(li) || []).filter(r => lineKey(doc.lines[r.li]) === lineKey(ln) && doc.lines[r.li].tokens.filter(k => k.t != null).length >= 2)
			.sort((a, b) => b.sim.text - a.sim.text || Math.abs(a.li - li) - Math.abs(b.li - li))[0];
		if (!best) return;
		if (ln.t == null) {
			let p = li - 1;
			while (p >= 0 && !lineRange(p)) p--;
			const r = p >= 0 ? lineRange(p) : null;
			if (!r) return;
			ln.t = LRC.q(r.b + 0.1);
		}
		done.push([best.li, li]);
	});
	if (!done.length) return;
	pushUndo();
	const keep = undoStack.length;
	for (const [m, li] of done) linkLines([m, li], false);
	undoStack.length = keep;
	hint(done.length + (done.length === 1 ? ' Satz ohne Zeiten wurde' : ' Sätze ohne Zeiten wurden') + ' mit einem gleichen verlinkt und ab ' +
		'ihrem Start aufgefächert  (Strg+Z = zurück)');
}

// a word dragged in the word list onto another place - also into another line: it goes in there with its time
// (and its syllables). Before a word / after it (by the half it is dropped on), or at the end of a line.
let wdrag = null;
$('words').addEventListener('mousedown', e => {
	const tok = e.target.closest('.tok');
	if (e.button !== 0 || !tok || e.target.closest('b, button, i') || edit || e.shiftKey || e.ctrlKey || e.metaKey || simple) return;
	wdrag = {li: +tok.dataset.li, ti: +tok.dataset.ti, x0: e.clientX, y0: e.clientY, el: tok, on: false, drop: null};
	wdrag.multi = wpick.has(wdrag.li + ':' + wdrag.ti) && lineWordsOf(wpickList()).length > 1;
	const move = ev => {
		if (!wdrag.on) {
			if (Math.hypot(ev.clientX - wdrag.x0, ev.clientY - wdrag.y0) < 6) return;
			wdrag.on = true;
			wdrag.ghost = document.createElement('div');
			wdrag.ghost.className = 'wghost';
			const ln = doc.lines[wdrag.li], w = lineWords(ln).find(o => wdrag.ti >= o.a && wdrag.ti <= o.b);
			if (w) wdrag.ti = w.a;
			if (wdrag.multi) {
				const ws = lineWordsOf(wpickList()), s = ws.map(o => doc.lines[o.li].tokens.slice(o.a, o.b + 1).map(k => k.text).join('')).join(' ');
				wdrag.ghost.textContent = (s.length > 40 ? s.slice(0, 38) + '…' : s) + '  (' + ws.length + ')';
				for (const [l, i] of wpickList()) { const t = tokEls[l] && tokEls[l][i]; if (t) t.classList.add('wdragging'); }
			} else {
				wdrag.ghost.textContent = w ? w.text : ln.tokens[wdrag.ti].text;
				for (let i = w ? w.a : wdrag.ti; i <= (w ? w.b : wdrag.ti); i++) { const t = tokEls[wdrag.li] && tokEls[wdrag.li][i]; if (t) t.classList.add('wdragging'); }
			}
			document.body.appendChild(wdrag.ghost);
			document.body.classList.add('wdrag');
		}
		ev.preventDefault();
		wdrag.ghost.style.left = ev.clientX + 12 + 'px';
		wdrag.ghost.style.top = ev.clientY + 8 + 'px';
		$('words').querySelectorAll('.drop-b, .drop-a, .drop-end').forEach(x => x.classList.remove('drop-b', 'drop-a', 'drop-end'));
		const under = document.elementFromPoint(ev.clientX, ev.clientY);
		const t = under && under.closest('#words .tok'), row = under && under.closest('#words .line');
		wdrag.drop = null;
		if (t && !t.classList.contains('wdragging')) {
			const r = t.getBoundingClientRect(), after = ev.clientX > r.left + r.width / 2;
			t.classList.add(after ? 'drop-a' : 'drop-b');
			wdrag.drop = {li: +t.dataset.li, ti: +t.dataset.ti, after};
		} else if (row && !t && !doc.lines[+row.dataset.li].brk) {
			row.classList.add('drop-end');
			wdrag.drop = {li: +row.dataset.li, ti: null};
		}
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		const d = wdrag;
		wdrag = null;
		if (!d.on) return;
		d.ghost.remove();
		document.body.classList.remove('wdrag');
		$('words').querySelectorAll('.drop-b, .drop-a, .drop-end, .wdragging').forEach(x => x.classList.remove('drop-b', 'drop-a', 'drop-end', 'wdragging'));
		skipClick = true;
		setTimeout(() => { skipClick = false; }, 0);
		if (!d.drop) return;
		const dl = doc.lines[d.drop.li];
		let at = d.drop.ti == null ? dl.tokens.length : d.drop.ti;
		if (d.drop.ti != null && d.drop.after) { at++; while (dl.tokens[at] && dl.tokens[at].glue) at++; }
		if (d.multi) moveWordsTo(wpickList(), d.drop.li, at); else moveWordTo(d.li, d.ti, d.drop.li, at);
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
});
let skipClick = false;
$('words').addEventListener('click', e => { if (skipClick) { e.stopPropagation(); e.preventDefault(); } }, true);

// the word (with its syllables) at line li, token ti, moved in front of token `at` of line dl (at = its length: the end)
function moveWordTo(li, ti, dl, at) {
	const A = doc.lines[li], B = doc.lines[dl];
	if (!A || !B) return;
	let a = ti, b = ti;
	while (a > 0 && A.tokens[a].glue) a--;
	while (b + 1 < A.tokens.length && A.tokens[b + 1].glue) b++;
	if (li === dl && at >= a && at <= b + 1) return;          // dropped on itself
	while (B.tokens[at] && B.tokens[at].glue) at++;            // never into the middle of a word
	pushUndo();
	delete A.link;
	delete B.link;
	const wasLast = b === A.tokens.length - 1;
	const moved = A.tokens.splice(a, b - a + 1);
	if (li === dl && at > a) at -= moved.length;
	if (A.tokens[a] && A.tokens[a].glue) A.tokens[a].glue = false;
	const last = moved[moved.length - 1], first = moved[0];
	first.glue = false;
	if (wasLast && li !== dl) {                                  // the line before loses its last word: it ends where that one began
		const pv = A.tokens[A.tokens.length - 1];
		if (pv && pv.end == null) pv.end = first.t != null ? first.t : last.end;
	}
	const pv = B.tokens[at - 1], nx = B.tokens[at];
	if (pv && pv.end != null && first.t != null && first.t - pv.end < 0.3) pv.end = null;     // no pause before it
	if (nx && last.end != null && nx.t != null && last.end >= nx.t - 0.3) last.end = null;       // nor after it
	if (!nx && last.end == null && pv && pv.end != null && first.t != null && pv.end > first.t) { last.end = pv.end; pv.end = null; }
	B.tokens.splice(at, 0, ...moved);
	let gone = false;
	if (!A.tokens.length) { doc.lines.splice(li, 1); gone = true; }
	const nl = gone && dl > li ? dl - 1 : dl;
	sel = {li: nl, ti: doc.lines[nl].tokens.indexOf(first), end: false};
	changed();
	hint('„' + moved.map(k => k.text).join('') + '“ nach Zeile ' + (nl + 1) + ' geschoben' + (gone ? ' (die leere Zeile ist weg)' : '') + '  (Strg+Z = zurück)');
}

// a line split in two in front of token s (syllables stay with their word)
function splitAt(li, s) {
	const ln = doc.lines[li], tk = ln && ln.tokens;
	if (!tk || s <= 0 || s >= tk.length) return;
	while (s < tk.length && tk[s].glue) s++;
	if (s >= tk.length) return;
	pushUndo();
	delete ln.link;
	const left = tk[s - 1], nx = tk[s];
	if (left.end == null && nx.t != null) left.end = nx.t;
	const tail = tk.splice(s);
	tail[0].glue = false;
	doc.lines.splice(li + 1, 0, {t: tail[0].t, tokens: tail, brk: false, vtag: ln.vtag});
	sel = {li: li + 1, ti: 0, end: false};
	changed();
	hint('Zeile ' + (li + 1) + ' geteilt: „' + LRC.lineText(ln, false).replace(/\|/g, '') + '“ | „' +
		LRC.lineText(doc.lines[li + 1], false).replace(/\|/g, '') + '“  (Strg+Z = zurück)');
}

// with the original lyrics loaded: where the lines should break, from them -> issues as in buildIssues
function refBuildIssues() {
	if (!refLines) return [];
	const dw = [];
	doc.lines.forEach((ln, li) => { if (!ln.brk && !LRC.isBg(ln)) lineWords(ln).forEach((o, wi) => { if (o.w) dw.push({li, wi, w: o.w}); }); });
	const rw = [];
	refLines.forEach((s, ri) => s.split(/\s+/).forEach(x => { const w = wnorm(x); if (w) rw.push({ri, w}); }));
	const n = dw.length, m = rw.length;
	if (!n || !m || n * m > 6e6) return [];
	const W = m + 1, d = new Uint16Array((n + 1) * W);
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
		d[i * W + j] = dw[i].w === rw[j].w ? d[(i + 1) * W + j + 1] + 1 : Math.max(d[(i + 1) * W + j], d[i * W + j + 1]);
	for (let i = 0, j = 0; i < n && j < m;) {
		if (dw[i].w === rw[j].w) { dw[i].ri = rw[j].ri; i++; j++; } else if (d[(i + 1) * W + j] >= d[i * W + j + 1]) i++; else j++;
	}
	const byLine = new Map();
	for (const o of dw) { if (!byLine.has(o.li)) byLine.set(o.li, []); byLine.get(o.li).push(o); }
	const lis = [...byLine.keys()], out = [];
	const major = ws => { const c = new Map(); ws.forEach(o => { if (o.ri != null) c.set(o.ri, (c.get(o.ri) || 0) + 1); }); return [...c].sort((a, b) => b[1] - a[1])[0]; };
	lis.forEach((li, n) => {
		const ws = byLine.get(li), mj = major(ws);
		if (!mj) return;
		const words = lineWords(doc.lines[li]);
		// runs of words from the same original line: two runs of 2 words or more -> split there
		const runs = [];
		ws.forEach(o => { if (o.ri == null) return; const r = runs[runs.length - 1]; if (r && r.ri === o.ri) r.n++; else runs.push({ri: o.ri, n: 1, wi: o.wi}); });
		const big = runs.filter(r => r.n >= 2);
		if (big.length >= 2) {
			for (let k = 1; k < big.length; k++) if (big[k].ri !== big[k - 1].ri)
				out.push({li, kind: 'split', ti: words[big[k].wi].a, word: words[big[k].wi].text, pct: 95, why: 'laut Original-Lyrics beginnt hier eine neue Zeile'});
			return;
		}
		const nx = byLine.get(lis[n + 1]), pv = byLine.get(lis[n - 1]);
		const L = ws[ws.length - 1], F = ws[0];
		if (ws.length >= 2 && nx && L.ri != null && L.ri !== mj[0] && nx[0].ri === L.ri && L.wi === words.length - 1)
			out.push({li, dir: 1, word: words[L.wi].text, pct: 95, why: 'laut Original-Lyrics gehört es in die nächste Zeile'});
		if (ws.length >= 2 && pv && F.ri != null && F.ri !== mj[0] && pv[pv.length - 1].ri === F.ri && F.wi === 0)
			out.push({li, dir: -1, word: words[0].text, pct: 95, why: 'laut Original-Lyrics gehört es in die Zeile davor'});
	});
	return out;
}

// the same sentence twice in one line (two lines run together): split where it starts again
function repeatIssues() {
	const out = [];
	doc.lines.forEach((ln, li) => {
		if (ln.brk) return;
		const w = lineWords(ln);
		for (let k = 3; k + 3 <= w.length; k++) {
			let m = 0;
			while (k + m < w.length && m < k && w[m].w === w[k + m].w) m++;
			if (m >= 3 && (m >= k - 1 || k + m === w.length)) {
				out.push({li, kind: 'split', ti: w[k].a, word: w[k].text, pct: 85, why: 'der Satz fängt hier noch einmal von vorn an – zwei Zeilen in einer?'});
				return;
			}
		}
	});
	return out;
}


// ---------------------------------------------------------------- several words in the word list
// Strg+click on a word adds it to the chosen words (or takes it out again), Shift+click chooses all words from the
// last one up to it. They are the same chosen words as with the box in the timeline: one of them dragged in the word
// list moves all of them there, in their order.

function wordSpan(li, ti) {
	const tk = doc.lines[li].tokens;
	let a = ti, b = ti;
	while (a > 0 && tk[a].glue) a--;
	while (b + 1 < tk.length && tk[b + 1].glue) b++;
	return [a, b];
}

function wordPick(li, ti, range) {
	const all = [];
	doc.lines.forEach((ln, l) => { if (!ln.brk) ln.tokens.forEach((k, t) => all.push(l + ':' + t)); });
	if (range && wpickAt && doc.lines[wpickAt.li]) {
		let i = all.indexOf(wpickAt.li + ':' + wpickAt.ti), j = all.indexOf(li + ':' + ti);
		if (i > j) [i, j] = [j, i];
		if (i >= 0) all.slice(i, j + 1).forEach(id => wpick.add(id));
	} else {
		const [a, b] = wordSpan(li, ti), on = !wpick.has(li + ':' + ti);
		for (let t = a; t <= b; t++) { if (on) wpick.add(li + ':' + t); else wpick.delete(li + ':' + t); }
		wpickAt = {li, ti};
	}
	if (picked.size) clearPicked();
	delTarget = 'words';
	renderWpick();
	const n = lineWordsOf(wpickList()).length;
	hint(n ? n + (n === 1 ? ' Wort' : ' Wörter') + ' gewählt: eins davon ziehen = alle dorthin schieben (in der Wortliste in eine Zeile, in der Zeitleiste in der Zeit), ' +
		'Strg+C = kopieren, Entf = löschen, Esc = abwählen' : 'Keine Wörter gewählt.');
}

// chosen tokens -> whole words [{li, a, b}] in text order
function lineWordsOf(ids) {
	const seen = new Set(), out = [];
	for (const [li, ti] of ids.slice().sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
		const [a, b] = wordSpan(li, ti);
		if (seen.has(li + ':' + a)) continue;
		seen.add(li + ':' + a);
		out.push({li, a, b});
	}
	return out;
}

// the chosen words moved in front of token `at` of line dl, in their order, each with its time (and syllables)
function moveWordsTo(ids, dl, at) {
	const B = doc.lines[dl];
	if (!B) return;
	const groups = lineWordsOf(ids).map(o => ({A: doc.lines[o.li], ks: doc.lines[o.li].tokens.slice(o.a, o.b + 1)}));
	if (!groups.length) return;
	const moved = groups.flatMap(g => g.ks), mset = new Set(moved);
	while (B.tokens[at] && B.tokens[at].glue) at++;
	while (B.tokens[at] && mset.has(B.tokens[at])) at++;            // dropped on one of them: behind it
	const anchor = B.tokens[at] || null;
	pushUndo();
	const from = new Set();
	for (const g of groups) {
		const A = g.A, a = A.tokens.indexOf(g.ks[0]), wasLast = a + g.ks.length === A.tokens.length;
		from.add(A);
		delete A.link;
		A.tokens.splice(a, g.ks.length);
		if (A.tokens[a] && A.tokens[a].glue) A.tokens[a].glue = false;
		if (wasLast && A !== B) {                                     // the line ends where its last word began
			const pv = A.tokens[A.tokens.length - 1];
			if (pv && pv.end == null) pv.end = g.ks[0].t != null ? g.ks[0].t : g.ks[g.ks.length - 1].end;
		}
		g.ks[0].glue = false;
	}
	delete B.link;
	const pos = anchor ? B.tokens.indexOf(anchor) : B.tokens.length;
	const first = moved[0], last = moved[moved.length - 1], pv = B.tokens[pos - 1], nx = B.tokens[pos];
	if (pv && pv.end != null && first.t != null && first.t - pv.end < 0.3) pv.end = null;
	if (nx && last.end != null && nx.t != null && last.end >= nx.t - 0.3) last.end = null;
	if (!nx && last.end == null && pv && pv.end != null && first.t != null && pv.end > first.t) { last.end = pv.end; pv.end = null; }
	B.tokens.splice(pos, 0, ...moved);
	let gone = 0;
	for (let i = doc.lines.length - 1; i >= 0; i--) if (from.has(doc.lines[i]) && !doc.lines[i].tokens.length) { doc.lines.splice(i, 1); gone++; }
	const nl = doc.lines.indexOf(B);
	wpick = new Set(moved.map(k => nl + ':' + B.tokens.indexOf(k)));
	wpickAt = null;
	delTarget = 'words';
	sel = {li: nl, ti: B.tokens.indexOf(first), end: false};
	changed();
	hint(groups.length + ' Wörter nach Zeile ' + (nl + 1) + ' geschoben' + (gone ? ' (leere Zeilen sind weg)' : '') + '  (Strg+Z = zurück)');
}

// ---------------------------------------------------------------- ✂ blade into a word: syllables
// Like the blade in a video editor: a click into a word box cuts the word just there. The text is cut at the syllable
// border nearest to the click (by the share of the word's time), for a word without syllables at the letter there.
// The right piece starts at the click, glued to the left one (same word, two syllables).

// the word column under the blade: anywhere above the line boxes, between the word's start and end (a main line
// before background vocals, the bar the mouse is on first)
function cutColAt(x, y) {
	if (y >= LANE_Y - 1) return null;
	const on = bodies.filter(o => x > o.x0 + 1 && x < o.x1 - 1);
	return on.find(o => y >= o.y0 && y <= o.y1) || on.find(o => !LRC.isBg(doc.lines[o.li])) || on[0] || null;
}

// where the word at li/ti can be cut: at its syllables (else between its letters), each at the share of the word's
// time its letters before it have. c = the blade's time: the nearest of them is taken.
// -> {cuts: [{at, t}], pick, at, t, a, b} or null
function cutSplit(li, ti, c) {
	const ln = doc.lines[li], k = ln && ln.tokens[ti];
	if (!k || k.t == null) return null;
	const e = boxEnd(li, ti), txt = k.text, isL = ch => /[\p{L}\p{N}]/u.test(ch);
	if (e == null || e - k.t < 0.1 || txt.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return null;
	const m = $('sylMode').value, ps = LRC.syllables(txt, m === 'auto' || m === 'off' ? LRC.guessLang(doc) : m);
	const pos = [];
	if (ps.length > 1 && ps.join('') === txt) { let a = 0; ps.slice(0, -1).forEach(p => pos.push(a += p.length)); } else
		for (let i = 1; i < txt.length; i++) if (isL(txt[i - 1]) && isL(txt[i])) pos.push(i);
	const n = [...txt].filter(isL).length, before = at => [...txt.slice(0, at)].filter(isL).length;
	const cuts = pos.map(at => ({at, t: LRC.q(k.t + (e - k.t) * before(at) / n)}));
	if (!cuts.length) return null;
	const pick = cuts.reduce((x, y) => Math.abs(y.t - c) < Math.abs(x.t - c) ? y : x);
	return {cuts: ps.length > 1 ? cuts : [pick], at: pick.at, t: pick.t, a: txt.slice(0, pick.at), b: txt.slice(pick.at)};
}

function cutWord(li, ti, c) {
	const s = cutSplit(li, ti, c);
	if (!s) return false;
	const ln = doc.lines[li], k = ln.tokens[ti];
	pushUndo();
	ln.tokens.splice(ti + 1, 0, {text: s.b, t: s.t, end: k.end, glue: true});
	k.text = s.a;
	k.end = null;
	sel = {li, ti: ti + 1, end: false};
	changed();
	hint('✂ „' + s.a + '|' + s.b + '“ getrennt – die Länge ist nach den Silben aufgeteilt. Kanten ziehen = fein richten  (Strg+Z = zurück)');
	return true;
}

// ---------------------------------------------------------------- a sentence typed right into the timeline
// Double click on a free spot of the waveform (like a comment on SoundCloud): a field opens there, the sentence is
// typed in and Enter takes it; the next click sets where it ends. Its words share that time by their length and
// come as boxes that are pulled at their edges (longer / shorter) or in the middle (moved), as clips in a DAW.

function quickLine(x, y) {
	quickClose();
	const t0 = tlTime(x), r = tl.getBoundingClientRect(), inp = document.createElement('input');
	inp.className = 'qline';
	inp.placeholder = 'Satz eintippen, Enter – dann ans Satzende klicken';
	inp.style.left = Math.max(4, Math.min(innerWidth - 380, r.left + x)) + 'px';
	inp.style.top = Math.max(4, r.top + y - 16) + 'px';
	document.body.appendChild(inp);
	qline = {t0, inp, text: null};
	inp.focus();
	inp.addEventListener('keydown', e => {
		e.stopPropagation();
		if (e.key === 'Escape') { quickClose(); hint('Satz verworfen.'); }
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const v = inp.value.trim();
		if (!v) { quickClose(); return; }
		qline.text = v;
		inp.remove();
		qline.inp = null;
		hint('Jetzt in die Zeitleiste klicken, wo „' + v + '“ endet (Esc = verwerfen).');
	});
	inp.addEventListener('blur', () => { if (qline && qline.inp === inp && !qline.text) setTimeout(() => { if (qline && qline.inp === inp) quickClose(); }, 0); });
	hint('Satz eintippen, Enter – dann ans Satzende klicken. Esc = verwerfen.');
}

function quickClose() {
	if (qline && qline.inp) qline.inp.remove();
	qline = null;
}

function quickEnd(c) {
	const a = Math.min(qline.t0, c), b = Math.max(qline.t0, c);
	if (b - a < 0.2) { hint('Zu kurz – weiter rechts klicken, wo der Satz endet (Esc = verwerfen).'); return; }
	const {v: vtag, body} = LRC.stripVoice(qline.text), tk = LRC.tokensOf(body);
	quickClose();
	if (!tk.length) return;
	const wt = tk.map(k => Math.max(1, k.text.replace(/[^\p{L}\p{N}]/gu, '').length)), sum = wt.reduce((x, w) => x + w, 0);
	let acc = 0;
	tk.forEach((k, i) => { k.t = LRC.q(a + (b - a) * acc / sum); acc += wt[i]; });
	tk[tk.length - 1].end = LRC.q(b);
	pushUndo();
	let at = doc.lines.findIndex(l => { const lt = l.brk ? l.t : LRC.lineTime(l); return lt != null && lt > a; });
	if (at < 0) at = doc.lines.length;
	doc.lines.splice(at, 0, {t: null, tokens: tk, brk: false, vtag});
	clearPicked();
	sel = {li: at, ti: 0, end: false};
	changed();
	hint('Satz gesetzt: die Wortboxen an den Kanten ziehen = länger / kürzer, in der Mitte = verschieben, ✂ (X) in ein Wort = Silben  (Strg+Z = zurück)');
}

// the sentence waiting for its end: a box from its start to the mouse
function drawQline() {
	if (!qline || !qline.text) return;
	const ctx = tl.getContext('2d'), W = tl.clientWidth, x0 = (qline.t0 - view.start) / view.span * W, x1 = hoverX != null ? hoverX : x0 + 80;
	const x = Math.min(x0, x1), w = Math.max(2, Math.abs(x1 - x0)), y = LANE_Y - 26;
	ctx.save();
	ctx.fillStyle = C.cursor;
	ctx.globalAlpha = 0.25;
	ctx.fillRect(x, y, w, 20);
	ctx.globalAlpha = 1;
	ctx.strokeStyle = C.cursor;
	ctx.lineWidth = 2;
	ctx.strokeRect(x + 1, y + 1, w - 2, 18);
	ctx.font = 'bold 12px ' + UI_FONT;
	ctx.fillText(qline.text, x + 6, y - 6);
	ctx.restore();
}

// the view moved with the middle mouse button, anywhere in the timeline
function panDrag(x0) {
	const s0 = view.start, W = tl.clientWidth;
	tl.style.cursor = 'grabbing';
	const move = ev => { view.start = Math.max(0, s0 - (ev.clientX - tl.getBoundingClientRect().left - x0) / W * view.span); };
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		tl.style.cursor = '';
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
}

// pressed beside the words in the word list and dragged: a box, every word it touches is chosen (Shift / Strg: added)
$('words').addEventListener('mousedown', e => {
	if (e.button !== 0 || edit || simple || e.target.closest('.tok, .endmark, button, .ln, input, .cmpp, #cmpBar')) return;
	const base = e.shiftKey || e.ctrlKey || e.metaKey ? new Set(wpick) : new Set(), x0 = e.clientX, y0 = e.clientY;
	let box = null;
	const move = ev => {
		if (!box) {
			if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
			box = document.createElement('div');
			box.className = 'lband';
			document.body.appendChild(box);
		}
		ev.preventDefault();
		const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY), r = Math.max(x0, ev.clientX), b = Math.max(y0, ev.clientY);
		Object.assign(box.style, {left: l + 'px', top: t + 'px', width: r - l + 'px', height: b - t + 'px'});
		wpick = new Set(base);
		tokEls.forEach((row, li) => row && row.forEach((el, ti) => {
			if (!el || !el.isConnected || el.closest('.cmp-hide')) return;
			const q = el.getBoundingClientRect();
			if (q.width && q.right >= l && q.left <= r && q.bottom >= t && q.top <= b) wpick.add(li + ':' + ti);
		}));
		renderWpick();
	};
	const up = () => {
		window.removeEventListener('mousemove', move);
		window.removeEventListener('mouseup', up);
		if (!box) return;
		box.remove();
		skipClick = true;
		setTimeout(() => { skipClick = false; }, 0);
		if (picked.size) clearPicked();
		delTarget = 'words';
		wpickAt = null;
		const n = lineWordsOf(wpickList()).length;
		hint(n ? n + (n === 1 ? ' Wort' : ' Wörter') + ' gewählt: eins davon ziehen = alle dorthin schieben, Strg+C = kopieren, Entf = löschen, Esc = abwählen' : 'Keine Wörter in der Box.');
	};
	window.addEventListener('mousemove', move);
	window.addEventListener('mouseup', up);
});


// ---------------------------------------------------------------- choose, copy and paste lines
// Lines are chosen with Shift / Strg+Klick (line number, word or line box), Strg+A or ☑ Auswählen. Strg+C / ⧉ Kopieren
// copies them with all their times (as LRC text too, for other programs), Strg+V / 📋 Einfügen puts them in again so
// that they start at the playhead - like a clip in a DAW. Text from elsewhere (LRC or plain lyrics) can be pasted too.

function setPickMode(on) {
	pickMode = on;
	if (!on) hint('Auswählen aus.');
	else hint('Auswählen: Klick auf Zeilen (Text oder Box) wählt sie aus oder ab, Shift = Bereich. Dann ⧉ Kopieren, 🔗 Verlinken oder Reparieren. Esc = aus.');
	renderPicked();
}

function chosenLines() {
	const lis = picked.size ? [...picked].sort((a, b) => a - b) : sel ? [sel.li] : [];
	return lis.filter(li => doc.lines[li]);
}

// -> the copied lines as LRC text, null when nothing is chosen
function copyLines() {
	const lis = chosenLines();
	if (!lis.length && !(delTarget === 'words' && wpick.size)) { hint('Erst Zeilen auswählen: Shift / Strg+Klick oder ☑ Auswählen.'); return null; }
	const lines = delTarget === 'words' && wpick.size ? wordsAsLines() : lis.map(li => doc.lines[li]);
	const text = LRC.write({meta: [], lines});
	clip = {json: JSON.stringify(lines), text};
	hint(lines.length + (lines.length === 1 ? ' Zeile' : ' Zeilen') + ' kopiert. Abspielmarke dorthin setzen, wo sie hin sollen, dann Strg+V (📋 Einfügen).');
	return text;
}

// text: from the clipboard (null = what was copied here). Lines with times start at the playhead and go in by time,
// lines without time go in after the marked line. Copies of linked lines stay linked.
function pasteLines(text = null) {
	if (edit) { lockedHint(); return; }
	const own = clip && (text == null || text.trim() === clip.text.trim());
	let lines = own ? JSON.parse(clip.json) : text && text.trim() ? LRC.parse(text).lines : [];
	if (!own) lines.forEach(ln => { delete ln.link; });
	if (!lines.length) { hint('Nichts zum Einfügen – erst Zeilen kopieren (Strg+C).'); return; }
	const ts = lines.map(ln => LRC.lineTime(ln)).filter(x => x != null);
	let at = sel ? sel.li + 1 : doc.lines.length;
	if (ts.length && audio.src) {
		const t0 = LRC.q(clock()), d = LRC.q(t0 - Math.min(...ts)), sh = x => x == null ? x : LRC.q(x + d);
		for (const ln of lines) {
			ln.t = sh(ln.t);
			ln.tokens.forEach(k => { k.t = sh(k.t); k.end = sh(k.end); });
			if (ln.link) ln.link.base = sh(ln.link.base);
		}
		at = doc.lines.findIndex(ln => { const x = LRC.lineTime(ln); return x != null && x > t0; });
		if (at < 0) at = doc.lines.length;
	}
	pushUndo();
	doc.lines.splice(at, 0, ...lines);
	picked = new Set(lines.map((_, i) => at + i));
	pickAnchor = at;
	delTarget = 'lines';
	sel = {li: at, ti: 0, end: false};
	changed();
	showLine(at);
	hint(lines.length + (lines.length === 1 ? ' Zeile' : ' Zeilen') + ' eingefügt' + (ts.length && audio.src ? ' ab ' + LRC.fmt(clock()) : '') +
		' (Strg+Z = zurück)');
}

document.addEventListener('copy', e => {
	if (typing(e) || String(getSelection()).trim() || !doc.lines.length) return;   // marked text on the page: copy that
	const text = copyLines();
	if (text == null) return;
	e.preventDefault();
	e.clipboardData.setData('text/plain', text);
});
document.addEventListener('paste', e => {
	if (typing(e)) return;
	e.preventDefault();
	pasteLines(e.clipboardData.getData('text/plain'));
});
$('btnPick').onclick = () => setPickMode(!pickMode);

// ⤒ the word list folded up over the lyrics display and the timeline: it gets (almost) the whole screen
function setTall(on, keep = true) {
	document.body.classList.toggle('tall', on);
	$('splitTl').title = on ? 'Nach unten ziehen oder Doppelklick: Zeitleiste wieder aufklappen' : 'Ziehen: Zeitleiste höher / flacher – ganz nach oben: Wortliste aufklappen · Doppelklick: Standardhöhe';
	$('btnTall').textContent = on ? '⤓ Zuklappen' : '⤒ Aufklappen';
	$('btnTall').title = on ? 'Liedtext-Anzeige und Zeitleiste wieder zeigen' :
		'Wortliste nach oben aufklappen: sie bekommt fast den ganzen Bildschirm (Liedtext-Anzeige und Zeitleiste klappen weg)';
	if (keep) try { localStorage.setItem('lrcEditorTall', on ? '1' : ''); } catch (e) { /* ignore */ }
	scrollToSel();
}
$('btnTall').onclick = () => setTall(!document.body.classList.contains('tall'));

// ⌃ the header folded into one slim row of symbols (the words stay in the tooltips), ⌄ back
function setSlimHead(on, keep = true) {
	document.body.classList.toggle('slimhead', on);
	$('btnHead').textContent = on ? '⌄' : '⌃';
	$('btnHead').title = on ? 'Kopfleiste wieder ausklappen (mit Text)' : 'Kopfleiste einklappen: alles in einer schmalen Zeile, nur mit Symbolen';
	if (keep) try { localStorage.setItem('lrcEditorSlimHead', on ? '1' : ''); } catch (e) { /* ignore */ }
	window.dispatchEvent(new Event('resize'));
}
$('btnHead').onclick = () => setSlimHead(!document.body.classList.contains('slimhead'));
try { setSlimHead(localStorage.getItem('lrcEditorSlimHead') === '1', false); } catch (e) { setSlimHead(false, false); }
try { setTall(localStorage.getItem('lrcEditorTall') === '1', false); } catch (e) { setTall(false, false); }
$('btnCopy').onclick = () => {
	const text = copyLines();
	if (text != null && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { /* kept inside the studio */ });
};
$('btnPaste').onclick = () => {
	if (clip || !navigator.clipboard) { pasteLines(); return; }
	navigator.clipboard.readText().then(s => pasteLines(s), () => hint('Erst Zeilen kopieren (⧉ Kopieren oder Strg+C).'));
};

// ---------------------------------------------------------------- linked lines: the same sentence behaves the same
// The studio finds lines with the same text (🔗 in the line number). Linked lines share one pattern: their words and
// the times of the words relative to the line's base (its first word when it was linked). Whatever changes in one -
// a word moved, made longer, swapped, set again, the whole line moved - happens in all of them, each at its own place.
// A group has its own colour; a second version of a sentence (sung differently) is a group of its own.

function linkColor(id) {
	const c = ['#5ce1e6', '#ffb547', '#b69bff', '#7dff9b', '#ff7ac6', '#ffd166', '#6fa8ff', '#ff8f5c'];
	return c[(id - 1) % c.length];
}

function lineKey(ln) { return LRC.lineText(ln, false).replace(/\|/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

// the first other line with the same text (-1 = none)
function twinOf(li) {
	const ln = doc.lines[li], key = ln && !ln.brk ? lineKey(ln) : '';
	return key ? doc.lines.findIndex((x, j) => j !== li && !x.brk && lineKey(x) === key) : -1;
}

// a line's pattern: words with their times from the line's base (the same in every linked line)
function linkOf(ln) {
	const rel = x => x == null ? null : LRC.q(x - ln.link.base);
	return JSON.stringify(ln.tokens.map(k => [k.text, !!k.glue, rel(k.t), rel(k.end)]));
}

function linkApply(ln, pat) {
	const sh = x => x == null ? null : LRC.q(ln.link.base + x);
	ln.tokens = JSON.parse(pat).map(([text, glue, t, end]) => ({text, glue, t: sh(t), end: sh(end)}));
}

// on every change: a linked line that differs from its group gives the group its new pattern, the others follow.
// The open line (✎ / Reparieren) only once it is taken with OK.
function linkSync() {
	const groups = new Map();
	doc.lines.forEach(ln => { if (ln.link) { if (!groups.has(ln.link.id)) groups.set(ln.link.id, []); groups.get(ln.link.id).push(ln); } });
	for (const id of [...linkPat.keys()]) if (!groups.has(id)) linkPat.delete(id);
	for (const [id, ls] of groups) {
		if (ls.length < 2 && ls[0].link.solo) { linkPat.set(id, linkOf(ls[0])); continue; }   // a new version (+), waiting for lines
		if (ls.length < 2) { delete ls[0].link; linkPat.delete(id); continue; }    // alone: nothing to link any more
		ls.forEach(ln => { delete ln.link.solo; });
		const pats = ls.map(linkOf), P = linkPat.get(id);
		if (P == null) { linkPat.set(id, pats[0]); ls.slice(1).forEach(ln => linkApply(ln, pats[0])); continue; }
		const i = pats.findIndex(x => x !== P);
		if (i < 0 || (edit && ls[i] === doc.lines[edit.li])) continue;
		linkPat.set(id, pats[i]);
		ls.forEach((ln, j) => { if (j !== i) linkApply(ln, pats[i]); });
	}
}

function lineBase(ln) { const k = ln.tokens.find(x => x.t != null); return k ? k.t : LRC.lineTime(ln); }

// where a line takes the pattern P so that it stays where it is: the middle of how far its words are from the
// pattern (not its first word - a first word set too late would push the whole line to the right)
function fitBase(ln, P) {
	const pat = JSON.parse(P), off = [];
	ln.tokens.forEach((k, i) => {
		if (!pat[i]) return;
		if (k.t != null && pat[i][2] != null) off.push(k.t - pat[i][2]);
		if (k.end != null && pat[i][3] != null) off.push(k.end - pat[i][3]);
	});
	if (!off.length) { const r = pat.find(x => x[2] != null); return LRC.q(lineBase(ln) - (r ? r[2] : 0)); }
	off.sort((a, b) => a - b);
	const h = off.length >> 1;
	return LRC.q(off.length % 2 ? off[h] : (off[h - 1] + off[h]) / 2);
}

// lines lis into one group, the first one is the model; fresh: always a new group (a new version of the sentence)
function linkLines(lis, fresh) {
	const ls = lis.map(li => doc.lines[li]).filter(ln => ln && !ln.brk);
	const m = ls[0] && ls[0].tokens.some(k => k.t != null) ? ls[0] : ls.find(ln => ln.tokens.some(k => k.t != null));
	if (!m || ls.length < 2) { hint('Zum Verlinken braucht mindestens ein Satz schon Zeiten – erst setzen.'); return; }
	pushUndo();
	// the model (master) passes all its words on; a line without times gets them laid out from its own start
	// (else just after the line before)
	const timed = ls.filter(ln => {
		if (ln === m || ln.tokens.some(k => k.t != null)) return true;
		if (ln.t != null) return true;
		let p = doc.lines.indexOf(ln) - 1;
		while (p >= 0 && !lineRange(p)) p--;
		const r = p >= 0 ? lineRange(p) : null;
		if (!r) return false;
		ln.t = LRC.q(r.b + 0.1);
		return true;
	});
	timed.splice(timed.indexOf(m), 1);
	timed.unshift(m);
	const id = !fresh && m.link ? m.link.id : 1 + Math.max(0, ...doc.lines.map(ln => ln.link ? ln.link.id : 0), ...linkPat.keys());
	if (!m.link || m.link.id !== id) m.link = {id, base: lineBase(m)};
	const P = linkOf(m);
	linkPat.set(id, P);
	for (const ln of timed.slice(1)) {
		ln.link = {id, base: fitBase(ln, P)};
		linkApply(ln, P);
	}
	changed();
	const n = doc.lines.filter(ln => ln.link && ln.link.id === id).length;
	hint(n + ' Sätze verlinkt (🔗' + id + '): was du in einem änderst, passiert in allen  (Strg+Z = zurück)');
}

function unlinkLines(lis) {
	const ls = lis.map(li => doc.lines[li]).filter(ln => ln && ln.link);
	if (!ls.length) return;
	pushUndo();
	ls.forEach(ln => { delete ln.link; });
	changed();
	hint(ls.length + (ls.length === 1 ? ' Satz' : ' Sätze') + ' gelöst – sie lassen sich jetzt einzeln ändern.');
}

// 🔗 at a line: linked -> unlink it; else: no group of this sentence yet -> link it with every unlinked line of the same
// text; groups already there -> it joins the nearest one before it (else after it)
function linkToggle(li) {
	const ln = doc.lines[li];
	if (!ln || ln.brk) return;
	if (edit) { lockedHint(); return; }
	if (ln.link) { unlinkLines([li]); return; }
	const key = lineKey(ln), same = [], linked = [];
	doc.lines.forEach((x, j) => {
		if (x.brk || lineKey(x) !== key) return;
		if (x.link) linked.push(j); else same.push(j);
	});
	if (linked.length) {
		const before = linked.filter(j => j < li), m = before.length ? before[before.length - 1] : linked[0];
		linkLines([m, li], false);
		return;
	}
	if (same.length < 2) { hint('Kein gleicher Satz gefunden. Andere Versionen: Zeilen mit Strg+Klick auswählen und 🔗 Verlinken.'); return; }
	linkLines(same, false);
}

// + at a linked line: it leaves its group and starts a new version of the sentence (own colour); identical lines
// then join it with their 🔗 (the nearest version before them) or chosen together with Strg+Klick and 🔗 Verlinken
function linkVersion(li) {
	const ln = doc.lines[li];
	if (!ln || ln.brk) return;
	if (edit) { lockedHint(); return; }
	if (lineBase(ln) == null) { hint('Erst den Satz setzen, dann eine Version daraus machen.'); return; }
	pushUndo();
	const id = 1 + Math.max(0, ...doc.lines.map(x => x.link ? x.link.id : 0), ...linkPat.keys());
	ln.link = {id, base: lineBase(ln), solo: true};
	linkPat.set(id, linkOf(ln));
	changed();
	hint('Neue Version 🔗' + id + ': gleiche Sätze danach verlinken sich mit ihr (🔗 an der Zeile), oder mit Strg+Klick auswählen und 🔗 Verlinken.');
}

// the 🔗 button over the words: several chosen lines -> a group of their own (a new version); one line -> as at the line
function renderLinkBtn() {
	const b = $('btnLink'), lis = chosenLines(), ln = lis.length === 1 && doc.lines[lis[0]];
	b.textContent = lis.length > 1 ? '🔗 ' + lis.length + ' verlinken' : ln && ln.link ? '⛓ Lösen' : '🔗 Verlinken';
	b.title = lis.length > 1 ? 'Die ausgewählten Sätze verlinken: ist einer schon verlinkt, kommen die anderen in seine Gruppe, sonst eine neue Gruppe (neue Farbe)' :
		ln && ln.link ? 'Verlinkung dieses Satzes lösen: danach lässt er sich einzeln ändern' :
		'Gleiche Sätze verlinken: was du in einem änderst (Wörter, Zeiten, Verschieben), passiert in allen. Mehrere Zeilen ausgewählt = eigene Gruppe (neue Version)';
}
$('btnLink').onclick = () => {
	if (edit) { lockedHint(); return; }
	const lis = chosenLines();
	const lead = lis.find(li => doc.lines[li] && doc.lines[li].link);
	if (lis.length > 1) linkLines(lead != null ? [lead, ...lis.filter(li => li !== lead)] : lis, lead == null);
	else if (lis.length) linkToggle(lis[0]);
	else hint('Erst einen Satz markieren oder mehrere auswählen.');
};

// Zoom-Tempo is kept in this browser
$('jumpSel').onchange = () => {
	jumpSel = $('jumpSel').checked;
	try { localStorage.setItem('lrcEditorJumpSel', jumpSel ? '' : '0'); } catch (e) { /* ignore */ }
	hint(jumpSel ? 'Mitspringen an: ein Wort anwählen holt Zeitleiste und Abspielmarke zu ihm.' : 'Mitspringen aus: Wort anwählen lässt Zeitleiste und Abspielmarke, wo sie sind.');
};
try { jumpSel = $('jumpSel').checked = localStorage.getItem('lrcEditorJumpSel') !== '0'; } catch (e) { /* ignore */ }
$('tlTimes').onchange = () => { tlTimes = $('tlTimes').checked; try { localStorage.setItem('lrcEditorTlTimes', tlTimes ? '1' : ''); } catch (e) { /* ignore */ } };
try { tlTimes = $('tlTimes').checked = localStorage.getItem('lrcEditorTlTimes') === '1'; } catch (e) { /* ignore */ }
$('zoomSens').onchange = () => { try { localStorage.setItem('lrcEditorZoom2', $('zoomSens').value); } catch (e) { /* ignore */ } };
try { const z = localStorage.getItem('lrcEditorZoom2'); if (z) $('zoomSens').value = z; } catch (e) { /* ignore */ }

// ---------------------------------------------------------------- folder: which audio belongs to which LRC
//
// Pairs by file name (without extension, "_enhanced" etc. ignored), in any subfolder. With the folder
// picker (Chrome / Edge) a new LRC is written straight into the folder; otherwise the files are only read.

const AUDIO_RE = /\.(mp3|wav|flac|m4a|aiff?|ogg)$/i, LRC_RE = /\.lrc$/i;

async function openFolder() {
	if (window.showDirectoryPicker) {
		try {
			const dir = await showDirectoryPicker({id: 'juicyLrc', mode: 'readwrite'});
			keepDir(dir);
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
		if (h.kind === 'directory') { if (depth < 8 && !name.startsWith('.')) await walk(h, path + name + '/', out, depth + 1); }
		else if (AUDIO_RE.test(name) || LRC_RE.test(name)) out.push({name, path: path + name, dir, handle: h, get: () => h.getFile()});
	}
}

// the key two files are paired by: case, accents, "_" / "'" and punctuation do not count
const songKey = n => cleanStem(stemOf(n)).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
// looser: without "Artist - " and without (Mix ...) / [Edit ...]
const looseKey = n => songKey(cleanStem(stemOf(n)).replace(/^.*?\s+-\s+/, '').replace(/\s*[([][^)\]]*[)\]]/g, '') + '.x');

function setFolder(name, files, show = true) {
	const by = new Map();
	for (const f of files) {
		const key = songKey(f.name);
		if (!by.has(key)) by.set(key, {key, audio: [], lrc: []});
		by.get(key)[AUDIO_RE.test(f.name) ? 'audio' : 'lrc'].push(f);
	}
	// an LRC still alone: pair it with an audio still alone if exactly one fits loosely
	// ("Artist - Title.mp3" + "Title_enhanced.lrc", "Song (Extended Mix).wav" + "Song.lrc", files in other subfolders)
	const alone = k => [...by.values()].filter(s => (k === 'lrc' ? s.lrc.length && !s.audio.length : s.audio.length && !s.lrc.length));
	for (const s of alone('lrc')) {
		const lk = looseKey(s.lrc[0].name), lt = songKey(s.lrc[0].name);
		const fit = alone('audio').filter(a => { const ak = looseKey(a.audio[0].name), at = songKey(a.audio[0].name);
			return ak === lk || (lk.length > 3 && (at.includes(lt) || lt.includes(at))); });
		if (fit.length !== 1) continue;
		fit[0].lrc.push(...s.lrc);
		fit[0].loose = true;
		by.delete(s.key);
	}
	const anyLrc = files.find(f => LRC_RE.test(f.name) && f.dir);   // new LRCs go where the others are
	folder = {name, songs: [...by.values()].sort((a, b) => a.key.localeCompare(b.key)), lrcDir: anyLrc ? anyLrc.dir : null, cur: -1};
	renderSongNav();
	renderFolder();
	if (show) $('dlgFolder').showModal();
	renderLastDir();
}

// a new LRC was saved into the folder: show it in the list
function folderAdd(h) {
	if (!folder || !newTarget) return;
	const key = songKey(h.name);
	let s = folder.songs.find(x => x.key === key) || folder.songs[folder.cur];
	if (!s) folder.songs.push(s = {key, audio: [], lrc: []});
	if (!s.lrc.some(f => f.name === h.name))
		s.lrc.push({name: h.name, path: h.name, dir: newTarget.dir, handle: h, get: () => h.getFile()});
	renderSongNav();
}

function renderFolder() {
	const songs = folder.songs, noLrc = songs.filter(s => s.audio.length && !s.lrc.length).length;
	const noAudio = songs.filter(s => !s.audio.length).length, twice = songs.filter(s => s.lrc.length > 1).length;
	$('folderName').textContent = folder.name;
	$('folderOk').innerHTML = songs.length ? '✓ <b>Ordner ausgewählt</b> – alle Unterordner sind mit durchsucht. Du kannst das Fenster jetzt schließen (ohne Auswahl öffnet sich der oberste Song) und oben mit ◀ ▶ durch die Songs blättern, oder hier direkt einen Song öffnen.' :
		'Keine Audio- oder LRC-Dateien in diesem Ordner (auch nicht in Unterordnern). „Anderer Ordner …“ wählen.';
	$('folderOk').classList.toggle('none', !songs.length);
	$('folderSum').textContent = songs.length + ' Songs · ' + (songs.length - noLrc - noAudio) + ' komplett' +
		(noLrc ? ' · ' + noLrc + ' ohne LRC' : '') + (noAudio ? ' · ' + noAudio + ' LRC ohne Audio' : '') +
		(twice ? ' · ' + twice + ' mit mehreren LRCs' : '');
	$('folderList').innerHTML = songs.map((s, i) => {
		const a = s.audio[0], l = s.lrc[0];
		const state = !s.audio.length ? '<span class="fs warn">kein Audio</span>' : !s.lrc.length ? '<span class="fs err">keine LRC</span>' :
			s.lrc.length > 1 ? '<span class="fs warn">' + s.lrc.length + ' LRCs</span>' :
			s.loose ? '<span class="fs ok" title="Name nicht gleich, aber eindeutig zugeordnet – beim Speichern schlage ich den Audio-Namen vor">≈</span>' :
			'<span class="fs ok">✓</span>';
		const btn = s.audio.length && !s.lrc.length ? '<button type="button" data-i="' + i + '" data-act="new">LRC erstellen</button>' :
			'<button type="button" data-i="' + i + '" data-act="open">Öffnen</button>';
		return '<div class="frow">' + state + '<span class="fn" title="' + esc((a || l).path) + '">' + esc(stemOf((a || l).name)) +
			'</span><span class="fd">' + (l ? esc(l.path) : '–') + '</span>' + btn + '</div>';
	}).join('') || '<p>Keine Audio- oder LRC-Dateien gefunden.</p>';
}

async function openSong(s, create) {
	if (!await askSave()) { renderSongNav(); return; }
	dirty = false;
	$('dlgFolder').close();
	folder.cur = folder.songs.indexOf(s);
	try { localStorage.setItem('lrcEditorLastSong', s.key); } catch (e) { /* ignore */ }
	renderSongNav();
	if (s.audio.length) await loadAudio(await s.audio[0].get(), s.audio[0].handle || null);
	if (s.lrc.length) {
		await loadLrcFile(await s.lrc[0].get(), s.lrc[0].handle || null);
		if (s.lrc.length > 1) hint('Achtung: ' + s.lrc.length + ' LRCs für diesen Song (' + s.lrc.map(f => f.path).join(', ') +
			'). Player nehmen nur eine – die übrigen bitte löschen.');
		return;
	}
	setDoc({meta: [], lines: [], warnings: []}, '', null);   // the LRC of the song before must not stay (or be saved over)
	if (!create && !confirm('Für „' + s.audio[0].name + '“ gibt es noch keine LRC. Jetzt eine erstellen?')) return;
	const st = stemOf(s.audio[0].name), m = st.match(/^(.+?)\s+-\s+(.+)$/);
	newTarget = {dir: folder.lrcDir || s.audio[0].dir, name: st + '.lrc'};
	openNew(m ? m[2] : st, m ? m[1] : '');
}

// ◀ ▶ and the list in the header step through the songs of the folder, round at both ends
function renderSongNav() {
	$('songNav').hidden = !folder || !folder.songs.length;
	if (!folder) return;
	$('songSel').innerHTML = (folder.cur < 0 ? '<option value="-1">Song wählen …</option>' : '') + folder.songs.map((s, i) => {
		const f = s.audio[0] || s.lrc[0];
		return '<option value="' + i + '">' + esc(stemOf(f.name)) + (!s.lrc.length ? '  (keine LRC)' : !s.audio.length ? '  (kein Audio)' : '') + '</option>';
	}).join('');
	$('songSel').value = folder.cur;
	$('songSel').title = folder.name + ': ' + (folder.cur + 1) + ' / ' + folder.songs.length;
}

function stepSong(d) {
	if (!folder || !folder.songs.length) return;
	const n = folder.songs.length, i = folder.cur < 0 ? (d > 0 ? 0 : n - 1) : (folder.cur + d + n) % n;
	openSong(folder.songs[i], true);
}

// unsaved changes before something else is opened: save, throw away or stay. -> true = go on
function askSave() {
	if (!dirty) return Promise.resolve(true);
	if ($('dlgSave').open) return Promise.resolve(false);
	$('saveName').textContent = fileName || suggestName();
	return choose($('dlgSave')).then(async v => {
		if (v === 'save') { await save(false); return !dirty; }
		if (v === 'drop') { dirty = false; return true; }
		return false;
	});
}

// shows a dialog and answers with the value of the button clicked in it, Esc = 'cancel'. Listens to the clicks
// themselves, not to 'close' (that one comes late or not at all in a hidden tab)
function choose(dlg) {
	dlg.showModal();
	return new Promise(res => {
		const done = v => {
			dlg.removeEventListener('click', onClick);
			dlg.removeEventListener('cancel', onEsc);
			dlg.close(v);
			res(v);
		};
		const onClick = e => { const b = e.target.closest('button[value]'); if (b) { e.preventDefault(); done(b.value); } };
		const onEsc = e => { e.preventDefault(); done('cancel'); };
		dlg.addEventListener('click', onClick);
		dlg.addEventListener('cancel', onEsc);
	});
}

$('songPrev').onclick = () => stepSong(-1);
$('songNext').onclick = () => stepSong(1);
$('songSel').onchange = () => { const i = +$('songSel').value; if (i >= 0) openSong(folder.songs[i], true); };

$('btnFolder').onclick = () => folder ? (renderFolder(), $('dlgFolder').showModal()) : openFolder();
let folderKeep = false;          // the folder list closes for another folder: open no song
$('folderOther').onclick = () => { folderKeep = true; $('dlgFolder').close(); openFolder(); };
// closed without picking a song: the top one is opened
$('dlgFolder').addEventListener('close', () => {
	if (folderKeep) { folderKeep = false; return; }
	if (folder && folder.cur < 0 && folder.songs.length) openSong(folder.songs[0], true);
});
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
	const items = [...e.dataTransfer.items].filter(it => it.kind === 'file');
	const entries = items.map(it => it.webkitGetAsEntry && it.webkitGetAsEntry());
	const dirAt = entries.findIndex(en => en && en.isDirectory);
	if (dirAt >= 0) {
		// Chrome / Edge: a real folder handle, so new LRCs can be written into it; else the files are only read
		const hp = items[dirAt].getAsFileSystemHandle ? items[dirAt].getAsFileSystemHandle().catch(() => null) : Promise.resolve(null);
		dropFolder(hp, entries[dirAt]);
		return;
	}
	const hs = items.map(it => it.getAsFileSystemHandle ? it.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null));
	[...e.dataTransfer.files].forEach(async (f, i) => {
		const h = await hs[i];
		if (/\.(lrc|txt)$/i.test(f.name)) loadLrcFile(f, h && h.kind === 'file' && LRC_RE.test(f.name) ? h : null);
		else if (f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aiff?|ogg)$/i.test(f.name)) loadAudio(f, h && h.kind === 'file' ? h : null);
	});
});

async function dropFolder(hp, entry) {
	if (!await askSave()) return;
	const h = await hp, files = [];
	if (h && h.kind === 'directory') {
		keepDir(h);
		await walk(h, '', files, 0);
		setFolder(h.name, files);
		return;
	}
	await walkEntry(entry, '', files, 0);
	setFolder(entry.name, files);
}

async function walkEntry(dir, path, out, depth) {
	const reader = dir.createReader();
	for (;;) {
		const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
		if (!batch.length) break;
		for (const en of batch) {
			if (en.isDirectory) { if (depth < 8 && !en.name.startsWith('.')) await walkEntry(en, path + en.name + '/', out, depth + 1); }
			else if (AUDIO_RE.test(en.name) || LRC_RE.test(en.name))
				out.push({name: en.name, path: path + en.name, dir: null, handle: null, get: () => new Promise((res, rej) => en.file(res, rej))});
		}
	}
}

// ---------------------------------------------------------------- the last folder, kept for the next visit
// Chrome / Edge hand out a folder as a handle that can be kept (in IndexedDB). On the next visit the folder opens again
// by itself (with the song last open) if the browser still allows it, else ↺ next to Ordner asks once and opens it.

function idbDir(op, val) {
	return new Promise(res => {
		try {
			const rq = indexedDB.open('juicyLrc', 1);
			rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
			rq.onerror = () => res(null);
			rq.onsuccess = () => {
				const st = rq.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite').objectStore('kv');
				const r = op === 'get' ? st.get('lastDir') : st.put(val, 'lastDir');
				r.onsuccess = () => res(op === 'get' ? r.result || null : true);
				r.onerror = () => res(null);
			};
		} catch (e) { res(null); }
	});
}

function keepDir(dir) {
	lastDir = dir;
	idbDir('put', dir);
}

function renderLastDir() {
	const b = $('btnLastDir');
	b.hidden = !lastDir || !!folder;
	if (!lastDir) return;
	b.textContent = '↺ ' + lastDir.name;
	b.title = 'Den zuletzt geöffneten Ordner „' + lastDir.name + '“ wieder öffnen (mit dem Song von zuletzt)';
}

// ask: on a click (the browser may ask once for access); else only when access is still there
async function reopenDir(ask) {
	if (!lastDir || !lastDir.queryPermission) return false;
	try {
		let p = await lastDir.queryPermission({mode: 'readwrite'});
		if (p !== 'granted' && ask) p = await lastDir.requestPermission({mode: 'readwrite'});
		if (p !== 'granted') return false;
		const files = [];
		await walk(lastDir, '', files, 0);
		let key = '';
		try { key = localStorage.getItem('lrcEditorLastSong') || ''; } catch (e) { /* ignore */ }
		const fresh = !doc.lines.length && $('draft').hidden;     // nothing loaded yet, no draft waiting
		setFolder(lastDir.name, files, false);
		const s = folder.songs.find(x => x.key === key);
		if (s && (ask || fresh)) await openSong(s, false);
		else if (ask) { renderFolder(); $('dlgFolder').showModal(); }
		hint('📁 Ordner „' + lastDir.name + '“ wieder geöffnet' + (s && (ask || fresh) ? ', Song: ' + (s.audio[0] || s.lrc[0]).name.replace(/\.[^.]+$/, '') : '') + '.');
		return true;
	} catch (e) {
		return false;
	}
}

$('btnLastDir').onclick = async () => {
	if (!await reopenDir(true)) { hint('Der Ordner ist nicht mehr erreichbar – bitte neu wählen.'); openFolder(); }
};
idbDir('get').then(d => {
	if (!d || !d.queryPermission) return;
	lastDir = d;
	renderLastDir();
	setTimeout(() => { if (!folder) reopenDir(false); }, 300);
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

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function burst(x, y, w, h, n, party = false) {
	if (party ? calm() : !bubblesOn()) return;
	fxInit();
	n = Math.min(n, 900 - fx.list.length);
	for (let i = 0; i < n; i++) {
		const big = Math.random() < (party ? 0.35 : 0.18);
		fx.list.push({
			x: x + Math.random() * w, y: y + Math.random() * h,
			r: party ? (big ? 18 + Math.random() * 22 : 6 + Math.random() * 12) : big ? 11 + Math.random() * 9 : 4 + Math.random() * 6,
			vx: (Math.random() - 0.5) * (party ? 120 : 60), vy: -(party ? 140 + Math.random() * 220 : 30 + Math.random() * 70),
			ph: Math.random() * 6.3, wob: 0.6 + Math.random() * 1.6,
			age: -Math.random() * 0.12, life: party ? 2.2 + Math.random() * 2.4 : 1.1 + Math.random() * 1.5,
			sp: fx.sprites[(Math.random() * fx.sprites.length) | 0],
		});
	}
	fxStart();
}

// confetti for the party: little paper strips falling from the top, tumbling
const CONFETTI = ['#ff4f9a', '#ffb547', '#5ce1e6', '#9b7bff', '#7dff9b', '#ffffff'];
function confetti(n) {
	if (calm()) return;
	fxInit();
	n = Math.min(n, 900 - fx.list.length);
	for (let i = 0; i < n; i++) {
		fx.list.push({
			conf: true, x: Math.random() * innerWidth, y: -20 - Math.random() * 60,
			vx: (Math.random() - 0.5) * 140, vy: 60 + Math.random() * 160, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4,
			rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 14, ph: Math.random() * 6.3,
			age: 0, life: 3 + Math.random() * 2, col: CONFETTI[(Math.random() * CONFETTI.length) | 0],
		});
	}
	fxStart();
}

function fxInit() {
	if (fx.cv) return;
	fx.cv = $('fx');
	fx.ctx = fx.cv.getContext('2d');
	fx.sprites = bubbleSprites();
}

function fxStart() {
	if (fx.run) return;
	fx.run = true;
	fx.last = performance.now();
	requestAnimationFrame(fxFrame);
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
		if (b.conf) {
			b.vy += 60 * dt;
			b.vx *= 1 - 0.8 * dt;
			b.x += (b.vx + Math.sin(b.ph + b.age * 3) * 40) * dt;
			b.y += b.vy * dt;
			b.rot += b.spin * dt;
			g.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
			g.fillStyle = b.col;
			g.save();
			g.translate(b.x, b.y);
			g.rotate(b.rot);
			g.scale(1, Math.cos(b.ph + b.age * 7));     // tumbling: the strip turns its edge to us
			g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
			g.restore();
			return b.y < innerHeight + 30;
		}
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
let blubAt = 0;
const blubSnd = new Audio('assets/blub.wav');
function blub() {                               // once per deletion, even when several things burst at once
	const now = performance.now();
	if (now - blubAt < 150) return;
	blubAt = now;
	const s = blubSnd.cloneNode();
	s.volume = 0.8;
	s.play().catch(() => {});
}

function popEl(el) {
	if (!el || !bubblesOn()) return;
	blub();
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
	if (bubblesOn()) blub();
	const r = $('timeline').getBoundingClientRect();
	const x = r.left + (t - view.start) / view.span * r.width;
	if (x < r.left || x > r.right) return;
	burst(x - 4, r.top + 10, 8, LANE_Y - 14, 11);
}

// reset of all word times: every visible timed word gives a few bubbles, the timeline a cloud
function popAll() {
	if (!bubblesOn()) return;
	blub();
	let n = 0;
	for (const row of tokEls) for (const el of row || []) {
		if (n >= 120 || !el || el.classList.contains('unset')) continue;
		const r = el.getBoundingClientRect();
		if (r.bottom > 0 && r.top < innerHeight) { n++; burst(r.left, r.top, r.width, r.height, 2); }
	}
	const c = $('timeline').getBoundingClientRect();
	burst(c.left, c.top, c.width, LANE_Y, 40);
}

// ---------------------------------------------------------------- finished: name and status into the LRC, save, party
//
// The name is asked once and kept in the browser (⚙ Dein Name). It goes into [by:], [status:Fertig] marks the
// file as done; players ignore unknown tags.

const myName = () => { try { return (localStorage.getItem('lrcEditorName') || '').trim(); } catch (e) { return ''; } };
function setMyName(n) { try { localStorage.setItem('lrcEditorName', n.trim()); } catch (e) { /* ignore */ } }

function setMeta(key, v) {
	const m = doc.meta.find(x => x[0] === key);
	if (m) m[1] = v; else doc.meta.push([key, v]);
}

async function finish() {
	if (edit) { lockedHint(); return; }
	if (!doc.lines.length) { hint('Noch keine Lyrics da – erst eine LRC öffnen oder „Neu aus Text“.'); return; }
	const open = LRC.flat(doc).filter(e => e.k.t == null).length, errs = issues.filter(i => i.level === 'err').length;
	if ((open || errs) && !confirm('Noch nicht ganz sauber: ' + [open ? open + ' Wörter ohne Zeit' : '', errs ? errs + ' Fehler in der Prüfung' : '']
		.filter(Boolean).join(', ') + '.\nTrotzdem als fertig speichern?')) return;
	let name = myName();
	if (!name) {
		$('nameIn').value = '';
		setTimeout(() => $('nameIn').focus(), 50);
		if (await choose($('dlgName')) !== 'ok') return;
		name = $('nameIn').value.trim();
		if (!name) { hint('Ohne Namen geht’s nicht – trag ihn ein, dann nochmal 🎉 Fertig.'); return; }
		setMyName(name);
		$('myName').value = name;
	}
	pushUndo();
	setMeta('by', name);
	setMeta('status', 'Fertig');
	dirty = true;
	renderMeta();
	renderInfo();
	await save(false);
	if (dirty) return;                             // not saved (dialog cancelled): no party
	party(name);
}

const partySnd = new Audio('assets/party.wav');
function party(name) {
	partySnd.currentTime = 0;
	partySnd.volume = 0.9;
	partySnd.play().catch(() => {});
	document.querySelector('.party')?.remove();
	const el = document.createElement('div');
	el.className = 'party';
	el.innerHTML = '<div class="party-card"><div class="party-emoji">🎉</div><h2>Danke, <span class="grad">' + esc(name) + '</span>!</h2>' +
		'<p>Danke für deinen Support! „' + esc(fileName) + '“ ist fertig und gespeichert.</p></div>';
	document.body.appendChild(el);
	const gone = () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); };
	el.onclick = gone;
	setTimeout(gone, 6000);
	for (let w = 0; w < 15; w++) setTimeout(() => {
		burst(0, innerHeight - 10, innerWidth, 30, 28, true);
		if (w < 8) confetti(45);
	}, w * 300);
}

$('btnDone').onclick = finish;
$('myName').value = myName();
$('myName').onchange = () => setMyName($('myName').value);

// ---------------------------------------------------------------- compare with the original lyrics
//
// The original text (pasted or a .txt) is compared with every line, see LRC.compareRef. Each difference is listed
// in the side panel with a suggestion (replace, insert, delete) and marked in the word list. Runs again on every
// change; ✕ hides one suggestion for good.

function runRef() {
	refDiffs = [];
	refAt = new Map();
	if (!refLines) return;
	const key = d => d.kind + '|' + LRC.lineText(doc.lines[d.li], false) + '|' + (d.have || '') + '|' + (d.want || '');
	refDiffs = LRC.compareRef(doc, refLines);
	refDiffs.forEach(d => { d.key = key(d); });
	refDiffs = refDiffs.filter(d => !refSkip.has(d.key));
	for (const d of refDiffs) {
		if (d.kind === 'miss') refAt.set(d.li + ':' + d.ti0 + ':m', d);
		else if (d.kind !== 'nomatch') for (let ti = d.ti0; ti <= d.ti1; ti++) refAt.set(d.li + ':' + ti, d);
	}
}

// words that probably have syllables sung apart but are one piece in the LRC: only when the option is on, only words
// that last long enough to be sung in pieces (or have no time yet)
function runSyl() {
	sylAt = new Map();
	const m = $('sylMode').value;
	if (m === 'off') return;
	const lang = m === 'auto' ? LRC.guessLang(doc) : m;
	doc.lines.forEach((ln, li) => ln.tokens.forEach((k, ti) => {
		const ps = LRC.syllables(k.text, lang);
		if (ps.length < 2) return;
		const e = k.t != null ? boxEnd(li, ti) : null;
		if (e != null && e - k.t < 0.3) return;                                    // too short to sing in pieces
		sylAt.set(li + ':' + ti, ps);
	}));
}
// on at every start (automatic language); the button above the words and the setting switch it
let sylLast = 'auto';
$('sylMode').onchange = () => {
	if ($('sylMode').value !== 'off') sylLast = $('sylMode').value;
	$('btnSyl').classList.toggle('on', $('sylMode').value !== 'off');
	changed(false);
	if ($('sylMode').value !== 'off') hint(sylAt.size ? sylAt.size + (sylAt.size === 1 ? ' Wort könnte' : ' Wörter könnten') + ' Silben haben: orange Punkte zeigen die Trennung, ✂ am Wort trennt es.' :
		'Keine Wörter gefunden, die noch Silben brauchen.');
};
$('btnSyl').onclick = () => {
	$('sylMode').value = $('sylMode').value === 'off' ? sylLast : 'off';
	$('sylMode').onchange();
	if ($('sylMode').value === 'off') hint('Silben-Vorschläge aus.');
};
$('sylMode').value = 'auto';
changed(false);

function refTitle(d) {
	return d.kind === 'sub' ? 'Original: „' + d.want + '“' : d.kind === 'extra' ? 'Steht nicht im Original' :
		d.kind === 'miss' ? 'Hier fehlt „' + d.want + '“' : '';
}

function renderRef() {
	$('refBox').hidden = !refLines;
	if (!refLines) return;
	const nm = refDiffs.filter(d => d.kind === 'nomatch').length, n = refDiffs.length - nm;
	$('refSum').textContent = refDiffs.length ? (n ? n + ' Abweichungen' : '') + (n && nm ? ' · ' : '') +
		(nm ? nm + ' Zeilen nicht gefunden' : '') : 'wie im Original ✓';
	$('refAll').hidden = !refDiffs.some(d => d.kind === 'sub');
	$('refList').innerHTML = refDiffs.slice(0, 400).map((d, i) => {
		const z = '<b>Z. ' + (d.li + 1) + '</b> ';
		const btn = label => ' <button data-ract="apply" data-i="' + i + '">' + label + '</button>';
		const body = d.kind === 'sub' ? z + '„' + esc(d.have) + '“ → „' + esc(d.want) + '“' + btn('Tauschen') :
			d.kind === 'miss' ? z + 'fehlt „' + esc(d.want) + '“' + (d.after ? ' nach „' + esc(d.after) + '“' : ' am Anfang') + btn('Einfügen') :
			d.kind === 'extra' ? z + '„' + esc(d.have) + '“ steht nicht im Original' + btn('Löschen') :
			z + 'Zeile nicht im Original gefunden';
		return '<div class="issue rd ' + d.kind + '" data-i="' + i + '"' + (d.ref ? ' title="Original: ' + esc(d.ref) + '"' : '') + '>' +
			body + '<button class="skip" data-ract="skip" data-i="' + i + '" title="Ignorieren">✕</button></div>';
	}).join('');
}

// one suggestion into the text; in a batch the caller takes care of undo and changed()
function applyRef(d, batch = false) {
	const ln = doc.lines[d.li];
	if (!ln || d.kind === 'nomatch') return false;
	if (!batch) pushUndo();
	if (d.kind === 'sub') {
		const k = ln.tokens[d.ti0], lastK = ln.tokens[d.ti1];
		k.text = d.want;
		if (d.ti1 > d.ti0) {                          // a word of several syllables becomes one token
			if (lastK.end != null) k.end = lastK.end;
			ln.tokens.splice(d.ti0 + 1, d.ti1 - d.ti0);
		}
	} else if (d.kind === 'miss') {
		const nk = {text: d.want, t: null, end: null, glue: false}, prev = ln.tokens[d.ti0 - 1];
		const endB = prev && d.ti0 === ln.tokens.length ? boxEnd(d.li, d.ti0 - 1) : null;
		if (d.ti0 === ln.tokens.length && prev && prev.end != null) { nk.end = prev.end; prev.end = null; }  // line end moves along
		ln.tokens.splice(d.ti0, 0, nk);
		if (d.ti0 > 0) timeInserted(d.li, d.ti0 - 1, 1, endB);
	} else {
		popEl(tokEls[d.li] && tokEls[d.li][d.ti0]);
		const gone = ln.tokens.splice(d.ti0, d.ti1 - d.ti0 + 1), endK = gone[gone.length - 1];
		if (endK.end != null && ln.tokens.length && d.ti0 === ln.tokens.length) ln.tokens[ln.tokens.length - 1].end = endK.end;
		if (!ln.tokens.length) doc.lines.splice(d.li, 1);
	}
	if (!batch) {
		const l2 = doc.lines[d.li];
		sel = l2 && l2.tokens.length ? {li: d.li, ti: Math.min(d.ti0, l2.tokens.length - 1), end: false} : null;
		changed();
	}
	return true;
}

$('btnRef').onclick = () => {
	if (edit) { lockedHint(); return; }
	$('refText').value = refRaw;
	$('dlgRef').showModal();
};
$('refEdit').onclick = () => $('btnRef').onclick();
$('refFile').onclick = () => $('refFileIn').click();
$('refFileIn').onchange = async e => {
	const f = e.target.files[0];
	if (f) $('refText').value = LRC.decode(await f.arrayBuffer());
	e.target.value = '';
};
$('dlgRef').addEventListener('close', () => {
	if ($('dlgRef').returnValue !== 'ok') return;
	refRaw = $('refText').value;
	const lines = LRC.cleanLyrics(refRaw).filter(Boolean);
	refLines = lines.length ? lines : null;
	refSkip = new Set();
	changed(false);
	if (refLines) hint(refDiffs.length ? 'Abgleich: ' + $('refSum').textContent + ' – rechts in der Liste, im Text unterstrichen.' :
		'Abgleich: alles wie im Original ✓');
});
$('refOff').onclick = () => { refLines = null; changed(false); };
$('refAll').onclick = () => {
	if (edit) { lockedHint(); return; }
	const subs = refDiffs.filter(d => d.kind === 'sub').sort((a, b) => b.li - a.li || b.ti0 - a.ti0);
	if (!subs.length) return;
	pushUndo();
	subs.forEach(d => applyRef(d, true));
	changed();
	hint(subs.length + ' Wörter getauscht (Strg+Z macht es rückgängig).');
};
$('refList').addEventListener('click', e => {
	const row = e.target.closest('.rd');
	if (!row) return;
	const d = refDiffs[+row.dataset.i];
	if (!d) return;
	const act = e.target.closest('button[data-ract]');
	if (act && act.dataset.ract === 'skip') { refSkip.add(d.key); changed(false); return; }
	if (act) {
		if (edit) { lockedHint(); return; }
		applyRef(d);
		return;
	}
	if (edit && d.li !== edit.li) { lockedHint(); return; }
	const ln = doc.lines[d.li];
	setSel({li: d.li, ti: Math.max(0, Math.min(d.ti0, ln.tokens.length - 1)), end: false});
	jumpToSel(d.li);
});

// ---------------------------------------------------------------- splitters: timeline height and side panel width
// Drag the grip under the timeline or the bar left of the side panel; each size stays between min and max and is
// kept in this browser. Double click = default size.

const TL_H = {min: 150, def: 179, max: 520}, SIDE_W = {min: 230, def: 340, max: 680}, PV_H = {min: 34, def: 96, max: 260};
const clampTo = (v, r) => Math.round(Math.max(r.min, Math.min(r.max, v)));

function setTlH(h, keep = true) {
	h = clampTo(Math.min(h, innerHeight * 0.6), TL_H);      // the word list keeps some room
	LANE_Y = h - 42;
	if (keep) try { localStorage.setItem('lrcEditorTlH', h); } catch (e) { /* ignore */ }
}

function setPvH(h, keep = true) {
	pvH = clampTo(Math.min(h, innerHeight * 0.35), PV_H);
	$('preview').style.height = pvH + 'px';
	fitPreview();
	if (keep) try { localStorage.setItem('lrcEditorPvH', pvH); } catch (e) { /* ignore */ }
}

// lyrics preview: the font follows the box height. Under 78 px the grey next line goes and the current line takes
// its room (never bigger than just before); a line too wide for the box gets smaller still.
function fitPreview() {
	const next = pvH >= 78, cur = next ? Math.min(72, (pvH - 10) * 0.42) : Math.min(28, (pvH - 10) / 1.2);
	const el = $('pvCur'), nx = $('pvNext');
	nx.hidden = !next;
	nx.style.fontSize = Math.max(11, cur * 0.5) + 'px';
	el.style.fontSize = cur + 'px';
	if (el.scrollWidth > el.clientWidth + 1) el.style.fontSize = Math.max(10, cur * el.clientWidth / el.scrollWidth * 0.97) + 'px';
}
window.addEventListener('resize', fitPreview);

function setSideW(w, keep = true) {
	w = clampTo(Math.min(w, innerWidth * 0.6), SIDE_W);
	document.querySelector('aside').style.width = w + 'px';
	if (keep) try { localStorage.setItem('lrcEditorSideW', w); } catch (e) { /* ignore */ }
}

function splitter(el, cur, set, axis) {
	el.addEventListener('pointerdown', e => {
		if (e.button !== 0) return;
		e.preventDefault();
		const p0 = axis === 'y' ? e.clientY : e.clientX, v0 = cur();
		el.setPointerCapture(e.pointerId);
		el.classList.add('drag');
		document.body.classList.add('resizing', axis === 'y' ? 'rs-y' : 'rs-x');
		const sx = document.body.classList.contains('side-left') ? -1 : 1;        // side panel: towards the centre = wider
		const move = ev => set(v0 + (axis === 'y' ? ev.clientY - p0 : (p0 - ev.clientX) * sx));
		const up = () => {
			el.removeEventListener('pointermove', move);
			el.removeEventListener('pointerup', up);
			el.removeEventListener('pointercancel', up);
			el.classList.remove('drag');
			document.body.classList.remove('resizing', 'rs-y', 'rs-x');
		};
		el.addEventListener('pointermove', move);
		el.addEventListener('pointerup', up);
		el.addEventListener('pointercancel', up);
	});
}

splitter($('splitTl'), () => document.body.classList.contains('tall') ? TL_H.min - 60 : LANE_Y + 42, h => {
	const tall = h < TL_H.min - 40;
	if (tall !== document.body.classList.contains('tall')) setTall(tall);
	if (!tall) setTlH(h);
}, 'y');
splitter($('splitPv'), () => pvH, setPvH, 'y');
$('splitPv').ondblclick = () => setPvH(PV_H.def);
splitter($('splitSide'), () => document.querySelector('aside').getBoundingClientRect().width, setSideW, 'x');
$('splitTl').ondblclick = () => { if (document.body.classList.contains('tall')) setTall(false); else setTlH(TL_H.def); };
$('splitSide').ondblclick = () => { document.querySelector('aside').style.width = ''; try { localStorage.removeItem('lrcEditorSideW'); } catch (e) { /* ignore */ } };
try {
	const h = +localStorage.getItem('lrcEditorTlH'), w = +localStorage.getItem('lrcEditorSideW');
	setPvH(+localStorage.getItem('lrcEditorPvH') || PV_H.def, false);
	if (h) setTlH(h, false);
	if (w) setSideW(w, false);
} catch (e) { /* ignore */ }

// check tools left of ▶: their left edge lines up with the file buttons above (▶ follows right after them)
function alignChecks() {
	const bar = document.querySelector('header .bar'), ck = $('checks');
	ck.style.marginLeft = getComputedStyle(bar).display === 'grid' ?
		Math.max(0, document.querySelector('header .files').offsetLeft - bar.offsetLeft) + 'px' : '';
}
window.addEventListener('resize', alignChecks);
window.addEventListener('load', alignChecks);          // web fonts change the widths
alignChecks();

// ---------------------------------------------------------------- side panel: dock left / right (⇆), fold to a strip (»)

function sideLayout(left, mini, keep = true) {
	const b = document.body.classList;
	b.toggle('side-left', left);
	b.toggle('side-mini', mini);
	// the arrow points where the panel goes: folding pushes it to its edge, unfolding pulls it back
	$('sideFold').textContent = (mini ? !left : left) ? '«' : '»';
	$('sideFold').title = mini ? 'Seitenleiste wieder aufklappen' : 'Seitenleiste einklappen: nur noch ein schmaler Streifen mit den Fehlern';
	if (keep) try { localStorage.setItem('lrcEditorSide', (left ? 'L' : 'R') + (mini ? 'm' : '')); } catch (e) { /* ignore */ }
}
$('sideDock').onclick = () => sideLayout(!document.body.classList.contains('side-left'), document.body.classList.contains('side-mini'));
$('sideFold').onclick = () => sideLayout(document.body.classList.contains('side-left'), !document.body.classList.contains('side-mini'));
try {
	const s = localStorage.getItem('lrcEditorSide') || 'R';
	sideLayout(s[0] === 'L', s[1] === 'm', false);
} catch (e) { sideLayout(false, false, false); }

// the strip: counts, then one tick per line with a problem at its place in the song (by line number)
function renderMini() {
	const n = lv => issues.filter(i => i.level === lv).length, unset = issues.filter(i => i.code === 'unset');
	const unsetL = new Set(unset.map(i => i.li)), refL = new Set(refLines ? refDiffs.map(d => d.li) : []);
	const b = [['err', n('err'), 'Fehler'], ['warn', n('warn'), 'Warnungen'], ['unset', unset.length, 'Wörter noch nicht gesetzt'],
		['ref', refLines ? refDiffs.length : 0, 'Abweichungen vom Original']].filter(x => x[1]);
	$('miniBadges').innerHTML = b.length ? b.map(x => '<div class="mb ' + x[0] + '" title="' + x[1] + ' ' + x[2] + '">' +
		(x[1] > 99 ? '99+' : x[1]) + '</div>').join('') : doc.lines.length ? '<div class="mb ok" title="Alles ok">✓</div>' : '';
	const N = doc.lines.length, h = N ? Math.max(1.5, 100 / N) : 0, ticks = [];
	doc.lines.forEach((ln, li) => {
		const kind = lineBad.get(li) || (refL.has(li) ? 'ref' : unsetL.has(li) ? 'unset' : '');
		if (!kind) return;
		const what = kind === 'err' ? 'Fehler' : kind === 'warn' ? 'Warnung' : kind === 'ref' ? 'weicht vom Original ab' : 'ungesetzte Wörter';
		ticks.push('<i class="' + kind + '" data-li="' + li + '" style="top:' + (li / N * 100).toFixed(2) + '%;height:' + h.toFixed(2) +
			'%" title="Zeile ' + (li + 1) + ': ' + what + ' – ' + esc(LRC.lineText(ln, false).replace(/\|/g, '').slice(0, 60)) + '"></i>');
	});
	$('miniMap').innerHTML = ticks.join('');
}
$('miniMap').addEventListener('click', e => {
	const tick = e.target.closest('i[data-li]');
	if (!tick) return;
	const li = +tick.dataset.li;
	if (edit && li !== edit.li) { lockedHint(); return; }
	goLine(li);
});

// ---------------------------------------------------------------- tutorial: a made-up example song, one step per tool
// Each step points at its area, a red arrow blinks over what to use, it says what to try and ticks off by itself once
// it is done (check). The song is built so every tool has something to do: a long word to split, a stack, a missing
// end, two lines the wrong way round, a typo, an untimed line, a word with a pause in it and a line that is too long.

const TUT_LRC = `[ti:Juicy im Studio]
[ar:Juicy]
[00:01.00]<00:01.00>Juicy <00:01.50>singt <00:02.00>im <00:02.40>Sonnenschein <00:04.20>
[00:05.00]<00:05.00>Alle <00:05.00>Wörter <00:05.00>auf <00:05.00>einmal <00:07.00>
[00:08.00]<00:08.00>Der <00:08.40>Mond <00:09.00>tanst <00:09.60>mit
Diese Zeile setzt du selbst
[00:19.00]<00:19.00>Hier <00:19.50>stimmt <00:20.00>die <00:20.40>Reihenfolge <00:21.60>nicht <00:22.20>
[00:15.00]<00:15.00>Ich <00:15.40>komme <00:15.90>eigentlich <00:16.70>zuerst <00:17.40>
[00:24.00]<00:24.00>Kurz <00:24.50>Pause <00:26.40>und <00:26.80>weiter <00:27.40>geht's <00:28.20>
[00:30.00]<00:30.00>Eine <00:30.40>lange <00:30.90>Zeile <00:31.40>wird <00:31.80>hier <00:32.20>in <00:32.40>zwei <00:32.90>geteilt <00:34.00>
`;
const TUT_REF = `Juicy singt im Sonnenschein
Alle Wörter auf einmal
Der Mond tanzt mit
Diese Zeile setzt du selbst
Ich komme eigentlich zuerst
Hier stimmt die Reihenfolge nicht
Kurz Pause und weiter geht's
Eine lange Zeile wird hier in zwei geteilt`;

// the line that starts with these words (lines move and change during the tutorial), -1 if none
const tutLine = s => doc.lines.findIndex(ln => LRC.lineText(ln, false).replace(/\|/g, '').toLowerCase().startsWith(s.toLowerCase()));
const tutTok = (s, w) => {                // [li, ti] of the word w in that line
	const li = tutLine(s);
	return li < 0 ? [-1, -1] : [li, doc.lines[li].tokens.findIndex(k => k.text.replace(/[^\p{L}']/gu, '') === w)];
};
const tutShow = s => { const li = tutLine(s); if (li >= 0) { if (!edit) goLine(li); showLine(li); } };
const tutEl = (s, w) => { const [li, ti] = tutTok(s, w); return li >= 0 && ti >= 0 && tokEls[li] ? tokEls[li][ti] : null; };
const tutTimes = () => JSON.stringify(doc.lines.map(l => l.tokens.map(k => [k.t, k.end])));
// something drawn in the timeline (a word box, a button), as a rect on the page
const tutCv = o => { if (!o) return null; const r = tl.getBoundingClientRect(); return {left: r.left + o.x0, top: r.top + o.y0, width: o.x1 - o.x0, height: o.y1 - o.y0}; };
const tutBody = (s, w) => { const [li, ti] = tutTok(s, w); return tutCv(bodies.find(o => o.li === li && o.ti === ti)); };

const TUT = [
	{title: 'Willkommen im Studio!', area: () => $('stage'),
		html: 'Ich führe dich mit einem kleinen Beispielsong durch das Studio: <i>Juicy im Studio</i>. Der <b class="tut-err">rote Pfeil</b> ' +
			'zeigt immer auf das, was du bedienen sollst. Oben ist die <b>Zeitleiste</b> mit den Wörtern und ihren Zeiten, ' +
			'darunter die <b>Wortliste</b>, rechts die <b>Prüfung</b>.<br>Diese Karte kannst du oben anfassen und verschieben.'},
	{title: 'Audio auswählen', area: () => document.querySelector('header .files'), point: () => $('btnAudio'),
		html: 'Mit <b>♪ Audio</b> wählst du deinen Song aus (mp3, wav, flac, m4a …). Er bleibt auf deinem Rechner, nichts wird hochgeladen. ' +
			'Du kannst die Datei auch einfach ins Fenster ziehen. Dann siehst du die Wellenform und hörst mit <b>▶</b> und Rechtsklick rein.<br>' +
			'Für das Tutorial brauchst du kein Audio – das Beispiel geht auch ohne.'},
	{title: 'LRC auswählen oder neu anlegen', area: () => document.querySelector('header .files'), point: () => [$('btnOpen'), $('btnNew')],
		html: '<b>LRC öffnen</b> lädt eine fertige oder halbfertige LRC-Datei. Hast du nur den Songtext, nimm <b>Neu aus Text</b> und ' +
			'füg ihn ein – eine Zeile pro Bildschirmzeile. Mit <b>📁 Ordner</b> öffnest du gleich einen ganzen Ordner: Das Studio zeigt, ' +
			'welches Audio zu welcher LRC gehört, und du blätterst mit ◀ ▶ durch die Songs.<br>Den Beispielsong habe ich schon für dich geladen.'},
	{title: 'Zeitleiste bewegen', area: () => $('timeline'), point: () => $('timeline'),
		html: '<b>Mausrad</b> über der Zeitleiste = zoomen, <b>Shift + Mausrad</b> oder im Leeren ziehen = blättern. ' +
			'Die schmale <b>Übersicht</b> darüber zeigt den ganzen Song, ein Klick springt dorthin.',
		task: 'Zoome einmal mit dem Mausrad hinein oder heraus.',
		setup: s => { s.span = view.span; }, check: s => Math.abs(view.span - s.span) > 0.01},
	{title: 'Wörter markieren', area: () => $('words'), point: () => tutEl('Der Mond', 'Mond'),
		html: 'In der Wortliste steht jede Zeile mit Nummer, Startzeit und ihren Wörtern. Ein <b>Klick</b> auf ein Wort markiert es, ' +
			'die Zeitleiste springt mit. Mit <b>← →</b> gehst du Wort für Wort weiter.',
		task: 'Klick in der Wortliste auf <i>Mond</i> in Zeile 3.',
		check: () => { const [li, ti] = tutTok('Der Mond', 'Mond'); return !!sel && sel.li === li && sel.ti === ti; }},
	{title: 'Fehler in der Wortliste', area: () => $('words'), setup: () => tutShow('Alle Wörter'),
		point: () => [document.querySelector('#words .tok.err'), document.querySelector('#words .endmark.missing')],
		html: 'Die Wortliste zeigt Fehler direkt am Wort: <b class="tut-err">rot</b> = Fehler (z. B. gleiche Zeit wie das Wort davor), ' +
			'<b class="tut-warn">orange</b> = Warnung, <b>grau</b> = noch keine Zeit. Ein <b>⏹ Ende</b> mit <i>?</i> heißt: Das Zeilenende fehlt. ' +
			'Fährst du mit der Maus über ein Wort, steht der Grund im Tooltip. In der Zeitleiste sind dieselben Stellen rot bzw. orange, ' +
			'und rechts in der <b>Prüfung</b> stehen alle als Liste.'},
	{title: 'Silben trennen', area: () => tutEl('Juicy singt', 'Sonnenschein') || $('words'), setup: () => tutShow('Juicy singt'),
		point: () => { const e = tutEl('Juicy singt', 'Sonnenschein'); return e && (e.querySelector('.tsyl') || e); },
		html: '<i>Sonnenschein</i> wird lang gesungen, ist aber ein Stück. Die orangen Punkte zeigen, wo man es trennen könnte: ' +
			'<i>Son·nen·schein</i>. Das runde <b>✂</b> links oben trennt alle Silben auf einmal. Fährst du über <b>einen</b> Punkt, ' +
			'erscheint darunter ✂ – ein Klick trennt nur dort. Die Zeit des Wortes wird auf die Silben aufgeteilt.<br>' +
			'Der Knopf <b>Sil·ben</b> über der Liste schaltet die Vorschläge an und aus.',
		task: 'Trenne <i>Sonnenschein</i> – ganz oder nur an einem Punkt.',
		check: () => { const li = tutLine('Juicy singt'); return li >= 0 && doc.lines[li].tokens.length > 4; }},
	{title: 'Gestapelte Wörter auffächern', area: () => $('timeline'), setup: () => tutShow('Alle Wörter'),
		point: () => { const li = tutLine('Alle Wörter'); return tutCv(fanBtns.find(b => b.li === li)); },
		html: 'In Zeile 2 haben alle vier Wörter dieselbe Zeit: Sie liegen <b class="tut-err">rot</b> übereinander. ' +
			'Klick auf den runden Knopf <b>⇔</b> über dem Stapel (Maus kurz drauf = <i>4 Wörter auffächern</i>): Jedes Wort bekommt eine Länge nach seinem Text, ' +
			'das Zeilenende rückt mit. Würde die Zeile in die nächste laufen, liegt sie rot leuchtend eine Ebene höher, bis du Platz machst.',
		task: 'Fächere den Stapel in Zeile 2 auf.',
		check: () => { const li = tutLine('Alle Wörter'); return li >= 0 && new Set(doc.lines[li].tokens.map(k => k.t)).size === doc.lines[li].tokens.length; }},
	{title: 'Wörter und Zeilen ziehen', area: () => $('timeline'), setup: s => { tutShow('Alle Wörter'); s.v = tutTimes(); },
		point: () => tutBody('Alle Wörter', 'Wörter'),
		html: 'Fass in der Zeitleiste den <b>Balken unter einem Wort</b> an und zieh = Wort verschieben. Seine <b>Kanten</b> ' +
			'machen es länger oder kürzer. Ziehst du ein Wort über seinen Nachbarn, liegt es rot eine Ebene höher, bis du es zurückschiebst.<br>' +
			'Die <b>Zeilen-Box ganz unten</b> verschiebt die ganze Zeile mit allen Wörtern. Mit Audio spielt dabei die Stelle kurz an.<br>' +
			'Vertan? <b>Strg+Z</b> nimmt es zurück.',
		task: 'Verschiebe ein Wort oder eine Zeile.', check: s => tutTimes() !== s.v},
	{title: 'Zeilenende bestätigen', area: () => endEls[tutLine('Der Mond')] || $('words'), setup: () => tutShow('Der Mond'),
		point: () => { const e = endEls[tutLine('Der Mond')]; return e && (e.querySelector('.tok-ok') || e); },
		html: 'Zeile 3 hat kein Ende: Nach <i>mit</i> steht <b>⏹ Ende</b> mit Fragezeichen, in der Zeitleiste ein gestrichelter Vorschlag <i>Ende?</i>. ' +
			'Den Vorschlag kannst du in der Zeitleiste ziehen. Passt er, setzt der kleine <b>✓</b> am Ende in der Wortliste ihn fest.',
		task: 'Setze das Ende von Zeile 3 mit ✓ fest.',
		check: () => { const li = tutLine('Der Mond'); return li >= 0 && doc.lines[li].tokens[doc.lines[li].tokens.length - 1].end != null; }},
	{title: 'Zeile an der falschen Stelle', area: () => $('timeline'), setup: () => tutShow('Ich komme'), point: () => tutCv(orderBtns[0]),
		html: '<i>Ich komme eigentlich zuerst</i> steht im Text nach <i>Hier stimmt …</i>, beginnt aber früher. Unter ihr zeigt ein <b class="tut-warn">oranges Schild</b> ' +
			'mit Pfeil, wo sie steht; rechts in der Prüfung steht es auch. Ein Klick auf das Schild sortiert alle Zeilen nach ihrer Zeit.',
		task: 'Klick auf das orange Schild.', check: () => tutLine('Ich komme') >= 0 && tutLine('Ich komme') < tutLine('Hier stimmt')},
	{title: 'Mit den Original-Lyrics vergleichen', area: () => $('btnRef'), setup: () => { if (!refRaw) refRaw = TUT_REF; tutShow('Der Mond'); },
		point: () => !refLines ? $('btnRef') : tutEl('Der Mond', 'tanst'),
		html: 'Tippfehler findet der <b>Vergleich mit dem Original</b>. Den Originaltext habe ich schon eingefügt – klick auf ' +
			'<b>Mit Original-Lyrics vergleichen</b> und dann auf <b>Vergleichen</b>.<br>Danach ist <i>tanst</i> markiert. Fahr in der ' +
			'Wortliste darüber: Oben erscheint <b>↔ tanzt</b>, ein Klick tauscht. Danach steht dort <b>↶ tanst</b> – damit tauschst du zurück. ' +
			'Rechts im <i>Original-Abgleich</i> stehen alle Abweichungen mit Vorschlag.',
		task: 'Vergleiche und tausche <i>tanst</i> gegen <i>tanzt</i>.', check: () => tutLine('Der Mond tanzt') >= 0},
	{title: 'Loop an und aus', area: () => document.querySelector('header .transport'), point: () => [$('btnLoopMode'), $('btnLoop')],
		setup: s => { s.m = loopMode; },
		html: '<b>↻</b> neben ▶ ist der <b>Loop-Modus</b>: an (leuchtet) = die markierte Zeile läuft beim Abspielen immer im Loop, ' +
			'wählst du eine andere Zeile, loopt sofort die. Aus = der ganze Song läuft durch.<br>' +
			'<b>↻ Zeile loopen</b> über der Wortliste (Taste <b>L</b>) spielt die markierte Zeile einmal im Loop, mit etwas Vor- und Nachlauf. ' +
			'<b>Esc</b> stoppt. Das hörst du natürlich erst mit Audio.',
		task: 'Schalte den Loop-Modus mit ↻ einmal um.', check: s => loopMode !== s.m},
	{title: 'Eine Zeile selbst setzen', area: () => $('modeBar'), setup: () => tutShow('Diese Zeile'),
		point: () => editing(tutLine('Diese Zeile')) ? $('timeline') : $('btnEdit'),
		html: '<i>Diese Zeile setzt du selbst</i> hat noch keine Zeiten (grau). Sie ist markiert – drück <b>B</b> (oder ✎ Zeile bearbeiten). ' +
			'Jetzt hängt das erste Wort an der Maus: Jeder <b>Linksklick</b> in die Zeitleiste setzt ein Wort, zum Schluss das <b>Ende</b>. ' +
			'Mit Audio hörst du vorher mit <b>Rechtsklick</b> rein. <b>Enter</b> = OK übernimmt, <b>Esc</b> bricht ab.<br>' +
			'Mit Audio geht es auch im Takt: <b>T</b> schaltet <i>Leertaste tippt</i> an, dann setzt jeder Druck auf die Leertaste das nächste Wort.',
		task: 'Setze alle fünf Wörter und das Ende, dann Enter.',
		check: () => {
			const li = tutLine('Diese Zeile');
			if (li < 0 || editing(li)) return false;
			const tk = doc.lines[li].tokens;
			return tk.every(k => k.t != null) && tk[tk.length - 1].end != null;
		}},
	{title: 'Pause in ein Wort', area: () => $('btnPause'), setup: () => tutShow('Kurz Pause'),
		point: () => pauser ? tutBody('Kurz', 'Pause') : $('btnPause'),
		html: 'In Zeile 7 ist <i>Pause</i> fast zwei Sekunden lang – gesungen wird es aber kurz, danach ist Stille. ' +
			'Schalte das <b>⏸ Pause</b>-Werkzeug an (Taste <b>P</b>) und klick in der Zeitleiste in das Wort <i>Pause</i>, wo es enden soll. ' +
			'Bis zum nächsten Wort ist dann Pause (grüne Marke, lässt sich ziehen). <b>Esc</b> schaltet das Werkzeug aus.',
		task: 'Lass <i>Pause</i> mit dem Pause-Werkzeug früher enden.',
		check: () => { const [li, ti] = tutTok('Kurz', 'Pause'); return li >= 0 && ti >= 0 && doc.lines[li].tokens[ti].end != null; }},
	{title: 'Zeile teilen', area: () => $('btnSplit'), setup: () => { setPauser(false); tutShow('Eine lange'); },
		point: () => {
			if (!blade) return $('btnSplit');
			const a = tutBody('Eine lange', 'hier'), b = tutBody('Eine lange', 'in');
			return a && b ? {left: (a.left + a.width + b.left) / 2 - 1, top: b.top, width: 2, height: b.height} : null;
		},
		html: 'Die letzte Zeile ist zu lang für den Bildschirm. Schalte die <b>✂ Klinge</b> an (Taste <b>X</b>) und klick in der Zeitleiste ' +
			'zwischen <i>hier</i> und <i>in</i> – wie beim Schneiden eines Clips. Die Zeile wird dort in zwei Zeilen geteilt.',
		task: 'Teile die lange Zeile in zwei.', check: () => tutLine('Eine lange') >= 0 && doc.lines[tutLine('Eine lange')].tokens.length < 8},
	{title: 'Wörter löschen und einfügen', area: () => tutEl('Juicy singt', 'im') || $('words'), point: () => tutEl('Juicy singt', 'im'),
		setup: s => { setBlade(false); tutShow('Juicy singt'); s.n = LRC.flat(doc).length; },
		html: 'Fahr in der Wortliste über ein Wort: Das kleine <b>×</b> löscht es, das <b>+</b> rechts daneben fügt dahinter ein neues ein. ' +
			'Es bekommt gleich eine Zeit mitten zwischen seinen Nachbarn und steht so schon in der Zeitleiste. ' +
			'<b>Doppelklick</b> (oder F2) auf ein Wort ändert seinen Text, <code>|</code> trennt Silben.',
		task: 'Füge mit + ein Wort ein (z. B. <i>hellen</i> nach <i>im</i>).', check: s => LRC.flat(doc).length > s.n},
	{title: 'Prüfung und nächster Fehler', area: () => $('issues'), point: () => [$('issues'), $('btnNext')],
		html: 'Rechts listet die <b>Prüfung</b> alles, was noch nicht stimmt: rot = Fehler, orange = Warnung. Ein Klick springt hin. ' +
			'<b>N</b> (oder <i>Nächster Fehler ⏭</i>) geht zur nächsten Zeile mit Problemen. ' +
			'<b>Zeiten verteilen</b> und <b>Enden schätzen</b> oben helfen bei vielen Fällen auf einmal.<br>' +
			'Mehrere Zeilen neu setzen: Zeilennummern anklicken (Shift = Bereich) und <b>Reparieren</b> (R).'},
	{title: 'Speichern und fertig', area: () => document.querySelector('header .files'), point: () => [$('btnSave'), $('btnDone')],
		html: '<b>Speichern</b> (Strg+S) schreibt die LRC – sie muss heißen wie das Audio, das Studio schlägt den Namen vor. ' +
			'Sitzt alles, trägt <b>🎉 Fertig</b> deinen Namen ein und speichert.<br>' +
			'Alle Tasten stehen unter <b>?</b>. Das Tutorial findest du jederzeit wieder unter 🎓.'},
	{title: 'Jetzt dein Song!', area: () => document.querySelector('header .files'), point: () => [$('btnFolder'), $('btnAudio'), $('btnOpen')],
		html: 'Geschafft! 🎉 Jetzt wählst du dein <b>Original-Audio</b> und deine <b>LRC</b> aus – oder gleich den <b>ganzen Ordner</b>, ' +
			'in dem deine Audio- und LRC-Dateien liegen. Dann zeigt das Studio, was zusammengehört und wo noch eine LRC fehlt.' +
			'<div class="tut-go"><button class="primary" data-go="btnFolder">📁 Ganzen Ordner öffnen</button>' +
			'<button data-go="btnAudio">♪ Audio wählen</button><button data-go="btnOpen">LRC öffnen</button>' +
			'<button data-go="btnNew">Neu aus Text</button></div>'},
];

let tutHl = null;
function tutArea(el) {
	if (tutHl) tutHl.classList.remove('tour-hl');
	tutHl = el || null;
	if (tutHl) tutHl.classList.add('tour-hl');
}

// the blinking red arrows: over the target pointing down, or under it pointing up when there is no room above
const tutArrows = [];
function tutPlace() {
	let list = [];
	const dlg = document.querySelector('dialog[open]');
	if (tut) {
		const st = TUT[tut.i];
		const p = tut.done ? $('tutNext') : st.point && !$('dlgRef').open ? st.point() : null;    // done: on to Weiter
		list = (Array.isArray(p) ? p : [p]).filter(Boolean);
	} else if (asst.on && dlg && dlg === $('dlgFolder')) {
		list = [dlg.querySelector('button[value="close"]')];           // folder list: on with Fertig – schließen
	} else if (asst.on && asst.step && asst.step.point && asstArrow() && !dlg) {
		const p = asst.step.point();
		list = (Array.isArray(p) ? p : [p]).filter(Boolean);
	}
	const host = dlg && list.length && !tut ? dlg : document.body;      // a modal dialog lies on top: the arrows go into it
	list.forEach((p, i) => {
		let a = tutArrows[i];
		if (!a) {
			a = tutArrows[i] = document.createElement('div');
			a.className = 'tut-arrow';
			a.innerHTML = '<svg viewBox="0 0 34 46" aria-hidden="true"><path d="M10 2h14v22h8L17 44 2 24h8z"/></svg>';
		}
		if (a.parentNode !== host) host.append(a);
		const r = p.getBoundingClientRect ? p.getBoundingClientRect() : p;
		const up = r.top < 56 || !!(p.closest && p.closest('header')), x = r.left + r.width / 2 - 17;    // header: from below
		const off = r.top + r.height < 0 || r.top > innerHeight || (!r.width && !r.height);
		a.hidden = off;
		a.classList.toggle('up', up);
		const L = Math.max(2, Math.min(innerWidth - 36, x)), T = up ? r.top + r.height + 4 : r.top - 50;
		a.style.left = L + 'px';
		a.style.top = T + 'px';
		if (host !== document.body && !off) {         // inside a dialog 'fixed' may count from the dialog: correct by what came out
			const g = a.getBoundingClientRect();
			a.style.left = L + L - g.left + 'px';
			a.style.top = T + T - g.top + 'px';
		}
	});
	for (let i = list.length; i < tutArrows.length; i++) tutArrows[i].hidden = true;
}
function tutPoint() {
	tutPlace();
	requestAnimationFrame(tutPoint);
}
requestAnimationFrame(tutPoint);

async function startTut() {
	if (!await askSave()) return;
	if (edit) endEdit(false);
	setBlade(false);
	setPauser(false);
	newTarget = null;
	refRaw = '';
	try { $('settings').hidePopover(); } catch (e) { /* not open */ }
	$('sylMode').value = 'auto';
	$('sylMode').onchange();
	tut = {i: 0, s: {}, done: false};
	document.body.classList.remove('simple');          // the tutorial shows the whole studio
	$('asst').hidden = true;
	const d = LRC.parse(TUT_LRC), at = s => d.lines.find(ln => LRC.lineText(ln, false).startsWith(s));
	// loading sorts the lines by time: put 'Hier stimmt' back before 'Ich komme', for the order step
	d.lines = ['Juicy', 'Alle', 'Der', 'Diese', 'Hier', 'Ich', 'Kurz', 'Eine'].map(at);
	setDoc(d, 'Juicy im Studio.lrc', null);
	view.span = 8;
	$('tut').hidden = false;
	$('btnTut').classList.add('on');
	tutGo(0);
}

function tutGo(i) {
	if (!tut) return;
	tut.i = Math.max(0, Math.min(TUT.length - 1, i));
	const st = TUT[tut.i];
	tut.s = {};
	tut.done = false;
	if (st.setup) st.setup(tut.s);
	$('tutTitle').textContent = st.title;
	$('tutStep').textContent = (tut.i + 1) + ' / ' + TUT.length;
	$('tutBody').innerHTML = st.html;
	$('tutBack').disabled = tut.i === 0;
	$('tutNext').textContent = tut.i === TUT.length - 1 ? 'Fertig ✓' : 'Weiter ▶';
	tutTick();
	let p = st.point && st.point();                  // what the arrow points at, else the highlighted area, comes into view
	if (Array.isArray(p)) p = p[0];
	const go = p && p.scrollIntoView ? p : tutHl;
	if (go) go.scrollIntoView({block: 'nearest'});
}

// a few times a second: the task ticks off once done, the highlight follows the word list being redrawn
function tutTick() {
	if (!tut) return;
	const st = TUT[tut.i];
	if (st.check && !tut.done) tut.done = !!st.check(tut.s);
	$('tutTask').hidden = !st.task;
	$('tutTask').innerHTML = st.task ? (tut.done ? '✓ ' : '👉 ') + st.task : '';
	$('tutTask').classList.toggle('done', tut.done);
	$('tutNext').classList.toggle('go', tut.done);
	const el = st.area && st.area();
	if (el !== tutHl || (el && !el.classList.contains('tour-hl'))) tutArea(el);
}
setInterval(tutTick, 250);

function endTut() {
	if (!tut) return;
	tut = null;
	tutArea(null);
	$('tut').hidden = true;
	$('btnTut').classList.remove('on');
	tutPlace();
	setDoc({meta: [], lines: [], warnings: []}, '', null);    // the example song goes, it needs no saving
	setSimple(simple, false);                                // simple mode and the assistant come back
	refRaw = '';
	hint('Jetzt dein Song: 📁 Ordner mit Audio und LRC öffnen – oder ♪ Audio und LRC öffnen bzw. Neu aus Text.');
}

$('btnTut').onclick = () => tut ? endTut() : startTut();
$('helpTut').onclick = () => { if (!$('help').hidden) $('btnHelp').onclick(); startTut(); };
$('tutNext').onclick = () => tut.i === TUT.length - 1 ? endTut() : tutGo(tut.i + 1);
$('tutBack').onclick = () => tutGo(tut.i - 1);
$('tutClose').onclick = endTut;
// last step: straight on to the user's files (the click is still the user's, so the file picker may open)
$('tutBody').addEventListener('click', e => {
	const b = e.target.closest('[data-go]');
	if (!b) return;
	endTut();
	$(b.dataset.go).click();
});
$('words').addEventListener('click', e => { if (e.target.closest('.tut-start')) startTut(); });
// the cards (tutorial, assistant) are moved by their head
document.querySelectorAll('.tut-head').forEach(head => head.addEventListener('pointerdown', e => {
	if (e.target.closest('button')) return;
	const card = head.parentElement, r = card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
	const mv = ev => {
		card.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + 'px';
		card.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px';
		card.style.right = card.style.bottom = 'auto';
	};
	const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
	addEventListener('pointermove', mv);
	addEventListener('pointerup', up);
	e.preventDefault();
}));

// ---------------------------------------------------------------- assistant: leads through the song, one spot at a time
// Juicy says what to do next and the red arrow blinks on what to use: choose the files, paste the original lyrics, a
// short first round (move the card, tempo, add / delete / change a word, undo), then every spot from the start of the
// song to its end (per line the text against the original first, then the timing), at the end listen once to the whole
// song, save and Fertig. The arrow shows when a step starts and again whenever nothing has happened for a while.
// Simple mode (✨) is the same in a slim studio: only the line being fixed shows, in the word list and in the timeline,
// and most buttons go. In the normal studio the Juicy head switches it on and off.

const TIME_FIX = new Set(['unset', 'same', 'order', 'endorder', 'endlate']);   // fixed by clicking words in again
const INTRO = ['move', 'tempo', 'add', 'del', 'word', 'undo'];                 // the first round, once per browser

// what is still to do, in song order (lines put off with Später last): each difference to the original, then one
// timing job per line
function asstTasks() {
	const per = new Map(), add = (li, t) => { if (!per.has(li)) per.set(li, []); per.get(li).push(t); };
	// the sentences first: as long as a line is cut in the wrong place (or two lines run together), only that - the
	// timing comes after, so nothing is set twice
	const build = buildIssues().filter(o => o.pct >= 70 && doc.lines[o.li] && !((asst.skip.get(doc.lines[o.li]) || new Set()).has('build')))
		.sort((a, b) => a.li - b.li);
	if (build.length) return build.map(o => Object.assign({}, o, {kind: 'build'}));
	for (const d of dupPairs()) {                // the same word twice on top of itself first: fusing fixes text and timing
		const sk = asst.skip.get(doc.lines[d.li]);
		if (!(sk && sk.has('dup'))) add(d.li, {kind: 'dup', li: d.li, ti: d.ti});
	}
	for (const o of overhangs()) {               // an end reaching under the next word / line: cut it back
		const sk = asst.skip.get(doc.lines[o.li]);
		if (!(sk && sk.has('trim'))) add(o.li, Object.assign({kind: 'trim'}, o));
	}
	doc.lines.forEach((ln, li) => {               // a word in the wrong place of its line first: sorting it also fixes the text
		const sk = asst.skip.get(ln);
		if (!(sk && sk.has('wordorder')) && sortWords(li, true)) add(li, {kind: 'wordorder', li});
	});
	if (refLines) refDiffs.forEach(d => add(d.li, {kind: 'ref', li: d.li, d}));
	const codes = new Map();
	for (const i of issues) {
		if (i.level === 'info' && i.code !== 'unset') continue;
		const ln = doc.lines[i.li], sk = ln && asst.skip.get(ln);
		if (!ln || ln.brk || (sk && sk.has(i.code))) continue;
		if (!codes.has(i.li)) codes.set(i.li, []);
		codes.get(i.li).push(i);
	}
	for (const [li, list] of codes) {
		const has = c => list.find(i => i.code === c);
		const fix = list.filter(i => TIME_FIX.has(i.code));
		const long = list.find(i => i.code === 'long' && !i.end), end = list.find(i => i.code === 'noend' || (i.code === 'long' && i.end));
		const t = has('lineorder') ? {kind: 'lineorder', i: has('lineorder')} : fix.length ? {kind: 'retap', list: fix} :
			long ? {kind: 'long', i: long} : end ? {kind: 'end', i: end} : has('overlap') ? {kind: 'overlap', i: has('overlap')} : null;
		if (t) add(li, Object.assign(t, {li}));
	}
	const later = li => asst.later.has(doc.lines[li]) ? 1 : 0;
	return [...per.keys()].sort((a, b) => later(a) - later(b) || a - b).flatMap(li => per.get(li));
}

function aTok(li, ti) { return (tokEls[li] && tokEls[li][ti]) || null; }
const aShown = el => el && el.getClientRects().length ? el : null;                // only what is on the page
const aWord = (li, ti) => { const k = doc.lines[li] && doc.lines[li].tokens[ti]; return k ? k.text.replace(/\|/g, '') : ''; };
const aBtn = a => $('asstActs').querySelector('[data-a="' + a + '"]');
const aBody = (li, ti) => tutCv(bodies.find(o => o.li === li && o.ti === ti));
// a spot in the timeline as a rect on the page (for the arrow), at the top edge of the canvas
function aAt(t) {
	if (t == null) return $('timeline');
	const r = tl.getBoundingClientRect(), x = (t - view.start) / view.span * tl.clientWidth;
	return x < 0 || x > tl.clientWidth ? $('timeline') : {left: r.left + x - 1, top: r.top, width: 2, height: 30};
}

// the words to click in again for these problems: only the ones that are wrong (a stack of two = those two), whole
// syllable groups; null = the whole line
function asstRange(li, list) {
	const tk = doc.lines[li].tokens;
	let a = Infinity, b = -1;
	for (const i of list) {
		if (i.code === 'same' || i.code === 'order') { a = Math.min(a, i.ti - 1); b = Math.max(b, i.ti); }
		else if (i.code === 'unset') { a = Math.min(a, i.ti); b = Math.max(b, i.ti); }
		else return null;
	}
	a = Math.max(0, a);
	while (a > 0 && tk[a].glue) a--;
	while (b < tk.length - 1 && tk[b + 1].glue) b++;
	return a === 0 && b === tk.length - 1 ? null : {a, b};
}

// the step for right now: {key, title, html, acts: [[id, label, primary]], point, focus: Set of lines | null}
function asstStep() {
	const files = [$('btnFolder'), $('btnAudio'), $('btnOpen')];
	if (INTRO[asst.intro] === 'move') return {key: 'i-move', title: 'Hallo, ich bin Juicy!',
		html: 'Ich führe dich Schritt für Schritt durch deinen Song und zeige dir mit dem <b class="tut-err">roten Pfeil</b>, ' +
			'was als Nächstes dran ist. Mich kannst du überall hinschieben, wo ich nicht störe.' +
			'<div class="asst-task">👉 Deine erste Mission: Fass mich <b>oben an</b> (Pfeil) und schieb mich bitte mal näher an den Text – ' +
			'in das gestrichelte Feld in der Mitte.</div>',
		acts: [['next', 'Überspringen'], ['nointro', 'Kenne ich schon']], point: () => [document.querySelector('#asst .tut-head img'), $('asstZone')]};
	if (!doc.lines.length && !audio.src) return {key: 'files', title: 'Los geht’s: dein Song',
		html: 'Wähle deinen <b>Ordner</b> mit den Audio- und LRC-Dateien (📁) – dann zeige ich dir, was zusammengehört. ' +
			'Oder einzeln: erst <b>♪ Audio</b>, dann die passende <b>LRC</b>. In der LRC-Datei steht der <b>Songtext</b> mit den Zeiten, ' +
			'wann welches Wort gesungen wird. Hast du nur den Songtext, nimm <b>Neu aus Text</b>.',
		point: () => files};
	if (!doc.lines.length) return {key: 'lrc', title: 'Jetzt die LRC', html: 'Audio ist da ✓ Jetzt die passende <b>LRC öffnen</b>: ' +
		'In dieser Datei steht der <b>Songtext</b> – Zeile für Zeile, mit den Zeiten, wann welches Wort gesungen wird. ' +
		'Hast du nur den Songtext, nimm <b>Neu aus Text</b> und füg ihn ein.', point: () => [$('btnOpen'), $('btnNew')]};
	if (!audio.src) return {key: 'audio', title: 'Jetzt das Audio', html: 'Die LRC ist da ✓ Jetzt das passende <b>♪ Audio</b> dazu, ' +
		'damit du hörst, wo die Wörter sitzen.', point: () => $('btnAudio')};
	if (edit) return asstEditStep();
	if (!refLines && !asst.noRef) return {key: 'ref', title: 'Original-Lyrics holen',
		html: 'Lade jetzt am besten die <b>Original-Lyrics</b> vom Track hier rein – z. B. von einer Lyrics-Seite kopieren und einfügen. ' +
			'Dann gleiche ich sie mit deiner LRC ab und finde falsche, fehlende und überzählige Wörter.<br>' +
			'Keine Sorge, ich bin schlau: Ist dein Track ein <b>Remix</b>, nimm einfach den Text vom <b>Original-Lied</b> – ' +
			'Wiederholungen und weggeschnittene Teile verstehe ich. Überschriften wie <code>[Chorus]</code> oder <code>[Strophe 2]</code>, ' +
			'Leerzeilen zwischen den Strophen und Wörter in <code>( )</code> stören mich nicht – einfach alles so einfügen, wie es ist.',
		acts: [['ref', '📋 Original-Lyrics einfügen', 1], ['noref', 'Ohne Original weiter']], point: () => aShown($('btnRef')) || aBtn('ref')};
	if (asst.intro < INTRO.length) { const s = asstIntroStep(); if (s) return s; }
	const ck = asstCheck();
	if (ck) return ck;
	const tasks = asstTasks(), t = tasks[0];
	asst.left = tasks.length;
	if (t) return asstTaskStep(t);
	const lastEnd = Math.max(0, ...doc.lines.map((ln, li) => (lineRange(li) || {b: 0}).b));
	if (!asst.listened) {
		const on = asst.listening && !audio.paused;
		return {key: 'listen' + on, title: 'Einmal das ganze Lied anhören',
			html: 'Alle Stellen sind durch ✓ Hör dir zum Schluss einmal das ganze Lied an und lies mit – gern wieder auf <b>100 %</b>. ' +
				'Klingt eine Zeile falsch, klick sie unten an und dann <b>Diese Zeile neu einklicken</b>.',
			acts: [['listen', on ? '❚❚ Pause' : asst.listening ? '▶ Weiter anhören' : '▶ Ganzes Lied anhören', 1],
				['retapcur', 'Diese Zeile neu einklicken'], ['listened', 'Passt, weiter']],
			point: () => aBtn(on ? 'listened' : 'listen'), lastEnd};
	}
	const st = (doc.meta.find(m => m[0] === 'status') || [])[1];
	if (dirty) return {key: 'save', title: 'Speichern', html: 'Klingt alles gut? Dann <b>speichern</b>. Die LRC muss heißen wie dein Audio, ' +
		'damit der Player sie findet – den Namen schlage ich vor.', point: () => $('btnSave')};
	if (st !== 'Fertig') return {key: 'done', title: 'Fertig machen', html: '<b>🎉 Fertig</b> trägt deinen Namen ein, markiert die LRC ' +
		'als fertig und speichert sie.', point: () => $('btnDone')};
	return {key: 'finished', title: 'Geschafft! 🎉', html: '„' + esc(fileName) + '“ ist fertig. ' +
		(folder && folder.songs.length > 1 ? 'Weiter mit dem nächsten Song aus deinem Ordner?' : 'Für den nächsten Song einfach Audio und LRC öffnen.'),
		acts: folder && folder.songs.length > 1 ? [['nextsong', 'Nächster Song ▶', 1]] : [], point: () => folder ? aBtn('nextsong') : files};
}

// the first round on the user's own song: tempo, a test word in and out again, a word changed and undone
function asstIntroStep() {
	const step = INTRO[asst.intro], skip = ['nointro', 'Kenne ich schon'];
	if (step === 'tempo') return {key: 'i-tempo', title: 'Tipp: das Tempo',
		html: 'Gesungene Wörter sind schnell vorbei. Mein Tipp: Hör den Song erst kurz <b>normal</b> (100 %), damit du ihn im Ohr hast – ' +
			'dann stell auf <b>50 %</b> und geh so mit mir durch die Fehler. So findest du jede Stelle viel genauer.<br>' +
			'Das Tempo stellst du hier oben um (Pfeil), die Tonhöhe bleibt dabei gleich. Die Tasten <b>1 – 4</b> gehen auch.',
		acts: [['play100', '▶ Kurz normal anhören'], ['rate50', '50 % einstellen', 1], skip], point: () => document.querySelector('.seg')};
	let d = asst.demo;
	if (!d || !doc.lines[d.li]) {                 // the demo word: the first word of the first line with timed words
		const li = doc.lines.findIndex(ln => !ln.brk && ln.tokens.length > 1 && ln.tokens[0].t != null && ln.tokens[1].t != null);
		if (li < 0) { asst.intro = INTRO.length; return null; }
		d = asst.demo = {li, ti: 0, n: doc.lines[li].tokens.length, text: doc.lines[li].tokens[0].text};
	}
	const ln = doc.lines[d.li], n = ln.tokens.length, base = {li: d.li, focus: new Set([d.li])};
	if (step === 'add') {
		if (n > d.n) { asstIntroNext(); return asstIntroStep(); }
		return {...base, key: 'i-add', title: 'Ein Wort einfügen', demo: d.ti,
			html: 'Fehlt mal ein Wort, fährst du in der Liste mit der Maus über das Wort davor: Rechts daneben ist ein grünes <b>+</b> (Pfeil). ' +
				'Ein Klick darauf fügt ein Wort dahinter ein – es bekommt gleich eine Zeit zwischen seinen Nachbarn.<br>' +
				'Probier’s aus, z. B. mit „Test“ – oder ich mach’s dir vor.',
			acts: [['demoadd', 'Zeig’s mir', 1], ['next', 'Überspringen'], skip],
			point: () => { const e = aTok(d.li, d.ti); return e && (e.querySelector('.tadd') || e); }};
	}
	if (step === 'del') {
		if (n <= d.n) { asstIntroNext(); return asstIntroStep(); }
		return {...base, key: 'i-del', title: 'Ein Wort löschen', demo: d.ti + 1,
			html: 'Da ist das neue Wort ✓ Und so wird man ein Wort wieder los: das kleine <b>×</b> oben rechts am Wort (Pfeil). ' +
				'Lösch das Testwort wieder.',
			acts: [['demodel', 'Zeig’s mir', 1], skip],
			point: () => { const e = aTok(d.li, d.ti + 1); return e && (e.querySelector('.tx') || e); }};
	}
	if (step === 'word') {
		if (aWord(d.li, d.ti) !== d.text.replace(/\|/g, '')) { asstIntroNext(); return asstIntroStep(); }
		return {...base, key: 'i-word', title: 'Ein Wort umschreiben', ti: d.ti,
			html: 'Ist ein Wort falsch geschrieben, mach einen <b>Doppelklick</b> darauf und schreib es neu. ' +
				'Probier’s aus: Doppelklick auf das Wort (Pfeil) und ändere es – keine Sorge, gleich machen wir es wieder rückgängig.',
			acts: [['next', 'Überspringen'], skip], point: () => aTok(d.li, d.ti)};
	}
	if (aWord(d.li, d.ti) === d.text.replace(/\|/g, '')) { asstIntroNext(); return null; }
	return {...base, key: 'i-undo', title: 'Rückgängig und wieder vor', ti: d.ti,
		html: 'Vertan? <b>↶ Zurück</b> oben rechts (oder Strg+Z) nimmt den letzten Schritt zurück, <b>↷ Vor</b> holt ihn wieder. ' +
			'Mach deine Änderung jetzt rückgängig.<br>Danach geht es los mit den Stellen in deinem Song.',
		acts: [['undo', '↶ Zurück', 1], ['next', 'Weiter']], point: () => [$('btnUndo'), $('btnRedo')]};
}

function asstIntroNext(all = false) {
	asst.intro = all ? INTRO.length : asst.intro + 1;
	if (asst.intro >= INTRO.length) try { localStorage.setItem('lrcEditorAsstIntro', '1'); } catch (e) { /* ignore */ }
}

// a word just inserted from the original: is it where it is sung?
function asstCheck() {
	const c = asst.check, li = c ? doc.lines.indexOf(c.ln) : -1, ti = li >= 0 ? c.ln.tokens.indexOf(c.k) : -1;
	if (ti < 0 || c.k.t == null) { asst.check = null; return null; }
	return {key: 'check:' + li + ':' + ti, li, ti, focus: new Set([li]), title: 'Sitzt das neue Wort richtig?',
		html: '„<b>' + esc(aWord(li, ti)) + '</b>“ ist jetzt drin und hat eine Zeit mitten zwischen seinen Nachbarn bekommen. ' +
			'Hör rein (🔊), ob es dort gesungen wird – der Pfeil zeigt auf seinen <b>Anfang</b> in der Zeitleiste.<br>' +
			'Sitzt es nicht: Zieh seine <b>Box</b> (der Balken unter dem Wort) dahin, wo es gesungen wird, ihre <b>Kanten</b> machen es länger ' +
			'oder kürzer – oder versetz oben seine <b>Marke</b>. Passt es, klick <b>Passt so</b>.',
		acts: [['hear', '🔊 Anhören', 1], ['checkok', 'Passt so'], ['retapck', 'Neu einklicken']],
		point: () => [aAt(c.k.t), aBody(li, ti)]};
}

function asstTaskStep(t) {
	const li = t.li, ln = doc.lines[li], z = 'Zeile ' + (li + 1), hear = ['hear', '🔊 Anhören'];
	const base = {li, focus: new Set([li])};
	if (t.kind === 'ref') {
		const d = t.d, w = '„' + esc(d.have || '') + '“', want = '„' + esc(d.want || '') + '“', id = 'ref:' + d.key;
		if (d.kind === 'sub') return {...base, key: id, ti: d.ti0, title: d.near ? 'Ist das das richtige Wort?' : 'Falsches Wort?',
			html: z + ': Hier steht ' + w + (d.near ? ' – klingt ähnlich wie ' + want + ' aus dem Original. Ist das gemeint?' :
				', im Original steht ' + want + '.') + ' Klick auf <b>↔ ' + esc(d.want) + '</b> über dem Wort zum Tauschen – ' +
				'oder <b>Passt so</b>, wenn deins stimmt.',
			acts: [['apply', '↔ ' + d.want, 1], ['skipref', 'Passt so'], hear],
			point: () => { const e = aTok(li, d.ti0); return e && (e.querySelector('.tsug') || e); }};
		if (d.kind === 'miss') return {...base, key: id, ti: Math.max(0, d.ti0 - 1), title: 'Hier fehlt ein Wort',
			html: z + ': Im Original steht ' + (d.after ? 'nach „' + esc(d.after) + '“' : 'am Anfang') + ' noch ' + want + '. ' +
				'<b>Einfügen</b> setzt es gleich mit einer Zeit zwischen seine Nachbarn – danach prüfen wir zusammen, ob es dort richtig sitzt.',
			acts: [['apply', '＋ ' + d.want + ' einfügen', 1], ['skipref', 'Passt so'], hear],
			point: () => aBtn('apply')};
		if (d.kind === 'extra') return {...base, key: id, ti: d.ti0, title: 'Ein Wort zu viel?',
			html: z + ': ' + w + ' steht nicht im Original. Wird es doch gesungen, lass es mit <b>Passt so</b> stehen.',
			acts: [['apply', '✕ ' + d.have + ' löschen', 1], ['skipref', 'Passt so'], hear],
			point: () => aTok(li, d.ti0)};
		return {...base, key: id, ti: 0, title: 'Zeile nicht im Original',
			html: z + ' kommt im Original nicht vor – vielleicht ein Zwischenruf, ein Ad-lib oder ein anderer Text. Hör rein: ' +
				'Wird sie so gesungen, ist alles gut.', acts: [['skipref', 'Passt so', 1], hear], point: () => aBtn('skipref')};
	}
	const id = t.kind + ':' + li + ':' + LRC.lineText(ln, false), back = asst.later.has(ln) ? 'Jetzt die schwierige Stelle von vorhin. ' : '';
	if (t.kind === 'build') {
		const nb = d => { let j = li; do j += d; while (doc.lines[j] && (doc.lines[j].brk || LRC.isBg(doc.lines[j]))); return j; };
		const oi = t.dir == null ? -1 : nb(t.dir), w = lineWords(ln);
		const wi = t.dir > 0 ? w[w.length - 1] : t.dir < 0 ? w[0] : w.find(o => o.a === t.ti);
		const wti = wi ? wi.a : 0;
		if (t.dir == null) return {...base, key: id + ':split:' + t.ti, ti: t.ti, codes: ['build'], title: 'Zwei Sätze in einer Zeile?',
			html: 'Erst der Satzbau, dann das Timing. ' + z + ' sieht aus wie zwei Zeilen in einer: ' + esc(t.why) + '. <b>✂ Teilen</b> macht ' +
				'vor „<b>' + esc(t.word) + '</b>“ eine neue Zeile daraus (die Zeiten bleiben). Gehört es doch zusammen, klick <b>Passt so</b>.',
			acts: [['split', '✂ Teilen', 1], ['skip', 'Passt so'], hear], point: () => aShown(aTok(li, t.ti)) || aBtn('split')};
		return {...base, key: id + ':shift:' + t.dir, ti: wti, dir: t.dir, codes: ['build'], focus: new Set([li, oi].filter(x => doc.lines[x])),
			title: 'Wort in der falschen Zeile?',
			html: 'Erst der Satzbau, dann das Timing. ' + z + ': „<b>' + esc(t.word) + '</b>“ gehört wahrscheinlich ' +
				(t.dir > 0 ? 'an den Anfang der nächsten Zeile' : 'ans Ende der Zeile davor') + ' (' + t.pct + ' %) – ' + esc(t.why) + '. ' +
				'<b>Rüberschieben</b> setzt es mit seiner Zeit dorthin. Du kannst Wörter auch selbst mit der Maus in eine andere Zeile ziehen.',
			acts: [['shiftw', t.dir > 0 ? '↓ Rüberschieben' : '↑ Rüberschieben', 1], ['skip', 'Passt so'], hear],
			point: () => aShown(aTok(li, wti)) || aBtn('shiftw')};
	}
	if (t.kind === 'dup') return {...base, key: id + ':' + t.ti, ti: t.ti, codes: ['dup'], title: 'Doppeltes Wort?',
		html: z + ': „<b>' + esc(aWord(li, t.ti)) + '</b>“ steht zweimal fast genau übereinander – wahrscheinlich wurde es nur einmal gesungen ' +
			'und ist aus Versehen doppelt drin. <b>⇊ Fusionieren</b> macht eins daraus: Das obere wird gelöscht, das untere bleibt mit seiner Zeit. ' +
			'Wird es wirklich zweimal gesungen, klick <b>Beide behalten</b>.',
		acts: [['fuse', '⇊ Fusionieren', 1], ['skip', 'Beide behalten'], hear],
		point: () => tutCv(fuseBtns.find(o => o.pairs.some(d => d.li === li && d.ti === t.ti))) || aBtn('fuse')};
	if (t.kind === 'trim') {
		const nli = t.line ? doc.lines.findIndex((x, j) => j > li && !x.brk && !LRC.isBg(x)) : -1;
		return {...base, key: id + ':' + t.ti + ':' + t.to, ti: t.ti, codes: ['trim'], to: t.to, title: 'Das Ende steht über',
			focus: new Set([li, nli].filter(x => x >= 0)),
			html: z + ': Das ' + (t.line ? 'Satzende' : 'Ende') + ' von „<b>' + esc(aWord(li, t.ti)) + '</b>“ reicht unter den Anfang ' +
				(t.line ? 'des nächsten Satzes' : 'von „' + esc(t.word) + '“') + ' – meistens ist es einfach zu lang. ' +
				'Der runde Knopf <b>✂</b> (Ende kürzen) setzt es genau auf diesen Anfang (die orange Linie in der Zeitleiste). ' +
				'Singen sich die beiden wirklich ins Wort, klick <b>Passt so</b>.',
			acts: [['trim', '✂ Ende kürzen', 1], ['skip', 'Passt so'], hear],
			point: () => tutCv(trimBtns.find(o => o.li === li && o.ti === t.ti)) || aBtn('trim')};
	}
	if (t.kind === 'wordorder') {
		const o = issues.filter(i => i.li === li && (i.code === 'order' || i.code === 'same')), range = o.length ? asstRange(li, o) : null;
		return {...base, key: id, ti: o.length ? o[0].ti : 0, codes: ['wordorder'], range, title: 'Wort an der falschen Stelle im Satz',
			html: z + ': Ein Wort steht im Satz an einer anderen Stelle, als es gesungen wird – in der Zeitleiste liegt es <b class="tut-err">rot</b> ' +
				'eine Ebene höher. Stimmt seine <b>Zeit</b> (hör rein), rückt der runde Knopf <b>↓</b> darüber es im Satz genau dorthin. ' +
				'Stimmt seine Zeit nicht, klick die Wörter neu ein.',
			acts: [['resort', '⇄ Hier einsortieren', 1], ['retap', '▶ Neu einklicken'], ['skip', 'Überspringen'], hear],
			point: () => tutCv(wordBtns.find(o => o.li === li)) || aBtn('resort')};
	}
	if (t.kind === 'lineorder') {
		const pli = lineOrder().get(li);
		return {...base, key: id, ti: 0, focus: new Set([li, pli].filter(x => x != null)), title: 'Zeile an der falschen Stelle',
			html: z + ' steht im Text nach Zeile ' + ((pli ?? li - 1) + 1) + ', kommt im Lied aber früher. Ein Klick sortiert alle Zeilen nach ihrer Zeit.',
			acts: [['sort', '⇅ Nach Zeit sortieren', 1]], point: () => tutCv(orderBtns.find(o => o.li === li)) || aBtn('sort')};
	}
	if (t.kind === 'retap') {
		const c = new Set(t.list.map(i => i.code)), n = ln.tokens.filter(k => k.t == null).length;
		const stack = t.list.filter(i => i.code === 'same').length + 1, hard = stack >= 4, none = n === ln.tokens.length;
		const range = asstRange(li, t.list), cnt = range ? range.b - range.a + 1 : ln.tokens.length;
		const sorts = c.has('order') && sortWords(li, true);
		const what = range ? (cnt === 1 ? 'das Wort' : 'die ' + cnt + ' Wörter') : 'den Satz';
		const retap = ['retap', '▶ ' + (range ? (cnt === 1 ? 'Wort' : cnt + ' Wörter') + ' neu einklicken' : 'Satz einklicken'), !sorts];
		return {...base, key: id, ti: range ? range.a : t.list[0].ti, codes: [...c], range,
			title: back ? 'Die schwierige Stelle' : hard ? 'Oh, eine schwierige Stelle' : c.has('same') ? 'Hier ist wohl was schiefgegangen' :
				none ? 'Satz einklicken' : c.has('unset') ? 'Wörter ohne Zeit' : 'Reihenfolge durcheinander',
			html: back + (c.has('same') ? z + ': ' + stack + ' Wörter liegen übereinander – sie haben alle dieselbe Zeit. ' :
				none ? z + ' hat noch keine Zeiten. ' : c.has('unset') ? z + ': ' + n + (n === 1 ? ' Wort hat' : ' Wörter haben') + ' noch keine Zeit. ' :
				z + ': Die Zeiten stehen nicht in der richtigen Reihenfolge. ') +
				(sorts ? 'Ein Wort steht im Satz an der falschen Stelle, seine Zeit stimmt aber vielleicht (rot, eine Ebene höher). ' +
					'<b>⇄ Nach Zeit ordnen</b> rückt es im Satz dahin, wo es gesungen wird. Sonst ' : '') +
				(sorts ? 'klicken' : 'Klicken') + ' wir ' + what + ' neu ein: Wort für Wort, von vorne nach hinten – ich zeige dir jeden Schritt.' +
				(hard && !back ? '<br>Das ist ein großer Fehler. Manchmal ist es leichter, so eine Stelle erst zu <b>überspringen</b> – wir kommen ' +
					'am Ende hierher zurück. Bei so großen Fehlern kann auch der <b>Anfang</b> etwas weiter links oder rechts liegen als jetzt (Pfeil ' +
					'in der Zeitleiste) – hör genau hin.' : ''),
			acts: [sorts ? ['resort', '⇄ Nach Zeit ordnen', 1] : null, retap, hard && !back ? ['later', 'Später'] : ['skip', 'Überspringen'], hear].filter(Boolean),
			point: () => hard && !back ? [aBtn('retap'), aAt(LRC.lineTime(ln))] : aBtn(sorts ? 'resort' : 'retap')};
	}
	if (t.kind === 'long') return {...base, key: id, ti: t.i.ti, codes: ['long'], title: 'Ein Wort ist sehr lang',
		html: z + ': „' + esc(aWord(li, t.i.ti)) + '“ ' + esc(t.i.msg) + '. Meistens ist danach eine Pause, oder die Zeiten sind verrutscht. ' +
			'Hör rein und klick den Satz neu ein – oder <b>Passt so</b>, wenn das Wort wirklich so lang gehalten wird.',
		acts: [['retap', '▶ Satz neu einklicken', 1], ['skip', 'Passt so'], hear], point: () => aBtn('retap')};
	if (t.kind === 'end') {
		const last = ln.tokens.length - 1, sg = sugg.get(li);
		return {...base, key: id, ti: last, codes: ['noend', 'long'], title: 'Wo hört das Wort auf?',
			html: 'Am Ende von ' + z + ' fehlt das <b>Ende</b>: Wo hört „' + esc(aWord(li, last)) + '“ auf zu klingen? ' +
				'Gesungene Wörter werden oft lang gehalten – mit dem Ende weiß die Karaoke-Maschine, wie lange das Wort ungefähr dauert.<br>' +
				(sg != null ? 'Die gestrichelte Linie <i>Ende?</i> in der Zeitleiste (Pfeil) ist mein Vorschlag: Du kannst sie mit der Maus ' +
					'dahin <b>ziehen</b>, wo das Wort aufhört, und mit ✓ übernehmen. Oder ' : 'Dafür ') +
				'<b>⏹ Ende einklicken</b>: anhören und an der richtigen Stelle klicken.',
			acts: [['end', '⏹ Ende einklicken', 1], sg != null ? ['endok', '✓ Vorschlag passt'] : null, hear].filter(Boolean),
			point: () => sg != null ? [aAt(sugg.get(li)), aBtn('end')] : aBtn('end')};
	}
	return {...base, key: id, ti: 0, focus: new Set([li - 1, li].filter(x => x >= 0)), codes: ['overlap'], title: 'Zeilen überlappen',
		html: z + ' beginnt, bevor Zeile ' + li + ' zu Ende ist. Singen hier zwei Stimmen gleichzeitig (Duett, Hintergrund), passt das so. ' +
			'Sonst klick den Satz neu ein.', acts: [['retap', '▶ Satz neu einklicken', 1], ['skip', 'Passt so'], hear], point: () => aBtn('retap')};
}

// the open line: one word after the other, then the line end, then OK
function asstEditStep() {
	const li = edit.li, ln = doc.lines[li], focus = new Set([li]);
	const cancel = ['cancel', 'Abbrechen'];
	if (edit.free || !sel || sel.li !== li) {
		const fixing = performance.now() - asst.fix < 5000;
		return {key: 'ok:' + li, focus, title: 'Fertig – passt alles?',
			html: 'Das läuft jetzt im Loop. Passt alles? Dann klick <b>✓ OK</b>.<br>Zum Korrigieren: die <b>Box</b> eines Wortes in der Zeitleiste ' +
				'ziehen (ihre Kanten = länger / kürzer) – oder oben die <b>Marke</b> des Wortes versetzen. Du kannst auch ein Wort anklicken und neu setzen.',
			acts: [['fixhow', 'Wie korrigiere ich?'], cancel],
			point: () => fixing ? [aBody(li, 0), aAt((ln.tokens[0] || {}).t)] : $('btnOk')};
	}
	const k = ln.tokens[sel.ti], slow = asst.placed < 3;
	const a = edit.upto != null && repair ? Math.min(...[...repair.ghost.keys()].filter(x => x.startsWith(li + ':')).map(x => +x.split(':')[1])) : 0;
	const n = (edit.upto != null ? edit.upto : ln.tokens.length - 1) - a + 1;
	const g = repair && repair.ghost.get(li + ':' + sel.ti);
	const where = () => {                       // its old time when that is still a help (not stacked), else just after the word before
		const p = selTime();
		return aAt(g && g.t != null && !sel.end && (p == null || g.t > p + 0.05) ? g.t : p != null ? p + (sel.end ? 0.6 : 0.3) : edit.zone && edit.zone.a0);
	};
	const listen = 'Hör mit <b>Rechtsklick</b> in die Zeitleiste rein (gedrückt halten = weiterhören)';
	const touch = '<br><small>Touchscreen: lange drücken = anhören, tippen = setzen.</small>';
	const speed = slow ? '<br>Zu schnell? <b>Hier langsamer</b> machen – 50 % ist ideal –, dann findest du die Stelle genauer.' : '';
	if (sel.end) return {key: 'end:' + li + ':' + sel.ti, focus, title: sel.ti === ln.tokens.length - 1 ? 'Und jetzt das Ende' : 'Ende vor der Pause',
		html: 'Wo hört „' + esc(aWord(li, sel.ti)) + '“ auf zu klingen? ' + listen + ', <b>Linksklick</b> setzt das Ende. ' +
			'Gehaltene Wörter klingen länger – so weiß die Karaoke-Maschine, wie lang das Wort ist. Danach kannst du das Ende in der Zeitleiste ' +
			'auch noch ziehen.' + speed + touch,
		acts: [['hearw', '🔊 Stelle anhören'], cancel], point: () => slow ? [where(), document.querySelector('.seg')] : where()};
	return {key: 'word:' + li + ':' + sel.ti, focus, title: 'Wort für Wort (' + (sel.ti - a + 1) + ' / ' + n + ')',
		html: 'Finde „<b>' + esc(aWord(li, sel.ti)) + '</b>“: ' + listen + '. Gefunden? <b>Linksklick</b> setzt das Wort genau dort, ' +
			'dann ist das nächste dran.' + (g && g.t != null ? ' Grau gestrichelt siehst du, wo es vorher war.' : '') + speed + touch,
		acts: [['hearw', '🔊 Stelle anhören'], cancel], point: () => slow ? [where(), document.querySelector('.seg')] : where(), k};
}

// on a new step: bring its line into view and mark the word it is about
function asstGo(s) {
	if (s.li == null || edit || !doc.lines[s.li]) return;
	const ln = doc.lines[s.li], ti = Math.max(0, Math.min(s.ti || 0, ln.tokens.length - 1));
	if (!audio.paused && !asst.listening) pause();
	loop = null;
	setSel({li: s.li, ti, end: false}, false);
	const r = lineRange(s.li);
	if (!r) return;
	view.span = Math.max(4, Math.min(30, (r.b - r.a) * 1.6 + 1));          // the line in the middle, with room around it
	view.start = Math.max(0, r.a - (view.span - (r.b - r.a)) / 2);
	if (audio.paused) seek(Math.max(0, r.a - 0.05));
}

// first mission: a dashed field in the middle of the screen, the card is dragged into it -> on to the next step
function asstZone() {
	const z = $('asstZone'), on = asst.on && !tut && INTRO[asst.intro] === 'move';
	z.hidden = !on;
	if (!on) return;
	const c = $('asst').getBoundingClientRect(), w = Math.min(c.width + 60, innerWidth - 32), h = c.height + 50;
	Object.assign(z.style, {width: w + 'px', height: h + 'px', left: (innerWidth - w) / 2 + 'px', top: Math.max(8, (innerHeight - h) / 2) + 'px'});
	const r = z.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
	if (c.width && cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) {
		asstIntroNext();
		z.hidden = true;
		const b = $('asst').getBoundingClientRect();
		burst(b.left, b.top, b.width, 20, 18);
		hint('Super! So kannst du mich jederzeit verschieben.');
	}
}

// arrow on at the start of a step and after a few seconds without a click or key
const asstArrow = () => asst.act <= asst.at + 200 || performance.now() - asst.act > 5000;

function asstTick() {
	if (!asst.on || tut) { $('asstZone').hidden = true; return; }
	if (asst.listening) {
		const end = Math.max(0, ...doc.lines.map((ln, li) => (lineRange(li) || {b: 0}).b));
		if (audio.ended || (!audio.paused && clock() >= end + 0.5)) { asst.listening = false; asst.listened = true; pause(); }
	}
	asstZone();
	const s = asst.step = asstStep();
	asst.focus = s.focus || null;
	if (s.key !== asst.key) {
		asst.key = s.key;
		asst.at = performance.now();
		$('asstTitle').textContent = s.title;
		$('asstBody').innerHTML = s.html;
		$('asstActs').innerHTML = (s.acts || []).map(a => '<button type="button" data-a="' + a[0] + '"' + (a[2] ? ' class="primary"' : '') + '>' +
			esc(a[1]) + '</button>').join('');
		asstGo(s);
		asstLines();
		let p = s.point && s.point();
		if (Array.isArray(p)) p = p[0];
		if (p && p.scrollIntoView && !$('asst').contains(p)) p.scrollIntoView({block: 'nearest'});
	}
	const tasks = refLines || asst.noRef ? asst.left : null;
	$('asstCount').textContent = !doc.lines.length || !audio.src || s.key.startsWith('i-') ? '' : edit ? 'Zeile ' + (edit.li + 1) :
		tasks ? 'noch ' + tasks + (tasks === 1 ? ' Stelle' : ' Stellen') : tasks === 0 ? '✓' : '';
	document.body.classList.toggle('afocus-on', !!asst.focus);
	tutPlace();
}
setInterval(asstTick, 250);

// the lines the step is about: marked in the word list (simple mode shows only them), the word it is about too; in
// the first round the word whose + or × is shown
function asstLines() {
	const f = asst.on && !tut ? asst.focus : null, s = asst.step;
	lineEls.forEach((el, i) => el && el.classList.toggle('afocus', !!f && f.has(i)));
	$('words').querySelectorAll('.aword, .ademo').forEach(el => el.classList.remove('aword', 'ademo'));
	const w = f && s && s.li != null && s.ti != null && aTok(s.li, s.ti);
	if (w) w.classList.add('aword');
	const dm = f && s && s.demo != null && aTok(s.li, s.demo);
	if (dm) dm.classList.add('ademo');
}
// simple mode: the timeline draws only the lines the step is about
function tlHidden(li) { return simple && !tut && asst.on && !!asst.focus && !asst.focus.has(li); }

// a short listen: from t for dur seconds of the song, then back (like holding the right button)
function asstHear(t, dur = 2.5) {
	if (t == null) return;
	audition(Math.max(0, t), true);
	setTimeout(releaseSnip, dur / rate * 1000);
}

// the line clicked in again word by word (repair of this one line: old times stay grey as a help)
function asstRetap(li) {
	if (edit || li == null || !doc.lines[li]) return;
	clearPicked();
	picked.add(li);
	startRepair();
}

// only words a..b of a line clicked in again (a stack of two: just those two); the rest of the line stays
function asstRetapRange(li, a, b) {
	const ln = doc.lines[li];
	if (edit || !ln || !audio.src) return;
	pushUndo();
	clearPicked();
	repair = {lines: [li], idx: 0, ghost: new Map()};
	edit = {li, before: JSON.stringify(ln), free: false, upto: b};
	for (let ti = a; ti <= b; ti++) {
		const k = ln.tokens[ti];
		repair.ghost.set(li + ':' + ti, {t: k.t, end: k.end});
		k.t = null;
		k.end = null;
	}
	sel = {li, ti: a, end: false};
	lastPlaced = null;
	changed();
	openZone();
	const p = ln.tokens[a - 1];
	if (p && p.t != null) {                        // the loop box starts just before the word in front of them
		edit.zone.a0 = p.t;
		edit.zone.a = Math.max(0, p.t - 0.3 - preRoll());
		showRange(edit.zone.a, edit.zone.b);
		seek(edit.zone.a);
	}
	hint('Nur ' + (b - a + 1) + ' Wörter neu einklicken: Rechtsklick hört an, Linksklick setzt. Enter = OK, Esc = Abbrechen.');
}

function asstSkip(s) {
	const ln = doc.lines[s.li];
	if (!ln) return;
	const set = asst.skip.get(ln) || new Set();
	(s.codes || []).forEach(c => set.add(c));
	asst.skip.set(ln, set);
}

$('asstActs').addEventListener('click', e => {
	const b = e.target.closest('[data-a]'), s = asst.step;
	if (!b || !s) return;
	const a = b.dataset.a, d = s.key.startsWith('ref:') ? refDiffs.find(x => 'ref:' + x.key === s.key) : null;
	if (a === 'ref') $('btnRef').onclick();
	else if (a === 'noref') asst.noRef = true;
	else if (a === 'next') asstIntroNext();
	else if (a === 'nointro') asstIntroNext(true);
	else if (a === 'play100') { setRate(1); asstHear(Math.max(0, (lineRange(0) || {a: 0}).a - 0.5), 12); }
	else if (a === 'rate50') { setRate(0.5); asstIntroNext(); }
	else if (a === 'demoadd') {
		const ln = doc.lines[s.li], k = ln.tokens[s.demo];
		pushUndo();
		ln.tokens.splice(s.demo + 1, 0, {text: 'Test', t: null, end: null, glue: false});
		timeInserted(s.li, s.demo, 1);
		changed();
		if (k) hint('„Test“ nach „' + k.text + '“ eingefügt.');
	} else if (a === 'demodel') tokAction('del', s.li, s.demo);
	else if (a === 'undo') undo();
	else if (a === 'apply' && d) {
		if (d.kind === 'sub') tokAction('swap', d.li, d.ti0);
		else {
			applyRef(d);
			const ln = doc.lines[d.li], k = d.kind === 'miss' && ln && ln.tokens[d.ti0];
			if (k && k.text === d.want && k.t != null) asst.check = {ln, k};        // inserted: check where it sits
		}
	} else if (a === 'skipref' && d) { refSkip.add(d.key); changed(false); }
	else if (a === 'skip') { asstSkip(s); changed(false); }
	else if (a === 'later') { asst.later.add(doc.lines[s.li]); asst.key = ''; }
	else if (a === 'sort') sortLines();
	else if (a === 'resort') sortWords(s.li);
	else if (a === 'fuse') fuseWords([{li: s.li, ti: s.ti}]);
	else if (a === 'split') splitAt(s.li, s.ti);
	else if (a === 'shiftw') shiftWord(s.li, s.dir);
	else if (a === 'trim') trimEnd(s.li, s.ti, s.to);
	else if (a === 'retap') { if (s.range) asstRetapRange(s.li, s.range.a, s.range.b); else asstRetap(s.li); }
	else if (a === 'retapcur') { asst.listening = false; pause(); asstRetap(sel ? sel.li : playLi); }
	else if (a === 'checkok') asst.check = null;
	else if (a === 'retapck') { asst.check = null; asstRetapRange(s.li, s.ti, s.ti); }
	else if (a === 'end') {
		if (startEdit(s.li)) { sel = {li: s.li, ti: doc.lines[s.li].tokens.length - 1, end: true}; renderSelection(); }
	} else if (a === 'endok') tokAction('endok', s.li, doc.lines[s.li].tokens.length - 1);
	else if (a === 'hear') {
		const r = lineRange(s.li), k = doc.lines[s.li].tokens[s.ti || 0];
		const t = k && k.t != null ? k.t - (s.key.startsWith('check') ? 1 : 0.3) : r ? r.a - 0.3 : null;
		asstHear(t, r && t != null ? Math.min(6, Math.max(2, r.b - t + 0.3)) : 2.5);
	} else if (a === 'hearw') {
		const t = selTime();
		asstHear(t != null ? t - 0.2 : edit.zone ? edit.zone.a : null);
	} else if (a === 'cancel') endEdit(false);
	else if (a === 'fixhow') { asst.fix = performance.now(); asst.at = asst.fix; asst.key = ''; }
	else if (a === 'listen') {
		if (!audio.paused) pause();
		else {
			if (!asst.listening || clock() >= (s.lastEnd || 0)) seek(Math.max(0, (lineRange(0) || {a: 0}).a - 1));
			asst.listening = true;
			loop = null;
			play();
		}
	} else if (a === 'listened') { asst.listening = false; asst.listened = true; pause(); }
	else if (a === 'nextsong') stepSong(1);
	setTimeout(asstTick, 0);
});

// a new song: everything the assistant knew about the old one goes
function asstReset() {
	asst.noRef = false;
	asst.listened = false;
	asst.listening = false;
	asst.skip = new WeakMap();
	asst.later = new WeakSet();
	asst.check = null;
	asst.demo = null;
	asst.key = '';
}

function setAsst(on, keep = true) {
	asst.on = on || simple;
	asst.key = '';
	$('asst').hidden = !asst.on || !!tut;
	$('btnAsst').classList.toggle('on', asst.on);
	if (keep) try { localStorage.setItem('lrcEditorAsst', on ? '1' : '0'); } catch (e) { /* ignore */ }
	if (!asst.on) { asst.focus = null; document.body.classList.remove('afocus-on'); asstLines(); tutPlace(); }
	asstTick();
}

// ✨ simple mode: a slim studio with the assistant always on and the timeline paging instead of following (Folgen
// off); 🛠 Profi-Modus = the full studio again, as it was
let sylBefore = null, followBefore = null;
function setSimple(on, keep = true) {
	simple = on;
	document.body.classList.toggle('simple', on && !tut);
	if (on) setTall(false, false);                 // the assistant points into the timeline
	$('btnSimple').textContent = on ? '🛠 Profi-Modus' : '✨ Simple-Modus';
	$('btnSimple').dataset.i = on ? '🛠' : '✨';
	$('btnSimple').title = on ? 'Zurück ins volle Studio mit allen Werkzeugen' :
		'Simple-Modus: ein schlankes Studio, Juicy führt dich Stelle für Stelle durch den Song';
	if (on && $('sylMode').value !== 'off') { sylBefore = $('sylMode').value; $('sylMode').value = 'off'; $('sylMode').onchange(); }
	else if (!on && sylBefore) { $('sylMode').value = sylBefore; sylBefore = null; $('sylMode').onchange(); }
	if (on && followBefore == null) { followBefore = $('follow').checked; $('follow').checked = false; }
	else if (!on && followBefore != null) { $('follow').checked = followBefore; followBefore = null; }
	if (keep) try { localStorage.setItem('lrcEditorSimple', on ? '1' : '0'); } catch (e) { /* ignore */ }
	let a = false;
	try { a = localStorage.getItem('lrcEditorAsst') === '1'; } catch (e) { /* ignore */ }
	setAsst(on || a, false);
	fitPreview();
}
$('btnSimple').onclick = () => setSimple(!simple);
$('btnAsst').onclick = () => setAsst(!asst.on);
$('asstClose').onclick = () => simple ? setSimple(false) : setAsst(false);
$('splashSimple').addEventListener('click', () => setSimple(true));
// what the user does: the arrow steps back while they work and comes again when nothing happens
addEventListener('pointerdown', e => { if (!e.target.closest('#asst')) asst.act = performance.now(); }, true);
addEventListener('keydown', () => { asst.act = performance.now(); }, true);
try {
	asst.placed = +localStorage.getItem('lrcEditorAsstPlaced') || 0;
	asst.intro = localStorage.getItem('lrcEditorAsstIntro') === '1' ? INTRO.length : 0;
} catch (e) { /* ignore */ }

// touch screens: a long press into the timeline plays from there (like the right button), a tap sets as usual
let touchHold = null;
tl.addEventListener('pointerdown', e => {
	if (e.pointerType !== 'touch') return;
	const t = tlTime(e.offsetX), h = touchHold = {on: false};
	h.timer = setTimeout(() => { h.on = true; audition(t, true); }, 380);
});
const touchUp = () => {
	if (!touchHold) return;
	clearTimeout(touchHold.timer);
	if (touchHold.on) { releaseSnip(); touchHeldAt = performance.now(); }    // no tap after a long press
	touchHold = null;
};
tl.addEventListener('pointerup', touchUp);
tl.addEventListener('pointercancel', touchUp);
try { setSimple(localStorage.getItem('lrcEditorSimple') === '1', false); } catch (e) { setSimple(false, false); }

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
	let stay = false;                                // the mouse on the splash: it waits for a click (Studio / Tutorial)
	el.addEventListener('pointerenter', () => { stay = true; clearTimeout(timer); el.classList.add('wait'); });
	const auto = () => { if (!stay) close(); };
	if (!on) { timer = setTimeout(auto, 1400); return; }
	snd.play().then(() => {
		el.classList.add('playing');
		timer = setTimeout(auto, 1900);
	}).catch(() => el.classList.add('wait'));
})();
