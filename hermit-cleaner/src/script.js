// HermitUI Cleaner: clean up text another model wrote, optionally have a local model
// reword part of it, and add a few typing mistakes. Nothing is stored: settings and
// text live in this tab's memory only.
//
// The pure functions come first (tests/extract.mjs slices them out by name, by brace
// counting, so keep literal braces out of their regexes, strings and comments); the
// DOM wiring is at the bottom.

const APP_VERSION = "0.4.8";

// ========== Stage 1: character cleanup ==========

// What survives: tab, newline, printable ASCII, printable Latin-1 (U+00A1-U+00FF; the
// no-break space U+00A0 and the soft hyphen U+00AD are turned into a space and removed
// on the way), plus the euro sign, which every European keyboard has although Latin-1
// predates it.
const KEEP_RE = /^[\t\n\x20-\x7e\xa1-\xac\xae-\xff\u20ac]$/;

// Invisible characters: format characters (zero-width space/joiners, BiDi controls,
// BOM, word joiner, soft hyphen), control characters, variation selectors, and the
// letters and fillers that render as blank space.
const INVISIBLE_RE = /^(?:[\p{Cf}\p{Cc}\u034f\u115f\u1160\u17b4\u17b5\u2800\u3164\ufe00-\ufe0f\uffa0]|[\u{e0100}-\u{e01ef}])$/u;

// Unusual spaces that become a plain space. Line and paragraph separators become \n.
const SPACE_CHARS = "\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000";

// Typography a keyboard can't type, and letters NFKD doesn't decompose.
const CHAR_MAP = {
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'", "\u2032": "'", "\u2035": "'",
    "\u2039": "'", "\u203a": "'", "\u02bc": "'", "\u02bb": "'",
    "\u201c": "\"", "\u201d": "\"", "\u201e": "\"", "\u201f": "\"", "\u2033": "\"", "\u2036": "\"",
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2212": "-", "\u2043": "-",
    "\u2026": "...", "\u2022": "-", "\u2023": "-", "\u25e6": "-", "\u2219": "-", "\u25cf": "-", "\u25aa": "-",
    "\u2192": "->", "\u2190": "<-", "\u2194": "<->", "\u21d2": "=>", "\u21d0": "<=", "\u21d4": "<=>",
    "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2248": "~", "\u2044": "/", "\u2215": "/",
    "\u2122": "(TM)", "\u2116": "No.", "\u2030": " promille", "\u301c": "~", "\u3030": "~",
    "\u27a1": "->", "\u2794": "->", "\u279c": "->", "\u27f6": "->", "\u2b95": "->", "\u21a6": "->", "\u2b05": "<-", "\u27f5": "<-",
    "\u25b6": "-", "\u25ba": "-", "\u25b8": "-", "\u27a4": "-", "\u25a0": "-", "\u25c6": "-", "\u2756": "-", "\u2726": "-",
    "\u0142": "l", "\u0141": "L", "\u0111": "d", "\u0110": "D", "\u0131": "i", "\u0153": "oe", "\u0152": "OE",
    "\u1e9e": "SS", "\u0251": "a", "\u0261": "g", "\u0127": "h", "\u0126": "H", "\u0167": "t", "\u0166": "T",
    // Small capitals, a favourite of "fancy text" generators. NFKD leaves them alone.
    "\u1d00": "a", "\u0299": "b", "\u1d04": "c", "\u1d05": "d", "\u1d07": "e", "\ua730": "f", "\u0262": "g",
    "\u029c": "h", "\u026a": "i", "\u1d0a": "j", "\u1d0b": "k", "\u029f": "l", "\u1d0d": "m", "\u0274": "n",
    "\u1d0f": "o", "\u1d18": "p", "\u0280": "r", "\ua731": "s", "\u1d1b": "t", "\u1d1c": "u", "\u1d20": "v",
    "\u1d21": "w", "\u028f": "y", "\u1d22": "z",
};

// Cyrillic and Greek letters that look like Latin ones. Mapped only inside a word that
// also has real Latin letters, so genuine Russian or Greek text is never "corrected".
const HOMOGLYPHS = {
    "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
    "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u051b": "q", "\u051d": "w", "\u04bb": "h", "\u04cf": "l",
    "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M", "\u041d": "H", "\u041e": "O",
    "\u0420": "P", "\u0421": "C", "\u0422": "T", "\u0425": "X", "\u0423": "Y", "\u0406": "I", "\u0408": "J", "\u0405": "S",
    "\u03bf": "o", "\u03bd": "v", "\u03c1": "p", "\u03b9": "i", "\u03b1": "a",
    "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H", "\u0399": "I", "\u039a": "K",
    "\u039c": "M", "\u039d": "N", "\u039f": "O", "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
    // Armenian, Cherokee, and the Latin click letter that passes for an l.
    "\u0585": "o", "\u057d": "u", "\u0570": "h", "\u0578": "n", "\u0581": "g", "\u0566": "q",
    "\u13aa": "A", "\u13f4": "B", "\u13df": "C", "\u13a0": "D", "\u13ac": "E", "\u13b6": "G", "\u13bb": "H",
    "\u13ab": "J", "\u13e6": "K", "\u13de": "L", "\u13b7": "M", "\u13e2": "P", "\u13da": "S", "\u13a2": "T",
    "\u13d9": "V", "\u13b3": "W", "\u13a9": "Y", "\u13c3": "Z", "\u01c0": "l",
};

// Names for the characters people most often ask about; the rest show as U+XXXX.
const CHAR_NAMES = {
    0x200b: "zero-width space", 0x200c: "zero-width non-joiner", 0x200d: "zero-width joiner",
    0x200e: "left-to-right mark", 0x200f: "right-to-left mark", 0x2060: "word joiner", 0xfeff: "byte-order mark",
    0x00ad: "soft hyphen", 0x00a0: "no-break space", 0x202f: "narrow no-break space", 0x2009: "thin space",
    0x200a: "hair space", 0x2002: "en space", 0x2003: "em space", 0x2007: "figure space", 0x3000: "ideographic space",
    0x2014: "em dash", 0x2015: "horizontal bar", 0x2013: "en dash", 0x2011: "non-breaking hyphen", 0x2212: "minus sign",
    0x2018: "left single quote", 0x2019: "right single quote", 0x201c: "left double quote",
    0x201d: "right double quote", 0x201e: "low double quote", 0x2026: "ellipsis", 0x2022: "bullet",
    0x202a: "LTR embedding", 0x202b: "RTL embedding", 0x202c: "pop directional formatting",
    0x202d: "LTR override", 0x202e: "RTL override", 0x2066: "LTR isolate", 0x2067: "RTL isolate",
    0x2068: "first-strong isolate", 0x2069: "pop directional isolate", 0x061c: "Arabic letter mark",
    0x034f: "combining grapheme joiner", 0x180e: "Mongolian vowel separator", 0x3164: "Hangul filler",
    0x2028: "line separator", 0x2029: "paragraph separator",
};

const CLEAN_CATEGORIES = ["hidden", "invisible", "composed", "spaces", "typography", "homoglyph", "transliterated", "dropped"];

function charLabel(ch) {
    const cp = ch.codePointAt(0);
    const hex = "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
    if (CHAR_NAMES[cp]) return `${CHAR_NAMES[cp]} (${hex})`;
    if (cp >= 0xe0000 && cp <= 0xe007f) return `tag character (${hex})`;
    if (cp >= 0xfe00 && cp <= 0xfe0f) return `variation selector (${hex})`;
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return `control character (${hex})`;
    if ((cp >= 0xe000 && cp <= 0xf8ff) || cp >= 0xf0000) return `private-use character (${hex})`;
    if (cp >= 0xd800 && cp <= 0xdfff) return `broken character, half a surrogate pair (${hex})`;
    if (cp === 0xfffd) return `replacement character \ufffd (${hex})`;
    if (/\p{M}/u.test(ch)) return `combining mark (${hex})`;
    if (INVISIBLE_RE.test(ch)) return `invisible character (${hex})`;
    return `${ch} (${hex})`;
}

// A character outside the kept set, written with kept characters, or null.
function transliterate(ch) {
    if (Object.prototype.hasOwnProperty.call(CHAR_MAP, ch)) return CHAR_MAP[ch];
    // Negative circled and negative squared capitals (fancy text): no decomposition.
    const cp = ch.codePointAt(0);
    if (cp >= 0x1f150 && cp <= 0x1f169) return String.fromCharCode(65 + cp - 0x1f150);
    if (cp >= 0x1f170 && cp <= 0x1f189) return String.fromCharCode(65 + cp - 0x1f170);
    const base = ch.normalize("NFKD").replace(/\p{M}/gu, "");
    if (!base || base === ch) return null;
    let out = "";
    for (const c of base) {
        if (KEEP_RE.test(c)) out += c;
        else if (Object.prototype.hasOwnProperty.call(CHAR_MAP, c)) out += CHAR_MAP[c];
        else if (SPACE_CHARS.includes(c)) out += " ";
        else return null;
    }
    return out;
}

// Indices (into the code-point array) of look-alike letters inside words that also
// contain Latin letters. Invisible characters count as part of the word, since they
// are often used to split one.
function homoglyphPositions(chars) {
    const hits = new Set();
    let i = 0;
    while (i < chars.length) {
        if (!/[\p{L}\p{M}]/u.test(chars[i])) { i++; continue; }
        let j = i, latin = false;
        const candidates = [];
        while (j < chars.length && (/[\p{L}\p{M}]/u.test(chars[j]) || INVISIBLE_RE.test(chars[j]))) {
            if (Object.prototype.hasOwnProperty.call(HOMOGLYPHS, chars[j])) candidates.push(j);
            else if (/\p{Script=Latin}/u.test(chars[j])) latin = true;
            j++;
        }
        if (latin) candidates.forEach(k => hits.add(k));
        i = j;
    }
    return hits;
}

// Clean `text` down to the kept character set.
// Returns the cleaned text, marks for the change view (offsets into the cleaned text;
// a removal is a zero-width mark) and a report: per category, a label -> count map,
// plus any text hidden in tag characters, decoded.
// Besides characters it tidies whitespace, a known hiding place for data: trailing
// spaces and repeated spaces mid-line go, and so do spaces a removed symbol leaves
// behind. Fenced code blocks keep their whitespace.
function cleanText(text) {
    const raw = String(text || "").replace(/\r\n?/g, "\n");
    // NFC first: an accent stored as a separate combining mark ("u" + U+0308, as macOS
    // writes it) becomes the Latin-1 letter instead of losing its accent.
    const nfc = raw.normalize("NFC");
    const chars = Array.from(nfc);
    const counts = {};
    CLEAN_CATEGORIES.forEach(c => { counts[c] = {}; });
    const composed = (raw.match(/\p{M}/gu) || []).length - (nfc.match(/\p{M}/gu) || []).length;
    if (composed > 0) counts.composed["accent stored as a separate mark, recombined"] = composed;
    const hiddenText = [];
    const marks = [];
    const homoglyphs = homoglyphPositions(chars);
    let out = "";
    let lineHasText = false;   // anything but spaces/tabs on the current output line
    let afterDrop = false;     // the last thing done was dropping a symbol
    let fence = null;          // inside a fenced code block: its fence character

    const count = (cat, ch, label) => { const l = label || charLabel(ch); counts[cat][l] = (counts[cat][l] || 0) + 1; };
    const emit = str => {
        out += str;
        afterDrop = false;
        const nl = str.lastIndexOf("\n");
        if (nl >= 0) lineHasText = /[^ \t]/.test(str.slice(nl + 1));
        else if (/[^ \t]/.test(str)) lineHasText = true;
    };
    const removed = (cat, ch, label) => {
        count(cat, ch, label);
        const l = label || charLabel(ch);
        const last = marks[marks.length - 1];
        if (last && last.kind === "removed" && last.start === out.length) {
            last.count++;
            // A long run of removals is one mark; its tooltip names the first few kinds.
            if (last.labels.length < 12 && !last.labels.includes(l)) last.labels.push(l);
        } else {
            marks.push({ start: out.length, end: out.length, kind: "removed", count: 1, labels: [l] });
        }
    };
    const replaced = (cat, ch, rep) => {
        // A replacement that starts with a space (a decomposed accent, say) mustn't
        // double one already there.
        if (!fence && lineHasText && out.endsWith(" ") && rep.startsWith(" ")) {
            rep = rep.replace(/^ +/, "");
            if (!rep) { removed(cat, ch); return; }
        }
        count(cat, ch);
        marks.push({ start: out.length, end: out.length + rep.length, kind: "clean", labels: [charLabel(ch)] });
        emit(rep);
    };
    // Cut spaces/tabs off the end of the output; counted under `label` unless silent.
    const trimEnd = label => {
        let k = out.length;
        while (k > 0 && (out[k - 1] === " " || out[k - 1] === "\t")) k--;
        if (k === out.length) return;
        const cut = out.slice(k);
        out = out.slice(0, k);
        while (marks.length && marks[marks.length - 1].end > out.length) {
            const mk = marks[marks.length - 1];
            if (mk.start >= out.length && mk.end > mk.start) marks.pop();
            else { mk.end = Math.max(mk.start, out.length); break; }
        }
        if (label) for (const ch of cut) removed("spaces", ch, ch === "\t" ? "trailing tab" : label);
    };

    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const cp = ch.codePointAt(0);
        if (i === 0 || chars[i - 1] === "\n") {
            let k = i;
            while (chars[k] === " " || chars[k] === "\t") k++;
            const f = chars[k] === "`" || chars[k] === "~" ? chars[k] : null;
            if (f && chars[k + 1] === f && chars[k + 2] === f) {
                if (!fence) fence = f;
                else if (fence === f) fence = null;
            }
        }
        if (cp >= 0xe0000 && cp <= 0xe007f) {
            // Tag characters: invisible copies of ASCII (U+E0020-U+E007E). Decode the run,
            // so the user can see what was smuggled in, then drop it.
            let decoded = "";
            let j = i;
            while (j < chars.length && chars[j].codePointAt(0) >= 0xe0000 && chars[j].codePointAt(0) <= 0xe007f) {
                const c = chars[j].codePointAt(0);
                if (c >= 0xe0020 && c <= 0xe007e) decoded += String.fromCharCode(c - 0xe0000);
                removed("hidden", chars[j]);
                j++;
            }
            if (decoded.trim()) hiddenText.push(decoded);
            i = j - 1;
            continue;
        }
        if (ch === "\n") {
            if (!fence) trimEnd(afterDrop ? null : "trailing space");
            emit(ch);
            continue;
        }
        if (ch === " " && !fence) {
            // A symbol was dropped next to this space: don't leave "  " or a leading space.
            if (afterDrop && (!lineHasText || out.endsWith(" "))) continue;
            if (lineHasText && out.endsWith(" ")) {
                // Spaces running to the end of the line are trailing: trimEnd counts them.
                let k = i;
                while (chars[k] === " " || chars[k] === "\t") k++;
                if (k < chars.length && chars[k] !== "\n") { removed("spaces", ch, "repeated space"); continue; }
            }
        }
        if (afterDrop && !fence && /^[,.;:!?)\]]$/.test(ch)) trimEnd(null);
        if (ch === "\t") { emit(ch); continue; }
        if (homoglyphs.has(i)) { replaced("homoglyph", ch, HOMOGLYPHS[ch]); continue; }
        if (KEEP_RE.test(ch)) { emit(ch); continue; }
        if (ch === "\u2028" || ch === "\u2029") { if (!fence) trimEnd(null); replaced("spaces", ch, "\n"); continue; }
        if (SPACE_CHARS.includes(ch)) { replaced("spaces", ch, " "); continue; }
        if (ch === "\u2014" || ch === "\u2015") {
            // An em dash becomes a spaced hyphen, as people type it: "a - b".
            trimEnd(null);
            const lineStart = out.length === 0 || out.endsWith("\n");
            // Following spaces and further dashes ("\u2014\u2014") fold into this one.
            let j = i + 1;
            while (j < chars.length && (chars[j] === " " || chars[j] === "\t" || SPACE_CHARS.includes(chars[j]) || chars[j] === "\u2014" || chars[j] === "\u2015")) {
                if (chars[j] === "\u2014" || chars[j] === "\u2015") count("typography", chars[j]);
                j++;
            }
            const lineEnd = j >= chars.length || chars[j] === "\n";
            replaced("typography", ch, lineStart ? "- " : lineEnd ? " -" : " - ");
            i = j - 1;
            continue;
        }
        if (INVISIBLE_RE.test(ch)) { removed("invisible", ch); continue; }
        const rep = transliterate(ch);
        if (rep !== null) {
            replaced(Object.prototype.hasOwnProperty.call(CHAR_MAP, ch) && !/\p{L}/u.test(ch) ? "typography" : "transliterated", ch, rep);
            continue;
        }
        removed("dropped", ch);
        afterDrop = true;
    }
    if (!fence) trimEnd(afterDrop ? null : "trailing space");
    return { text: out, marks, report: { counts, hiddenText } };
}

// Add one clean report into another (the second pass cleans the model's output).
function mergeCleanReports(a, b) {
    const counts = {};
    CLEAN_CATEGORIES.forEach(cat => {
        counts[cat] = { ...((a && a.counts[cat]) || {}) };
        Object.entries((b && b.counts[cat]) || {}).forEach(([l, n]) => { counts[cat][l] = (counts[cat][l] || 0) + n; });
    });
    return { counts, hiddenText: [...((a && a.hiddenText) || []), ...((b && b.hiddenText) || [])] };
}

function cleanTotal(report) {
    return CLEAN_CATEGORIES.reduce((sum, cat) => sum + Object.values(report.counts[cat]).reduce((s, n) => s + n, 0), 0);
}

// ========== Language ==========

// Short, frequent words per language: enough to tell these apart on one paragraph.
const STOPWORDS = {
    en: "the and is are of to in that it with for this was not you be have on as at by from or but",
    de: "der die das und ist nicht ein eine zu mit den auch sich auf f\u00fcr es im dem von sind wir ich werden oder aber wie bei",
    fr: "le la les et est des une un que pour dans pas sur avec ce qui du au sont il elle mais ou nous",
    es: "el la los las y es que en un una por con para no se del como est\u00e1 pero son lo al",
    it: "il la che di e \u00e8 un una per non sono con del della gli nel ma anche si come",
    nl: "de het een en van is niet dat op met zijn voor ook er maar te wordt aan",
    pt: "o a os as e \u00e9 que em um uma n\u00e3o para com do da se mas por s\u00e3o",
};
const LANGUAGE_NAMES = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese" };
// The keyboard people writing the language most likely use; anything else gets QWERTY.
const KEYBOARD_FOR_LANGUAGE = { de: "qwertz", fr: "azerty" };

// The language of `text` as a code from STOPWORDS, or null when the text is too short
// or the counts too close to call.
function detectLanguage(text) {
    const words = String(text || "").toLowerCase().match(/\p{L}+/gu) || [];
    if (words.length < 8) return null;
    const scores = Object.entries(STOPWORDS).map(([lang, list]) => {
        const set = new Set(list.split(" "));
        return [lang, words.filter(w => set.has(w)).length];
    }).sort((a, b) => b[1] - a[1]);
    const [best, second] = scores;
    if (best[1] < 3 || best[1] < words.length * 0.08 || best[1] < second[1] * 1.3) return null;
    return best[0];
}

// ========== Stage 2: rewording ==========

// The fewest letters a sentence or paragraph needs to be sent to the model (the Min.
// letters option). Low enough for "Hi Sarah," and "Best regards,"; a bare "Tom" stays.
const MIN_LETTERS = 6;

