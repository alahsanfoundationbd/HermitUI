// Pulls the real implementations under test out of ../src/script.js and evaluates them
// in isolation, so the tests exercise shipped code rather than a copy that can drift
// (the same approach as HermitUI's ../../tests/extract.mjs). Everything sliced out here
// is pure (no DOM), so taking it by name is enough. Renaming one of these functions
// fails the suite loudly; update the lists below with the rename.
//
// Slicing is plain brace counting: an unbalanced brace inside a listed function's
// regex, string or comment runs the slice on into the next function, and every test
// file fails with "Identifier ... has already been declared". To see the real error:
//   node -e 'import("./tests/extract.mjs").catch(e => console.log(e.message))'
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "script.js");
const src = readFileSync(SRC, "utf8");

// Slice `[async] function name(...) { ... }` by brace matching from its declaration.
function fn(name) {
    let i = src.indexOf(`function ${name}(`);
    if (i < 0) throw new Error(`extract.mjs: function ${name} not found in src/script.js`);
    if (src.slice(i - 6, i) === "async ") i -= 6;
    let depth = 0, started = false, j = i;
    for (; j < src.length; j++) {
        if (src[j] === "{") { depth++; started = true; }
        else if (src[j] === "}") { depth--; if (started && depth === 0) { j++; break; } }
    }
    return src.slice(i, j);
}

// A top-level `const NAME = ...;` declaration, single- or multi-line (an object or
// array literal closed by `};` / `];` at the start of a line).
function constDecl(name) {
    const one = src.match(new RegExp(`^const ${name} = [^\\n]*;$`, "m"));
    if (one && !/[[{(]$/.test(one[0].slice(0, -1))) return one[0];
    const multi = src.match(new RegExp(`^const ${name} = [\\s\\S]*?^[\\]}\\)][^\\n]*;$`, "m"));
    if (!multi) throw new Error(`extract.mjs: const ${name} not found in src/script.js`);
    return multi[0];
}

const CONSTS = ["APP_VERSION", "KEEP_RE", "INVISIBLE_RE", "SPACE_CHARS", "CHAR_MAP", "HOMOGLYPHS", "CHAR_NAMES",
    "CLEAN_CATEGORIES", "STOPWORDS", "LANGUAGE_NAMES", "KEYBOARD_FOR_LANGUAGE", "CONTRAST_RULES", "REWORD_LEVELS", "REWORD_EXAMPLE_INPUT", "REWORD_TONES", "STOCK_PHRASES", "STOCK_PATTERNS", "CONTRAST_PATTERNS", "MIN_LETTERS", "RETRY_MIN_LETTERS", "PREAMBLE_RE", "KEYBOARDS", "TYPO_WEIGHTS", "TYPO_NAMES", "GERMAN_DETERMINER_RE", "GERMAN_COMMA_WORDS", "LETTER_KINDS", "ABBREVIATIONS", "SALUTATION_RE", "WHOLE_EXAMPLES", "GREETING_SMALL_WORDS", "WHOLE_PASSES", "WHOLE_MIN_LETTERS", "NUMBER_WORDS", "STYLE_ONLY_RE", "META_COMMENT_RE", "WHOLE_TELLS", "WHOLE_CONTRASTS", "WHOLE_CONCESSIONS", "WHOLE_TRIPLETS", "SPEAKER_LIMITS", "TEXT_KINDS", "WHOLE_PLAIN_EN", "PLAIN_SPLIT_WORDS", "PLAIN_DE_WORDS", "SPLIT_KEEP", "SPLIT_LINKS", "REPEAT_COMMON", "FILLER_KEEP_RE", "NO_HIDDEN_MARKS"];
const FUNCS = [
    "charLabel", "transliterate", "homoglyphPositions", "cleanText", "mergeCleanReports", "cleanTotal",
    "detectLanguage", "splitParagraphs", "isRewritable", "splitSentences", "rewordUnits", "groupUnits", "applyRewrites", "mulberry32", "pickUnits", "phraseListRe", "findContrasts", "stockPhraseRe", "findStockPhrases", "countStockPhrases", "isStockOnly", "deletionRange", "cutStockPhrases", "buildRewriteSystem", "buildRewriteMessages", "withNoHiddenMarks", "buildRewriteBody", "wordDiff",
    "stripThinking", "acceptRewrite", "addressForms", "retryNote",
    "splitLetterFrame", "greetingCase", "wholeLanguage", "wholeWriteIn", "buildCritiqueMessages", "buildWholeRewriteMessages", "buildOutlineMessages", "buildPlanMessages", "buildSlopFindMessages", "cutFillerSentences", "isFirstPerson", "buildSentenceReviewMessages",
    "buildSentenceFixMessages", "copiedSentences", "wholeSpotNotes", "buildSpotFixMessages", "buildFactCheckMessages", "buildProofreadMessages", "buildProofFindMessages", "applyProofFixes", "longSentences", "buildPlainRuleMessages", "plainOpenerRule", "buildSplitMessages", "buildSplitCheckMessages", "acceptSplit", "buildTextKindMessages", "parseTextKind", "speakerRule", "buildOneRuleMessages", "isFactError", "factCheckErrors", "buildFactFixMessages",
    "sameOpenerRun", "acceptWholeRewrite", "numberWords", "missingNumbers", "addedNumbers", "repeatedSentences", "wholeRewrite", "buildChatBody",
    "keyNeighbors", "protectedRanges", "makeTypo", "addTypos", "shiftMarks",
    "isLocalEndpoint", "apiEndpoint", "normalizeApiUrl", "chatErrorHint", "normalizeGgufUrl", "ggufFileName", "wllamaMaxTokens",
];

const mod = `
${CONSTS.map(constDecl).join("\n")}
${FUNCS.map(fn).join("\n")}
export { ${[...CONSTS, ...FUNCS].join(", ")} };
`;

export default await import("data:text/javascript;base64," + Buffer.from(mod).toString("base64"));
