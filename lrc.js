// Enhanced LRC model for the browser editor: parse, write, check. No DOM here.
//
// doc  = {meta: [[key, value]], lines: [Line], warnings: []}
// Line = {t, tokens: [Tok], brk, vtag}  t: line tag time (used while no token is placed), brk: empty line = break
//                                     marker, vtag: voice tag written on this line ('v2', 'F', 'bg' ... or '')
// Tok  = {text, t, end, glue}        t / end in seconds or null, glue: syllable that continues the previous token
//
// Written like src/core/lrc_parser.py reads it:
//   [00:21.40]<00:21.40>Hel<00:21.80>lo <00:22.30>world <00:23.10>     last tag without text = end mark
//   ... <00:22.30>world <00:23.10> <00:24.00>again                      end mark followed by a pause
// Lines without any time stay plain text (unfinished file); players skip them.
// Syllables that have no time yet are kept as 'Lie|be', so an unfinished file keeps its syllable splits.
// Voices: [t]v2: text (eLRC v1 v2 ...), [t]F: text (M / F / D), a voice stays until the next tag;
// [t]bg: text = background vocals, they overlap the main line and are checked on their own.

const LRC = (() => {
	const T = '(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?';
	const LINE_TAGS = new RegExp('^((?:\\[' + T + '\\]\\s*)+)(.*)$');
	const LINE_TAG = new RegExp('\\[' + T + '\\]', 'g');
	const WORD_TAG = new RegExp('<' + T + '>', 'g');
	const META = /^\[([A-Za-z#][\w#-]*)\s*:(.*)\]\s*$/;
	const SAME = 0.005;        // two times closer than this are "the same" (files store hundredths)
	const VOICE = /^\s*([vV]\d{1,2}|[bB][gG]|[MFD])\s*:\s*/;
	const FIRST_TAG = new RegExp('^<' + T + '>');

	const secs = (m, s, f) => +m * 60 + +s + (f ? +f / 10 ** f.length : 0);
	const q = t => Math.round(t * 100) / 100;      // hundredths, what the file can store
	const pad = n => String(n).padStart(2, '0');

	function fmt(t) {
		const c = Math.max(0, Math.round(t * 100));
		return pad(Math.floor(c / 6000)) + ':' + pad(Math.floor(c / 100) % 60) + '.' + pad(c % 100);
	}

	function decode(buf) {
		const b = new Uint8Array(buf);
		if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
		if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
		try {
			return new TextDecoder('utf-8', {fatal: true}).decode(b);
		} catch (e) {
			return new TextDecoder('windows-1252').decode(b);
		}
	}

	// 'v2: text' / '<t>v2: text' -> {v: 'v2', body: text without the tag}
	function stripVoice(body) {
		let head = '', rest = body, m = rest.match(VOICE);
		const t = rest.match(FIRST_TAG);
		if (!m && t) {
			head = t[0];
			rest = rest.slice(t[0].length);
			m = rest.match(VOICE);
		}
		if (!m) return {v: '', body};
		const v = /^[vb]/i.test(m[1]) ? m[1].toLowerCase() : m[1];
		return {v, body: head + rest.slice(m[0].length)};
	}

	const isBg = ln => ln.vtag === 'bg';

	// per line {voice, bg, own}: the voice it is sung in (inherited from the line before when it has no tag)
	function voices(doc) {
		let cur = '';
		return doc.lines.map(ln => {
			if (isBg(ln)) return {voice: cur, bg: true, own: true};
			if (ln.vtag) cur = ln.vtag;
			return {voice: cur, bg: false, own: !!ln.vtag};
		});
	}

	function parse(text) {
		const doc = {meta: [], lines: [], warnings: []};
		const rows = [];
		text.replace(/^﻿/, '').split(/\r?\n/).forEach((raw, n) => {
			const ln = raw.trim().normalize('NFC');
			if (!ln) return;
			const m = ln.match(LINE_TAGS);
			if (m) {
				for (const tg of m[1].matchAll(LINE_TAG))
					rows.push({t: secs(tg[1], tg[2], tg[3]), body: m[5], order: rows.length});
				return;
			}
			const mm = ln.match(META);
			if (mm) {
				doc.meta.push([mm[1].trim(), mm[2].trim()]);
				return;
			}
			rows.push({t: null, body: ln, order: rows.length});       // plain text line, not timed yet
		});
		// timed rows sorted by time; untimed rows stay where they were (after the timed row before them)
		let last = -1;
		rows.forEach(r => { r.key = r.t != null ? r.t : last; if (r.t != null) last = r.t; });
		rows.sort((a, b) => a.key - b.key || a.order - b.order);
		for (const r of rows) {
			const {v, body} = stripVoice(r.body);
			const tokens = parseBody(body, r.t);
			doc.lines.push(tokens.length ? {t: r.t, tokens, brk: false, vtag: v} : {t: r.t, tokens: [], brk: true, vtag: ''});
		}
		return doc;
	}

	function parseBody(body, lineT) {
		const tags = [...body.matchAll(WORD_TAG)];
		const toks = [];
		if (!tags.length) {
			for (const w of body.match(/\S+/g) || []) toks.push(...syllables(w, null, false));
			return toks;
		}
		const segs = [];
		const head = body.slice(0, tags[0].index);
		if (head.trim()) segs.push({t: lineT, txt: head});
		tags.forEach((m, i) => {
			const stop = i + 1 < tags.length ? tags[i + 1].index : body.length;
			segs.push({t: secs(m[1], m[2], m[3]), txt: body.slice(m.index + m[0].length, stop)});
		});
		let before = '';
		for (const sg of segs) {
			if (!sg.txt.trim()) {                   // tag without text = end mark of the token before
				const p = toks[toks.length - 1];
				if (p && p.end == null) p.end = q(sg.t);
			} else {
				// 'Hel<t>lo': a tag in the middle of a word continues it
				const glued = toks.length > 0 && before !== '' && !/\s$/.test(before) && !/^\s/.test(sg.txt);
				sg.txt.match(/\S+/g).forEach((w, j) => toks.push(...syllables(w, j === 0 ? q(sg.t) : null, j === 0 && glued)));
			}
			before = sg.txt;
		}
		return toks;
	}

	// 'Lie|be' -> two glued tokens, the first one with time t
	function syllables(w, t, glue) {
		return w.split('|').filter(Boolean).map((s, i) => ({text: s, t: i === 0 ? t : null, end: null, glue: i === 0 ? glue : true}));
	}

	function lineTime(ln) {
		return ln.tokens.length && ln.tokens[0].t != null ? ln.tokens[0].t : ln.t;
	}

	function write(doc) {
		const out = doc.meta.map(([k, v]) => '[' + k + ':' + v + ']');
		for (const ln of doc.lines) {
			const t0 = lineTime(ln);
			if (ln.brk) {
				if (t0 != null) out.push('[' + fmt(t0) + ']');
				continue;
			}
			let s = (t0 != null ? '[' + fmt(t0) + ']' : '') + (ln.vtag ? ln.vtag + ': ' : '');
			ln.tokens.forEach((k, i) => {
				if (i > 0 && !k.glue) s += ' ';
				else if (i > 0 && k.t == null) s += '|';      // syllable not placed yet
				if (k.t != null) s += '<' + fmt(k.t) + '>';
				s += k.text;
				const nx = ln.tokens[i + 1];
				if (k.end != null && (!nx || (!nx.glue && (nx.t == null || Math.abs(nx.t - k.end) > SAME))))
					s += ' <' + fmt(k.end) + '>';
			});
			out.push(s);
		}
		return out.join('\n') + '\n';
	}

	// every token in file order: {li, ti, k}
	function flat(doc) {
		const out = [];
		doc.lines.forEach((ln, li) => ln.tokens.forEach((k, ti) => out.push({li, ti, k})));
		return out;
	}

	// when a token stops: its end mark, else the next placed token, else nothing
	function tokEnd(doc, li, ti) {
		const ln = doc.lines[li], k = ln.tokens[ti];
		if (k.end != null) return k.end;
		for (let j = ti + 1; j < ln.tokens.length; j++) if (ln.tokens[j].t != null) return ln.tokens[j].t;
		for (let i = li + 1; i < doc.lines.length; i++) {
			if (isBg(doc.lines[i])) continue;
			const t = lineTime(doc.lines[i]);
			if (t != null) return t;
		}
		return null;
	}

	// problems: {li, ti, end, level: 'err' | 'warn' | 'info', code, msg}
	// maxGap: a word that lasts longer than this (to its end mark or, without one, to the next word) is an error
	// endGap: a missing line end only counts when the next line starts later than this after the last word
	//         (same as END_GAP in lrc_parser.py)
	function check(doc, maxGap = 5, endGap = 0.5) {
		const out = [];
		let prev = null, prevEnd = null;
		const sec = d => d.toFixed(1).replace('.', ',') + ' s';
		doc.lines.forEach((ln, li) => {
			if (ln.brk) return;
			const bg = isBg(ln);
			const mainPrev = prev;
			if (bg) prev = null;
			const lastI = ln.tokens.length - 1;
			ln.tokens.forEach((k, ti) => {
				if (k.t != null && maxGap > 0) {
					const e = tokEnd(doc, li, ti);
					if (e != null && e - k.t > maxGap)
						out.push(k.end != null
							? {li, ti, level: 'err', code: 'long', msg: 'Wort ist ' + sec(e - k.t) + ' lang'}
							: ti === lastI
								? {li, ti, end: true, level: 'err', code: 'long', msg: 'Zeilenende fehlt, das letzte Wort liefe ' + sec(e - k.t)}
								: {li, ti, level: 'err', code: 'long', msg: sec(e - k.t) + ' bis zum nächsten Wort (Pause markieren?)'});
				}
				if (k.t == null) {
					out.push({li, ti, level: 'info', code: 'unset', msg: 'noch nicht gesetzt'});
					return;
				}
				if (prev && Math.abs(k.t - prev.t) < SAME)
					out.push({li, ti, level: 'err', code: 'same', msg: 'gleiche Zeit wie „' + prev.text + '“ davor'});
				else if (prev && k.t < prev.t)
					out.push({li, ti, level: 'err', code: 'order', msg: 'früher als „' + prev.text + '“ davor'});
				if (ti === 0 && !bg && prevEnd != null && k.t < prevEnd - SAME)
					out.push({li, ti, level: 'warn', code: 'overlap', msg: 'beginnt vor dem Ende der Zeile davor'});
				if (k.end != null && k.end <= k.t + SAME)
					out.push({li, ti, end: true, level: 'err', code: 'endorder', msg: 'Ende liegt nicht nach dem Anfang'});
				const nx = ln.tokens[ti + 1];
				if (k.end != null && nx && nx.t != null && nx.t < k.end - SAME)
					out.push({li, ti, end: true, level: 'err', code: 'endlate', msg: 'Ende liegt nach dem nächsten Wort'});
				prev = k;
			});
			const last = ln.tokens[ln.tokens.length - 1];
			const runs = last.t != null && last.end == null ? tokEnd(doc, li, ln.tokens.length - 1) : null;
			if (last.t != null && last.end == null && (runs == null || runs - last.t > endGap + SAME) &&
				!out.some(i => i.li === li && i.code === 'long' && i.end))
				out.push({li, ti: ln.tokens.length - 1, end: true, level: 'warn', code: 'noend', msg: 'Zeilenende fehlt'});
			if (bg) prev = mainPrev;
			else if (last.end != null) prevEnd = last.end;
		});
		return out;
	}

	// Words with the same time as the word before: spread them between that time and the next later one,
	// in proportion to their length. Returns how many tokens moved.
	function spreadSame(doc) {
		const placed = flat(doc).filter(e => e.k.t != null);
		const groups = [placed.filter(e => !isBg(doc.lines[e.li]))];
		doc.lines.forEach((ln, li) => { if (isBg(ln)) groups.push(placed.filter(e => e.li === li)); });
		return groups.reduce((n, f) => n + spreadList(f), 0);
	}

	function spreadList(f) {
		let moved = 0;
		for (let i = 1; i < f.length; i++) {
			if (Math.abs(f[i].k.t - f[i - 1].k.t) >= SAME) continue;
			const s = i - 1, base = f[s].k.t;
			let e = i;
			while (e + 1 < f.length && Math.abs(f[e + 1].k.t - base) < SAME) e++;
			let stop = e + 1 < f.length && f[e + 1].k.t > base ? f[e + 1].k.t : null;
			const endMark = f[e].k.end;
			if (endMark != null && endMark > base && (stop == null || endMark < stop)) stop = endMark;
			if (stop == null) stop = base + 0.3 * (e - s + 1);
			const w = f.slice(s, e + 1).map(x => Math.max(1, x.k.text.length));
			const total = w.reduce((a, b) => a + b, 0);
			let acc = 0;
			for (let j = s; j <= e; j++) {
				const nt = q(base + (stop - base) * acc / total);
				if (j > s) moved++;
				f[j].k.t = nt;
				if (f[j].k.end != null && f[j].k.end <= nt) f[j].k.end = null;
				acc += w[j - s];
			}
			i = e;
		}
		return moved;
	}

	// Missing line ends: about as long as the other words of the line, never past the next line.
	// suggested end of a line whose last word has no end mark: about as long as its other words (x1.3, 0.25..1.5 s),
	// never past the next line. null when the line has an end or no time.
	function suggestEnd(doc, li) {
		const ln = doc.lines[li];
		if (!ln || ln.brk || !ln.tokens.length) return null;
		const ti = ln.tokens.length - 1, k = ln.tokens[ti];
		if (k.t == null || k.end != null) return null;
		const durs = [];
		for (let j = 0; j < ti; j++) {
			const a = ln.tokens[j], e = tokEnd(doc, li, j);
			if (a.t != null && e != null && e > a.t) durs.push(e - a.t);
		}
		let d = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0.4;
		d = Math.min(1.5, Math.max(0.25, d * 1.3));
		const nxt = tokEnd(doc, li, ti);
		let end = k.t + d;
		if (nxt != null) end = Math.min(end, nxt - 0.05);
		return end > k.t + 0.05 ? q(end) : null;
	}

	function guessEnds(doc) {
		let n = 0;
		doc.lines.forEach((ln, li) => {
			const e = suggestEnd(doc, li);
			if (e != null) {
				ln.tokens[ln.tokens.length - 1].end = e;
				n++;
			}
		});
		return n;
	}

	// Pasted lyrics from lyric sites: section headers ([Verse 1], [Chorus], (Refrain) ...) and the
	// "You might also like" block with other songs are dropped, [...] inside a line too, "123Embed" at the end.
	const SECTION = /^[[(]\s*(verse|chorus|refrain|hook|bridge|intro|outro|pre-?chorus|post-?chorus|strophe|interlude|break|drop|instrumental|part|teil)\b[^\])]*[\])]\s*$/i;

	function cleanLyrics(text) {
		const out = [];
		let junk = false;
		for (let raw of text.split(/\r?\n/)) {
			raw = raw.normalize('NFC').trim();
			if (/^\[[^\]]*\]$/.test(raw) || SECTION.test(raw)) { junk = false; continue; }
			if (/^you might also like/i.test(raw)) { junk = true; continue; }
			if (junk) continue;
			if (/^\d+\s+contributors?\b/i.test(raw) || /^translations?$/i.test(raw)) continue;
			raw = raw.replace(/\[[^\]]*\]/g, ' ').replace(/\d*\s*Embed$/, '').replace(/\s+/g, ' ').trim();
			out.push(raw);
		}
		return out;
	}

	// ---------------------------------------------------------------- compare with the original lyrics
	//
	// Every LRC line is aligned on its own against the whole original as one word stream, so repeats and loops of a
	// remix find their place again, and a line may start or stop anywhere (remix cuts are no mistakes). Inside the
	// matched stretch a different word is a suggestion to replace, a missing word one to insert, an extra word one
	// to delete. Words in (...) of the original are optional (backing vocals). Case and punctuation do not count.

	const norm = w => w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

	function lev(a, b) {
		if (a === b) return 0;
		let p = Array.from({length: b.length + 1}, (_, j) => j);
		for (let i = 1; i <= a.length; i++) {
			const c = [i];
			for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			p = c;
		}
		return p[b.length];
	}

	// 'same' | 'near' (a typo or a small mishearing) | 'other'
	function likeness(a, b) {
		if (a === b) return 'same';
		const n = Math.max(a.length, b.length);
		return n >= 3 && lev(a, b) <= Math.max(1, Math.floor(n / 3)) ? 'near' : 'other';
	}

	function refWords(lines) {
		const out = [];
		let depth = 0;
		lines.forEach((ln, rl) => {
			for (const raw of ln.split(/\s+/).filter(Boolean)) {
				const open = (raw.match(/\(/g) || []).length, close = (raw.match(/\)/g) || []).length;
				const opt = depth > 0 || open > 0;
				depth = Math.max(0, depth + open - close);
				const w = raw.replace(/[()]/g, '');
				const n = norm(w);
				if (n) out.push({w, n, opt, rl});
			}
			depth = 0;                                // a bracket never runs over the end of a line
		});
		return out;
	}

	// words of an LRC line: glued syllables are one word. {ti0, ti1, text, n}
	function lineWords(ln) {
		const out = [];
		ln.tokens.forEach((k, ti) => {
			const prev = out[out.length - 1];
			if (k.glue && prev) { prev.ti1 = ti; prev.text += k.text; }
			else out.push({ti0: ti, ti1: ti, text: k.text});
		});
		for (const w of out) w.n = norm(w.text);
		return out.filter(w => w.n);
	}

	// -> [{li, kind: 'sub' | 'miss' | 'extra' | 'nomatch', ti0, ti1, have, want, near, ref}], ti0 of 'miss' = insert before
	// this token (tokens.length = at the end), ref = the matched part of the original as text
	function compareRef(doc, lines) {
		const R = refWords(lines), m = R.length, out = [];
		if (!m) return out;
		let prevEnd = 0;
		doc.lines.forEach((ln, li) => {
			if (ln.brk || isBg(ln)) return;
			const W = lineWords(ln), n = W.length;
			if (!n) return;
			// semi-global alignment: free start and end in the original
			const D = new Float64Array((n + 1) * (m + 1)), B = new Uint8Array((n + 1) * (m + 1));
			const at = (i, j) => i * (m + 1) + j;
			for (let i = 1; i <= n; i++) { D[at(i, 0)] = i * 1.5; B[at(i, 0)] = 2; }
			for (let i = 1; i <= n; i++) {
				for (let j = 1; j <= m; j++) {
					const lk = likeness(W[i - 1].n, R[j - 1].n);
					const sub = D[at(i - 1, j - 1)] + (lk === 'same' ? 0 : lk === 'near' ? 0.3 : 1.4);
					const extra = D[at(i - 1, j)] + 1.5;          // an extra word costs more than a missing one: a mishearing more often drops words
					const miss = D[at(i, j - 1)] + (R[j - 1].opt ? 0.05 : 1);
					let best = sub, b = 1;
					if (extra < best) { best = extra; b = 2; }
					if (miss < best) { best = miss; b = 3; }
					D[at(i, j)] = best;
					B[at(i, j)] = b;
				}
			}
			let end = -1, cost = Infinity, dist = Infinity;
			for (let j = 1; j <= m; j++) {
				const c = D[at(n, j)], d = (j - prevEnd + m) % m;   // equal cost: the next one after the line before
				if (c < cost - 1e-9 || (Math.abs(c - cost) < 1e-9 && d < dist)) { cost = c; end = j; dist = d; }
			}
			if (cost > n * 0.5 || (n < 3 && cost > 0.6)) {
				if (n >= 3) out.push({li, kind: 'nomatch', ti0: 0, ti1: ln.tokens.length - 1});
				return;
			}
			prevEnd = end;
			const found = [];
			let i = n, j = end;
			while (i > 0) {
				const b = B[at(i, j)];
				if (b === 1) {
					const w = W[i - 1], r = R[j - 1], lk = likeness(w.n, r.n);
					if (lk !== 'same') found.push({li, kind: 'sub', ti0: w.ti0, ti1: w.ti1, have: w.text, want: r.w, near: lk === 'near'});
					i--; j--;
				} else if (b === 2) {
					const w = W[i - 1];
					found.push({li, kind: 'extra', ti0: w.ti0, ti1: w.ti1, have: w.text});
					i--;
				} else {
					const r = R[j - 1];
					if (!r.opt) found.push({li, kind: 'miss', ti0: i < n ? W[i].ti0 : ln.tokens.length, ti1: -1, want: r.w,
						after: i > 0 ? W[i - 1].text : null});
					j--;
				}
			}
			const ref = R.slice(j, end).map(r => r.w).join(' ');
			for (const f of found.reverse()) { f.ref = ref; out.push(f); }
		});
		return out;
	}

	// pasted lyrics -> unplaced lines; '|' splits syllables (Hel|lo); section headers and site junk are dropped
	function fromText(text, meta) {
		const doc = {meta: meta.filter(m => m[1]), lines: [], warnings: []};
		for (const raw of cleanLyrics(text)) {
			const words = raw.trim().normalize('NFC').split(/\s+/).filter(Boolean);
			if (!words.length) continue;
			const {v, body} = stripVoice(words.join(' '));
			if (body.trim()) doc.lines.push({t: null, tokens: tokensOf(body), brk: false, vtag: v});
		}
		return doc;
	}

	function tokensOf(text) {
		const out = [];
		for (const w of text.trim().split(/\s+/).filter(Boolean))
			w.split('|').filter(Boolean).forEach((syl, j) => out.push({text: syl, t: null, end: null, glue: j > 0}));
		return out;
	}

	// line text with '|' between syllables and the voice tag in front, for editing
	function lineText(ln, withVoice = true) {
		return (withVoice && ln.vtag ? ln.vtag + ': ' : '') +
			ln.tokens.map((k, i) => (i === 0 ? '' : k.glue ? '|' : ' ') + k.text).join('');
	}

	// colour group of a voice: 0 main ('', v1, M), 2 (v2, F), 3 (v3 and more), 9 duet (D)
	function voiceGroup(v) {
		if (/^v\d+$/.test(v)) return Math.min(3, Math.max(1, +v.slice(1))) === 1 ? 0 : Math.min(3, +v.slice(1));
		return {F: 2, D: 9}[v] || 0;
	}

	return {SAME, q, fmt, decode, parse, write, check, flat, tokEnd, lineTime, spreadSame, guessEnds, suggestEnd, fromText,
		tokensOf, lineText, stripVoice, voices, voiceGroup, isBg, cleanLyrics, compareRef};
})();