// Split text into blocks whose texts concatenate back to the input exactly:
// "code" (a fenced block), "sep" (blank lines) and "para" (consecutive non-blank lines).
// `rewrite` marks paragraphs worth sending to the model: real prose, not a table,
// heading, bare URL or something with fewer than `minLetters` letters.
function splitParagraphs(text, minLetters = MIN_LETTERS) {
    const lines = String(text || "").match(/[^\n]*\n|[^\n]+$/g) || [];
    const blocks = [];
    let fence = null;
    const push = (kind, line) => {
        const last = blocks[blocks.length - 1];
        if (last && last.kind === kind && kind !== "code") last.text += line;
        else blocks.push({ kind, text: line });
    };
    for (const line of lines) {
        const marker = line.trimStart().match(/^(`{3,}|~{3,})/);
        if (fence) {
            blocks[blocks.length - 1].text += line;
            if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.trim().slice(marker[1].length).trim()) fence = null;
        } else if (marker) {
            fence = marker[1];
            blocks.push({ kind: "code", text: line });
        } else if (!line.trim()) {
            push("sep", line);
        } else {
            push("para", line);
        }
    }
    let offset = 0;
    for (const b of blocks) {
        b.start = offset;
        offset += b.text.length;
        b.rewrite = b.kind === "para" && isRewritable(b.text, minLetters);
    }
    return blocks;
}

function isRewritable(para, minLetters = MIN_LETTERS) {
    const t = para.trim();
    const letters = (t.match(/\p{L}/gu) || []).length;
    if (letters < minLetters) return false;
    const lines = t.split("\n");
    if (lines.every(l => /^\s*\|/.test(l))) return false;               // a table
    if (lines.length === 1 && /^#{1,6}\s/.test(t)) return false;         // a heading
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(t)) return false;            // a bare URL
    // A greeting or sign-off, alone or with the name lines under it.
    if (SALUTATION_RE.test(lines[0].trim()) && lines.slice(1).every(l => l.trim().split(/\s+/).length <= 4)) return false;
    return true;
}

// A greeting or sign-off line of a letter. Reworded, "Sehr geehrter Herr Becker," came
// back as "Lieber" or "Hallo Herr Becker," (Qwen3.8-27B, Gemma-4 E2B, Qwen3.5-4B), and a
// "Mit freundlichen Gr\u00fc\u00dfen" on the line above the name as the name (Qwen3-4B):
// nothing to gain, and the form of address is lost. Not reworded in either unit.
const SALUTATION_RE = new RegExp("^(?:" + [
    "(?:(?:sehr )?geehrte[rs]?|liebe[rs]?|hallo|hi|hey|guten (?:tag|morgen|abend)|moin|servus|dear|hello|good (?:morning|afternoon|evening)"
        + "|bonjour|bonsoir|ch\u00e8re?s?|madame|monsieur|estimad[oa]s?|querid[oa]s?|hola|buongiorno|gentil[ei]|car[oa]|geachte|beste)(?![\\p{L}])[^\\n.!?]{0,60}[,!]?",
    "(?:mit |viele |beste |liebe |herzliche |freundliche )?(?:freundlichen |besten |herzlichen |lieben |sch\u00f6nen )?gr(?:\u00fc\u00df|\u00fcss|uess)e[^\\n.!?]{0,30}",
    "(?:best|kind|warm|warmest|many) (?:regards|wishes)[,!]?", "(?:yours )?(?:sincerely|faithfully|truly)[,!]?", "cheers[,!]?",
    "cordialement", "bien \u00e0 vous", "(?:cordiali )?saluti", "(?:un )?saludos?(?: cordiales)?", "atentamente", "met vriendelijke groet(?:en)?",
].join("|") + ")$", "iu");

// Abbreviations a full stop doesn't end a sentence after (lower case, without the dot).
// Single letters ("z. B.", "J. Smith"), words with a dot inside ("e.g", "d.h") and
// one- or two-digit numbers (German ordinals: "am 3. Mai") are caught by rule instead.
const ABBREVIATIONS = new Set(["dr", "prof", "nr", "no", "ca", "bzw", "usw", "etc", "vs", "mr", "mrs", "ms", "st", "jr", "sr",
    "inkl", "ggf", "evtl", "vgl", "sog", "bzgl", "abs", "art", "approx", "dept", "fig", "mio", "mrd", "tel", "str", "jh", "hr", "fr", "vol",
]);

// The sentences of one paragraph, as [start, end) ranges into it without surrounding
// whitespace. A line break always ends a sentence; a list or quote marker at the start
// of a line is left out, and heading and table lines are skipped. A full stop ends a
// sentence only before an upper-case letter, a digit or an opening quote, and not
// after an abbreviation.
function splitSentences(para) {
    const text = String(para || "");
    const out = [];
    const push = (a, b) => {
        while (a < b && /\s/.test(text[a])) a++;
        while (b > a && /\s/.test(text[b - 1])) b--;
        if (b > a) out.push([a, b]);
    };
    let pos = 0;
    for (const line of text.split("\n")) {
        const base = pos;
        pos += line.length + 1;
        if (/^\s*(?:#{1,6}\s|\|)/.test(line)) continue;
        let s = line.match(/^\s*(?:(?:[-*+]|\d{1,3}[.)])\s+|>\s*)*/)[0].length;
        const stop = /[.!?\u2026]+["'\u00ab\u00bb)\]]*(?=\s+\S)/g;
        stop.lastIndex = s;
        let m;
        while ((m = stop.exec(line))) {
            const after = m.index + m[0].length;
            const next = line.slice(after).trimStart()[0];
            if (!/[\p{Lu}\d"'\u00ab\u00bb(\u00bf\u00a1]/u.test(next)) continue;
            if (/^\.["'\u00ab\u00bb)\]]*$/.test(m[0])) {
                const word = line.slice(s, m.index).match(/[\p{L}\d.]*$/u)[0];
                if (/^\p{L}$/u.test(word) || /^\d{1,2}$/.test(word) || /\p{L}\.\p{L}/u.test(word) || ABBREVIATIONS.has(word.toLowerCase())) continue;
            }
            push(base + s, base + after);
            s = after;
        }
        push(base + s, base + line.length);
    }
    return out;
}

// What to send to the model, as [start, end) ranges into `text`, in order: the core of
// each rewritable paragraph, or with `unit` "sentence" each sentence in them that has
// at least `minLetters` letters, with its paragraph as context. `block` numbers the
// paragraph.
function rewordUnits(text, unit, minLetters = MIN_LETTERS) {
    const units = [];
    splitParagraphs(text, minLetters).forEach((b, block) => {
        if (!b.rewrite) return;
        const context = b.text.trim();
        const lead = b.text.length - b.text.trimStart().length;
        const ranges = unit === "sentence" ? splitSentences(b.text) : [[lead, lead + context.length]];
        for (const [s, e] of ranges) {
            const t = b.text.slice(s, e);
            if (unit === "sentence" && ((t.match(/\p{L}/gu) || []).length < minLetters || SALUTATION_RE.test(t.trim()))) continue;
            units.push({ start: b.start + s, end: b.start + e, text: t, block, context: t === context ? null : context });
        }
    });
    return units;
}

// The picked units, in order, as requests: picked sentences next to each other on the
// same line go to the model together (up to `maxRun`), so they are rewritten as one
// piece and still read as one. `count` is how many units a request holds.
function groupUnits(text, units, picked, maxRun = 3) {
    const groups = [];
    let prev = -2;
    for (const i of picked) {
        const u = units[i], g = groups[groups.length - 1];
        if (g && prev === i - 1 && g.count < maxRun && units[prev].block === u.block && /^[ \t]+$/.test(text.slice(g.end, u.start))) {
            g.end = u.end;
            g.text = text.slice(g.start, g.end);
            g.count++;
            if (g.text === g.context) g.context = null;
        } else {
            groups.push({ start: u.start, end: u.end, text: u.text, context: u.context, count: 1 });
        }
        prev = i;
    }
    return groups;
}

// Put the rewritten ranges `reps` ({start, end, text}, in order) into `text`. Marks
// inside a replaced range go with the text they pointed at, the rest move with the
// edits, and each replacement gets a "reword" mark labelled with the original. A rep's
// optional `changed` ranges (into its text, from wordDiff) become "changed" marks. A rep
// with a `removed` label deletes its range and leaves a "removed" mark instead.
function applyRewrites(text, marks, reps) {
    let out = "", pos = 0;
    const edits = [], added = [];
    for (const r of reps) {
        out += text.slice(pos, r.start);
        edits.push({ at: r.start, removed: r.end - r.start, inserted: r.text.length });
        if (r.removed) added.push({ start: out.length, end: out.length, kind: "removed", count: 1, labels: [r.removed] });
        else added.push({ start: out.length, end: out.length + r.text.length, kind: "reword", labels: [text.slice(r.start, r.end)] });
        for (const [s, e] of r.changed || []) added.push({ start: out.length + s, end: out.length + e, kind: "changed", labels: [] });
        out += r.text;
        pos = r.end;
    }
    out += text.slice(pos);
    const inside = m => reps.some(r => m.start < r.end && (m.start > r.start || (m.start === r.start && m.end > m.start)));
    return { text: out, marks: shiftMarks(marks.filter(m => !inside(m)), edits).concat(added) };
}

// Seeded PRNG (mulberry32): a seed gives the same run every time.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Which of `n` eligible units (paragraphs or sentences) to reword: a random `share` of
// them (0-1), at least one when share > 0. Units in the optional Set `first` (those with
// stock phrases) are taken before the others. Returns sorted indices into the list.
function pickUnits(n, share, rng, first) {
    if (n <= 0 || share <= 0) return [];
    const k = Math.min(n, Math.max(1, Math.round(n * share)));
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    // A stable sort, so each group stays in its random order.
    if (first && first.size) idx.sort((a, b) => first.has(b) - first.has(a));
    return idx.slice(0, k).sort((a, b) => a - b);
}

// Added at Medium and Strong, in the passage's language (English when it has none, so no
// other language is named): measured with Qwen3.8-27B on three English essays, this cut
// the replies that kept a contrast at Strong from 4 of 15 to 1 of 15, more than an
// example exchange did.
const CONTRAST_RULES = {
    en: "- Never build a sentence as a set-up contrast: \"X is not (just) A; it is B\", \"not A, but B\", \"doesn't just A, it B\". Say plainly what X is or does.",
    de: "- Never build a sentence as a set-up contrast: \"X ist kein A, sondern B\", \"nicht nur A, sondern auch B\", \"Es geht nicht um A, sondern um B\". Say plainly what X is or does.",
};

// How much the model may change. `rules` go into the prompt (with CONTRAST_RULES where
// `contrasts` is set); `maxChange` is the largest
// share of words a rewrite may change before it is refused (see wordDiff), and
// minLength/maxLength bound its length relative to the original. `example` is one
// exchange shown before the passage, per language: small models copy an example far
// more reliably than they follow a rule (measured with tests/model_eval.py).
const REWORD_LEVELS = {
    light: {
        temperature: 0.7, maxChange: 0.5, minLength: 0.6, maxLength: 1.6,
        rules: [
            "- Make light edits: in every sentence, cut a stock phrase or replace one or two words with plainer ones. Leave all other words exactly as they are, and keep every sentence.",
        ],
        example: {
            en: "The new tool clearly reduces the time needed for reports. The team tested it for 6 weeks.",
            de: "Au\u00dferdem verk\u00fcrzt das neue Tool die Zeit f\u00fcr Berichte deutlich. Das Team hat es \u00fcbrigens 6 Wochen lang getestet.",
        },
    },
    medium: {
        temperature: 0.8, maxChange: 1, minLength: 0.5, maxLength: 2, contrasts: true,
        rules: [
            "- Rephrase every sentence in your own words, with different wording and structure. Keep the order of the ideas.",
            "- Prefer plain everyday words over formal ones, and say things directly: no empty emphasis, no dramatic words or slogan-like lines.",
        ],
        example: {
            en: "With the new tool, reports take a lot less time. The team spent 6 weeks testing it.",
            de: "Mit dem neuen Tool gehen Berichte viel schneller. Das Team hat es 6 Wochen lang ausprobiert.",
        },
    },
    strong: {
        temperature: 0.9, maxChange: 1, minLength: 0.5, maxLength: 2, contrasts: true,
        rules: [
            "- Rewrite the passage freely in your own words: you may split, merge or reorder sentences.",
            "- Vary the sentence length, prefer plain everyday words over formal ones, and say things directly: no empty emphasis, no dramatic words or slogan-like lines.",
        ],
        example: {
            en: "Reports are done much faster now. That's thanks to the new tool, which the team tried out for 6 weeks first.",
            de: "Berichte sind jetzt viel schneller fertig. Das liegt am neuen Tool, das das Team vorher 6 Wochen lang ausprobiert hat.",
        },
    },
};
// The passage the examples above rewrite.
const REWORD_EXAMPLE_INPUT = {
    en: "Moreover, the new tool significantly reduces the time needed for reports. It is important to note that the team tested it for 6 weeks.",
    de: "Dar\u00fcber hinaus verk\u00fcrzt das neue Tool die Zeit f\u00fcr Berichte erheblich. Es ist wichtig zu beachten, dass das Team es 6 Wochen lang getestet hat.",
};

const REWORD_TONES = {
    keep: "",
    casual: "- Make the tone a little more casual and conversational, as in a message to a colleague.",
    formal: "- Make the tone a little more formal and precise.",
    simple: "- Use simple words and short sentences, easy to read for anyone.",
};

// Stock phrases to replace, named in the passage's own language only: a prompt for an
// English passage that mentions German pulls small models into German (Qwen3-1.7B
// answered 18 % of one English sentence in German; bench/README.md). These are the
// examples for a passage in which STOCK_PATTERNS finds none.
const STOCK_PHRASES = {
    en: "\"moreover\", \"it is important to note\", \"delve into\", \"seamless\", \"game-changer\"",
    de: "\"dar\u00fcber hinaus\", \"es ist wichtig zu beachten\", \"zusammenfassend l\u00e4sst sich sagen\", \"nahtlos\"",
    fr: "\"par ailleurs\", \"en conclusion\", \"il est important de souligner\"",
    es: "\"adem\u00e1s\", \"en conclusi\u00f3n\", \"es importante destacar\"",
    it: "\"inoltre\", \"in conclusione\", \"\u00e8 importante sottolineare\"",
    nl: "\"bovendien\", \"concluderend\", \"het is belangrijk op te merken\"",
    pt: "\"al\u00e9m disso\", \"em conclus\u00e3o\", \"\u00e9 importante notar\"",
};

// The words and phrases AI-written text overuses, per language, as regular expressions
// (case is ignored, a space matches any whitespace, and a match must be whole words; an
// optional part starts with its space, never ends with one). A passage that has some
// gets them named in the prompt, and its sentences are picked for rewording first.
// Collected from Wikipedia's "Signs of AI writing", Kobak et al. (Science Advances
// 2025), GPTZero, Graphite's 2026 study of current models, and German, French, Spanish
// and Italian style guides (README.md lists them). Only phrases that carry no
// information, or are plain hype, belong here: a list that flags ordinary words makes
// the model "fix" good text.
const STOCK_PATTERNS = {
    en: [
        // Filler transitions and wrap-ups. Weak signs one at a time, but nothing is lost.
        "moreover", "furthermore", "additionally", "in addition(?=\\s*,)", "in conclusion", "in summary", "to sum up", "to summari[sz]e",
        "overall(?=\\s*,)", "ultimately(?=\\s*,)", "notably", "(?:more )?importantly(?=\\s*,)", "crucially(?=\\s*,)", "in essence", "essentially(?=\\s*,)",
        "(?:that|this) being said", "with that(?: being)? said", "having said that", "all in all", "at the end of the day",
        "first and foremost", "last but not least", "nevertheless", "nonetheless", "consequently", "needless to say",
        "looking ahead(?=\\s*,)", "together,? these",
        // Signposting (most common up to 2024).
        "it(?: is|['\u2019]s) (?:important|crucial|essential|vital|critical|key) to (?:note|remember|understand|recogni[sz]e|consider|mention|highlight|keep in mind)(?: that)?",
        "it(?: is|['\u2019]s) worth (?:noting|mentioning|highlighting|pointing out|remembering)(?: that)?", "it should be noted(?: that)?",
        "it goes without saying(?: that)?",
        // Hooks and announcements.
        "let['\u2019]s (?:dive|delve|explore|unpack|take a (?:closer|deeper) look|break (?:it|this|that) down)", "deep[- ]dive", "div(?:e|es|ing) (?:deep(?:er)? )?into",
        "here['\u2019]s (?:the thing|the kicker|the catch|the truth|why (?:this|it) matters)", "here['\u2019]s what (?:nobody|no one) (?:tells|talks)", "(?:the|my) result\\?",
        "let that sink in", "(?:i['\u2019]m|i am|we['\u2019]re|we are) (?:thrilled|excited|delighted|humbled|honou?red) to (?:announce|share)",
        // Framing that current models overuse (Graphite 2026: up to several hundred times the human rate).
        "(?:is|are|was|were) not (?:simply|merely)", "(?:isn['\u2019]t|aren['\u2019]t|wasn['\u2019]t) (?:simply|merely)",
        "(?:it|this|that)(?: is|['\u2019]s) not (?:just|only|merely|simply)(?: about)?", "(?:it|this|that) isn['\u2019]t (?:just|only|merely|simply)(?: about)?",
        "rather than (?:merely|simply|relying on|focusing on)", "less like (?:a|an|the) [\\p{L}-]+(?: [\\p{L}-]+)? and more like",
        "this matters", "why (?:this|that|it) matters", "matters (?:because|more than)", "(?:the )?distinction matters", "another dimension",
        "without (?:sacrificing|compromising)", "every single", "(?:the )?single most", "arguably the most",
        // Inflated significance.
        "stand(?:s|ing)? as (?:a|an)", "serv(?:e|es|ed|ing) as (?:a|an) (?:testament|reminder|beacon|catalyst|cornerstone|springboard|blueprint)",
        "(?:a |is a |as a )?testament to", "a (?:stark |powerful |poignant |vivid )?reminder (?:of|that)",
        "pla(?:y|ys|yed|ying) (?:a|an) (?:crucial|vital|pivotal|key|significant|critical|essential|instrumental|central) role",
        "(?:set|sets|setting) the stage for", "(?:mark|marks|marked|marking|represent|represents|representing) a (?:pivotal|significant|major|key|crucial) (?:moment|shift|step|milestone|turning point)",
        "key turning point", "indelible mark", "deeply rooted", "enduring legacy", "(?:highlight|underscor|emphasi[sz]|stress)\\p{L}* the (?:importance|significance|need) of",
        "(?<=,\\s{0,3})(?:highlighting|underscoring|emphasi[sz]ing|showcasing|ensuring|reflecting|fostering|cementing|solidifying)",
        "valuable insights?", "(?:diverse|wide|rich) array of", "in the heart of", "rich (?:cultural )?(?:heritage|history|tapestry)", "commitment to excellence",
        "boasts? (?:a|an)", "exemplif(?:y|ies|ied)", "fundamentally (?:transform|chang|reshap|alter)\\p{L}*", "(?:transform|revolutioni[sz]|reshap)(?:e|es|ed|ing) the way",
        "(?:essential|key|crucial|vital) (?:for|to) (?:long[- ]term |lasting |sustainable )?success", "unique challenges",
        "(?:should not|must not|cannot|can['\u2019]t|shouldn['\u2019]t) be overlooked", "warrant(?:s|ed|ing)? (?:careful|further|closer) (?:consideration|attention|scrutiny)",
        // Vocabulary.
        "delv(?:e|es|ed|ing)(?: (?:deep(?:er)? )?into)?", "tapestry", "(?:in|within) the realm of",
        "(?:ever[- ]?(?:evolving|changing)|rapidly (?:evolving|changing)|evolving|changing|digital|dynamic|business|competitive|current) landscape",
        "ever[- ]?(?:evolving|changing)", "fast[- ]paced world", "today['\u2019]s digital age",
        "in today['\u2019]s (?:fast[- ]paced |digital |modern |interconnected |rapidly changing )?(?:world|age|era|society|landscape)",
        "in an (?:era|age) (?:of|where|when)", "in (?:an|our) increasingly (?:digital|connected|interconnected|complex|globali[sz]ed) world",
        "pivotal", "paramount", "multifaceted", "intricate", "intricacies", "nuanced", "holistic", "robust", "seamless(?:ly)?",
        "leverag(?:e|es|ed|ing)", "utili[sz](?:e|es|ed|ing|ation)", "harness(?:es|ed|ing)? the (?:power|potential)",
        "foster(?:s|ed|ing)?(?! (?:care|parents?|child|children|home|famil))", "bolster(?:s|ed|ing)?", "underscor(?:e|es|ed|ing)",
        "showcas(?:e|es|ed|ing)", "navigat(?:e|es|ed|ing) (?:the )?(?:complexities|challenges|intricacies|landscape|world|nuances)",
        "embark(?:s|ed|ing)? on", "(?:learning|personal|growth|career|transformative|wellness) journey",
        "unlock(?:s|ed|ing)? (?:the |their |its |your |our )?(?:full |true )?(?:potential|power|value)", "unleash(?:es|ed|ing)?", "elevat(?:e|es|ing)",
        "empower(?:s|ed|ing|ment)?", "revolutioni[sz](?:e|es|ed|ing)", "transformative", "game[- ]?chang(?:er|ers|ing)",
        "cutting[- ]edge", "state[- ]of[- ]the[- ]art", "groundbreaking", "innovative", "synerg(?:y|ies|istic)", "paradigm shift",
        "vibrant", "bustling", "nestled", "breathtaking", "captivating", "meticulous(?:ly)?", "commendable", "noteworthy",
        "invaluable", "(?:a )?myriad(?: of)?", "(?:a )?plethora of", "treasure trove", "beacon of", "unparalleled",
        "(?<!yours\\s)truly", "incredibly", "remarkably", "enormously", "immense(?:ly)?", "profound(?:ly)?",
        "absolutely (?:essential|crucial|vital|critical|necessary)", "quietly (?:reshap|transform|redefin|revolutioni[sz]|chang|becom|emerg|power|build)\\p{L}*",
        "at the forefront(?: of)?", "pav(?:e|es|ed|ing) the way", "shed(?:s|ding)? light on", "resonat(?:e|es|ed|ing) with",
        "streamlin(?:e|es|ed|ing)", "enhanc(?:e|es|ed|ing|ement)", "comprehensive", "crucial", "endeavou?rs?", "commenc(?:e|es|ed|ing)",
        "facilitat(?:e|es|ed|ing)", "interplay", "garner(?:s|ed|ing)?", "elucidat(?:e|es|ed|ing)", "encompass(?:es|ed|ing)?", "burgeoning",
        "dependable", "meaningful", "tangible (?:results|benefits|value|impact|outcomes)",
        "culture of (?:vigilance|innovation|excellence|accountability|continuous (?:learning|improvement))",
        "(?:first|last|critical|crucial|strong|vital|key) line of defen[cs]e", "proactive(?:ly)?", "peace of mind",
        "resilient (?:workforce|team|organi[sz]ation|business|future)",
        "quiet (?:resilience|strength|dignity|grace|determination)", "(?:genuine|real|deep|meaningful) human connection",
        "this (?:experience|journey|opportunity) (?:has )?(?:taught|showed|shown|made (?:it )?clear to) me(?: that)?",
        "(?:get|getting) (?:our|the) momentum back", "regain(?:s|ed|ing)? (?:our|the|some) momentum",
        "(?:meets?|meeting|exceeds?) our (?:high )?standards", "your input (?:is|would be) (?:crucial|invaluable|key|essential|vital)", "your input matters",
        // Letters, chat replies and posts.
        "i hope (?:this|my) (?:e-?mail|message|note|letter) finds you well", "(?:wanted|want|am writing) to reach out", "i['\u2019]m reaching out",
        "(?:please )?(?:do not|don['\u2019]t) hesitate to", "feel free to", "i hope this(?: information)? helps", "great question",
        "(?:certainly|absolutely|of course)(?=\\s*!)",
        "(?:require|need) (?:any )?further clarification", "(?:productive|fruitful) (?:discussion|collaboration|conversation)",
        "whether you(?:['\u2019]re| are) an? [\\p{L}-]+(?: [\\p{L}-]+)? or an?",
        "anything else (?:i can|you(?:['\u2019]d| would) like)", "would you like me to", "you['\u2019]re (?:absolutely|completely|totally) right",
        "taken the liberty", "your trust is (?:very |extremely )?important to us", "we value your (?:business|patience|trust|loyalty)",
        "(?:we )?apologi[sz]e for any inconvenience(?: (?:this|that) (?:may have )?caused)?", "rest assured", "as an ai(?: language model)?", "i(?:['\u2019]d| would) be (?:happy|glad) to help",
    ],
    de: [
        // Filler transitions and wrap-ups.
        "dar\u00fcber hinaus", "des weiteren", "ferner", "\u00fcberdies", "nichtsdestotrotz", "letztendlich", "letztlich", "im gro\u00dfen und ganzen",
        "vor diesem hintergrund", "in diesem zusammenhang",
        "zusammenfassend(?: (?:l\u00e4sst sich|kann man|kann) (?:sagen|festhalten|feststellen|gesagt werden))?",
        "(?:abschlie\u00dfend|insgesamt) (?:l\u00e4sst sich|kann man|sei) (?:sagen|festhalten|feststellen|angemerkt|gesagt)",
        // Signposting.
        "(?:es ist|ist es) (?:wichtig|entscheidend|essenziell|essentiell|unerl\u00e4sslich) zu (?:beachten|betonen|erw\u00e4hnen|verstehen|ber\u00fccksichtigen)",
        "es gilt zu beachten", "es (?:ist|w\u00e4re) erw\u00e4hnenswert", "erw\u00e4hnenswert ist", "es sei (?:darauf hingewiesen|erw\u00e4hnt|angemerkt)", "es lohnt sich,? zu erw\u00e4hnen",
        "es ist bemerkenswert", "es liegt auf der hand", "es versteht sich von selbst", "nicht zu vergessen", "es l\u00e4sst sich nicht (?:leugnen|bestreiten)",
        "es ist kein geheimnis", "(?:ist |sind )?von (?:entscheidender|zentraler) bedeutung", "(?:kann|k\u00f6nnen|muss|soll|wird) gew\u00e4hrleistet werden",
        "werfen wir (?:nun |gemeinsam |zun\u00e4chst )?einen (?:genaueren |n\u00e4heren |tieferen |kurzen )?blick", "tauchen (?:wir|sie) (?:gemeinsam |tiefer )?ein",
        "eintauchen", "in die welt (?:der|des|von)", "lassen sie uns", "lass(?:t)? uns (?:gemeinsam )?(?:eintauchen|einen (?:genaueren |n\u00e4heren )?blick)", "in diesem (?:artikel|beitrag|blogbeitrag|leitfaden) (?:beleuchten|erfahren|werfen|zeigen) (?:wir|sie)",
        // Framing newer models favour.
        "es geht nicht (?:nur |blo\u00df |einfach )?(?:um|darum)", "mehr als nur (?:ein|eine)", "eine (?:weitere|neue) dimension", "die wahrheit ist",
        "das ergebnis\\?", "eines ist sicher", "(?:die|meine) (?:gr\u00f6\u00dfte|wichtigste) (?:lektion|erkenntnis)[^.?!]{0,40}\\?",
        // Inflated significance.
        "(?:eine )?(?:entscheidende|zentrale|wesentliche|ma\u00dfgebliche|tragende) rolle", "schl\u00fcsselrolle", "tr(?:\u00e4gt|agen|ug|ugen) ma\u00dfgeblich",
        "unterstreich\\p{L}* (?:die|seine|ihre|deren) (?:bedeutung|wichtigkeit|relevanz)", "markier\\p{L}* einen (?:entscheidenden |wichtigen )?(?:wendepunkt|meilenstein)",
        "schl\u00fcssel zum erfolg", "(?:der |ein )?schl\u00fcssel zu[mr] (?:\\p{L}+ )?(?:erfolg|wettbewerbsf\u00e4higkeit|zukunft)", "strategische[nmrs]? hebel",
        "resiliente[nmrs]? (?:organisation|unternehmen|team|belegschaft|zukunft)", "entscheidenden? knackpunkt", "vor (?:erhebliche|enorme|gro\u00dfe|neue|vielf\u00e4ltige) herausforderungen", "absolut (?:unverzichtbar|entscheidend|essenziell|unerl\u00e4sslich)",
        "(?:ein )?(?:eindrucksvolles |lebendiges )?zeugnis (?:f\u00fcr|von|daf\u00fcr)",
        // Openers.
        "in der heutigen (?:schnelllebigen |digitalen |modernen |vernetzten )?(?:welt|zeit|gesellschaft)", "im digitalen zeitalter", "im zeitalter der digitalisierung",
        "in einer (?:zunehmend|immer)(?: mehr)? (?:digital|vernetzt|komplex|schnelllebig|global)\\p{L}*(?: werdenden)? welt", "(?:mehr|entscheidender|wichtiger) denn je",
        // Vocabulary.
        "nahtlos\\p{L}*", "ma\u00dfgeschneidert\\p{L}*", "ganzheitlich\\p{L}*", "facettenreich\\p{L}*", "vielschichtig\\p{L}*", "transformativ\\p{L}*",
        "bahnbrechend\\p{L}*", "revolution\u00e4r\\p{L}*", "revolutionier\\p{L}*", "wegweisend\\p{L}*", "zukunftsweisend\\p{L}*", "zukunftssicher\\p{L}*",
        "vision\u00e4r\\p{L}*", "disruptiv\\p{L}*", "beispiellos\\p{L}*", "hochmodern\\p{L}*", "innovativ\\p{L}*", "essenziell\\p{L}*", "umfassend\\p{L}*",
        "mehrwert", "synergie\\p{L}*", "potenzial\\p{L}* (?:voll(?:st\u00e4ndig)? )?(?:aussch\u00f6pf|auszusch\u00f6pf|entfalt)\\p{L}*", "entfessel\\p{L}*",
        "auf (?:ein|das) (?:neues|n\u00e4chste) (?:level|niveau)", "game[- ]?changer",
        "(?:digitalen?|dynamischen?|sich (?:st\u00e4ndig |stetig )?wandelnden?) landschaft", "sich (?:st\u00e4ndig|stetig|rasch|schnell) (?:wandelnd|ver\u00e4ndernd)\\p{L}*",
        "unerl\u00e4sslich\\p{L}*", "reibungslos\\p{L}*", "unglaublich (?:inspirierend|spannend|wertvoll)\\p{L}*", "inspirierend\\p{L}*", "herzst\u00fcck",
        "die zukunft (?:gemeinsam )?(?:zu )?gestalten", "den wandel (?:aktiv )?(?:voran(?:zu)?treiben|gestalten)",
        "spannende zeiten", "es bleibt (?:abzuwarten|spannend)", "gekommen, um zu bleiben", "ein wichtiger schritt in die richtige richtung",
        "steht (?:deinem|ihrem|eurem) erfolg nichts", "(?:diese|die) erfahrung hat mir gezeigt(?:, dass)?",
        // Letters, chat replies and posts.
        "selbstverst\u00e4ndlich", "z\u00f6ger(?:n sie|e|t) nicht", "(?:gerne )?m\u00f6chte ich ihnen mitteilen", "ich hoffe, (?:diese|meine) (?:e-?mail|nachricht)",
        "ich hoffe, (?:das|dies|diese informationen?) (?:hilft|helfen)", "gute frage", "m\u00f6chtest du, dass ich", "hier ist (?:eine|die) \u00fcberarbeitete",
        "als ki-sprachmodell", "ihr vertrauen ist (?:uns|mir) (?:sehr |besonders )?wichtig", "wir (?:tun|setzen) alles (?:daf\u00fcr|daran)",
        "(?:es ist (?:uns|mir) (?:sehr )?wichtig|ich freue mich|wir freuen uns|es freut (?:mich|uns)),? sie (?:auch )?weiterhin als kund(?:e|in|en)",
        "f\u00fcr (?:weitere |etwaige )?(?:r\u00fcck)?fragen stehe(?:n)? (?:ich|wir) ihnen (?:jederzeit |gerne |gern )*zur verf\u00fcgung", "wir sch\u00e4tzen es,? dass sie", "(?:du hast|sie haben) (?:v\u00f6llig|absolut|vollkommen) recht", "gespannt auf (?:eure|ihre|deine) (?:gedanken|meinung)",
    ],
    fr: [
        "par ailleurs", "de plus(?=\\s*,)", "en outre", "en conclusion", "en somme", "en r\u00e9sum\u00e9", "en d\u00e9finitive", "d\u00e8s lors", "n\u00e9anmoins",
        "\u00e0 cet \u00e9gard", "dans cette optique", "force est de constater",
        "il (?:est|convient|y a lieu) (?:important |essentiel |crucial |primordial )?de (?:noter|souligner|rappeler|comprendre|mentionner)",
        "jou(?:e|ent|er) un r\u00f4le (?:crucial|cl\u00e9|essentiel|central|majeur|d\u00e9terminant|primordial)", "plong(?:er|eons|ez|eant) (?:au c\u0153ur |dans)",
        "dans le monde (?:d['\u2019]aujourd['\u2019]hui|actuel)", "\u00e0 l['\u2019]\u00e8re (?:du )?num\u00e9rique", "en (?:constante|perp\u00e9tuelle) \u00e9volution",
        "ce n['\u2019]est pas (?:seulement|simplement|juste|qu['\u2019]une?)", "trouver le juste \u00e9quilibre", "la cl\u00e9 (?:du|d['\u2019]un) succ\u00e8s",
        "profond\u00e9ment (?:transform\u00e9|chang\u00e9|boulevers\u00e9)\\p{L}*", "qu['\u2019]il ne faut pas n\u00e9gliger",
        "n['\u2019]h\u00e9sitez pas \u00e0", "j['\u2019]esp\u00e8re que ce (?:message|courriel|mail) vous trouve", "r\u00e9volutionn\\p{L}*", "incontournable\\p{L}*", "primordia\\p{L}*",
        "crucia(?:l|le|ux|les)", "holistique\\p{L}*", "paradigme\\p{L}*", "synergie\\p{L}*", "\u00e9cosyst\u00e8me\\p{L}* num\u00e9rique\\p{L}*", "sans faille",
        "de pointe", "tirer parti", "pierre angulaire",
    ],
    es: [
        "adem\u00e1s(?=\\s*,)", "asimismo", "en conclusi\u00f3n", "en resumen", "en este sentido", "por ende", "cabe (?:destacar|se\u00f1alar|mencionar|resaltar)",
        "es (?:importante|crucial|fundamental|esencial) (?:destacar|se\u00f1alar|tener en cuenta|mencionar|recordar|resaltar)",
        "(?:juega|juegan|desempe\u00f1a|desempe\u00f1an) un papel (?:crucial|fundamental|clave|esencial|importante|vital)", "sumerg(?:irse|\u00e1monos|irnos|irte)",
        "en el mundo (?:actual|de hoy)", "en la era digital", "en el panorama actual", "en un mundo cada vez m\u00e1s", "en constante evoluci\u00f3n",
        "no (?:solo|s\u00f3lo) (?:es|se trata)", "enfrentar (?:los |estos |nuevos )?desaf\u00edos",
        "no (?:dudes|dude) en", "espero que este (?:correo|mensaje) (?:te|le) encuentre bien", "de vanguardia", "revolucion\\p{L}*", "fomentar",
        "tapiz", "crucial(?:es)?", "invaluables?", "sin lugar a dudas", "un sinf\u00edn de", "una amplia gama de",
    ],
    it: [
        "inoltre(?=\\s*,)", "in conclusione", "in sintesi", "per riassumere", "in definitiva",
        "\u00e8 (?:importante|fondamentale|cruciale|essenziale) (?:sottolineare|notare|ricordare|considerare)", "vale la pena (?:sottolineare|notare|ricordare)",
        "si potrebbe sostenere", "(?:gioca|giocano|svolge|svolgono) un ruolo (?:cruciale|fondamentale|chiave|essenziale)", "immerg(?:ersi|iamoci)",
        "addentr\\p{L}*", "arazzo", "navigare (?:tra )?(?:le )?(?:complessit\u00e0|sfide|sfumature)",
        "nel mondo (?:di oggi|odierno|attuale)", "nell['\u2019]era (?:digitale|moderna)", "(?:mondo|societ\u00e0) sempre pi\u00f9 (?:conness|digital|interconness)\\p{L}*",
        "in continua evoluzione", "non esit(?:are|ate) a", "senza soluzione di continuit\u00e0", "all['\u2019]avanguardia", "rivoluzion\\p{L}*", "cruciale",
        "un vero e proprio", "una vasta gamma di", "(?:certo|certamente|assolutamente)(?=\\s*!)",
    ],
    nl: [
        "bovendien", "concluderend", "samenvattend", "(?:het is|is het) (?:belangrijk|essentieel|cruciaal) (?:om )?(?:op te merken|te benadrukken|te onthouden)",
        "het is vermeldenswaard", "speelt een (?:cruciale|essenti\u00eble|centrale|sleutel)\\p{L}* rol", "duik(?:en)? (?:dieper )?in",
        "verdiep(?:en|t)(?: (?:ons|zich|je|jezelf))? in", "navigeren door (?:de )?(?:complexiteit|uitdagingen)", "wandtapijt",
        "in de (?:huidige|snel veranderende|digitale) wereld", "in het digitale tijdperk", "aarzel niet", "naadloos\\p{L}*", "baanbrekend\\p{L}*",
        "cruciaal\\p{L}*", "een breed scala aan", "zeker(?=\\s*!)",
    ],
    pt: [
        "al\u00e9m disso", "em conclus\u00e3o", "em suma", "em resumo", "\u00e9 (?:importante|crucial|fundamental) (?:notar|destacar|ressaltar|salientar|lembrar)",
        "vale (?:a pena )?(?:ressaltar|destacar|notar|lembrar)", "desempenha um papel (?:crucial|fundamental|essencial|importante)",
        "mergulh(?:ar|emos|ando) (?:em|no|na|nos|nas)", "tape\u00e7aria", "naveg\\p{L}* (?:pelas|nas|entre as) complexidades",
        "no mundo (?:atual|de hoje)", "na era digital", "em constante evolu\u00e7\u00e3o", "n\u00e3o hesite em", "de ponta",
        "revolucion\\p{L}*", "alavanc\\p{L}*", "potencializ\\p{L}*", "uma ampla gama de",
    ],
};

// Set-up contrasts, matched with both halves: "training is not just a cost - it ...",
// "didn't only feed us; it ...", "the weak spot isn't code; it's people", "more than
// just food; it was ...", "is not a piece of code, but a person", the reversed "...,
// not just a cost". Current models write them everywhere, and when told not to, swap
// "just" for "only" or "simply", or put a full stop between the halves ("isn't just a
// cost. It's ..."). They count as stock phrases, and at Medium and Strong a reply that
// still has one is refused (acceptRewrite). Same rules as STOCK_PATTERNS.
const CONTRAST_PATTERNS = {
    en: [
        "(?:\\p{L}+n['\u2019]t|not) (?:just|only|simply|merely|about) [^.;:!?]{1,60}?(?:,|;|\u2014|\u2013|\\s-)\\s*(?:but|it|they|this|that|we|i|he|she|you)",
        "(?:\\p{L}+n['\u2019]t|not) (?:just|only|simply|merely) [^.;:!?]{1,60}?[.!] (?:instead,? )?(?:it|they|this|that)(?:['\u2019](?:s|re)| \\p{L}+(?!['\u2019]t))",
        "(?:\\p{L}+n['\u2019]t|not) about [^.;:!?]{1,60}?[.!] (?:instead,? )?(?:it|they|this|that)(?:['\u2019](?:s|re)| is| are| was| were)",
        "(?:is|are|was|were)(?:n['\u2019]t| not) [^.;:!?]{1,40}?(?:,|;|\u2014|\u2013|\\s-)\\s*(?:it|they|this|that)(?:['\u2019](?:s|re)| is| are| was| were)",
        "(?:is|are|was|were)(?:n['\u2019]t| not) [^.;:!?]{0,30}?(?:just|only|simply|merely) [^.;:!?]{1,40}?[.!] (?:it|they|this|that)(?:['\u2019](?:s|re)| is| are| was| were)",
        "(?:more than|beyond) (?:just|simply|merely) [^.;:!?]{1,60}?(?:(?:;|\u2014|\u2013|\\s-)\\s*|[.!] )(?:it|they|this|that)(?:['\u2019](?:s|re)| \\p{L}+)",
        "(?<=,\\s{0,3})not (?:just|only|simply|merely)",
        "(?<=(?:is|are|was|were) )not (?:about )?(?:a |an |the )?[\\p{L}\\p{N}'\u2019-]+(?: [\\p{L}\\p{N}'\u2019-]+){0,5},? but",
    ],
    // Only the rhetorical forms: "kein Titel, sondern ein Dienst", "nicht nur X, sondern
    // auch Y", the halves split by a full stop ("Es geht nicht nur um X. Es geht um Y"). A plain correction ("nicht am Montag,
    // sondern am Dienstag") is ordinary German and stays unflagged.
    de: [
        "kein(?:e[nmrs]?)? [^.;:!?]{1,50}?(?:,? sondern|[.!] (?:sondern|vielmehr|es geht (?:vielmehr|darum|um)))",
        "nicht (?:nur|blo\u00df|einfach|allein|lediglich) [^.;:!?]{1,60}?(?:,? sondern|[.!] (?:sondern|vielmehr|es geht (?:vielmehr|darum|um)))",
    ],
};

// One pattern for a list of phrase patterns (see STOCK_PATTERNS for the rules).
function phraseListRe(list) {
    return new RegExp("(?<![\\p{L}\\p{N}])(?:" + list.join("|").replace(/ /g, "\\s+") + ")(?![\\p{L}\\p{N}])", "giu");
}

// The set-up contrasts in `text` (`lang`, or every language when it is unknown), as
// written there.
function findContrasts(text, lang) {
    const list = lang ? CONTRAST_PATTERNS[lang] : Object.values(CONTRAST_PATTERNS).flat();
    return list ? Array.from(String(text || "").matchAll(phraseListRe(list)), m => m[0]) : [];
}

// One pattern for the stock phrases of `lang` (of every language when it has no list),
// set-up contrasts included.
function stockPhraseRe(lang) {
    const all = t => Object.values(t).flat();
    return phraseListRe(STOCK_PATTERNS[lang] ? STOCK_PATTERNS[lang].concat(CONTRAST_PATTERNS[lang] || []) : all(STOCK_PATTERNS).concat(all(CONTRAST_PATTERNS)));
}

// The stock phrases in `text`, as [start, end) ranges, in order.
function findStockPhrases(text, lang) {
    return Array.from(String(text || "").matchAll(stockPhraseRe(lang)), m => [m.index, m.index + m[0].length]);
}

// How many stock phrases `text` has outside code blocks, each paragraph in its own
// language (else `lang`).
function countStockPhrases(text, lang) {
    return splitParagraphs(text, 1).filter(b => b.kind === "para")
        .reduce((n, b) => n + findStockPhrases(b.text, detectLanguage(b.text) || lang).length, 0);
}

// Is `text` (a sentence or paragraph) nothing but stock phrases, such as "I hope this
// email finds you well." or "Let that sink in."? Such a unit is removed, not reworded.
function isStockOnly(text, lang) {
    const t = String(text || "");
    const cut = cutStockPhrases(t, lang);
    return cut !== t.replace(/\s+/g, " ").trim() && !/[\p{L}\p{N}]/u.test(cut);
}

// The range to delete when the sentence at [start, end) of `text` goes: with the spaces
// after it, or before it at the end of a line. A line left empty, or holding only a list
// or quote marker, goes whole, and so does a blank line that would be left doubled.
function deletionRange(text, start, end) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd < 0) lineEnd = text.length;
    const before = text.slice(lineStart, start), after = text.slice(end, lineEnd);
    if (/^[ \t]+\S/.test(after)) return [start, end + after.match(/^[ \t]+/)[0].length];
    if (after.trim()) return [start, end];
    if (before.replace(/^\s*(?:(?:[-*+]|\d{1,3}[.)])\s+|>\s*)*/, "").trim()) return [start - before.match(/[ \t]*$/)[0].length, end];
    // The whole line. At the end of the text, the line breaks before it go instead.
    if (lineEnd >= text.length - 1 && lineStart > 0) {
        let s = lineStart;
        while (s > 0 && text[s - 1] === "\n") s--;
        return [s, lineEnd];
    }
    let e = Math.min(text.length, lineEnd + 1);
    if ((lineStart === 0 || text.slice(0, lineStart).endsWith("\n\n")) && text[e] === "\n") e++;
    return [lineStart, e];
}

// `text` without its stock phrases: what is left to compare a rewrite with, since cutting
// them is the job, not a change to hold against the model.
function cutStockPhrases(text, lang) {
    const t = String(text || "");
    let out = "", pos = 0;
    for (const [s, e] of findStockPhrases(t, lang)) { out += t.slice(pos, s); pos = e; }
    return (out + t.slice(pos)).replace(/\s+/g, " ").trim();
}

// Assemble the system prompt for a reword level (REWORD_LEVELS key), a tone
// (REWORD_TONES key), an optional instruction from the user, the passage's language
// (a LANGUAGE_NAMES code, or null when unknown), on a second try what was wrong with
// the first answer (retryNote), the stock phrases found in the passage (as written
// there), and its sentences that are nothing but stock phrases (`drop`). Small models
// act on the phrases named far more than on a general rule.
function buildRewriteSystem(level, tone, extra, lang, retry, phrases, drop) {
    const lv = REWORD_LEVELS[level] || REWORD_LEVELS.strong;
    const name = LANGUAGE_NAMES[lang];
    const found = [...new Map((phrases || []).map(p => {
        const t = String(p).replace(/\s+/g, " ").trim();
        return [t.toLowerCase(), t];
    })).values()].filter(Boolean).slice(0, 8);
    const lines = [
        "You edit one passage of text so it reads as if a person wrote it themselves.",
        "Rules:",
        ...lv.rules,
        lv.contrasts ? CONTRAST_RULES[lang] || CONTRAST_RULES.en : null,
        "- Keep the meaning and every fact, name, number and quote, and address the reader as the passage does (formal or informal).",
        name ? `- The passage is in ${name}. Write your rewrite in ${name}.` : "- Write your rewrite in the language of the passage.",
        drop && drop.length ? `- Leave these sentences out entirely, they say nothing: ${drop.map(t => `"${t}"`).join(", ")}` : null,
        found.length ? `- The passage has stock phrases that make it sound machine-written: ${found.map(p => `"${p}"`).join(", ")}. Cut each one, or say it in plain words, and keep the sentence grammatical. Treat other filler and hype the same way, and add none of your own.`
            : STOCK_PHRASES[lang] ? `- Cut or replace stock phrases, filler and hype, such as ${STOCK_PHRASES[lang]}, and add none of your own.`
            : `- Cut or replace stock phrases, filler and hype, such as ${STOCK_PHRASES.en}, and their equivalents in the passage's language.`,
        "- Don't add or drop information. Keep Markdown that is there (lists, bold), but add none.",
    ].filter(Boolean);
    if (REWORD_TONES[tone]) lines.push(REWORD_TONES[tone]);
    const own = String(extra || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (own) lines.push("- " + own);
    if (retry) lines.push("- " + retry);
    lines.push("- Reply with the edited passage only: no introduction, no comments, no quotation marks around it.");
    return lines.join("\n");
}

// `lang` (a LANGUAGE_NAMES code) is spelled out in the prompt: "keep the language" alone
// isn't enough for small models, which drift into English on German text. `context`
// (the paragraph a sentence comes from) goes into the system message, so the user
// message holds only what is to be rewritten. `opts` holds level, tone and extra. For
// English and German an example exchange at that level goes before the passage (the
// example is in the passage's language, or it would pull the reply into English).
// The stock phrases named are those of the passage, not of its context; a sentence that
// is nothing but stock phrases is named as one to leave out.
function buildRewriteMessages(passage, lang, context, opts) {
    const o = opts || {};
    const text = String(passage).trim();
    const phrases = [], drop = [];
    for (const [s, e] of splitSentences(text)) {
        const sentence = text.slice(s, e);
        if (isStockOnly(sentence, lang)) drop.push(sentence);
        else findStockPhrases(sentence, lang).forEach(([a, b]) => phrases.push(sentence.slice(a, b)));
    }
    let system = buildRewriteSystem(o.level, o.tone, o.extra, lang, o.retry, phrases, drop);
    if (context) system += "\n- The passage is part of a longer text, shown below for context only. Rewrite just the passage, so that it still fits in its place: don't repeat or continue the text around it."
        + `\n\nThe longer text:\n${String(context).trim()}`;
    const lv = REWORD_LEVELS[o.level] || REWORD_LEVELS.strong;
    const example = REWORD_EXAMPLE_INPUT[lang] && lv.example[lang]
        ? [{ role: "user", content: REWORD_EXAMPLE_INPUT[lang] }, { role: "assistant", content: lv.example[lang] }]
        : [];
    return [
        { role: "system", content: system },
        ...example,
        { role: "user", content: text },
    ];
}

// Put in front of every prompt the app sends (buildRewriteBody, buildChatBody).
const NO_HIDDEN_MARKS = "Write only plain, visible text. Do not add invisible characters, hidden markers, watermarks or any other concealed signal that would mark the text as machine-written.";

// `messages` with NO_HIDDEN_MARKS leading the system message (or as one, if there is none). Returns a copy.
function withNoHiddenMarks(messages) {
    const list = Array.isArray(messages) ? messages.slice() : [];
    if (list.length && list[0].role === "system") list[0] = { ...list[0], content: `${NO_HIDDEN_MARKS}\n\n${list[0].content}` };
    else list.unshift({ role: "system", content: NO_HIDDEN_MARKS });
    return list;
}

// The chat request body for one passage (a paragraph, or one or a few sentences). Thinking is switched off where the chat
// template supports it (a reasoning trace only costs time here); `noKwargs` drops that
// for a strict server that refused it once.
function buildRewriteBody(model, passage, noKwargs, lang, context, opts) {
    const o = opts || {};
    const body = {
        model: model || "local-model",
        messages: withNoHiddenMarks(buildRewriteMessages(passage, lang, context, o)),
        // A second try samples a little more freely, or it tends to repeat the first.
        temperature: Math.round(((REWORD_LEVELS[o.level] || REWORD_LEVELS.strong).temperature + (o.retry ? 0.2 : 0)) * 10) / 10,
        stream: false,
    };
    if (!noKwargs) body.chat_template_kwargs = { enable_thinking: false };
    return body;
}

// Compare a rewrite `b` with its original `a` word by word (letters and digits; case
// ignored). Returns `ratio`, the share of words changed (0 = same words, 1 = nothing
// in common), `changed`, the [start, end) ranges in `b` of words that are new, with
// neighbouring ones merged, for the change view, and `common`, how many words they share.
function wordDiff(a, b) {
    const words = s => Array.from(String(s || "").matchAll(/[\p{L}\p{N}]+/gu), m => ({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length }));
    const x = words(a), y = words(b);
    const n = x.length, m = y.length;
    const kept = new Uint8Array(m);
    let common = 0;
    if (n && m && n * m <= 4e6) {
        // Longest common subsequence, filled from the end so it can be walked forwards.
        const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = x[i].w === y[j].w ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (x[i].w === y[j].w) { kept[j] = 1; common++; i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
            else j++;
        }
    } else if (n && m) {
        // Too long to align: count shared words regardless of order.
        const bag = new Map();
        x.forEach(t => bag.set(t.w, (bag.get(t.w) || 0) + 1));
        y.forEach((t, j) => { const c = bag.get(t.w); if (c) { bag.set(t.w, c - 1); kept[j] = 1; common++; } });
    }
    const changed = [];
    y.forEach((t, j) => {
        if (kept[j]) return;
        const last = changed[changed.length - 1];
        if (last && j > 0 && !kept[j - 1]) last[1] = t.end;
        else changed.push([t.start, t.end]);
    });
    return { ratio: n || m ? 1 - common / Math.max(n, m) : 0, changed, common };
}

// The answer without any reasoning trace. A reply that is all trace (cut off before
// the answer) comes back empty. Besides the XML-style tags, Gemma 4 wraps its trace in
// "<|channel>thought ... <channel|>", and its larger models emit that block, empty,
// even with thinking switched off.
function stripThinking(text) {
    let t = String(text || "");
    t = t.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, "");
    t = t.replace(/<\|channel>[\s\S]*?<channel\|>/g, "");
    // A template that opens the trace in the prompt leaves only the closing tag.
    const close = t.match(/<\/(?:think|thought|reasoning)>|<channel\|>/i);
    if (close) t = t.slice(close.index + close[0].length);
    // An opening tag never closed: the model ran out of tokens while thinking.
    const open = t.search(/<(?:think|thought|reasoning)>|<\|channel>/i);
    if (open >= 0) t = t.slice(0, open);
    return t.trim();
}

const PREAMBLE_RE = /^(?:here(?:'s| is| are)\b|sure[,!.]|certainly[,!.]|of course[,!.]|okay[,!.]|ok[,!.]|hier ist\b|hier sind\b|gerne[,!.]|klar[,!.]|nat\u00fcrlich[,!.]|rewritten\b|umformuliert\b|voici\b|voil\u00e0\b|claro[,!.]|aqu\u00ed (?:est\u00e1|tienes)\b|ecco\b|certo[,!.])/i;

// Is the model's reply a usable rewrite of `orig` (in language `lang`, if known, at
// reword `level`)? Returns the text to use and the share of words changed, or why not.
// `unchanged` marks a reply identical to the original: kept, but not an error. Stock
// phrases cut or replaced don't count against the length and Light limits: "It is
// important to note that prices rose." may well become "Prices rose." A reply may
// start like an introduction ("Of course, we ...") when the original starts with the
// same words. A reply with more stock phrases than the original is refused.
function acceptRewrite(orig, reply, lang, level) {
    const lv = REWORD_LEVELS[level] || REWORD_LEVELS.strong;
    let t = stripThinking(reply);
    const o = String(orig || "").trim();
    // Quotes wrapped around the whole reply that the original didn't have.
    if (t.length > 1 && /^["'\u201c\u201e]/.test(t) && /["'\u201c\u201d]$/.test(t) && !/^["'\u201c\u201e]/.test(o)) t = t.slice(1, -1).trim();
    // A sentence comes back on one line, even if the model broke it.
    if (!o.includes("\n")) t = t.replace(/\s*\n\s*/g, " ");
    if (!t) return { ok: false, reason: "empty reply" };
    // Same words (spacing, punctuation or case aside): nothing was reworded.
    if (t === o || wordDiff(o, t).ratio === 0) return { ok: false, unchanged: true, reason: "the model changed nothing" };
    const lead = x => (x.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).slice(0, 3).join(" ");
    if (PREAMBLE_RE.test(t) && !(PREAMBLE_RE.test(o) && lead(t) === lead(o))) return { ok: false, reason: "the model added an introduction" };
    const cut = cutStockPhrases(o, lang);
    if (t.length / Math.max(1, cut.length) < lv.minLength) return { ok: false, reason: "reply much shorter than the original" };
    if (t.length / Math.max(1, o.length) > lv.maxLength) return { ok: false, reason: "reply much longer than the original" };
    const got = lang ? detectLanguage(t) : null;
    if (got && got !== lang) return { ok: false, reason: `the model answered in ${LANGUAGE_NAMES[got]} instead of ${LANGUAGE_NAMES[lang]}` };
    // German: the reader is addressed as in the original. Sentence by sentence, Qwen3.8-27B
    // turned "Sie" into "du" now and then, and a group ("eure") into one reader ("dich").
    if (lang === "de") {
        const was = addressForms(o), switched = [...addressForms(t)].filter(f => !was.has(f));
        if (was.size && switched.length) return { ok: false, address: [...was][0], reason: `the model switched the form of address to "${switched[0]}"` };
    }
    // Removing stock phrases is the job, so a reply with more of them than the original
    // ("Moreover, ...") is refused, naming the ones it brought in.
    const had = findStockPhrases(o, lang).map(([a, b]) => o.slice(a, b).toLowerCase());
    const has = findStockPhrases(t, lang).map(([a, b]) => t.slice(a, b));
    if (has.length > had.length) {
        const added = has.filter(x => !had.includes(x.toLowerCase())).slice(0, 3);
        return { ok: false, reason: `the model added stock phrases${added.length ? ` (${added.map(x => `"${x}"`).join(", ")})` : ""}` };
    }
    const change = wordDiff(o, t).ratio;
    // With stock phrases in it, what counts is how many of the other words changed.
    let rest = change;
    if (cut !== o) {
        const words = (cut.match(/[\p{L}\p{N}]+/gu) || []).length;
        rest = Math.min(change, words ? 1 - wordDiff(cut, t).common / words : 0);
    }
    if (rest > lv.maxChange) return { ok: false, reason: `the model changed ${Math.round(change * 100)} % of the words, more than a light edit` };
    // Past Light, a set-up contrast left in is refused, but softly: if the second try
    // fails too, this reply is still better than the original, which has one as well.
    const contrast = level === "light" ? null : findContrasts(t, lang)[0];
    if (contrast) return { ok: false, soft: true, contrast, text: t, change, reason: `the reply still sets up a contrast ("${contrast}")` };
    return { ok: true, text: t, change };
}

// How German `text` addresses its reader: "du" (one reader), "ihr" (a group, "euch",
// "eure") and "Sie" (formal: "Sie", "Ihnen", "Ihr" capitalised inside a sentence; at its
// start they may mean "they" or "her"). The plural "ihr" itself is left out, as it is
// also "her".
function addressForms(text) {
    const t = String(text || ""), forms = new Set();
    if (/(?<![\p{L}])(?:du|dich|dir|dein|deine[mnrs]?)(?![\p{L}])/iu.test(t)) forms.add("du");
    if (/(?<![\p{L}])(?:euch|euer|eure[mnrs]?)(?![\p{L}])/iu.test(t)) forms.add("ihr");
    if (/(?<!(?:^|[.!?:]|["\u201e\u201c])\s*)(?<![\p{L}])(?:Sie|Ihnen|Ihre?[mnrs]?)(?![\p{L}])/u.test(t)) forms.add("Sie");
    return forms;
}

// A unit shorter than this that comes back unchanged gets no second try: it is likely a
// greeting or a name the model rightly left alone, and pushing it to "change a word"
// would only damage it.
const RETRY_MIN_LETTERS = 20;

// The extra rule for a second try after acceptRewrite refused a reply (`verdict`) for
// `passage`, or "" when a second try isn't worth it. Small models return a third of
// the sentences unchanged at the Light level; a second try with this note and a
// slightly higher temperature rewords most of them (bench/README.md).
function retryNote(verdict, passage) {
    if (!verdict || verdict.ok) return "";
    if (verdict.unchanged) {
        if ((String(passage || "").match(/\p{L}/gu) || []).length < RETRY_MIN_LETTERS) return "";
        return "Your first answer repeated the passage word for word. This time, change at least one or two words in every sentence.";
    }
    if (verdict.reason === "empty reply") return "Your first answer was empty. Reply with the edited passage.";
    if (verdict.address) return `Your first answer changed how the reader is addressed. The passage says "${verdict.address}"; keep exactly that form in every sentence.`;
    if (verdict.contrast) return `Your first answer still set up a contrast ("${verdict.contrast}"). Say the point directly this time, with no "not just", "not only" or "not ..., but".`;
    return `Your first answer was refused (${verdict.reason}). Avoid that this time.`;
}

// ========== Stage 2b: rewriting the whole text ==========

// "Rewrite whole text" sends the text in one piece, in several passes, instead of
// sentence by sentence, so the rewrite can change the shape of the text as well as its
// wording: the opening, the order and weight of the points, the transitions, the voice
// and the closing line.
//
// The passes, in order (WHOLE_PASSES): the model lists what reads as machine-written
// (critique), rewrites the whole text with that list (rewrite; retry, then outline and
// draft, when refused), reviews it sentence by sentence (review) and fixes only the
// flagged sentences (sentences); then the model compares the result with the original
// (facts), corrects only the errors it found (fix) and checks once more (recheck), for
// the report only; then code finds the set-up contrasts, stock phrases and copied
// sentences left (wholeSpotNotes) and the model fixes those spots (spots), after the fix
// so that what it puts back is covered too. A proofreading pass ends it.

// A letter's greeting line and its sign-off block (the closing line and the short name
// lines under it) never go to the model: they come back reworded or as the name (see
// SALUTATION_RE). Returns the text split into `head` + `body` + `tail`, which
// concatenate back to it exactly; `letter` tells whether either was found.
function splitLetterFrame(text) {
    const t = String(text || "");
    const lines = t.split("\n");
    let a = 0, b = lines.length;
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && SALUTATION_RE.test(lines[i].trim())) a = i + 1;
    for (let j = lines.length - 1; j >= a; j--) {
        const l = lines[j].trim();
        if (!l) continue;
        if (SALUTATION_RE.test(l)) { b = j; break; }
        if (l.split(/\s+/).length > 4) break;
    }
    // A greeting with nothing under it, or a sign-off with nothing above it: no frame.
    if (!lines.slice(a, b).join("\n").trim()) return { head: "", body: t, tail: "", letter: false };
    let head = lines.slice(0, a).join("\n"), body = lines.slice(a, b).join("\n"), tail = lines.slice(b).join("\n");
    if (a > 0) head += "\n";
    if (b < lines.length) body += "\n";
    // Blank lines around the body belong to the frame, so the model gets only the core.
    const lead = body.match(/^\s*/)[0], trail = body.match(/\s*$/)[0];
    head += lead;
    tail = trail + tail;
    body = body.slice(lead.length, body.length - trail.length);
    return { head, body, tail, letter: a > 0 || b < lines.length };
}

// A German letter's first word after a greeting that ends in a comma ("Liebe Mitglieder,")
// is written small, as the original body has it: the rewrite opens with "Ab dem 1. M\u00e4rz".
// Only words that are never nouns are lowered; "Sie", "Ihr" and nouns keep their capital.
const GREETING_SMALL_WORDS = new Set("ab am an auf aus bei bis bitte da damit dann das dass dem den der die diese diesem diesen dieser dieses durch ein eine einem einen einer es f\u00fcr gerne gestern heute hier ich im in leider mit morgen nach nun schon seit so um und unser unsere unseren unserem unserer vielen vom von vor wie wir zum zur".split(" "));
function greetingCase(head, orig, body, lang) {
    const first = String(orig || "").match(/\p{L}/u);
    if (lang !== "de" || !/,\s*$/.test(String(head || "")) || !first || first[0] === first[0].toUpperCase()) return body;
    return String(body).replace(/^(\p{Lu})(\p{Ll}*)(?![\p{L}])/u, (w, a, b) => GREETING_SMALL_WORDS.has(w.toLowerCase()) ? a.toLowerCase() + b : w);
}

// Examples named in the prompts, in the text's own language only (English for any
// other, as with STOCK_PHRASES): naming German in an English prompt pulls small models
// into German.
const WHOLE_EXAMPLES = {
    en: { contrast: "\"X is not (just) A, it is B\", \"not only A but also B\", \"it's not about A, it's about B\"", illustrate: "\"say\", \"for example\"", voice: "\"I think\", \"at least for us\", \"in my experience\"",
        filler: "\"This clear structure builds trust.\", \"It is only one piece of the puzzle.\", \"That way everyday life gets calmer.\"", notFiller: "\"I put my phone in another room.\", \"Set a fixed time to stop.\"" },
    de: { contrast: "\"X ist kein A, sondern B\", \"nicht nur A, sondern auch B\", \"Es geht nicht um A, sondern um B\"", illustrate: "\"etwa\", \"zum Beispiel\"", voice: "\"finde ich\", \"zumindest bei uns\", \"meiner Erfahrung nach\"",
        filler: "\"Diese klare Struktur schafft Vertrauen.\", \"Das ist nur ein Teil des Puzzles.\", \"So kehrt mehr Ruhe in den Alltag ein.\"", notFiller: "\"Ich lege das Handy in einen anderen Raum.\", \"Man sollte feste Endzeiten haben.\"" },
};

// The fewest letters a text (a letter's body) needs for Rewrite whole text: a lone
// greeting or a line or two is better served by Reword.
const WHOLE_MIN_LETTERS = 40;

// The passes, with the temperature each samples at and whether the model's answer is
// notes (a list) or the new text. The rewrite runs warm; checks and fixes cold, so they
// change only what they are asked to.
const WHOLE_PASSES = [
    { id: "critique", label: "reading the text", temperature: 0.6, notes: true },
    // Rewrite freely only: the editor's plan of what to drop, merge, move and add.
    { id: "plan", label: "planning the changes", temperature: 0.5, notes: true },
    { id: "rewrite", label: "rewriting", temperature: 0.6 },
    // The second try at a refused rewrite, sampled hotter.
    { id: "retry", label: "rewriting again", temperature: 0.85 },
    // When rewrite and retry both copied the text: the model lists its points as notes
    // (outline) and writes the text from those (draft).
    { id: "outline", label: "listing the points", temperature: 0.2, notes: true },
    { id: "draft", label: "writing from the points", temperature: 0.7 },
    { id: "review", label: "reviewing sentences", temperature: 0.3, notes: true },
    { id: "sentences", label: "fixing sentences", temperature: 0.6 },
    { id: "facts", label: "checking facts", temperature: 0.2, notes: true },
    { id: "fix", label: "correcting", temperature: 0.2 },
    { id: "recheck", label: "checking the corrections", temperature: 0.2, notes: true },
    { id: "spots", label: "fixing contrasts and stock phrases", temperature: 0.5 },
    // Rewrite freely only: the filler sentences the later passes put back, cut.
    { id: "slop", label: "finding filler sentences", temperature: 0.2, notes: true },
    // Plainer only. German: everyday words, then each long sentence split on its own,
    // then a row of sentences opening alike reworded (buildPlainRuleMessages).
    { id: "words", label: "using everyday words", temperature: 0.5 },
    { id: "split", label: "splitting long sentences", temperature: 0.3 },
    // Each split acceptSplit let through, checked against its sentence: "ja" or "nein: ...".
    { id: "splitcheck", label: "checking the split sentences", temperature: 0, notes: true },
    { id: "openers", label: "varying sentence openings", temperature: 0.4 },
    // English: what kind of text it is (TEXT_KINDS), for the speaker pass; then one edit
    // of one kind per pass (WHOLE_PLAIN_EN), each with a little thinking.
    { id: "kind", label: "reading what kind of text it is", temperature: 0, notes: true },
    { id: "verdicts", label: "cutting verdicts and set-ups", temperature: 0.5 },
    { id: "objections", label: "reporting objections plainly", temperature: 0.5 },
    { id: "everyday", label: "using everyday words", temperature: 0.5 },
    { id: "speaker", label: "giving claims a speaker", temperature: 0.5 },
    { id: "alternatives", label: "cutting alternatives", temperature: 0.5 },
    { id: "proof", label: "proofreading", temperature: 0.1 },
];

function wholeLanguage(lang) {
    return LANGUAGE_NAMES[lang] || null;
}

function wholeWriteIn(lang) {
    const name = wholeLanguage(lang);
    return name ? `Write in ${name}, the language of the text.` : "Write in the language of the text.";
}

// Pass "critique": what makes the text read as machine-written, as a short list.
function buildCritiqueMessages(text) {
    return [
        { role: "system", content: "You are a sharp editor who spots machine-written text. List what in this text makes it read as written by an AI: "
            + "buzzwords and abstract phrases, set-up contrasts (\"not just A, but B\"), lists of three, sentences that all have the same length "
            + "and shape, paragraphs that each do one tidy job, points that are repeated, sweeping claims with no limit or example, "
            + "smooth transitions, a closing line that sums up or sounds like a slogan, overly polite or overly enthusiastic filler. "
            + "Quote the exact words. A short bullet list, at most 10 points, no rewrite." },
        { role: "user", content: String(text).trim() },
    ];
}

// Whether `text` is told in the first person (a post about the writer's own year), not
// argued in general: "I"/"my" (or German "ich"/"mein") in at least 2 % of its words.
function isFirstPerson(text, lang) {
    const w = String(text || "").toLowerCase().match(/\p{L}+/gu) || [];
    const own = lang === "de" ? /^(?:ich|mich|mir|mein(?:e[mnrs]?)?)$/ : /^(?:i|me|my|mine)$/;
    return w.length > 0 && w.filter(x => own.test(x)).length / w.length >= 0.02;
}

// Pass "plan" (Rewrite freely): how the content changes, as a short list for the
// rewrite: the main claim, the points to drop and merge, the opening, which point gets
// the room, an example from the text's own facts, and the end. No limit or doubt: asked
// for one, the plan made up a claim in nearly half the texts ("libraries cannot solve deep
// poverty", "the margin only works for a small shop") and once turned the writer's position.
function buildPlanMessages(text, lang, critique, letter) {
    const ex = WHOLE_EXAMPLES[lang] || WHOLE_EXAMPLES.en;
    return [
        { role: "system", content: "You are an editor. The text below is to be rewritten so that it reads like one real person wrote it, and the rewrite may change its content. "
            + "Plan the content changes as short bullets:\n"
            + (letter ? "- what to cut: empty courtesy, repeated assurances, filler (every request, promise, date, amount and apology stays)\n"
                : "- the main claim of the text (what it argues for or tells), which stays, said plainly\n"
                + "- at most two points to drop: generic ones any text on the topic would make, or ones that repeat another; every other argument stays. "
                + "A figure, date, name or measured result is the opposite of generic: a point that has one stays, with it\n")
            + "- the points to merge into one\n"
            + "- the opening: the writer's position or a plain fact from the text, in one sentence; not a scene, an example, a question or the thesis in grand words\n"
            + "- the one point that gets most of the room, and the minor points that shrink to a clause or a sentence inside another paragraph instead of a paragraph of their own\n"
            + "- at most one example, and only one built from the text's own facts; no invented scene\n"
            + "- the one point the text ends on: a specific one, not a summary, moral or outlook\n"
            + "Keep the core message and the writer's position. Name each point by quoting a few of the text's words; say what to change, not how to word it. At most 10 bullets, no rewrite."
            + (critique ? "\n\nAn editor found these machine-like features in the text:\n" + String(critique).trim() : "") },
        { role: "user", content: String(text).trim() },
    ];
}

// Plainer, German: one job per pass, as for English, since one prompt holding all the
// rules split everything into 3-5 word sentences and lost the logic and sometimes the
// meaning ("weniger fuer schnelle Loesungen, sondern ..." -> "brauchte mich"). The text
// must stay easy to follow. "words": everyday verbs for noun chains, no sentence split or
// joined. "split": each sentence over 12 words on its own (longSentences; the model can't
// count), and a split that doesn't come back as two or three whole sentences with every
// number keeps the sentence (acceptSplit). "openers": only when a row of sentences opens
// alike ("Sie sehen ... Sie koennen ..."). The fact check runs again after them.
const PLAIN_SPLIT_WORDS = 12;
const PLAIN_DE_WORDS = "lange W\u00f6rter, Substantivketten und Amtsdeutsch werden zu einfachen Verben und Alltagsw\u00f6rtern, wie man sie laut sagen w\u00fcrde (\"die Einarbeitung neuer Kr\u00e4fte bindet enormen Aufwand\" -> \"es ist viel Arbeit, die Neuen einzuarbeiten\"); das Hauptwort wird wiederholt statt durch ein Synonym ersetzt. Kein Satz wird geteilt oder mit einem anderen verbunden. Kein Slang, keine Fragen.";
function longSentences(text, max = PLAIN_SPLIT_WORDS) {
    const t = String(text || "");
    return splitSentences(t).map(([a, b]) => t.slice(a, b)).filter(x => (x.match(/[\p{L}\p{N}]+/gu) || []).length > max);
}
function buildPlainRuleMessages(text, rule) {
    return [
        { role: "system", content: `Bearbeite den Text unten. \u00c4ndere nur eines: ${rule} `
            + "Jeder andere Satz bleibt genau so, wie er ist; die Abs\u00e4tze, die Anrede, jede Zahl, jeder Name und jedes Datum bleiben, und nichts kommt dazu, was der Text nicht sagt. Korrektes Deutsch. Antworte nur mit dem Text." },
        { role: "user", content: String(text).trim() },
    ];
}
function plainOpenerRule(words) {
    return `mehrere S\u00e4tze hintereinander beginnen mit "${words}". Stell einige davon um (ein anderes Satzglied nach vorn) oder verbinde zwei davon mit "und", damit keine zwei S\u00e4tze hintereinander mit denselben W\u00f6rtern beginnen.`;
}
function buildSplitMessages(sentence) {
    return [
        { role: "system", content: "Teile den Satz in zwei, h\u00f6chstens drei vollst\u00e4ndige S\u00e4tze, ohne den Inhalt zu \u00e4ndern. "
            + "Jeder neue Satz hat sein eigenes Verb und ist allein verst\u00e4ndlich; ein Nebensatz mit \"dass\", \"damit\", \"ob\", \"ohne dass\", \"weil\", \"wenn\", \"was\" oder \"der\", \"die\", \"das\" bleibt an seinem Hauptsatz, ebenso ein Teil mit \"statt ... zu\", \"ohne ... zu\" oder \"um ... zu\", und was mit \"oder\" verbunden ist, bleibt in einem Satz. "
            + "Hatte der Satz ein Wort, das zeigt, wie seine Teile zueinander stehen (\"weil\", \"aber\", \"deshalb\", \"weniger ... als\"), beginnt der neue Satz mit einem Wort, das genau diesen Zusammenhang zeigt (\"denn\", \"aber\", \"deshalb\"); sonst beginnt er ohne so ein Wort. Nimm nie \"dabei\" als Verbindung. "
            + "Die Aussagen bleiben in der Reihenfolge, in der sie im Satz stehen. Ein Gegensatz beh\u00e4lt beide Seiten. Zwei S\u00e4tze hintereinander beginnen nicht mit demselben Wort. "
            + "Anrede, Zahlen, Namen und Daten bleiben genau gleich; nichts kommt dazu. Antworte nur mit den S\u00e4tzen." },
        { role: "user", content: String(sentence).trim() },
    ];
}
// Pass "splitcheck": does the split still say what the sentence said? Asked to judge
// strictly ("allein verst\u00e4ndlich", "worauf sich ein Wort bezieht"), the model refused 40 %
// of good splits, every one with "Das ..." or "Er ..." pointing back; asked only for a
// changed claim, a broken sentence or a repeat, it caught a flipped comparison ("anders
// als die meisten" -> "Die meisten ... arbeiten anders"), a lost condition and a turned
// reference at few false alarms.
function buildSplitCheckMessages(sentence, split) {
    return [
        { role: "system", content: "Ein Satz A wurde in zwei oder drei S\u00e4tze B geteilt. Antworte \"nein\" nur, wenn B etwas anderes behauptet als A (ein Vergleich, eine Bedingung, ein Gegensatz, eine Frage oder eine Ursache ist verloren oder umgedreht), wenn ein Satz in B kein vollst\u00e4ndiger Satz ist oder ein falsches Wort hat, oder wenn B etwas zweimal sagt. "
            + "Dass B k\u00fcrzere S\u00e4tze hat und ein Satz mit \"das\", \"dies\", \"dort\", \"damit\", \"er\" oder \"sie\" auf den vorigen zeigt, ist richtig so. Antworte mit genau einer Zeile: \"ja\", oder \"nein: <was falsch ist>\"." },
        { role: "user", content: `A: ${String(sentence).trim()}\nB: ${String(split).trim()}` },
    ];
}

// Words that carry a split sentence's logic, each with the words that may stand for it
// in the parts ("weil" -> "denn", "deshalb"): a split that has fewer of them lost a
// condition, a purpose, an "oder" or a "nicht" ("ohne dass es schlechter wird" ->
// "Es wird nicht schlechter").
const SPLIT_KEEP = [
    ["dass", "dass"], ["damit", "damit"], ["ohne", "ohne"], ["statt|anstatt", "statt|anstatt"], ["wenn|falls|sofern", "wenn|falls|sofern"], ["ob", "ob"], ["oder", "oder"],
    ["nicht|kein|keine|keinen|keinem|keiner|keines|nie|niemals|nichts|niemand", "nicht|kein|keine|keinen|keinem|keiner|keines|nie|niemals|nichts|niemand"],
    ["obwohl|obgleich", "obwohl|obgleich|trotzdem|dennoch|aber|doch|zwar"], ["weil", "weil|denn|deshalb|daher|darum|deswegen|n\u00e4mlich"], ["sodass", "sodass|deshalb|daher|dadurch|so"],
    // "w\u00e4hrend" as a conjunction only: after a comma, or opening the sentence but not before an article ("W\u00e4hrend der Woche").
    ["(?<=,\\s{0,3})w\u00e4hrend|^w\u00e4hrend(?!\\s+(?:de[mnrs]|dies(?:e[mnrs]?)?|eine[mnrs]?)(?![\\p{L}]))", "w\u00e4hrend|aber|doch|dagegen|jedoch"],
];
// A part may open with a link word only when the sentence had that link.
const SPLIT_LINKS = [
    ["deshalb|daher|darum|deswegen|denn", "weil|da|denn|deshalb|daher|darum|deswegen|sodass|dadurch|n\u00e4mlich"],
    ["trotzdem|dennoch", "obwohl|obgleich|trotzdem|dennoch|aber|doch|zwar"], ["stattdessen", "statt|anstatt|sondern|stattdessen"], ["dabei", "(?!)"],
];

// The split of `sentence` in `reply`, or null: two or three sentences of four words or
// more, not opening alike, every number and logic word kept (SPLIT_KEEP), no link word
// the sentence did not have (SPLIT_LINKS), about as long as the sentence. A part that
// is only a "Statt/Ohne/Um ... zu" phrase is a fragment ("Statt pauschale Limits zu
// verh\u00e4ngen."), and three words in a row that come back in a second part were said
// twice ("Ohne diese Kontakte w\u00fcrde die Isolation schnell greifen. Besonders wo ...,
// w\u00fcrde die Isolation schnell greifen.").
function acceptSplit(sentence, reply) {
    const s = String(sentence || "").trim();
    let t = stripThinking(reply).replace(/\s+/g, " ").trim();
    if (!/^["'\u201c\u201e]/.test(s)) t = t.replace(/^["'\u201c\u201e]+|["'\u201c\u201d]+$/g, "").trim();
    const words = x => (x.match(/[\p{L}\p{N}]+/gu) || []).length;
    const first = x => (x.toLowerCase().match(/[\p{L}\p{N}']+/u) || [""])[0];
    const parts = splitSentences(t).map(([a, b]) => t.slice(a, b));
    if (parts.length < 2 || parts.length > 3 || parts.some(p => words(p) < 4)) return null;
    if (parts.some((p, i) => i && first(p) === first(parts[i - 1]))) return null;
    if (missingNumbers(s, t).length || PREAMBLE_RE.test(t)) return null;
    const count = (x, alt) => (x.match(new RegExp(`(?<![\\p{L}])(?:${alt})(?![\\p{L}])`, "giu")) || []).length;
    if (SPLIT_KEEP.some(([a, b]) => count(t, b) < count(s, a))) return null;
    if (parts.some((p, i) => i && SPLIT_LINKS.some(([a, b]) => count(first(p), a) && !count(s, b)))) return null;
    if (parts.some(p => /^(?:an)?statt\s|^ohne\s|^um\s/i.test(p) && !p.includes(",") && /\szu\s+\p{L}+\W*$/u.test(p))) return null;
    const trigrams = x => { const w = x.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; return w.slice(2).map((c, i) => w[i] + " " + w[i + 1] + " " + c); };
    const inSentence = trigrams(s);
    if (parts.some((p, i) => trigrams(p).some(g => parts.some((q, j) => j > i && trigrams(q).includes(g)) && inSentence.filter(x => x === g).length < 2))) return null;
    const r = words(t) / Math.max(1, words(s));
    return r >= 0.75 && r <= 1.4 ? t : null;
}

// The speaker pass, once the kind of text is known (pass "kind"): only the one form of
// speaker that fits it, so that an argued text gets no "you'll find" and a how-to no "I'd
// expect". Unknown kind: the rule in WHOLE_PLAIN_EN, which names all three.
const SPEAKER_LIMITS = "One or two such words per paragraph, not on every sentence. A claim from people or reports the text names is told as what they found. Plain facts, numbers, history and instructions stay as they are. Name no source the text doesn't name and give the writer no experiences the text doesn't give them.";
const TEXT_KINDS = {
    A: { id: "own", label: "the writer, their team or their company tells about their own work, product, plans or experience",
        speaker: "as what the writer or their team saw or noticed, never as a guess", forms: "\"we noticed\", \"we found\", \"the team found\"" },
    B: { id: "howto", label: "instructions or advice that tell the reader what to do",
        speaker: "as what the reader will notice when they do it", forms: "\"you'll notice\", \"you'll find\"" },
    C: { id: "argue", label: "the writer argues for a position or an opinion",
        speaker: "as the writer's own view", forms: "\"I think\", \"I'd expect\", \"I doubt\"" },
};

// Pass "kind": one letter of TEXT_KINDS for the text.
function buildTextKindMessages(text) {
    return [
        { role: "system", content: "What kind of text is this? Answer with one letter only:\n"
            + Object.entries(TEXT_KINDS).map(([k, v]) => `${k} = ${v.label}`).join("\n") },
        { role: "user", content: String(text).trim() },
    ];
}

// The kind (TEXT_KINDS key) in a reply to buildTextKindMessages, or null.
function parseTextKind(reply) {
    const m = stripThinking(reply).trim().match(/^[*_("'\s]*([ABC])\b/i);
    return m ? m[1].toUpperCase() : null;
}

// The speaker rule for one kind of text: at most one per paragraph, on a judgement only,
// with a few plain forms that may come back. Told to word every one differently, the
// model reached for "you'll come to notice" and "I'd wager", and put a speaker on plain
// facts and plans ("We noticed you save money on heating", "Hospitals don't close, I'd
// expect"); with these forms half as many lines came out, and half of those read well.
function speakerRule(kind) {
    return "in each paragraph at most one judgement or generalization the text states as a plain fact without saying where it comes from is given a speaker, "
        + TEXT_KINDS[kind].speaker + ", with one of these plain forms at the start of the clause: " + TEXT_KINDS[kind].forms + ". The same form may come back in a later paragraph. "
        + "Never on a fact, a number, a step or an instruction, and never tacked on at the end (\", I'd expect.\"). A paragraph without such a claim stays as it is. "
        + "A claim from people or reports the text names is told as what they found. Name no source the text doesn't name and give the writer no experiences the text doesn't give them.";
}

// The English passes of Plainer, in order. Each changes one kind of sentence and leaves
// the rest as it is: a model handles one such job well, and a long list of them in one
// prompt mostly not.
const WHOLE_PLAIN_EN = [
    { id: "verdicts", rule: "two kinds of sentences change, everything else stays. (1) A sentence that says what something is good for, why it works, or judges "
        + "it (helps, allows, enables, ensures, boosts, improves, fosters, leads to, keeps, makes it easier, is key, is real, is the fix, the "
        + "problem is, works best, pays off). (2) A sentence or opening that only announces, links or sets up what comes (\"here's what that "
        + "means\", \"here's what it does\", \"the reason is straightforward:\", \"which brings you to\", \"this follows from that\", "
        + "\"what matters is\", \"what breaks is\", \"the single most useful thing you can do is\", \"the problem shows up in\"). Each "
        + "becomes a plain sentence about what people do or what happens, using only what the text says, or is cut if there is nothing "
        + "concrete to say. A paragraph starts with its first concrete statement." },
    { id: "objections", rule: "a passage that raises a worry or objection and then answers it (people worry, critics say, some fear, people raise concerns ... "
        + "but, however, yet trials show, it turns out, it was manageable) becomes a plain report of what happened in the cases the text names, "
        + "or of what the writer recommends, without the worry-then-answer shape. Keep the facts of both sides." },
    { id: "everyday", rule: "every formal or stock phrase, the kind found in product copy, reports or AI text (\"view order statuses in real time\", "
        + "\"update billing information\", \"access support resources\", \"your data is protected with\", \"enhance\", \"leverage\", "
        + "\"streamline\", \"facilitate\", \"utilize\", \"a wide range of\", \"accumulated stress\", \"output per hour\", \"engagement\") "
        + "is replaced by the everyday words a person would say out loud (\"see where your order is\", \"change your billing details\", "
        + "\"find the support pages\", \"we encrypt your data\"). Prefer verbs to nouns. Same meaning, every fact, number and name kept." },
    { id: "speaker", rule: "every general claim the text states as a plain fact without saying where it comes from is given a speaker, the way this kind "
        + "of text would: where the writer tells about their own work or team (I, we), as what they saw, did or noticed (\"the team pushed "
        + "back\", \"we noticed\"), never as a guess; in instructions or a how-to, as what you will see or find when you do it (\"you'll "
        + "notice\", \"you'll find\"); only in a text that argues for a position, as the writer's own expectation (\"I'd expect\", "
        + "\"I don't think\"). " + SPEAKER_LIMITS },
    { id: "alternatives", rule: "two things are cut, everything else stays word for word. (1) The alternative the text sets a point against: \"instead of X\", "
        + "\"rather than X\", \"not X but\" clauses, where X is what you should not do or what the thing is not; keep the point itself. "
        + "(2) An explanation of why a piece of advice works (\"because pajamas tell your body...\", \"so your mind can...\", \"the context "
        + "itself does the nudging\"); keep the advice itself. Keep every fact, number and name." },
];

// One English pass of Plainer: the text, edited by one rule of WHOLE_PLAIN_EN.
function buildOneRuleMessages(text, rule) {
    return [
        { role: "system", content: `Edit the text below and keep it in English. Change only one thing: ${rule} `
            + "Leave every other sentence exactly as it is, keep the paragraphs, every fact, number and name, and add nothing the text doesn't say. Reply with the edited text only." },
        { role: "user", content: String(text).trim() },
    ];
}

// Pass "rewrite": the whole text, rewritten with the critique. `o.letter` (a greeting
// or sign-off was cut off) picks the rules for a letter; otherwise those for an essay,
// post or other prose. `o.details` are facts the writer gave about themselves, the
// only experiences the rewrite may tell; `o.tone` and `o.extra` as for Reword.
function buildWholeRewriteMessages(text, lang, o) {
    o = o || {};
    const ex = WHOLE_EXAMPLES[lang] || WHOLE_EXAMPLES.en;
    const details = String(o.details || "").replace(/\s+/g, " ").trim().slice(0, 600);
    const personal = isFirstPerson(text, lang);
    const kind = o.letter ? [
        "This is the body of a letter or e-mail (the greeting and the sign-off are kept apart and put back later, so write neither):",
        "- Keep every point, apology, thanks, request and promise, in a natural order for the letter. Start with the matter itself, not with how the writer feels.",
        "- Polite and correct, but plain: one apology or thanks said once and simply, no empty courtesy, no grand assurances.",
    ] : [
        "This is an essay, post, report or other prose:",
        "- Start inside the topic, with a concrete point the text makes, not with a sentence that states the whole thesis.",
        "- Don't give the points equal weight in neat parallel paragraphs: give the ones that carry the text room, and merge or shorten the weaker ones.",
        // An argued text gets two illustrations and no pro, contra and solution layout; a
        // first-person post keeps one illustration.
        // Rewrite freely follows its plan instead: no invented scene, the points shrunk or
        // grown, no announced transitions.
        o.free ? "- No invented scenes or everyday illustrations: an example only where the plan names one from the text's own facts."
            : personal ? `- Give one abstract claim a short everyday illustration, marked as one with ${ex.illustrate}. It must be typical, not a claimed fact: no names, figures or events.`
            : `- Give two of the abstract claims a short everyday illustration each, marked as one with ${ex.illustrate}. It must be typical, not a claimed fact: no names, figures or events.`,
        o.free ? "- Two to four paragraphs of clearly different length. A minor point goes inside another paragraph in a clause; no transition announces the next point (\"another point\", \"also important\", \"on top of that\")." : null,
        personal ? null : "- Don't lay an argument out as pro, then contra, then the balanced solution: lead with what the writer cares about most and bring the counterpoint in where it bites.",
        // Rewrite freely without details keeps the text's own voice: an "I" with no
        // personal detail behind it reads as put on.
        o.free && !details ? "- Keep the text's own voice: add no \"I think\" or \"in my view\" it doesn't have, and give the writer no experiences."
            : details ? "- Opinions belong to the writer: let them say \"I\" or \"we\" where the text argues, instead of an impersonal \"one\" or \"you\". Their only experiences are the details given below."
            : "- Opinions belong to the writer: let them say \"I think\" or \"in my view\" where the text argues, instead of an impersonal \"one\" or \"you\". Use \"I\" only for opinions, never for things that happened to the writer, and don't give the writer a role (a boss, an employee) the text doesn't give them.",
        o.free && !details ? null : `- Where the text gives an opinion, a light marker such as ${ex.voice} now and then makes it one person's view. Not in every paragraph.`,
        "- Don't tell it as a tidy arc (how it was, the struggle, the lesson, the advice): open with the part that matters most to the writer, and go back to how it began only where it is needed.",
        "- End on a specific point, not on a summary, moral, outlook, advice or question to the audience. Advice or a question the text gives goes in earlier, where it fits, in one short sentence.",
    ];
    const lines = [
        "You rewrite a text so that it reads like one real person wrote it, in their own voice, not like a polished AI answer. Careful readers know the AI patterns: "
            + "an opening that states the thesis, every point covered in a tidy order with one paragraph each, smooth transitions, general claims with no example, "
            + "an impersonal voice, and a closing line that sums up or zooms out to the big picture. Your rewrite must have none of them.",
        "",
        ...kind.filter(Boolean),
        "For every kind of text:",
        "- Sentence length varies a lot. Some sentences are very short. Paragraphs differ in length.",
        "- Plain, concrete everyday words. No buzzwords, no stacked abstract nouns, no hype, no sayings that any text on the topic could contain.",
        `- Never a set-up contrast such as ${ex.contrast}, not even across two sentences: say what it is.`,
        "- No lists of three, no rhetorical questions, no dashes for drama, no colon before a punchline.",
        "- Cut sentences that only repeat a point made before.",
        ...(o.free ? [
            "- You may change the content: drop generic or weak points, merge points, move them, and add a concrete typical example where a claim stays abstract. "
                + "Keep the core message and the writer's position; a point you keep must still say what it said.",
            "- Leave a dropped point out silently: never say what the text leaves out or skips. The plan below says what to change, not how to word it: use your own plain words, not the plan's.",
            "- Every fact, name, number, date and amount you keep stays exactly right; address the reader as the text does (formal or informal).",
            "- Add no new figures, names, dates, studies, quotes or events, and no experiences of the writer beyond the details given below. An added example is typical, not a claimed fact.",
        ] : [
            "- Keep what each claim says: you may say it in other words, shorten it or merge it with another, but don't turn it into a different claim, and add no claims of your own. "
                + "Don't link claims with a cause or conclusion (\"which shows\", \"because\", \"so\") that the text doesn't state.",
            "- Keep every fact, name, number, date and amount exactly right, and address the reader as the text does (formal or informal).",
            "- Never invent details: no places, times, durations, causes, figures, people, events, scenes, feelings or promises the text doesn't state.",
        ]),
        "- Keep Markdown that is there (lists, bold), but add none.",
        "- Correct grammar and real words only. " + wholeWriteIn(lang),
    ];
    if (REWORD_TONES[o.tone]) lines.push(REWORD_TONES[o.tone]);
    const own = String(o.extra || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (own) lines.push("- " + own);
    if (details) lines.push("- The writer gave these details about themselves and their situation. Work them in alongside the text's own points, as the writer's own experience where they fit: "
        + "they add to the text and replace none of its points, facts or figures. Use them exactly as given, change no fact in them, and invent nothing beyond them: " + details);
    if (o.retry) lines.push("- " + o.retry);
    if (o.fromNotes) lines.push("- The user message holds the content of the text as notes, not the text: write the text from them, with every note in it, as running text in a few paragraphs of different length, not as a list. Add nothing the notes don't say: no subject line, no headings, no attachment, no detail.");
    lines.push("- Reply with the rewritten text only: no introduction, no comments.");
    const critique = String(o.critique || "").trim();
    if (critique) lines.push("", "An editor found these machine-like features in the text; fix all of them:", critique);
    const plan = String(o.plan || "").trim();
    if (plan) lines.push("", "Follow this plan for the content:", plan);
    return [{ role: "system", content: lines.join("\n") }, { role: "user", content: String(text).trim() }];
}

// Pass "outline": the content of `text` as short notes, for a draft written from them
// (pass "draft", buildWholeRewriteMessages with `fromNotes`) when the rewrite copied.
function buildOutlineMessages(text, lang) {
    return [
        { role: "system", content: "List the content of this text as short notes, one bullet per point: every fact, name, number, date, event, apology, thanks, request, promise, opinion and recommendation, in the order of the text. "
            + "Notes, not sentences: as few of the text's own words as you can, but names, numbers and dates exactly as written, and no labels such as \"Topic:\". Keep who says what, and how the reader is addressed (formal or informal) as one note. "
            + wholeWriteIn(lang) + " Reply with the notes only." },
        { role: "user", content: String(text).trim() },
    ];
}

// Pass "review": the sentences a strict reviewer would still flag, as a list of at most
// `max`.
function buildSentenceReviewMessages(text, max = 6) {
    return [
        { role: "system", content: "Check this text for AI-typical writing patterns, sentence by sentence, the way a strict AI-text reviewer would: "
            + "a punchy or generic opening, a rhetorical transition into the counter-argument, a polished closing line that rounds the text off, "
            + "\"X without losing Y\" and other elegant pairings, a general claim drawn from a number, business phrases, sayings, "
            + "a tidy pro, contra and solution order, parallel sentence shapes. "
            + "For each sentence that would be flagged, give one bullet: the sentence quoted exactly, then after \" -> \" what makes it AI-typical. "
            + `Only the sentences that would really be flagged, at most ${max}. No rewrite.` },
        { role: "user", content: String(text).trim() },
    ];
}

// Pass "sentences": rewrite only the flagged sentences.
function buildSentenceFixMessages(text, lang, notes) {
    return [
        { role: "system", content: `A reviewer flagged these sentences of the text (the user message) as AI-typical:\n${String(notes).trim()}\n\n`
            + "Rewrite only those sentences, the way a person would plainly say the same thing: less polished, more specific, no rhetorical shape. "
            + "Rewrite them, don't cut them: what each one says stays in the text. The one exception is a closing line that only repeats or sums up what the text already said: cut it. "
            + "A closing line that states a point or a recommendation stays, said plainly. Every other sentence stays word for word. "
            + "Keep every fact and invent nothing. Correct grammar. " + wholeWriteIn(lang) + " Reply with the whole edited text only." },
        { role: "user", content: String(text).trim() },
    ];
}

// The sentences of `text` that share a run of `n` words with `orig`: the original's
// wording back in the result. Eight words, so that a kept fact ("came in about 4,500
// euros over", the number counting as two words) does not count.
function copiedSentences(orig, text, n = 8) {
    const words = s => (String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const o = words(orig), grams = new Set();
    for (let i = 0; i + n <= o.length; i++) grams.add(o.slice(i, i + n).join(" "));
    const out = [];
    for (const para of String(text || "").split(/\n\s*\n/)) {
        for (const [a, b] of splitSentences(para)) {
            const sentence = para.slice(a, b), w = words(sentence);
            for (let i = 0; i + n <= w.length; i++) {
                if (grams.has(w.slice(i, i + n).join(" "))) { out.push(sentence); break; }
            }
        }
    }
    return out;
}

// Fillers the rewrite tends to add ("ehrlich gesagt"), and for German the plain "nicht
// A, sondern B" and other contrast shapes. CONTRAST_PATTERNS leaves the plain form alone
// for Reword; in a text rewritten from scratch it is flagged.
const WHOLE_TELLS = {
    en: ["honestly", "to be honest", "frankly", "let['\u2019]s be honest"],
    de: ["ehrlich gesagt", "offen gesagt", "mal ehrlich", "seien wir ehrlich"],
};
// The concession move ("Natuerlich kostet das Geld. Aber ..."); the "aber" may come
// later in the second sentence ("Die Rechnung geht aber auf").
const WHOLE_CONCESSIONS = {
    en: ["(?:of course|sure|admittedly|granted|yes),? [^.;:!?]{1,80}?[.!;]\\s+(?:[^.;:!?]{0,40}? )?(?:but|however|still)"],
    de: ["(?:nat\u00fcrlich|klar|sicher|zugegeben|ja),? [^.;:!?]{1,80}?[.!;]\\s+(?:[^.;:!?]{0,40}? )?(?:aber|jedoch|trotzdem)"],
};
// Three short items lined up ("schnell, effizient und sofort"); not a relative or other
// subordinate clause after the comma. A list of facts gets flagged too, and the note
// says to keep them.
const WHOLE_TRIPLETS = {
    en: ["\\p{L}+(?: \\p{L}+)?, (?!(?:which|that|who|whom|whose|when|where|because|to|if) )\\p{L}+(?: \\p{L}+)?,? (?:and|or) \\p{L}+(?: \\p{L}+){0,2}(?=[.,;:!?])"],
    de: ["\\p{L}+(?: \\p{L}+)?, (?!(?:der|die|das|dem|den|dessen|deren|dass|wenn|weil|ob|um|wie|wo|was|als) )\\p{L}+(?: \\p{L}+)?,? (?:und|oder) \\p{L}+(?: \\p{L}+){0,2}(?=[.,;:!?])"],
};
const WHOLE_CONTRASTS = {
    // and "Es geht nicht nur darum, dass X." with its other half left to the next sentence.
    // Also "selten X, sondern Y", "weniger A als B", "nicht A. Es ging eher um B" and
    // the trailing "Meine Haltung war entscheidend, nicht meine L\u00f6sungen."
    de: ["(?:nicht|selten|kaum|nie) [^.;:!?]{1,60}?, sondern", "nicht nur [^.;:!?]{1,80}?[.!]", "weniger [^.;:!?]{1,40}? als [^.;:!?]{1,40}",
        "nicht [^.;:!?]{1,60}?[.!] (?:es|das) (?:geht|ging) (?:eher|vielmehr|darum|um)", "(?<=, )nicht [^.;:!?,]{1,40}?[.!]"],
};

// Pass "spots", found in code: the set-up contrasts and stock phrases left in `text`,
// and with `orig` the sentences copied from it, as notes for the model, or [] when
// there are none.
function wholeSpotNotes(text, lang, orig) {
    const t = String(text || "");
    const contrasts = findContrasts(t, lang);
    for (const m of WHOLE_CONTRASTS[lang] ? t.matchAll(phraseListRe(WHOLE_CONTRASTS[lang])) : []) {
        if (!contrasts.some(c => c.includes(m[0]) || m[0].includes(c))) contrasts.push(m[0]);
    }
    // In German the plain fix must keep the side that is "not" ("Mein Team wollte meine
    // Haltung" lost the solutions the team did not need), and the link of a concession.
    const sides = lang === "de" ? " Keep both sides, as two plain statements: what it is not stays in." : "";
    const notes = contrasts.map(c => `- set-up contrast: "${c}". Say the point directly, without the "not ... but" shape.${sides}`);
    for (const [a, b] of findStockPhrases(t, lang)) {
        const p = t.slice(a, b);
        if (!contrasts.some(c => c.includes(p) || p.includes(c))) notes.push(`- stock phrase: "${p}". Cut it or say it plainly.`);
    }
    for (const m of t.matchAll(phraseListRe(WHOLE_TRIPLETS[lang] || WHOLE_TRIPLETS.en))) notes.push(`- list of three: "${m[0]}". Break the even triplet up: keep the items that are facts, but not as three matching parts in a row.`);
    for (const m of t.matchAll(phraseListRe(WHOLE_CONCESSIONS[lang] || WHOLE_CONCESSIONS.en))) notes.push(lang === "de" ? `- concession: "${m[0]}". Drop only the opening word ("nat\u00fcrlich", "klar", "zugegeben"); keep both facts and the "aber" that links them.`
        : `- concession: "${m[0]}". Give both facts plainly, without the "of course ... but" move.`);
    for (const m of t.matchAll(phraseListRe(WHOLE_TELLS[lang] || WHOLE_TELLS.en))) notes.push(`- filler: "${m[0]}". Cut it; the sentence works without it.`);
    if (orig) for (const c of copiedSentences(orig, t)) notes.push(`- copied from the original: "${c}". Say it in your own plain words, keeping every fact, name and number in it.`);
    return [...new Set(notes)].slice(0, 10);
}

function buildSpotFixMessages(text, lang, notes) {
    return [
        { role: "system", content: `Edit the text (the user message): fix exactly these spots, rewording only the sentence each one is in, and keep the grammar correct:\n${notes.join("\n")}\n`
            + "Every other sentence stays word for word. Don't add new facts. " + wholeWriteIn(lang) + " Reply with the edited text only." },
        { role: "user", content: String(text).trim() },
    ];
}

// Pass "slop" (Rewrite freely): the sentences that only evaluate, sum up or decorate,
// quoted as a list; cutFillerSentences takes them out in code, so the pass can't put
// new filler in.
function buildSlopFindMessages(text, lang) {
    const ex = WHOLE_EXAMPLES[lang] || WHOLE_EXAMPLES.en;
    return [
        { role: "system", content: "You are a strict editor who cuts AI filler. List the sentences of this text that add no fact of their own: "
            + "a sentence that only says what something achieves, creates or protects (\"This X helps / ensures / creates Y\"), one that sums up or evaluates what came before, "
            + "a general remark any text on the topic could make, a saying or stock image (\"piece of the puzzle\", \"two sides of the same coin\"), a chain of abstract nouns. "
            + `Filler looks like ${ex.filler}. `
            + `A sentence that tells what someone does or should do, a fact, a number, a name or the text's main claim is never filler, like ${ex.notFiller}. `
            + "For each filler sentence one bullet: the sentence quoted exactly as it stands, then after \" -> \" why it adds nothing. At most 5. No rewrite. If there is none, reply with exactly: OK" },
        { role: "user", content: String(text).trim() },
    ];
}

// `text` without the sentences quoted in `reply` (buildSlopFindMessages), at most a
// third of its sentences, and never one with a digit, the writer's "I"/"we" or advice
// ("should", "muss") in it (FILLER_KEEP_RE); a paragraph left empty goes. In German a
// sentence that carries the argument on ("aber", "sodass", "deshalb") stays too: cutting
// "Ein Team ... sodass sich der Aufwand amortisiert" left only "Der Anfang ist nicht
// billig", the opposite of the point. Returns the new text and the sentences cut.
const FILLER_KEEP_RE = {
    en: /(?<![\p{L}])(?:i|me|my|we|us|our|should|must|need to|have to)(?![\p{L}])/iu,
    de: /(?<![\p{L}])(?:ich|mich|mir|mein\p{L}*|wir|uns|unser\p{L}*|sollte\p{L}*|soll|sollen|muss|m\u00fcssen|musst|aber|doch|trotzdem|dennoch|sodass|deshalb|daher)(?![\p{L}])/iu,
};
function cutFillerSentences(text, reply, lang) {
    const keep = FILLER_KEEP_RE[lang] || FILLER_KEEP_RE.en;
    const norm = x => String(x || "").replace(/[\u201c\u201d\u201e"]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const quotes = stripThinking(reply).split("\n").map(l => l.trim()).filter(l => /^(?:[-*\u2022]|\d+[.)])\s+\S/.test(l))
        .map(l => norm(l.replace(/^(?:[-*\u2022]|\d+[.)])\s+/, "").replace(/\s+(?:->|\u2192).*$/, ""))).filter(q => q.length > 10);
    const paras = String(text || "").split(/\n\s*\n/);
    const total = paras.reduce((n, p) => n + splitSentences(p).length, 0);
    const cut = [];
    const out = paras.map(p => {
        let kept = "", last = 0;
        for (const [a, b] of splitSentences(p)) {
            const sentence = p.slice(a, b), n = norm(sentence);
            if (cut.length < Math.floor(total / 3) && !/\d/.test(sentence) && !keep.test(sentence) && quotes.some(q => q === n || (q.includes(n) && n.length > 20))) {
                kept += p.slice(last, a);
                cut.push(sentence.trim());
            } else kept += p.slice(last, b);
            last = b;
        }
        return (kept + p.slice(last)).replace(/[ \t]{2,}/g, " ").trim();
    }).filter(Boolean);
    return { text: out.join("\n\n"), cut };
}

// Pass "proof": grammar and spelling only.
function buildProofreadMessages(text, lang) {
    const name = wholeLanguage(lang) || "the language of the text";
    return [
        { role: "system", content: `Proofread this ${name} text. Correct only real mistakes: grammar, agreement, word order, spelling, a missing or wrong word, and punctuation that is wrong. `
            + "Keep the wording, the informal phrasing, the sentence lengths and the order exactly as they are: casual is not a mistake, and don't make the text more polished or formal. "
            + "If there is nothing to correct, reply with the text unchanged. Reply with the text only." },
        { role: "user", content: String(text).trim() },
    ];
}

// Pass "proof", German: the model lists the mistakes it finds, each with its fix, and the
// code applies them (applyProofFixes). Asked for the whole text back, it returned it
// unchanged even around a known slip: a long text that is mostly right looks fine to it.
function buildProofFindMessages(text) {
    return [
        { role: "system", content: "Lies den Text und finde echte Fehler: Grammatik (Fall, Einzahl/Mehrzahl, Verbform), ein fehlendes Verb oder Wort, ein falsches Wort, ein Satz, der so keinen Sinn ergibt. "
            + "Stil, Satzl\u00e4nge und lockere W\u00f6rter sind keine Fehler. Antworte mit einer Zeile pro Fehler: - \"genaues Zitat aus dem Text\" -> \"korrigiert\". Gibt es keinen Fehler, antworte nur OK." },
        { role: "user", content: String(text).trim() },
    ];
}

// The fixes of a proof find list (`- "quote" -> "fix"`) applied to `text`. A line counts
// only as a small edit of words found once in the text: a note in the fix ("(Hinweis: kein
// Fehler ...)") goes, a line that repeats its quote is skipped, and so is a fix that
// changes a number, also one inside a word ("dreistelligen" -> "f\u00fcnfstelligen": a
// proofreading never corrects facts), keeps less than 60 % of the quote's words (two
// may change in a short one: "keine gro\u00dfe Zeit" -> "nicht viel Zeit") or changes more
// than four words (or 40 % of a long quote). Returns the text, the `fixes` applied as
// [quote, fix] and how many lines were `listed`.
function applyProofFixes(text, reply) {
    let t = String(text || "");
    const fixes = [];
    let listed = 0;
    const line = /^\s*(?:[-*\u2022]|\d+[.)])?\s*["\u201c\u201e]([^"\u201c\u201d\u201e\n]+)["\u201c\u201d]\s*(?:->|\u2192)\s*["\u201c\u201e]([^"\u201c\u201d\u201e\n]*)["\u201c\u201d]/gm;
    const words = x => (x.match(/[\p{L}\p{N}]+/gu) || []).length;
    const stems = x => (x.toLowerCase().match(/zwei|drei|vier|f\u00fcnf|sechs|sieben|acht|neun|zehn|elf|zw\u00f6lf|zwanzig|drei\u00dfig|hundert|tausend|million|milliard/g) || []).sort().join();
    for (const [, q, raw] of stripThinking(reply).matchAll(line)) {
        listed++;
        const f = raw.replace(/\s*\((?:Hinweis|Anmerkung|kein Fehler|Note)\b[^)]*\)?\s*$/i, "").trim();
        if (!f || f === q.trim() || t.split(q).length !== 2) continue;
        if (missingNumbers(q, f).length || addedNumbers(q, f).length || stems(q) !== stems(f)) continue;
        const n = words(q), kept = wordDiff(q, f).common;
        if (kept < Math.min(0.6 * n, n - 2) || Math.max(n, words(f)) - kept > Math.max(4, Math.ceil(0.4 * n))) continue;
        t = t.replace(q, () => f);
        fixes.push([q, f]);
    }
    return { text: t, fixes, listed };
}

// Pass "facts": what the rewrite got wrong against the original (and the writer's
// details), as a list, or "OK". What a rewrite is meant to drop (a repeated point, a
// moral, a closing summary, a weaker argument) and the marked illustration are named
// as not errors, so that the fix doesn't put them back. With `free` (Rewrite freely) a
// dropped point and an added typical example are never errors either; a point kept
// must still be right; `gone` (Rewrite freely) are the original's numbers the rewrite no
// longer has, each an error only where the rewrite still makes its point.
function buildFactCheckMessages(orig, text, lang, details, free, gone) {
    const name = wholeLanguage(lang) || "the language of the text";
    const d = String(details || "").replace(/\s+/g, " ").trim().slice(0, 600);
    const lost = free && gone && gone.length ? `These numbers of the original are no longer in the rewrite: ${gone.join(", ")}. `
        + "Where the rewrite still makes the point a number belongs to, the missing number is an error: list it. " : "";
    return [
        { role: "system", content: "You compare an original text with a rewrite of it. List only real errors in the rewrite:\n"
            + (free ? "- a fact, name, number, date or amount that the rewrite keeps but changed, and an apology, promise or request of the original that is missing or changed\n"
                + "- a point that now says the opposite of the original, or a position of the writer turned around\n"
                : "- a fact, name, number, date, amount, apology, promise or request of the original that is missing or changed\n")
            + "- a reason or cause stated differently from the original\n"
            + "- a form of address (formal or informal) that differs from the original\n"
            + `- a grammar mistake or a word that doesn't exist in ${name}\n`
            + `- a fact, number, name or event that the original doesn't have (a short typical illustration marked with ${(WHOLE_EXAMPLES[lang] || WHOLE_EXAMPLES.en).illustrate} is fine)\n`
            + (free ? "" : "- a point, recommendation or conclusion of the original that is missing (unless it only repeated what the text had already said)\n")
            + "Not errors: style, order, length, the same fact said in other words or split over two sentences (\"It should have arrived on the 6th. It didn't.\" says it didn't arrive as agreed on the 6th), "
            + "a softer degree word (\"rarely\" for \"very rarely\"), a sentence cut because it repeated a point, a dropped saying or moral, a closing line that only summed up, "
            + "a plainer, less emphatic wording of an apology, thanks or courtesy, an opinion now marked as the writer's own (\"I think\"), "
            + "and a weaker argument merged into another. "
            + (free ? "The rewrite was allowed to change the content: a dropped or merged point, a new order, and an added typical example (no names, figures or dates) are not errors either. " : "")
            + lost
            + "Write one bullet per error, in the form: - \"words from the rewrite\" -> what is wrong. "
            + "Don't list what is correct or acceptable, and don't explain your reasoning. If there is no error, reply with exactly: OK" },
        { role: "user", content: `Original:\n${String(orig).trim()}\n\n` + (d ? `Details the writer added (these may appear in the rewrite; check them too):\n${d}\n\n` : "") + `Rewrite:\n${String(text).trim()}` },
    ];
}

// The numbers of `orig` (digits, with their inner separators: "4,500", "6", "23", "24/7")
// that `text` no longer has, found in code as a check on the model's fact check. One
// written out in `text` ("twelve-hour" for "12-hour", "zw\u00f6lf") counts as kept; 1 is left
// out, "one" and "ein" being everywhere.
const NUMBER_WORDS = { 2: "two|zwei", 3: "three|drei", 4: "four|vier", 5: "five|f\u00fcnf", 6: "six|sechs", 7: "seven|sieben", 8: "eight|acht", 9: "nine|neun", 10: "ten|zehn", 11: "eleven|elf", 12: "twelve|zw\u00f6lf", 13: "thirteen|dreizehn", 14: "fourteen|vierzehn", 15: "fifteen|f\u00fcnfzehn", 16: "sixteen|sechzehn", 17: "seventeen|siebzehn", 18: "eighteen|achtzehn", 19: "nineteen|neunzehn", 20: "twenty|zwanzig", 30: "thirty|drei\u00dfig", 40: "forty|vierzig", 50: "fifty|f\u00fcnfzig", 60: "sixty|sechzig", 70: "seventy|siebzig", 80: "eighty|achtzig", 90: "ninety|neunzig", 100: "a hundred|one hundred|hundert" };
// The written-out forms of `n`, as a regex alternation, or "": NUMBER_WORDS, and from
// 21 to 99 the compounds ("twenty-five", "f\u00fcnfundzwanzig").
function numberWords(n) {
    const v = Number(n), tens = NUMBER_WORDS[v - v % 10], unit = NUMBER_WORDS[v % 10] || "one|ein";
    if (NUMBER_WORDS[n] || !(v > 20 && v < 100 && v % 10 && tens)) return NUMBER_WORDS[n] || "";
    const [te, td] = tens.split("|"), [ue, ud] = unit.split("|");
    return `${te}[- ]?${ue}|${ud}und${td}`;
}

function missingNumbers(orig, text) {
    // "11:00" and "11.00" are the same time as "11".
    const nums = s => [...new Set((String(s || "").match(/\d+(?:[.,/:]\d+)*/g) || []).map(n => n.replace(/[:.]00$/, "")))];
    const t = String(text || ""), have = new Set(nums(t));
    const said = n => numberWords(n) && new RegExp(`(?<![\\p{L}])(?:${numberWords(n)})(?![\\p{L}])`, "iu").test(t);
    return nums(orig).filter(n => !have.has(n) && !said(n));
}

// Frequent words of five letters or more that say nothing about a sentence's point.
const REPEAT_COMMON = "nicht nichts keine keinen einem einer eines diese dieser dieses diesem jetzt immer schon wieder sollte sollten sollen m\u00fcssen muss m\u00fcsste k\u00f6nnen kann k\u00f6nnte werden wurde wurden haben hatte hatten waren w\u00e4re durch \u00fcber unter zwischen wegen meiner meine meinen deine eure ihrer unsere unser einfach etwas viele vielen mehrere andere anderen weniger mehr besser gerade dabei damit dann denn deshalb sowie zudem schauen machen geben gehen kommen nehmen \u00e4ndern about after again against because before being below between could doing during every from further having other their there these they those through under until which while would should shall might must where what when whom whose really still often always never something anything everything people things thing great";
// Pairs of sentences in `text` that say the same thing: of the words of five letters or
// more (not REPEAT_COMMON), the shorter sentence (four such words at least) shares 60 % with the other. A
// question is left out (a closing question may echo the opening on purpose), and so is a
// pair the original also had: saying it twice was the writer's choice.
function repeatedSentences(orig, text) {
    const sentences = t => String(t || "").split(/\n\s*\n/).flatMap(p => splitSentences(p).map(([a, b]) => p.slice(a, b).trim()));
    const common = new Set(REPEAT_COMMON.split(" "));
    const words = x => new Set((x.toLowerCase().match(/\p{L}{5,}/gu) || []).filter(w => !common.has(w)));
    const same = (a, b) => Math.min(a.size, b.size) >= 4 && [...a].filter(w => b.has(w)).length / Math.min(a.size, b.size) >= 0.6;
    const o = sentences(orig).map(words), t = sentences(text).filter(x => !/\?\W*$/.test(x)), w = t.map(words), out = [];
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
        if (!same(w[i], w[j])) continue;
        const inOrig = o.some((a, k) => same(w[i], a) && o.some((b, l) => l !== k && same(w[j], b)));
        if (!inOrig) out.push([t[i], t[j]]);
    }
    return out;
}

// The numbers in `text` the original never had ("3 a.m." for "24/7"): the rewrite made
// them up. A number the original wrote out ("twelve") counts as its own.
function addedNumbers(orig, text) {
    return missingNumbers(text, orig);
}

// A fact-check "error" that is about style, not content (a metaphor, a saying, a
// contrast, the tone): such points never reach the fix. A weaker promise ("guarantee"
// -> "should") is content and stays.
const STYLE_ONLY_RE = /\b(?:metaphors?|sayings?|idioms?|proverbs?|contrasts?|rhetorical|tone|register|phrasing|wording|stylistic|emphasis|emphatic|formal(?:ity)?|informal|nuance)\b/i;

function isFactError(item) {
    return !STYLE_ONLY_RE.test(String(item || "").split(/->|\u2192/).slice(1).join(" ") || String(item || ""));
}

// The errors in a fact check's reply, one per line, or [] when it found none.
function factCheckErrors(reply) {
    const t = stripThinking(reply).trim();
    const bullet = /^(?:[-*\u2022]|\d+[.)])\s+(?=\S)/;
    let items = t.split("\n").map(l => l.trim()).filter(l => bullet.test(l)).map(l => "- " + l.replace(bullet, ""));
    // Only the arrow lines count when there are any, and a line that calls its point
    // fine ("This is a reasonable summary") is never an error.
    const arrows = items.filter(l => /->|\u2192/.test(l));
    if (arrows.length) items = arrows;
    items = items.filter(l => !/\b(?:not an error|no error|is (?:accurate|correct|fine|acceptable|ok)|valid paraphrase|reasonable (?:summary|paraphrase))\b/i.test(l));
    if (items.length) return items.slice(0, 10);
    // No list: "OK" (in any dress) means no errors, a sentence that isn't one is one error.
    if (!t || /^[*_\s]*ok\b/i.test(t) || bullet.test(t)) return [];
    return ["- " + t.replace(/\s+/g, " ").slice(0, 300)];
}

// Pass "fix": correct exactly the errors found. The original is there for its facts
// only, and the prompt says so.
function buildFactFixMessages(orig, text, lang, errors) {
    return [
        { role: "system", content: `An editor found errors in a rewritten text. Edit the rewritten text (the user message) to fix exactly these errors:\n${errors.join("\n")}\n\n`
            + "Change only the words the errors are about: every other sentence stays word for word as it is in the rewritten text. "
            + "An invented detail is removed; a missing fact is added back in a few plain words, in the rewrite's plain style. "
            + "The text must still make sense as a whole: if a fix makes the next or previous sentence repeat or contradict it, adjust or drop that sentence. "
            + "Never copy a sentence from the original: it is there so you can check facts, and its wording is what the rewrite replaced. "
            + wholeWriteIn(lang) + ` Reply with the corrected text only.\n\nThe original, for checking facts only:\n${String(orig).trim()}` },
        { role: "user", content: String(text).trim() },
    ];
}

// The longest run of sentences in a row (inside one paragraph) that start with the same
// two words ("You can see ... You can download ..."), as { n, words }.
function sameOpenerRun(text, k = 2) {
    let best = { n: 0, words: "" };
    for (const para of String(text || "").split(/\n\s*\n/)) {
        let prev = null, n = 0;
        for (const [a, b] of splitSentences(para)) {
            const ws = (para.slice(a, b).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).slice(0, k), w = ws.join(" ");
            n = ws.length === k && w === prev ? n + 1 : 1;
            prev = w;
            if (n > best.n) best = { n, words: w };
        }
    }
    return best;
}

// A model commenting on the text instead of writing it ("though the text does not
// specify which product, survey, or baseline this figure compares to", "Wir lassen hier
// die Kosten weg"). "The original" counts only as a noun of its own ("the original
// says", "as in the original."), not in "The original plan had us open five days".
const META_COMMENT_RE = /\b(?:the (?:original|rewrite|rewritten text|source text)(?=[,.;:)]| text\b| (?:does not|doesn't|did not|says|states|mentions|specifies|gives|provides|names|lists)\b)|the (?:text|passage|author) (?:does not|doesn't|did not|says|states|mentions|specifies|gives|provides)\b|(?:der|im|vom|dem) (?:Originaltext|Ausgangstext|Original)\b|der Text (?:nennt|sagt|gibt|erw\u00e4hnt|enth\u00e4lt) (?:nicht|keine?n?)\b|(?:lassen wir|lasse ich|wir lassen|ich lasse) [^.!?]{0,60}?(?:weg|au(?:ss|\u00df)en vor)\b|(?:we|I)(?:['\u2019]ll| will)? (?:leave|set|skip) [^.!?]{0,40}?(?:aside|out)\b)/i;

// Is `reply` a usable result of a text-producing pass? `orig` is the text's body as it
// came in, `prev` the text the pass was given. The rewrite may change everything but
// must stay roughly as long as the original, in its language and form of address; a
// later pass that was told to touch only a few spots must stay close to `prev`, and a
// fix that went back to the original's wording is refused. The rewrite of a letter's body
// (`letter`) may come down to a quarter when it keeps every number: an honest rewrite of a
// newsletter full of empty courtesy came to 0.28 of it.
function acceptWholeRewrite(orig, prev, reply, lang, pass, letter) {
    let t = stripThinking(reply);
    const o = String(orig || "").trim(), p = String(prev || "").trim();
    if (t.length > 1 && /^["'\u201c\u201e]/.test(t) && /["'\u201c\u201d]$/.test(t) && !/^["'\u201c\u201e]/.test(p)) t = t.slice(1, -1).trim();
    if (!t) return { ok: false, reason: "empty reply" };
    const lead = x => (x.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).slice(0, 3).join(" ");
    if (PREAMBLE_RE.test(t) && !(PREAMBLE_RE.test(p) && lead(t) === lead(p))) return { ok: false, reason: "the model added an introduction" };
    // A later pass is measured against the text it was given: a free rewrite may already
    // be much shorter than the original.
    const short = pass === "rewrite" && letter && !missingNumbers(o, t).length ? 0.25 : 0.3;
    if (t.length / Math.max(1, (pass === "rewrite" ? o : p).length) < short) return { ok: false, reason: "reply much shorter than the original" };
    if (t.length / Math.max(1, o.length) > 1.8) return { ok: false, reason: "reply much longer than the original" };
    const got = lang ? detectLanguage(t) : null;
    if (got && got !== lang) return { ok: false, reason: `the model answered in ${LANGUAGE_NAMES[got]} instead of ${LANGUAGE_NAMES[lang]}` };
    if (lang === "de") {
        const was = addressForms(o), switched = [...addressForms(t)].filter(f => !was.has(f));
        if (was.size && switched.length) return { ok: false, address: [...was][0], reason: `the model switched the form of address to "${switched[0]}"` };
    }
    const meta = t.match(META_COMMENT_RE);
    if (meta && !META_COMMENT_RE.test(o)) return { ok: false, reason: `the model commented on the text ("${meta[0]}")` };
    // Echoing the original back is no rewrite.
    if (pass === "rewrite" && wordDiff(o, t).ratio < 0.3) return { ok: false, reason: "the model barely changed the text" };
    if (pass !== "rewrite") {
        const toPrev = wordDiff(p, t).ratio, toOrig = wordDiff(o, t).ratio;
        if (toPrev === 0) return { ok: false, unchanged: true, reason: "the model changed nothing" };
        // Closer to the original than to what it was given: back to the original, when it
        // is clearly that or the edit is otherwise small; an unrelated reply is far off both.
        if (toOrig < toPrev && (toOrig < 0.3 || toPrev <= 0.6)) return { ok: false, reason: "the model went back to the original wording" };
        if (toPrev > 0.6) return { ok: false, reason: "the model rewrote far more than it was asked to" };
        // Only the fact fix may shorten (an invented detail goes), and the English passes
        // of Plainer that cut verdicts and set-ups; the other passes keep the text's points.
        const words = x => (x.match(/[\p{L}\p{N}]+/gu) || []).length;
        const floor = pass === "fix" ? 0 : pass === "verdicts" || pass === "alternatives" ? 0.5 : 0.8;
        if (words(t) < floor * words(p)) return { ok: false, reason: "the model cut part of the text" };
        // Chopping a sentence into a row of "You can ... You can ..." reads as a list; the
        // fix is let through, since a fact counts for more.
        // German also by the first word alone: "Sie sehen ... Sie k\u00f6nnen ... Sie m\u00fcssen ...".
        const run = sameOpenerRun(t), one = lang === "de" ? sameOpenerRun(t, 1) : { n: 0 };
        if (pass !== "fix" && pass !== "split" && run.n >= 3 && run.n > sameOpenerRun(p).n) return { ok: false, run: run.words, reason: `the model started ${run.n} sentences in a row with "${run.words}"` };
        if (pass !== "fix" && pass !== "split" && one.n >= 4 && one.n > sameOpenerRun(p, 1).n) return { ok: false, run: one.words, reason: `the model started ${one.n} sentences in a row with "${one.words}"` };
        // "words" may not split sentences; now and then two main clauses joined by a comma.
        if (pass === "words") {
            const count = x => x.split(/\n\s*\n/).reduce((k, q) => k + splitSentences(q).length, 0);
            if (count(t) > count(p) + Math.ceil(count(p) / 4)) return { ok: false, split: true, reason: "the model split sentences" };
        }
        // A later pass may not lose a figure the text still had.
        const lost = missingNumbers(p, t).filter(n => !missingNumbers(o, p).includes(n) && o.includes(n));
        if (lost.length) return { ok: false, reason: `the model dropped the number ${lost[0]}` };
    }
    return { ok: true, text: t, change: wordDiff(o, t).ratio };
}

// Run the passes of WHOLE_PASSES on `text` (in language `lang`; `o` holds tone, extra
// and details). `chat(passId, messages, maxTokens, think)` returns the model's reply;
// `think` ("low") asks for a short reasoning trace (English text with Plainer on). Only
// the body of a letter goes to the model (splitLetterFrame). Each text reply is checked by
// acceptWholeRewrite: a refused pass leaves the text as it was before it, a refused
// rewrite gets one second try (and, when both copied the text, a draft written from
// notes of it), and if that fails too `info.failed` says why and the body
// comes back unchanged. If `chat` throws, the text of the passes that finished is kept:
// `info.stopped` (an AbortError) or `info.error` says so. Returns the frame, the new
// `body` and `info` for the report.
async function wholeRewrite(text, lang, o, chat) {
    o = o || {};
    const info = { free: !!o.free, cut: [], passes: [], errors: [], remaining: [], missing: [], fixed: false, failed: null, stopped: false, error: null, letter: false, change: 0, before: 0, after: 0, spotsFound: 0, spotsLeft: 0, flagged: 0, kind: null };
    const frame = splitLetterFrame(text);
    const orig = frame.body;
    info.letter = frame.letter;
    info.before = info.after = orig.length;
    if ((orig.match(/\p{L}/gu) || []).length < WHOLE_MIN_LETTERS) { info.failed = "the text is too short to rewrite as a whole"; return { frame, body: orig, info }; }
    let cur = orig;
    const notesTokens = 700, textTokens = Math.min(4096, 128 + Math.ceil(orig.length * 0.9));
    const use = (id, reply) => {
        // A letter's frame is put back afterwards: one the model wrote anyway goes.
        if (frame.letter) reply = splitLetterFrame(stripThinking(String(reply || "")).trim()).body;
        const v = acceptWholeRewrite(orig, cur, reply, lang, id, frame.letter);
        if (v.ok) cur = v.text;
        info.passes.push({ id, ok: v.ok, reason: v.ok ? "" : v.reason });
        return v;
    };
    // An editing pass on the current text (`build(cur)` makes its messages). A reply
    // refused for a row of sentences opening alike gets one second try with a note
    // naming it: the pass itself is wanted (German Plainer carries most of its effect).
    const edit = async (id, build, think) => {
        let v = use(id, await chat(id, build(cur), textTokens, think));
        if (!v.ok && (v.run || v.split)) {
            info.passes.pop();
            const note = v.split ? "Deine erste Antwort hat S\u00e4tze geteilt. Teile keinen Satz; \u00e4ndere nur die W\u00f6rter."
                : lang === "de" ? `Deine erste Antwort hatte mehrere S\u00e4tze hintereinander, die mit "${v.run}" beginnen. Stell sie um oder verbinde zwei davon, damit keine zwei S\u00e4tze hintereinander gleich anfangen.`
                : `Your first answer had several sentences in a row starting with "${v.run}". Reword or join them so that no two sentences in a row start the same way.`;
            const m = build(cur);
            v = use(id, await chat(id, [{ ...m[0], content: m[0].content + "\n" + note }, ...m.slice(1)], textTokens, think));
        }
        return v;
    };
    const bullets = t => (String(t).match(/^\s*(?:[-*\u2022]|\d+[.)])\s+\S/gm) || []).length;
    try {
        const critique = stripThinking(await chat("critique", buildCritiqueMessages(orig), notesTokens));
        const plan = o.free ? stripThinking(await chat("plan", buildPlanMessages(orig, lang, critique, frame.letter), notesTokens)) : "";
        const ro = { ...o, critique, plan, letter: frame.letter };
        // The English passes of Plainer were worked out on a rewrite written with thinking.
        const think = o.plain && lang === "en" ? "low" : undefined;
        let v = use("rewrite", await chat("rewrite", buildWholeRewriteMessages(orig, lang, ro), textTokens, think));
        if (!v.ok) {
            const retry = v.address ? `Your first answer changed how the reader is addressed. The text says "${v.address}"; keep exactly that form.`
                : /barely changed/.test(v.reason) ? "Your first answer copied most of the text word for word. Write every sentence anew, in your own words: copy no sentence of the text."
                : `Your first answer was refused (${v.reason}). Avoid that this time.`;
            info.passes.pop();
            v = use("rewrite", await chat("retry", buildWholeRewriteMessages(orig, lang, { ...ro, retry }), textTokens, think));
            if (!v.ok && /barely changed/.test(v.reason)) {
                const outline = stripThinking(await chat("outline", buildOutlineMessages(orig, lang), textTokens)).trim();
                info.passes.pop();
                v = use("rewrite", await chat("draft", buildWholeRewriteMessages(outline || orig, lang, { ...ro, fromNotes: !!outline }), textTokens, think));
            }
            if (!v.ok) { info.failed = v.reason; return { frame, body: orig, info }; }
        }
        // At most a third of the sentences: a review that flags nearly all of them makes
        // the sentences pass a second, choppier rewrite.
        const sentences = cur.split(/\n\s*\n/).reduce((n, p) => n + splitSentences(p).length, 0);
        const review = stripThinking(await chat("review", buildSentenceReviewMessages(cur, Math.max(1, Math.min(6, Math.ceil(sentences / 3)))), notesTokens));
        info.flagged = bullets(review);
        if (info.flagged) await edit("sentences", t => buildSentenceFixMessages(t, lang, review));
        // A number the free rewrite dropped may have gone with its point: the fact check
        // gets the list and decides. (Checked one paragraph at a time against the whole
        // original, it found more changed meanings in known cases, but not in fresh texts,
        // at two to three times the time.)
        const factCheck = async id => factCheckErrors(await chat(id, buildFactCheckMessages(orig, cur, lang, o.details, o.free, missingNumbers(orig, cur)), notesTokens)).filter(isFactError);
        // Found in code, not by the model, and listed first: a number lost (unless the
        // rewrite was free) or made up, a point said twice.
        const found = () => (o.free ? [] : missingNumbers(orig, cur).map(n => `- the number "${n}" of the original is missing -> put it back where it belongs`))
            .concat(addedNumbers(orig, cur).map(n => `- "${n}" is not in the original -> take it out, or say what the original says`),
                repeatedSentences(orig, cur).map(([a, b]) => `- "${b}" says again what "${a}" says -> say it once, unless the second adds something`));
        info.errors = found().concat(await factCheck("facts")).slice(0, 12);
        if (info.errors.length) {
            info.fixed = use("fix", await chat("fix", buildFactFixMessages(orig, cur, lang, info.errors), textTokens)).ok;
            // What a second check finds goes to the report, not to another round of fixes.
            if (info.fixed) info.remaining = await factCheck("recheck");
        }
        const spots = wholeSpotNotes(cur, lang, orig);
        info.spotsFound = spots.length;
        if (spots.length) use("spots", await chat("spots", buildSpotFixMessages(cur, lang, spots), textTokens));
        // One more round for the spots the model passed over.
        let left = spots.length ? wholeSpotNotes(cur, lang, orig) : [];
        if (left.length) {
            use("spots", await chat("spots", buildSpotFixMessages(cur, lang, left), textTokens));
            left = wholeSpotNotes(cur, lang, orig);
        }
        info.spotsLeft = left.length;
        if (o.free || o.cutFiller) {
            const c = cutFillerSentences(cur, await chat("slop", buildSlopFindMessages(cur, lang), notesTokens), lang);
            if (c.cut.length) { cur = c.text; info.cut = c.cut; }
        }
        if (o.plain && (lang === "de" || lang === "en")) {
            if (lang === "de") {
                await edit("words", t => buildPlainRuleMessages(t, PLAIN_DE_WORDS));
                let split = cur;
                const long = longSentences(cur);
                info.splits = [0, long.length];
                for (const s of long) {
                    const t = acceptSplit(s, await chat("split", buildSplitMessages(s), Math.min(600, 64 + s.length)));
                    if (t && !/^\W*nein\b/i.test(stripThinking(await chat("splitcheck", buildSplitCheckMessages(s, t), 80)))) { split = split.replace(s, () => t); info.splits[0]++; }
                }
                if (split !== cur) use("split", split);
                const run = [sameOpenerRun(cur), sameOpenerRun(cur, 1)].find((r, i) => r.n >= (i ? 3 : 2));
                if (run) use("openers", await chat("openers", buildPlainRuleMessages(cur, plainOpenerRule(run.words)), textTokens));
            } else {
                // The kind is read from the original: the rewrite may have cut what shows it.
                const kind = parseTextKind(await chat("kind", buildTextKindMessages(orig), 16));
                info.kind = kind ? TEXT_KINDS[kind].id : null;
                for (const p of WHOLE_PLAIN_EN) await edit(p.id, t => buildOneRuleMessages(t, p.id === "speaker" && kind ? speakerRule(kind) : p.rule), think);
            }
            const errs = found().filter(e => !/^- the number /.test(e)).concat(await factCheck("facts")).slice(0, 12);
            if (errs.length) {
                info.errors = info.errors.concat(errs);
                use("fix", await chat("fix", buildFactFixMessages(orig, cur, lang, errs), textTokens));
                // A fix that put a point back can bring the original's sentence with it.
                const again = wholeSpotNotes(cur, lang, orig);
                if (again.length) use("spots", await chat("spots", buildSpotFixMessages(cur, lang, again), textTokens));
            }
        }
        if (lang === "de") {
            const p = applyProofFixes(cur, await chat("proof", buildProofFindMessages(cur), notesTokens));
            info.proofed = [p.fixes.length, p.listed];
            if (p.fixes.length) use("proof", p.text);
        } else {
            use("proof", await chat("proof", buildProofreadMessages(cur, lang), textTokens));
            // Unchanged is the usual answer here, not a refusal.
            const last = info.passes[info.passes.length - 1];
            if (last.id === "proof" && last.reason === "the model changed nothing") info.passes.pop();
        }
        info.missing = missingNumbers(orig, cur);
    } catch (e) {
        if (e && e.name === "AbortError") info.stopped = true;
        else info.error = e;
    }
    cur = greetingCase(frame.head, orig, cur, lang);
    info.change = wordDiff(orig, cur).ratio;
    info.after = cur.length;
    return { frame, body: cur, info };
}

// The chat request body for one pass, as buildRewriteBody makes it for a passage.
// `think` ("low") turns thinking on at that effort; the trace comes back apart from the
// reply or is stripped.
function buildChatBody(model, messages, temperature, noKwargs, think) {
    const body = { model: model || "local-model", messages: withNoHiddenMarks(messages), temperature, stream: false };
    if (!noKwargs) body.chat_template_kwargs = think ? { enable_thinking: true, reasoning_effort: think } : { enable_thinking: false };
    return body;
}

// ========== Stage 3: typos ==========

const KEYBOARDS = {
    qwertz: ["qwertzuiop\u00fc", "asdfghjkl\u00f6\u00e4", "yxcvbnm"],
    qwerty: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
    azerty: ["azertyuiop", "qsdfghjklm", "wxcvbn"],
};

// Letters next to `ch` on the layout: same row left/right, and the touching keys of the
// rows above and below (staggered: up = same and next column, down = previous and same).
function keyNeighbors(ch, layout) {
    const rows = KEYBOARDS[layout] || KEYBOARDS.qwertz;
    const lower = ch.toLowerCase();
    for (let r = 0; r < rows.length; r++) {
        const c = rows[r].indexOf(lower);
        if (c < 0) continue;
        const near = [rows[r][c - 1], rows[r][c + 1]];
        if (r > 0) near.push(rows[r - 1][c], rows[r - 1][c + 1]);
        if (r < rows.length - 1) near.push(rows[r + 1][c - 1], rows[r + 1][c]);
        return near.filter(Boolean);
    }
    return [];
}

// Ranges no typo may touch: fenced code, inline code, URLs, e-mail addresses.
function protectedRanges(text) {
    const ranges = [];
    const add = re => { for (const m of text.matchAll(re)) ranges.push([m.index, m.index + m[0].length]); };
    add(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(\n\2[^\n]*|$)/g);
    add(/`[^`\n]+`/g);
    add(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi);
    add(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
    return ranges;
}

// Typo kinds and how often each is picked. Kinds that don't fit a word are skipped
// and the rest re-weighted. German adds the slips German typists make most.
const TYPO_WEIGHTS = {
    default: { neighbor: 0.33, swap: 0.24, drop: 0.12, double: 0.11, case: 0.05, shift: 0.06, repeat: 0.04, space: 0.05 },
    de: { neighbor: 0.19, swap: 0.13, drop: 0.08, double: 0.07, case: 0.03, shift: 0.05, repeat: 0.03, space: 0.03,
        nounCase: 0.08, ending: 0.09, nTail: 0.09, dass: 0.06, comma: 0.06, eszett: 0.01 },
};
const TYPO_NAMES = {
    neighbor: "neighbouring key", swap: "swapped letters", drop: "missing letter", double: "doubled letter",
    case: "missing capital", shift: "two capitals", repeat: "repeated word", space: "missing space",
    nounCase: "noun in lower case", ending: "-em/-en mixed up", nTail: "an n too many or missing",
    dass: "das/dass", comma: "missing comma", eszett: "\u00df as ss",
};
// German articles and pronouns whose -em/-en endings get mixed up ("mit einen Freund").
const GERMAN_DETERMINER_RE = /^(?:d|ein|kein|mein|dein|sein|ihr|unser|eur|dies|jen|jed|welch|manch|solch|all)e[mn]$/;
// German conjunctions that take a comma before them, a comma typists often leave out.
const GERMAN_COMMA_WORDS = ["dass", "weil", "obwohl", "damit", "wenn", "ob", "sondern", "aber", "als", "bevor", "nachdem", "sodass", "falls", "w\u00e4hrend"];
const LETTER_KINDS = ["neighbor", "swap", "drop", "double"];

// One typo in `word` (letters only): the new word, or null when the kind doesn't fit.
function makeTypo(word, kind, layout, rng, sentenceStart) {
    const pick = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    const n = word.length;
    if (LETTER_KINDS.includes(kind) && n < 4) return null;
    if (kind === "case") {
        if (!sentenceStart || word[0] === word[0].toLowerCase()) return null;
        return word[0].toLowerCase() + word.slice(1);
    }
    if (kind === "shift") {
        // Shift held a moment too long: "DIese".
        if (n < 3 || !/^\p{Lu}\p{Ll}/u.test(word) || word[1] === "\u00df") return null;
        return word[0] + word[1].toUpperCase() + word.slice(2);
    }
    if (kind === "nounCase") {
        if (sentenceStart || !/^\p{Lu}\p{Ll}+$/u.test(word)) return null;
        return word[0].toLowerCase() + word.slice(1);
    }
    if (kind === "ending") {
        if (!GERMAN_DETERMINER_RE.test(word.toLowerCase())) return null;
        const swapped = word.endsWith("m") ? "n" : word.endsWith("n") ? "m" : word.endsWith("M") ? "N" : "M";
        return word.slice(0, -1) + swapped;
    }
    if (kind === "nTail") {
        if (n >= 5 && /\p{Ll}en$/u.test(word)) return word.slice(0, -1);
        if (n >= 4 && /\p{Ll}e$/u.test(word)) return word + "n";
        return null;
    }
    if (kind === "dass") {
        if (/^dass$/i.test(word)) return word.slice(0, 3);
        if (/^das$/i.test(word)) return word + "s";
        return null;
    }
    if (kind === "eszett") {
        const i = word.indexOf("\u00df");
        return i < 0 ? null : word.slice(0, i) + "ss" + word.slice(i + 1);
    }
    if (kind === "neighbor") {
        for (let tries = 0; tries < 4; tries++) {
            const i = pick(1, n - 1);
            const near = keyNeighbors(word[i], layout);
            if (!near.length) continue;
            let rep = near[Math.floor(rng() * near.length)];
            if (word[i] !== word[i].toLowerCase()) rep = rep.toUpperCase();
            return word.slice(0, i) + rep + word.slice(i + 1);
        }
        return null;
    }
    if (kind === "swap") {
        for (let tries = 0; tries < 4; tries++) {
            const i = pick(1, n - 2);
            if (word[i] !== word[i + 1]) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
        }
        return null;
    }
    if (kind === "drop") {
        const i = pick(1, n - 1);
        return word.slice(0, i) + word.slice(i + 1);
    }
    if (kind === "double") {
        const i = pick(1, n - 1);
        return word.slice(0, i + 1) + word[i] + word.slice(i + 1);
    }
    return null;
}

// Add typing mistakes to `text`. opts.rate is the chance per eligible word (0-1),
// opts.layout a KEYBOARDS key, opts.minGap the fewest words between two typos.
// opts.lang "de" adds the German kinds and makes capitalised words in mid-sentence
// eligible: in German those are mostly nouns, not names.
// Returns the text, marks (offsets into the new text; `typo` names the kind, the label
// is the replaced original) and the edits made (offsets into the input), which
// shiftMarks uses to move earlier marks along.
function addTypos(text, opts, rng) {
    const o = opts || {};
    const rate = Math.max(0, Number(o.rate) || 0);
    const layout = o.layout || "qwertz";
    const minGap = o.minGap ?? 12;
    const german = o.lang === "de";
    const weights = Object.entries(TYPO_WEIGHTS[german ? "de" : "default"]);
    const src = String(text || "");
    const ranges = protectedRanges(src);
    const isProtected = (a, b) => ranges.some(([s, e]) => a < e && b > s);
    // Ordinary text: not touching digits, paths, file names, code, URLs or addresses.
    const plain = (a, b) => {
        const prev = src[a - 1] || "", next = src[b] || "";
        return !/[\d_@/\\]/.test(prev + next)
            && !(next === "." && /\p{L}/u.test(src[b + 1] || ""))
            && !(prev === "." && /\p{L}/u.test(src[a - 2] || ""))
            && !isProtected(a, b);
    };
    let out = "", last = 0, sinceTypo = minGap;
    const marks = [], edits = [];
    for (const m of src.matchAll(/\p{L}+/gu)) {
        const word = m[0], at = m.index, end = at + word.length;
        if (at < last) continue;   // already part of the previous edit
        sinceTypo++;
        // Sentence start: only spaces, quotes or a list bullet since the last full stop,
        // line break or the beginning of the text.
        let p = at - 1;
        while (p >= 0 && /[ \t"'(*_]/.test(src[p])) p--;
        let sentenceStart = p < 0 || /[.!?:\n]/.test(src[p]);
        if (!sentenceStart && /[-+]/.test(src[p])) {
            let q = p - 1;
            while (q >= 0 && /[ \t]/.test(src[q])) q--;
            sentenceStart = q < 0 || src[q] === "\n";
        }
        const capital = word[0] !== word[0].toLowerCase();
        if (!plain(at, end)) continue;
        if (word.length > 1 && word === word.toUpperCase()) continue;   // an acronym
        if (capital && !sentenceStart && !german) continue;              // likely a name
        if (sinceTypo < minGap || rng() >= rate) continue;

        const tryKind = kind => {
            if (kind === "repeat") return word.length >= 2 && !capital ? { from: at, to: end, text: word + " " + word } : null;
            if (kind === "space") {
                if (src[end] !== " ") return null;
                const nm = /^\p{L}+/u.exec(src.slice(end + 1, end + 41));
                if (!nm) return null;
                const next = nm[0], nEnd = end + 1 + next.length;
                if (!plain(end + 1, nEnd) || (next.length > 1 && next === next.toUpperCase())) return null;
                if (!german && next[0] !== next[0].toLowerCase()) return null;
                return { from: at, to: nEnd, text: word + next };
            }
            if (kind === "comma") {
                if (!GERMAN_COMMA_WORDS.includes(word.toLowerCase()) || src[at - 1] !== " " || src[at - 2] !== ",") return null;
                return { from: at - 2, to: end, text: " " + word };
            }
            const t = makeTypo(word, kind, layout, rng, sentenceStart);
            return t && t !== word ? { from: at, to: end, text: t } : null;
        };
        let pool = weights.slice(), edit = null, kind = null;
        while (pool.length && !edit) {
            const total = pool.reduce((sum, [, w]) => sum + w, 0);
            let r = rng() * total, k = 0;
            while (k < pool.length - 1 && r >= pool[k][1]) { r -= pool[k][1]; k++; }
            kind = pool[k][0];
            edit = tryKind(kind);
            pool.splice(k, 1);
        }
        if (!edit || edit.from < last) continue;
        out += src.slice(last, edit.from);
        marks.push({ start: out.length, end: out.length + edit.text.length, kind: "typo", typo: kind, labels: [src.slice(edit.from, edit.to)] });
        edits.push({ at: edit.from, removed: edit.to - edit.from, inserted: edit.text.length });
        out += edit.text;
        last = edit.to;
        sinceTypo = 0;
    }
    out += src.slice(last);
    return { text: out, marks, edits };
}

// Move marks made on a text through edits made to it (sorted by position, not
// overlapping, each removing at least one character). A position inside an edited span
// snaps to the span's new start, or its new end for a mark's end.
function shiftMarks(marks, edits) {
    const move = (pos, isEnd) => {
        let delta = 0;
        for (const e of edits) {
            if (e.at + e.removed <= pos) delta += e.inserted - e.removed;
            else if (e.at < pos) return e.at + delta + (isEnd ? e.inserted : 0);
            else break;
        }
        return pos + delta;
    };
    return marks.map(m => {
        const start = move(m.start, false);
        return { ...m, start, end: m.end === m.start ? start : Math.max(start, move(m.end, true)) };
    });
}

// ========== Copied from HermitUI (../src/script.js) ==========

// Hosts that keep the text on the user's own machine or LAN.
function isLocalEndpoint(rawUrl) {
    let host;
    try { host = new URL(rawUrl).hostname; }
    catch {
        try { host = new URL("https://" + rawUrl).hostname; } catch { return false; }
    }
    host = host.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;            // IPv6 unique-local
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
    if (host === "0.0.0.0") return true;
    if (/^127\./.test(host)) return true;                        // loopback
    if (/^10\./.test(host)) return true;                         // RFC1918
    if (/^192\.168\./.test(host)) return true;                   // RFC1918
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;    // RFC1918
    if (/^169\.254\./.test(host)) return true;                   // link-local
    return false;
}

// Normalize a base URL (or a pasted full chat endpoint) to the given API path.
function apiEndpoint(base, path) {
    let url = base.trim().replace(/\/+$/, "");
    for (const known of ["/chat/completions", "/completions", "/models"]) {
        if (url.endsWith(known)) { url = url.slice(0, -known.length); break; }
    }
    if (!url.endsWith(path)) url += path;
    return url;
}

// A base URL typed without a scheme would be fetched relative to this page.
function normalizeApiUrl(raw) {
    const url = String(raw || "").trim();
    if (!url) throw new Error("Enter an API Base URL first, e.g. http://localhost:9931/v1.");
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url;
    return (isLocalEndpoint("http://" + url) ? "http://" : "https://") + url;
}

// One line of advice under a failed request; the raw error stays visible above it.
// "" means the error already says everything useful.
function chatErrorHint(message, opts) {
    const { apiUrl = "", mixedContent = false } = opts || {};
    const msg = String(message || "");
    const status = Number((msg.match(/^Server Error (\d{3})\b/) || [])[1] || 0);
    if (status === 401 || status === 403) return "The server rejected the request's credentials — check the API key in Settings.";
    if (status === 404) return "Nothing answered at that address — check the API Base URL and the model name in Settings.";
    if (status === 429) return "Rate-limited or out of quota — wait a moment, or check your provider account.";
    if (status >= 500) return "The server failed while handling the request — its own logs will say why.";
    if (!status && /is not valid JSON|JSON\.parse|Unexpected token/i.test(msg)) {
        return "The server answered, but not with JSON — the API Base URL probably points at a web page instead of the API (it usually ends in /v1).";
    }
    if (/context (?:length|size|window)|n_ctx|too many tokens|maximum context/i.test(msg)) {
        return "The paragraph doesn't fit the model's context — raise the server's context size.";
    }
    if (/Failed to fetch|NetworkError|^Load failed$/i.test(msg)) {
        if (mixedContent) return "This page is served over https, so the browser blocks plain-http servers on your network — use localhost, an https endpoint, or open the Cleaner over http.";
        return isLocalEndpoint(apiUrl)
            ? `Couldn't reach ${apiUrl} — make sure the server is running and allows CORS from this page.`
            : `Couldn't reach ${apiUrl} — check the URL and your connection; the provider must also allow requests from a browser (CORS).`;
    }
    return "";
}

// Browsers block http:// requests from an https:// page, loopback exempted.
function isBlockedMixedContent(rawUrl) {
    if (typeof location === "undefined" || location.protocol !== "https:") return false;
    if (!/^http:\/\//i.test((rawUrl || "").trim())) return false;
    let host;
    try { host = new URL(rawUrl).hostname.toLowerCase(); } catch { return false; }
    return !(host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "[::1]" || host === "::1");
}

// The "Server Error NNN: detail" shape chatErrorHint reads, from a failed response.
async function serverError(res) {
    let detail = res.statusText || "";
    try {
        const body = await res.text();
        try {
            const j = JSON.parse(body);
            detail = (j.error && (j.error.message || j.error)) || j.message || j.detail || body;
        } catch { detail = body || detail; }
    } catch { /* keep statusText */ }
    if (typeof detail !== "string") detail = JSON.stringify(detail);
    return new Error(`Server Error ${res.status}: ${detail.slice(0, 300)}`);
}

// @wllama:start
// Accept the three URL shapes people realistically paste and normalize them
// to a direct, CORS-enabled download link. Throws with a human hint otherwise.
function normalizeGgufUrl(raw) {
    let url = (raw || "").trim();
    if (!url) throw new Error("Enter a model URL first.");
    const hf = url.match(/^hf:\/{0,2}([^\/\s]+)\/([^\/\s]+)\/(\S+\.gguf)$/i);
    if (hf) url = `https://huggingface.co/${hf[1]}/${hf[2]}/resolve/main/${hf[3]}`;
    if (!/^https?:\/\//i.test(url)) throw new Error("Not a URL. Use https://… or the hf:user/repo/file.gguf shorthand.");
    // Hugging Face "blob" browser pages aren't downloadable; the same path under /resolve/ is.
    if (/^https:\/\/huggingface\.co\//i.test(url)) url = url.replace(/\/blob\//, "/resolve/");
    if (!/\.gguf(\?.*)?$/i.test(url)) throw new Error("URL must point directly to a single .gguf file.");
    if (/-\d{5}-of-\d{5}\.gguf(\?.*)?$/i.test(url)) throw new Error("Split GGUFs (…-00001-of-000NN.gguf) aren't supported — pick a single-file quant.");
    // Callers parse the result (new URL(url).host); reject what can't be parsed here.
    try { new URL(url); } catch { throw new Error("Not a valid URL."); }
    return url;
}

// The file name shown in labels. decodeURIComponent throws on a malformed escape
// ("%E0"): fall back to the raw text.
function ggufFileName(url) {
    const seg = url.split("?")[0].split("/").pop();
    try { return decodeURIComponent(seg); } catch { return seg; }
}

// The most tokens a rewrite of `passage` may take in the browser: about three times
// its length, so a small model that rambles is cut off early (the reply would be
// refused as too long anyway), plus room for an empty thinking block.
function wllamaMaxTokens(passage) {
    return Math.min(2048, 64 + Math.ceil(String(passage || "").length * 0.75));
}
// @wllama:end

// ========== DOM ==========

if (typeof document !== "undefined") {
    const $ = id => document.getElementById(id);

    // Settings: memory only (strict ephemerality).
    let API_URL = "http://localhost:9931/v1";
    let MODEL_NAME = "";
    let API_KEY = "";
    let kwargsRejected = false;
    // @wllama:start
    // "api" (an OpenAI-compatible server) or "wllama" (a GGUF model in this tab).
    let backendMode = "api";
    let wllamaModelLabel = null;   // file name of the loaded GGUF
    // @wllama:end

    // The last run, so Reroll typos needn't call the model again.
    let last = null;
    let running = null;   // AbortController of the current run
    let showChanges = true;

    $("versionBadge").textContent = "v" + APP_VERSION;

    // ----- theme -----
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    $("themeBtn").addEventListener("click", () => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
    });

    // ----- toast (copied from HermitUI) -----
    let toastTimeout = null;
    function showToast(message, opts) {
        const { error = false } = opts || {};
        let toast = $("toastNotification");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "toastNotification";
            toast.className = "toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.toggle("error", error);
        toast.classList.add("show");
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove("show"), error ? 8000 : 2500);
    }

    function errorText(err) {
        const hint = chatErrorHint(err.message, { apiUrl: API_URL, mixedContent: isBlockedMixedContent(API_URL) });
        return (err.message || "Unknown error") + (hint ? "\n" + hint : "");
    }

    function authHeaders() {
        const h = { "Content-Type": "application/json" };
        if (API_KEY) h.Authorization = "Bearer " + API_KEY;
        return h;
    }

    function updateEndpointBadge() {
        const badge = $("endpointBadge");
        // @wllama:start
        if (backendMode === "wllama") {
            badge.textContent = "🧠 " + (wllamaModelLabel || "no model loaded") + " · in this tab";
            badge.title = "In-browser model (wllama): the text never leaves this tab";
            badge.classList.remove("remote");
            $("remoteWarning").hidden = true;
            return;
        }
        // @wllama:end
        badge.textContent = (MODEL_NAME ? MODEL_NAME + " @ " : "") + API_URL.replace(/^https?:\/\//, "");
        badge.title = API_URL;
        badge.classList.toggle("remote", !isLocalEndpoint(API_URL));
        $("remoteWarning").hidden = isLocalEndpoint(API_URL);
    }
    updateEndpointBadge();

    // ----- settings modal -----
    const modal = $("settingsModal");
    function openSettings() {
        $("settingUrl").value = API_URL;
        $("settingModel").value = MODEL_NAME;
        $("settingKey").value = API_KEY;
        // @wllama:start
        $("settingBackend").value = backendMode;
        syncBackendGroups();
        // @wllama:end
        modal.classList.add("active");
        $("settingUrl").focus();
    }
    function closeSettings() { modal.classList.remove("active"); $("settingsBtn").focus(); }
    $("settingsBtn").addEventListener("click", openSettings);
    $("settingsCancel").addEventListener("click", closeSettings);
    modal.addEventListener("click", e => { if (e.target === modal) closeSettings(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && modal.classList.contains("active")) closeSettings(); });
    $("settingsSave").addEventListener("click", () => {
        let url;
        try { url = normalizeApiUrl($("settingUrl").value); }
        catch (e) { showToast(e.message, { error: true }); return; }
        if (url !== API_URL) kwargsRejected = false;
        API_URL = url;
        MODEL_NAME = $("settingModel").value.trim();
        API_KEY = $("settingKey").value.trim();
        // @wllama:start
        backendMode = $("settingBackend").value;
        // @wllama:end
        updateEndpointBadge();
        closeSettings();
        showToast("Settings saved (for this tab only)");
    });

    async function listModels(base, key, signal) {
        const headers = key ? { Authorization: "Bearer " + key } : {};
        const res = await fetch(apiEndpoint(base, "/models"), { headers, signal });
        if (!res.ok) throw await serverError(res);
        const data = await res.json();
        return (data.data || data.models || []).map(m => (m && (m.id || m.name)) || m).filter(m => typeof m === "string");
    }

    $("testConnectionBtn").addEventListener("click", async () => {
        const btn = $("testConnectionBtn");
        let base;
        try { base = normalizeApiUrl($("settingUrl").value); }
        catch (e) { showToast(e.message, { error: true }); return; }
        btn.disabled = true;
        btn.textContent = "Testing…";
        try {
            const models = await listModels(base, $("settingKey").value.trim(), AbortSignal.timeout(10000));
            const list = $("modelList");
            list.replaceChildren(...models.map(id => Object.assign(document.createElement("option"), { value: id })));
            if (!$("settingModel").value.trim() && models.length) $("settingModel").value = models[0];
            showToast(`✅ Connected — ${models.length} model${models.length === 1 ? "" : "s"} available`);
        } catch (e) {
            const hint = chatErrorHint(e.message, { apiUrl: base, mixedContent: isBlockedMixedContent(base) });
            showToast("❌ " + (e.message || "Connection failed") + (hint ? "\n" + hint : ""), { error: true });
        } finally {
            btn.disabled = false;
            btn.textContent = "Test Connection";
        }
    });

    // @wllama:start
    // ----- in-browser model (wllama), adapted from HermitUI's -wllama build -----
    // The engine version is pinned here only. The -wllama build embeds it (gzip +
    // base64, injected by build.py as window.__WLLAMA_INLINE__), so loading a model
    // needs no network; the unbuilt source imports it from the CDN instead.
    const WLLAMA_CDN_BASE = "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm";
    // Without JSPI (Firefox < 153, Safari) wllama copies the whole GGUF into its 4 GiB
    // wasm heap, where oversized allocations fail unchecked.
    const WLLAMA_HAS_JSPI = typeof WebAssembly !== "undefined" && !!WebAssembly.Suspending;
    const WLLAMA_HAS_WEBGPU = !!navigator.gpu;
    const WLLAMA_NO_JSPI_MAX_BYTES = 3 * 1024 * 1024 * 1024;
    // Firefox polls WebGPU completions on a 100 ms timer, so decode drops below 1 tok/s
    // there (bug 1870699): UA-sniffed on purpose, since it is a bug, not a capability.
    const WLLAMA_SLOW_WEBGPU = WLLAMA_HAS_WEBGPU && /\bFirefox\//.test(navigator.userAgent);
    let WllamaClass = null;
    let wllamaInstance = null;
    let wllamaEngineUrls = null;
    let wllamaDownloadAbort = null;   // set while a model download runs; Load becomes Cancel
    let ggufLinkPending = false;      // the load came from a #gguf= link: close Settings when ready

    function syncBackendGroups() {
        const local = $("settingBackend").value === "wllama";
        $("wllamaGroup").hidden = !local;
        $("apiGroup").hidden = local;
        $("testConnectionBtn").hidden = local;
    }
    $("settingBackend").addEventListener("change", syncBackendGroups);

    (function renderWllamaHints() {
        const notes = [];
        if (!WLLAMA_HAS_JSPI) notes.push("This browser can't stream-load models (no WebAssembly JSPI): GGUF files over ~3 GB will fail. Chrome, Edge and Firefox 153+ can.");
        if (!WLLAMA_HAS_WEBGPU) notes.push("WebGPU is unavailable, so the model runs on the CPU (slower).");
        if (WLLAMA_SLOW_WEBGPU) notes.push("WebGPU is off by default here: in Firefox it is currently slower than the CPU (Firefox bug 1870699).");
        if (!globalThis.crossOriginIsolated) notes.push("Opened as a plain file, the model runs on one CPU thread. Served with cross-origin isolation (COOP/COEP headers) it uses all cores.");
        $("wllamaHint").textContent = notes.join(" ");
        $("wllamaHint").hidden = !notes.length;
        $("wllamaWebGpu").checked = WLLAMA_HAS_WEBGPU && !WLLAMA_SLOW_WEBGPU;
        $("wllamaWebGpu").disabled = !WLLAMA_HAS_WEBGPU;
    })();

    async function gunzipToBytes(b64) {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    function bytesToBase64(bytes) {
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }
    async function resolveWllamaEngine() {
        if (wllamaEngineUrls) return wllamaEngineUrls;
        const inline = window.__WLLAMA_INLINE__;
        if (inline) {
            // The wasm must be a data: URI: Emscripten's loader decodes it in place,
            // whereas a blob: URL from a file:// page (origin "null") can't be loaded
            // inside wllama's worker. Never revoked: later loads reuse both URLs.
            wllamaEngineUrls = {
                js: URL.createObjectURL(new Blob([await gunzipToBytes(inline.js)], { type: "text/javascript" })),
                wasm: "data:application/octet-stream;base64," + bytesToBase64(await gunzipToBytes(inline.wasm)),
                source: "inline (offline)",
            };
        } else {
            wllamaEngineUrls = { js: `${WLLAMA_CDN_BASE}/index.js`, wasm: `${WLLAMA_CDN_BASE}/wasm/wllama.wasm`, source: "CDN" };
        }
        return wllamaEngineUrls;
    }

    function wllamaPreflightSize(bytes) {
        if (!WLLAMA_HAS_JSPI && bytes >= WLLAMA_NO_JSPI_MAX_BYTES) {
            return `This model is ${(bytes / 1073741824).toFixed(1)} GB, but without WebAssembly JSPI this browser must fit it into a 4 GB heap. Use Chrome/Edge or Firefox 153+, or a smaller model.`;
        }
        return null;
    }

    function setWllamaStatus(text, progress) {
        $("wllamaStatus").textContent = text;
        const bar = $("wllamaProgress");
        bar.hidden = progress === undefined;
        if (progress === null) bar.removeAttribute("value");   // indeterminate
        else if (progress !== undefined) bar.value = progress;
    }

    function setWllamaBusy(busy) {
        $("wllamaFile").disabled = busy;
        $("wllamaUrl").disabled = busy;
        $("wllamaCtx").disabled = busy;
        $("wllamaWebGpu").disabled = busy || !WLLAMA_HAS_WEBGPU;
    }

    // Load `blobs` (what wllama's loadModel takes) into a fresh engine. Reports in the
    // status line instead of throwing. Adapted from HermitUI's loadWllamaModel: same
    // Worker patch, the same check for a context that couldn't be created, and the
    // same halve-the-context retry, down to 2048 tokens (passages are short).
    async function loadWllamaModel(blobs, label) {
        setWllamaStatus("Loading the engine…", null);
        // Chrome blocks module workers made from cross-origin redirected scripts; the
        // wllama worker doesn't need module features, so drop { type: "module" }.
        const OriginalWorker = window.Worker;
        window.Worker = function (url, options) {
            if (options && options.type === "module") { options = { ...options }; delete options.type; }
            return new OriginalWorker(url, options);
        };
        try {
            const engine = await resolveWllamaEngine();
            if (!WllamaClass) WllamaClass = (await import(engine.js)).Wllama;
            if (wllamaInstance) {
                try { await wllamaInstance.exit(); } catch { /* the old engine is gone either way */ }
                wllamaInstance = null;
                wllamaModelLabel = null;
            }
            const useWebGpu = $("wllamaWebGpu").checked;
            const nCtx = parseInt($("wllamaCtx").value, 10);
            const requestedCtx = Number.isFinite(nCtx) && nCtx > 0 ? nCtx : 4096;
            let attemptCtx = requestedCtx;
            const started = performance.now();
            while (true) {
                const inst = new WllamaClass({ "default": engine.wasm }, { suppressNativeLog: true, logger: { debug() {}, log() {}, warn: console.warn, error: console.error } });
                const options = useWebGpu ? { n_ctx: attemptCtx } : { n_ctx: attemptCtx, n_gpu_layers: 0 };
                // Reasoning stays inline in the content, where stripThinking finds it.
                // llama.cpp's default moves it to a separate field the reply never reads.
                options.reasoning_format = "none";
                options.progressCallback = ({ loaded, total }) => {
                    const pct = total ? Math.round(loaded / total * 100) : 0;
                    setWllamaStatus(`Loading ${label}… ${pct} %`, pct < 100 ? pct : null);
                };
                setWllamaStatus(`Loading ${label}…`, null);
                try {
                    await inst.loadModel(blobs, options);
                    // wllama resolves even when the context couldn't be created (the KV
                    // cache didn't fit): treat that as the failure it is.
                    if (inst.getLoadedContextInfo().success === false) {
                        const err = new Error("not enough memory to create the model context");
                        err.name = "ContextAllocError";
                        throw err;
                    }
                    wllamaInstance = inst;
                    break;
                } catch (err) {
                    try { await inst.exit(); } catch { /* already dead */ }
                    if (attemptCtx <= 2048) {
                        if (err.name === "ContextAllocError") err.message = "not enough memory for this model. Try a smaller model or quantization" + (useWebGpu || !WLLAMA_HAS_WEBGPU ? "." : ", or switch WebGPU on.");
                        throw err;
                    }
                    attemptCtx = Math.max(2048, Math.floor(attemptCtx / 2));
                    setWllamaStatus(`Not enough memory for that context: retrying with ${attemptCtx} tokens…`, null);
                }
            }
            const meta = (() => { try { return wllamaInstance.getModelMetadata().meta || {}; } catch { return {}; } })();
            wllamaModelLabel = label;
            backendMode = "wllama";
            $("settingBackend").value = "wllama";
            updateEndpointBadge();
            const secs = ((performance.now() - started) / 1000).toFixed(1);
            const notes = [useWebGpu ? "WebGPU" : "CPU", `${attemptCtx}-token context${attemptCtx !== requestedCtx ? " (reduced)" : ""}`, `${secs} s`];
            if (!meta["tokenizer.chat_template"]) notes.push("no chat template in the file: replies may be poor");
            setWllamaStatus(`Ready 🟢 ${label} (${notes.join(", ")})`);
            showToast(`🧠 ${label} loaded`);
            if (ggufLinkPending && modal.classList.contains("active")) closeSettings();
        } catch (err) {
            let msg = err.message || String(err);
            if (err instanceof RangeError || /source array is too long|is out of bounds/i.test(msg)) {
                msg = "the model doesn't fit in browser memory." + (WLLAMA_HAS_JSPI ? "" : " Without WebAssembly JSPI this browser caps models at ~3 GB.") + " Try a smaller quantization.";
            } else if (err.name === "NotReadableError" || /NotReadableError/.test(msg)) {
                msg = "the browser lost access to the model data mid-load. Pick the file again; in a private window, try a normal one.";
            }
            setWllamaStatus("❌ Error: " + msg);
            if (!wllamaInstance) { wllamaModelLabel = null; updateEndpointBadge(); }
        } finally {
            window.Worker = OriginalWorker;
        }
    }

    // A Blob whose bytes live in JS memory. Large real Blobs break in private windows
    // (blob data can't be paged to disk there); wllama only uses size, slice,
    // arrayBuffer and stream, so those are overridden. Copied from HermitUI.
    class MemBlob extends Blob {
        constructor(parts, size, offset = 0) {
            super([]);
            this.memParts = parts;
            this.memOffset = offset;
            this.memSize = size;
        }
        get size() { return this.memSize; }
        slice(start = 0, end = this.memSize) {
            const clamp = v => Math.min(Math.max(v < 0 ? this.memSize + v : v, 0), this.memSize);
            start = clamp(start);
            end = clamp(end);
            return new MemBlob(this.memParts, Math.max(end - start, 0), this.memOffset + start);
        }
        async arrayBuffer() {
            const out = new Uint8Array(this.memSize);
            let skip = this.memOffset, outPos = 0;
            for (const part of this.memParts) {
                if (outPos >= this.memSize) break;
                if (skip >= part.byteLength) { skip -= part.byteLength; continue; }
                const take = Math.min(part.byteLength - skip, this.memSize - outPos);
                out.set(part.subarray(skip, skip + take), outPos);
                outPos += take;
                skip = 0;
            }
            return out.buffer;
        }
        stream() {
            const CHUNK = 4 * 1024 * 1024;
            let pos = 0;
            return new ReadableStream({
                pull: controller => {
                    if (pos >= this.memSize) { controller.close(); return; }
                    const view = this.slice(pos, pos + CHUNK);
                    pos += view.size;
                    return view.arrayBuffer().then(ab => controller.enqueue(new Uint8Array(ab)));
                },
            });
        }
    }

    // Download a GGUF into memory, never into browser storage: wllama's own URL
    // loader would keep it in OPFS, which the ephemerality rule forbids.
    async function downloadGgufToBlob(url, onProgress, signal) {
        const res = await fetch(url, { signal });
        if (!res.ok) {
            const why = res.status === 401 || res.status === 403 ? " — the file is gated or private. Download it on Hugging Face and pick the file instead."
                : res.status === 404 ? " — no file at that URL (names are case-sensitive)."
                : res.status === 429 ? " — rate-limited by the host. Wait a moment and retry." : "";
            throw new Error(`Download failed: HTTP ${res.status}${why}`);
        }
        const total = parseInt(res.headers.get("content-length") || "0", 10);
        const sizeErr = wllamaPreflightSize(total);
        if (sizeErr) { try { await res.body.cancel(); } catch { /* closed */ } throw new Error(sizeErr); }
        const reader = res.body.getReader();
        // Compact network chunks into 64 MB parts: MemBlob scans the list linearly.
        const PART_BYTES = 64 * 1024 * 1024;
        const parts = [];
        let pending = [], pendingBytes = 0, loaded = 0;
        const flush = () => {
            if (!pendingBytes) return;
            const part = new Uint8Array(pendingBytes);
            let o = 0;
            for (const c of pending) { part.set(c, o); o += c.byteLength; }
            parts.push(part);
            pending = [];
            pendingBytes = 0;
        };
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pending.push(value);
            pendingBytes += value.byteLength;
            if (pendingBytes >= PART_BYTES) flush();
            loaded += value.byteLength;
            if (!total) {
                const runningErr = wllamaPreflightSize(loaded);
                if (runningErr) { try { await reader.cancel(); } catch { /* closed */ } throw new Error(runningErr); }
            }
            onProgress(loaded, total);
        }
        flush();
        return new MemBlob(parts, loaded);
    }

    $("wllamaFile").addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        const sizeErr = wllamaPreflightSize(file.size);
        if (sizeErr) { setWllamaStatus("❌ " + sizeErr); e.target.value = ""; return; }
        setWllamaBusy(true);
        $("wllamaUrlBtn").disabled = true;
        try { await loadWllamaModel([file], file.name); }
        finally {
            setWllamaBusy(false);
            $("wllamaUrlBtn").disabled = false;
            e.target.value = "";   // so picking the same file again still loads it
        }
    });

    $("wllamaUrlBtn").addEventListener("click", async () => {
        const btn = $("wllamaUrlBtn");
        if (wllamaDownloadAbort) { wllamaDownloadAbort.abort(); return; }
        let url;
        try { url = normalizeGgufUrl($("wllamaUrl").value); }
        catch (e) { setWllamaStatus("❌ " + e.message); return; }
        const label = ggufFileName(url);
        wllamaDownloadAbort = new AbortController();
        setWllamaBusy(true);
        btn.textContent = "Cancel";
        try {
            setWllamaStatus(`Downloading ${label} from ${new URL(url).host}…`, null);
            const blob = await downloadGgufToBlob(url, (loaded, total) => {
                const mb = (loaded / 1048576).toFixed(0);
                if (total) setWllamaStatus(`Downloading ${label}: ${mb} of ${(total / 1048576).toFixed(0)} MB`, Math.round(loaded / total * 100));
                else setWllamaStatus(`Downloading ${label}: ${mb} MB`, null);
            }, wllamaDownloadAbort.signal);
            wllamaDownloadAbort = null;
            btn.textContent = "Load";
            btn.disabled = true;
            await loadWllamaModel([blob], label);
        } catch (e) {
            if (e.name === "AbortError") setWllamaStatus("Download cancelled.");
            else setWllamaStatus("❌ " + (/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? `Couldn't download from ${new URL(url).host}: the host must allow browser downloads (CORS). Hugging Face does.` : e.message));
        } finally {
            ggufLinkPending = false;   // on an error, Settings stays open with the reason
            wllamaDownloadAbort = null;
            btn.textContent = "Load";
            btn.disabled = false;
            setWllamaBusy(false);
        }
    });

    // One rewrite in the browser. Streams so that Stop takes effect between tokens
    // (a non-streamed call only checks the signal between polls), and shows the
    // speed after the status text.
    async function wllamaReword(passage, signal, lang, context, ropts) {
        const body = buildRewriteBody("", passage, false, lang, context, ropts);
        return wllamaChat(body.messages, body.temperature, wllamaMaxTokens(passage), signal);
    }

    async function wllamaChat(messages, temperature, maxTokens, signal) {
        if (!wllamaInstance) throw new Error("No in-browser model is loaded: pick a .gguf file in ⚙️ Settings.");
        const base = $("status").textContent;
        const started = performance.now();
        let text = "", tokens = 0, shown = 0;
        try {
            await wllamaInstance.createChatCompletion({
                messages,
                max_tokens: maxTokens,
                temperature,
                chat_template_kwargs: { enable_thinking: false },
                stream: true,
                abortSignal: signal,
                onData: chunk => {
                    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
                    const piece = (chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || "";
                    if (!piece) return;
                    text += piece;
                    tokens++;
                    const now = performance.now();
                    if (now - shown > 250) {
                        shown = now;
                        setStatus(`${base} ${tokens} tok · ${(tokens / ((now - started) / 1000)).toFixed(1)} tok/s`, "busy");
                    }
                },
            });
        } catch (e) {
            // Our own throw from onData, or wllama's WllamaAbortError between polls.
            if (signal.aborted || e.name === "AbortError" || e.message === "AbortError") throw new DOMException("Stopped", "AbortError");
            throw e;
        }
        return text;
    }

    // A link can name a model: page.html#gguf=hf:user/repo/file.gguf (or a direct
    // .gguf or Hugging Face URL), as in HermitUI. The fragment never leaves the browser
    // and nothing is stored. A link alone never starts a download of gigabytes: a
    // banner says what would be loaded from where, and only its button loads it.
    function applyGgufLink() {
        const raw = (new URLSearchParams(location.hash.slice(1)).get("gguf") || "").trim();
        if (!raw) return;
        let url;
        try { url = normalizeGgufUrl(raw); }
        catch (e) { showToast(`🔗 Model link ignored: ${e.message}`, { error: true }); return; }
        $("wllamaUrl").value = url;
        $("ggufBannerName").textContent = ggufFileName(url);
        $("ggufBannerHost").textContent = new URL(url).host;
        $("ggufBanner").hidden = false;
    }
    $("ggufBannerLoad").addEventListener("click", () => {
        $("ggufBanner").hidden = true;
        // Settings shows the download and load progress; it closes once the model is ready.
        backendMode = "wllama";
        updateEndpointBadge();
        openSettings();
        ggufLinkPending = true;
        $("wllamaUrlBtn").click();
    });
    $("ggufBannerDismiss").addEventListener("click", () => { $("ggufBanner").hidden = true; });
    applyGgufLink();
    // @wllama:end

    // ----- input: paste, open, drop -----
    const input = $("inputText");
    function updateInputStats() {
        const n = input.value.length;
        $("inputStats").textContent = n ? `${n.toLocaleString()} characters` : "";
        $("runBtn").disabled = $("wholeBtn").disabled = $("freeBtn").disabled = !n || !!running;
    }
    input.addEventListener("input", updateInputStats);

    async function loadFile(file) {
        if (!file) return;
        if (file.size > 5e6) { showToast("That file is over 5 MB — paste the part you need instead.", { error: true }); return; }
        const isText = /^text\//.test(file.type) || /\.(txt|md|markdown|text|csv|html?|json|tex|rst)$/i.test(file.name);
        if (!isText) { showToast(`${file.name} isn't a text file.`, { error: true }); return; }
        input.value = await file.text();
        updateInputStats();
        showToast(`Loaded ${file.name}`);
    }
    $("openBtn").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", e => { loadFile(e.target.files[0]); e.target.value = ""; });
    const inputCard = $("inputCard");
    inputCard.addEventListener("dragover", e => { e.preventDefault(); inputCard.classList.add("drag"); });
    inputCard.addEventListener("dragleave", () => inputCard.classList.remove("drag"));
    inputCard.addEventListener("drop", e => {
        e.preventDefault();
        inputCard.classList.remove("drag");
        if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
    });
    $("clearBtn").addEventListener("click", () => { input.value = ""; updateInputStats(); input.focus(); });

    // ----- options -----
    const opt = {
        clean: () => $("optClean").checked,
        reword: () => $("optReword").checked,
        typos: () => $("optTypos").checked,
        share: () => Number($("optShare").value),
        unit: () => $("optUnit").value,
        level: () => $("optLevel").value,
        tone: () => $("optTone").value,
        extra: () => $("optExtra").value,
        details: () => $("optDetails").value,
        plain: () => $("optPlain").checked,
        minLetters: () => { const n = parseInt($("optMin").value, 10); return Number.isFinite(n) && n > 0 ? n : MIN_LETTERS; },
        rate: () => Number($("optRate").value) / 100,
        layout: () => $("optLayout").value,
    };
    function syncOptions() {
        // Tone and Also serve Rewrite whole text too, so they stay usable.
        ["optShare", "optUnit", "optMin", "optLevel"].forEach(id => { $(id).disabled = !opt.reword(); });
        $("optRate").disabled = $("optLayout").disabled = !opt.typos();
        $("rateValue").textContent = Number($("optRate").value).toFixed(1) + " %";
        $("rerollBtn").disabled = !last || !opt.typos() || !!running;
    }
    ["optClean", "optReword", "optTypos", "optShare", "optUnit", "optMin", "optLevel", "optTone", "optRate", "optLayout"].forEach(id => $(id).addEventListener("input", syncOptions));
    syncOptions();

    function setStatus(text, kind) {
        const s = $("status");
        s.textContent = text || "";
        s.className = "status" + (kind ? " " + kind : "");
    }

    // ----- the model call -----
    async function rewordOne(passage, signal, lang, context, ropts) {
        // @wllama:start
        if (backendMode === "wllama") return wllamaReword(passage, signal, lang, context, ropts);
        // @wllama:end
        return apiChat(noKwargs => buildRewriteBody(MODEL_NAME, passage, noKwargs, lang, context, ropts), signal);
    }

    // One pass of Rewrite whole text. `maxTokens` bounds the reply in the browser only.
    // `think` is for a server only: the model in the tab always answers without thinking.
    async function chatOnce(messages, temperature, maxTokens, signal, think) {
        // @wllama:start
        if (backendMode === "wllama") return wllamaChat(withNoHiddenMarks(messages), temperature, maxTokens, signal);
        // @wllama:end
        return apiChat(noKwargs => buildChatBody(MODEL_NAME, messages, temperature, noKwargs, think), signal);
    }

    // POST the body `makeBody(noKwargs)` to the chat endpoint and return the reply text.
    async function apiChat(makeBody, signal) {
        if (!MODEL_NAME) {
            // Ollama needs a real model name; llama.cpp takes any. Ask the server once.
            try {
                const models = await listModels(API_URL, API_KEY, signal);
                if (models.length) { MODEL_NAME = models[0]; updateEndpointBadge(); }
            } catch (e) {
                if (e.name === "AbortError") throw e;
                /* the chat request below reports the real problem */
            }
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(apiEndpoint(API_URL, "/chat/completions"), {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(makeBody(kwargsRejected)),
                signal,
            });
            if (res.ok) {
                const data = await res.json();
                const msg = data.choices && data.choices[0] && data.choices[0].message;
                return (msg && msg.content) || "";
            }
            // A strict server refuses the unknown chat_template_kwargs: drop it, once.
            if (res.status === 400 && !kwargsRejected) { kwargsRejected = true; continue; }
            throw await serverError(res);
        }
        throw new Error("The server refused the request.");
    }

    // Rewrite whole text (wholeRewrite), with the status line, cleanup of the model's
    // answer and the marks for the output pane.
    async function rewriteWhole(text, marks, lang, signal, o) {
        const r = await wholeRewrite(text, lang, o, (id, messages, maxTokens, think) => {
            const k = WHOLE_PASSES.findIndex(p => p.id === id);
            setStatus(`Rewriting the whole text, pass ${k + 1} of ${WHOLE_PASSES.length}: ${WHOLE_PASSES[k].label}…`, "busy");
            return chatOnce(messages, WHOLE_PASSES[k].temperature, maxTokens, signal, think);
        });
        const info = r.info;
        if (r.body === r.frame.body) return { text, marks, info };
        const cleaned = o.clean ? cleanText(r.body) : { text: r.body, report: null };
        const cur = cleaned.text.trim();
        info.cleanReport = cleaned.report;
        const diff = wordDiff(r.frame.body, cur);
        info.change = diff.ratio;
        info.after = cur.length;
        const out = applyRewrites(text, marks, [{ start: r.frame.head.length, end: r.frame.head.length + r.frame.body.length, text: cur, changed: diff.changed }]);
        return { ...out, info };
    }

    // ----- pipeline -----
    // `mode` "whole" runs Rewrite whole text in place of the Reword step, "free" the same
    // with content changes allowed (Rewrite freely).
    async function run(mode) {
        const source = input.value;
        if (!source) return;
        const whole = mode === "whole" || mode === "free";
        if (!whole && !opt.clean() && !opt.reword() && !opt.typos()) { showToast("Switch on at least one step.", { error: true }); return; }
        running = new AbortController();
        const signal = running.signal;
        $("runBtn").hidden = true;
        $("wholeBtn").disabled = $("freeBtn").disabled = true;
        $("stopBtn").hidden = false;
        $("rerollBtn").disabled = true;
        document.body.classList.add("is-running");

        const empty = { counts: Object.fromEntries(CLEAN_CATEGORIES.map(c => [c, {}])), hiddenText: [] };
        let text = source, marks = [], clean1 = empty, clean2 = empty;
        const docLang = detectLanguage(source);
        const reword = { unit: opt.unit(), level: opt.level(), attempted: 0, done: 0, eligible: 0, unchanged: 0, retried: 0, rescued: 0, removed: 0, changes: [], skipped: [], stopped: false, error: null };
        const ropts = { level: opt.level(), tone: opt.tone(), extra: opt.extra() };
        try {
            if (opt.clean()) {
                const r = cleanText(text);
                text = r.text; marks = r.marks; clean1 = r.report;
            }
            if (whole) {
                const r = await rewriteWhole(text, marks, docLang, signal, { tone: opt.tone(), extra: opt.extra(), details: opt.details(), clean: opt.clean(), free: mode === "free", plain: opt.plain() });
                ({ text, marks } = r);
                reword.whole = r.info;
                if (r.info.cleanReport) clean2 = r.info.cleanReport;
                reword.stopped = r.info.stopped;
                reword.error = r.info.error;
            } else if (opt.reword()) {
                const units = rewordUnits(text, reword.unit, opt.minLetters());
                const langOf = u => detectLanguage(u.context || u.text) || docLang;
                // Those with stock phrases are reworded first.
                const first = new Set(units.flatMap((u, i) => findStockPhrases(u.text, langOf(u)).length ? [i] : []));
                const picked = pickUnits(units.length, opt.share(), mulberry32(Date.now() >>> 0), first);
                // One that is nothing but stock phrases ("Let that sink in.") is removed
                // here; the model gets the rest.
                const gone = picked.filter(i => isStockOnly(units[i].text, langOf(units[i])));
                const groups = groupUnits(text, units, picked.filter(i => !gone.includes(i)));
                reword.stockBefore = countStockPhrases(text, docLang);
                reword.eligible = units.length;
                reword.attempted = picked.length;
                reword.removed = reword.done = gone.length;
                const reps = gone.map(i => {
                    const [start, end] = deletionRange(text, units[i].start, units[i].end);
                    return { start, end, text: "", removed: `stock phrase "${units[i].text}"` };
                });
                for (const [k, g] of groups.entries()) {
                    if (reword.stopped || reword.error) break;
                    setStatus(`Rewording ${k + 1} of ${groups.length}…`, "busy");
                    try {
                        const lang = detectLanguage(g.context || g.text) || docLang;
                        // The context leaves out what was removed, or the model puts it back.
                        let context = gone.reduce((c, i) => c && units[i].context === g.context ? c.replace(units[i].text, "").replace(/[ \t]{2,}/g, " ").trim() : c, g.context);
                        if (context === g.text) context = null;
                        let reply = await rewordOne(g.text, signal, lang, context, ropts);
                        let verdict = acceptRewrite(g.text, reply, lang, ropts.level);
                        const note = retryNote(verdict, g.text);
                        if (note) {
                            reword.retried += g.count;
                            setStatus(`Rewording ${k + 1} of ${groups.length}, second try…`, "busy");
                            reply = await rewordOne(g.text, signal, lang, context, { ...ropts, retry: note });
                            const first = verdict;
                            verdict = acceptRewrite(g.text, reply, lang, ropts.level);
                            if (verdict.ok) reword.rescued += g.count;
                            // Refused only for a contrast left in: still better than the original. The
                            // first try is preferred: the second, hotter and pushed by the note, garbled
                            // German ("Man baut Vertrauen nicht einfach so auf, sondern man legt es in den Alltag").
                            else if (verdict.soft || first.soft) verdict = { ...(first.soft ? first : verdict), ok: true };
                        }
                        const cleaned = !verdict.ok ? null : opt.clean() ? cleanText(verdict.text) : { text: verdict.text, report: empty };
                        const core = cleaned && cleaned.text.trim();
                        if (core) {
                            const diff = wordDiff(g.text, core);
                            clean2 = mergeCleanReports(clean2, cleaned.report);
                            reps.push({ start: g.start, end: g.end, text: core, changed: diff.changed });
                            reword.done += g.count;
                            reword.changes.push(diff.ratio);
                        } else if (verdict.unchanged) {
                            reword.unchanged += g.count;
                        } else {
                            const t = g.text.length > 50 ? g.text.slice(0, 50).trimEnd() + "…" : g.text;
                            reword.skipped.push(`"${t}": ${verdict.ok ? "nothing left after cleanup" : verdict.reason} — kept the original.`);
                        }
                    } catch (e) {
                        if (e.name === "AbortError") reword.stopped = true;
                        else reword.error = e;
                    }
                }
                reps.sort((a, b) => a.start - b.start);
                ({ text, marks } = applyRewrites(text, marks, reps));
                reword.stockAfter = countStockPhrases(text, docLang);
            }
            last = { text, marks, clean1, clean2, reword, lang: docLang, did: { clean: opt.clean(), reword: !whole && opt.reword(), whole } };
            finish();
        } finally {
            running = null;
            $("runBtn").hidden = false;
            $("stopBtn").hidden = true;
            document.body.classList.remove("is-running");
            updateInputStats();
            syncOptions();
        }
    }

    // The typo stage and rendering; also what Reroll typos reruns.
    function finish() {
        let { text, marks } = last;
        let typos = [];
        last.layout = opt.layout() === "auto" ? (KEYBOARD_FOR_LANGUAGE[last.lang] || "qwerty") : opt.layout();
        if (opt.typos()) {
            const r = addTypos(text, { rate: opt.rate(), layout: last.layout, lang: last.lang }, mulberry32((Math.random() * 2 ** 32) >>> 0));
            marks = shiftMarks(marks, r.edits).concat(r.marks);
            text = r.text;
            typos = r.marks;
        }
        last.output = text;
        renderOutput(text, marks);
        renderReport(typos);
        const { reword } = last;
        if (reword.error) setStatus("❌ " + errorText(reword.error), "error");
        else if (reword.stopped && reword.whole) setStatus("Stopped — kept what the finished passes produced.", "warn");
        else if (reword.stopped) setStatus(`Stopped — reworded ${reword.done} of ${reword.attempted} ${reword.unit}s.`, "warn");
        else if (reword.whole && reword.whole.failed) setStatus(`Not rewritten: ${reword.whole.failed}.`, "warn");
        else setStatus("Done.", "ok");
    }

    function renderOutput(text, marks) {
        const box = $("outputText");
        box.replaceChildren();
        $("copyBtn").disabled = !text;
        $("outputStats").textContent = text ? `${text.length.toLocaleString()} characters` : "";
        if (!text && !marks.length) { box.textContent = ""; return; }
        // Inline marks per character (a later mark wins), reworded ranges as a layer
        // below them, and removals as markers in between.
        const inline = new Array(text.length).fill(null);
        const reword = new Array(text.length).fill(null);
        const removedAt = new Map();
        for (const m of marks) {
            if (m.kind === "removed") {
                const prev = removedAt.get(m.start);
                if (prev) { prev.count += m.count; prev.labels = [...new Set([...prev.labels, ...m.labels])]; }
                else removedAt.set(m.start, { ...m, labels: [...m.labels] });
                continue;
            }
            const layer = m.kind === "reword" ? reword : inline;
            for (let i = Math.max(0, m.start); i < Math.min(text.length, m.end); i++) layer[i] = m;
        }
        const frag = document.createDocumentFragment();
        let i = 0;
        let rewordSpan = null;
        const target = () => rewordSpan || frag;
        while (i <= text.length) {
            const rm = removedAt.get(i);
            if (rm) {
                const s = document.createElement("span");
                s.className = "m-removed";
                s.title = `Removed ${rm.count}: ${rm.labels.slice(0, 12).join(", ")}${rm.labels.length >= 12 ? ", …" : ""}`;
                s.setAttribute("aria-label", s.title);
                target().appendChild(s);
            }
            if (i === text.length) break;
            if (reword[i] && (!rewordSpan || rewordSpan._mark !== reword[i])) {
                rewordSpan = document.createElement("span");
                rewordSpan.className = "m-reword";
                rewordSpan.title = "Reworded. Original:\n" + reword[i].labels[0];
                rewordSpan._mark = reword[i];
                frag.appendChild(rewordSpan);
            } else if (!reword[i]) {
                rewordSpan = null;
            }
            let j = i + 1;
            while (j < text.length && inline[j] === inline[i] && reword[j] === reword[i] && !removedAt.has(j)) j++;
            const piece = text.slice(i, j);
            const m = inline[i];
            if (m) {
                const s = document.createElement("span");
                s.className = "m-" + m.kind;
                // A changed word keeps no title of its own: hovering it shows the
                // reworded span's original.
                if (m.kind !== "changed") s.title = m.kind === "typo" ? `Typo, ${TYPO_NAMES[m.typo] || "typo"} (was "${m.labels[0]}")` : `Was ${m.labels.join(", ")}`;
                s.textContent = piece;
                target().appendChild(s);
            } else {
                target().appendChild(document.createTextNode(piece));
            }
            i = j;
        }
        box.appendChild(frag);
    }

    const CATEGORY_TEXT = {
        hidden: "Hidden text (tag characters)",
        invisible: "Invisible characters",
        composed: "Accents stored as two characters (recombined)",
        spaces: "Unusual spaces",
        typography: "Typography",
        homoglyph: "Look-alike letters",
        transliterated: "Letters outside Latin-1",
        dropped: "Removed (no keyboard equivalent)",
    };

    const LEVEL_TEXT = { light: "light edits", medium: "rephrased", strong: "rewritten freely" };

    function renderReport(typos) {
        const box = $("report");
        box.replaceChildren();
        const add = (tag, text, cls) => {
            const el = document.createElement(tag);
            if (text) el.textContent = text;
            if (cls) el.className = cls;
            box.appendChild(el);
            return el;
        };
        const { clean1, clean2, reword, did } = last;
        add("p", `Language: ${LANGUAGE_NAMES[last.lang] || "not recognised"}`, "report-note");
        if (did.clean) {
            const total = cleanTotal(clean1);
            add("h4", total ? `Cleanup: ${total} character${total === 1 ? "" : "s"} changed` : "Cleanup: the text was already clean");
            for (const cat of CLEAN_CATEGORIES) {
                const entries = Object.entries(clean1.counts[cat]).sort((a, b) => b[1] - a[1]);
                if (!entries.length) continue;
                const n = entries.reduce((s, [, c]) => s + c, 0);
                const details = add("details", "", "report-cat cat-" + cat);
                const sum = document.createElement("summary");
                sum.textContent = `${CATEGORY_TEXT[cat]}: ${n}`;
                details.appendChild(sum);
                const ul = document.createElement("ul");
                entries.forEach(([label, c]) => { const li = document.createElement("li"); li.textContent = `${label} × ${c}`; ul.appendChild(li); });
                details.appendChild(ul);
            }
            if (clean1.hiddenText.length) {
                add("p", "⚠️ The text carried hidden instructions or data, now removed:", "report-warn");
                clean1.hiddenText.forEach(t => add("pre", t, "hidden-text"));
            }
        }
        if (did.reword) {
            if (!reword.eligible) add("h4", `Rewording: no ${reword.unit} long enough to reword`);
            else add("h4", `Rewording: ${reword.done} of ${reword.eligible} ${reword.unit}${reword.eligible === 1 ? "" : "s"} reworded (${LEVEL_TEXT[reword.level]})`);
            if (reword.changes.length) {
                const avg = reword.changes.reduce((s, r) => s + r, 0) / reword.changes.length;
                add("p", `On average the model changed ${Math.round(avg * 100)} % of the words in what it reworded.`, "report-note");
            }
            if (reword.stockBefore || reword.stockAfter) add("p", `Stock phrases: ${reword.stockBefore} before rewording, ${reword.stockAfter} after.`, "report-note");
            if (reword.removed) add("p", `${reword.removed} ${reword.unit}${reword.removed === 1 ? " that was" : "s that were"} nothing but stock phrases ${reword.removed === 1 ? "was" : "were"} removed.`, "report-note");
            if (reword.retried) add("p", `${reword.retried} ${reword.unit}${reword.retried === 1 ? "" : "s"} got a second try, ${reword.rescued} of them reworded then.`, "report-note");
            if (reword.unchanged) add("p", `${reword.unchanged} ${reword.unit}${reword.unchanged === 1 ? "" : "s"} came back unchanged.`, "report-note");
            reword.skipped.forEach(s => add("p", s, "report-note"));
            const fixed = cleanTotal(clean2);
            if (fixed) add("p", `Cleaned ${fixed} character${fixed === 1 ? "" : "s"} out of the model's answers.`, "report-note");
            add("p", "Rewording changes the word choice, which is what statistical watermarks live in. No tool can promise what an AI detector will say.", "report-note");
        }
        if (did.whole && reword.whole) {
            const w = reword.whole;
            const title = w.free ? "Rewrite freely" : "Rewrite whole text";
            if (w.failed) add("h4", `${title}: not rewritten (${w.failed})`);
            else {
                add("h4", `${title}: ${Math.round(w.change * 100)} % of the words changed, ${w.before.toLocaleString()} → ${w.after.toLocaleString()} characters`);
                if (w.letter) add("p", "The greeting and the sign-off were kept as they were.", "report-note");
                const passText = { rewrite: "the rewrite", sentences: "fixing the flagged sentences", spots: "fixing contrasts and stock phrases", fix: "correcting the fact-check errors" };
                if (w.flagged) add("p", `The sentence review flagged ${w.flagged} sentence${w.flagged === 1 ? "" : "s"}.`, "report-note");
                if (w.cut && w.cut.length) add("p", `Cut ${w.cut.length} filler sentence${w.cut.length === 1 ? "" : "s"} that added no fact.`, "report-note");
                if (w.spotsFound) add("p", `Set-up contrasts and stock phrases: ${w.spotsFound} found after the rewrite, ${w.spotsLeft} left.`, "report-note");
                w.passes.filter(p => !p.ok).forEach(p => add("p", `Skipped ${passText[p.id] || p.id}: ${p.reason}.`, "report-note"));
                const list = items => {
                    const ul = add("ul", "", "report-list");
                    items.forEach(e => { const li = document.createElement("li"); li.textContent = e.replace(/^-\s*/, ""); ul.appendChild(li); });
                };
                if (w.errors.length) {
                    add("p", w.fixed ? "The fact check found these problems, and they were corrected:" : "⚠️ The fact check found these problems and they could not be corrected; fix them by hand:", w.fixed ? "report-note" : "report-warn");
                    list(w.errors);
                    // The second check is strict to a fault (it called "I think" a change of
                    // register), so its points are offered, collapsed, not raised as warnings.
                    if (w.remaining.length) {
                        const det = add("details", "", "report-cat");
                        const sum = document.createElement("summary");
                        sum.textContent = `A second check raised ${w.remaining.length} more point${w.remaining.length === 1 ? "" : "s"}, often only wording: look ${w.remaining.length === 1 ? "it" : "them"} over`;
                        det.appendChild(sum);
                        const ul = document.createElement("ul");
                        w.remaining.forEach(e => { const li = document.createElement("li"); li.textContent = e.replace(/^-\s*/, ""); ul.appendChild(li); });
                        det.appendChild(ul);
                    } else if (w.fixed) add("p", "A second check found nothing more.", "report-note");
                } else if (!w.stopped && !w.error) add("p", "The fact check found no errors.", "report-note");
                if (w.missing.length) add("p", w.free ? `These numbers of the original went with the points that were dropped: ${w.missing.join(", ")}. Check that none of them is missed.`
                    : `⚠️ These numbers of the original are not in the result: ${w.missing.join(", ")}. Check the text.`, w.free ? "report-note" : "report-warn");
            }
            const fixed = cleanTotal(clean2);
            if (fixed) add("p", `Cleaned ${fixed} character${fixed === 1 ? "" : "s"} out of the model's answer.`, "report-note");
            add("p", (w.free ? "Read the result before you use it: this rewrite changes the content on purpose (points dropped or merged, examples added), and a model can still get a fact wrong." : "Read the result before you use it: the rewrite may reorder, merge or drop points, and a model can still get a fact wrong.") + " No tool can promise what an AI detector will say.", "report-note");
        }
        if (opt.typos()) {
            add("h4", `Typos: ${typos.length} added (${last.layout.toUpperCase()} keyboard)`);
            const byKind = {};
            typos.forEach(mk => { byKind[mk.typo] = (byKind[mk.typo] || 0) + 1; });
            const parts = Object.entries(byKind).sort((x, y) => y[1] - x[1]).map(([k, c]) => `${c} × ${TYPO_NAMES[k] || k}`);
            if (parts.length) add("p", parts.join(", "), "report-note");
        }
    }

    $("runBtn").addEventListener("click", () => { run().catch(e => setStatus("❌ " + errorText(e), "error")); });
    $("wholeBtn").addEventListener("click", () => { run("whole").catch(e => setStatus("❌ " + errorText(e), "error")); });
    $("freeBtn").addEventListener("click", () => { run("free").catch(e => setStatus("❌ " + errorText(e), "error")); });
    $("stopBtn").addEventListener("click", () => { if (running) running.abort(); });
    $("rerollBtn").addEventListener("click", () => { if (last && !running) finish(); });
    input.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !$("runBtn").disabled) { e.preventDefault(); $("runBtn").click(); }
    });

    $("changesBtn").addEventListener("click", () => {
        showChanges = !showChanges;
        $("outputText").classList.toggle("plain", !showChanges);
        $("changesBtn").setAttribute("aria-pressed", String(showChanges));
        $("changesBtn").textContent = showChanges ? "Hide changes" : "Show changes";
    });

    $("copyBtn").addEventListener("click", async () => {
        if (!last || last.output == null) return;
        try {
            await navigator.clipboard.writeText(last.output);
            showToast("Copied");
        } catch {
            // file:// in some browsers: fall back to selecting a hidden textarea.
            const ta = document.createElement("textarea");
            ta.value = last.output;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            showToast(ok ? "Copied" : "Copy failed — select the text and copy it by hand.", { error: !ok });
        }
    });

    updateInputStats();
}
