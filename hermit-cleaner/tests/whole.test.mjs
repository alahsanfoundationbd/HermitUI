// Rewrite whole text: the letter frame, the prompts of each pass, the checks on the
// replies and the pass sequence (wholeRewrite with a scripted chat).
import m from "./extract.mjs";
import { check, section, report } from "./check.mjs";

const { splitLetterFrame, greetingCase, buildCritiqueMessages, buildWholeRewriteMessages, buildSentenceFixMessages, wholeSpotNotes,
    buildFactCheckMessages, factCheckErrors, buildFactFixMessages, acceptWholeRewrite, wholeRewrite, buildChatBody, missingNumbers, addedNumbers, numberWords, repeatedSentences, buildProofreadMessages, buildProofFindMessages, applyProofFixes, isFactError, copiedSentences, cutFillerSentences, buildPlainRuleMessages, buildSplitMessages, acceptSplit, buildOneRuleMessages, WHOLE_PLAIN_EN, WHOLE_PASSES,
    buildSentenceReviewMessages, buildTextKindMessages, parseTextKind, speakerRule, sameOpenerRun, longSentences } = m;

const BODY_EN = "The Q3 budget review is next Thursday. I will send a full overview of the key figures by Tuesday.\n\n"
    + "The travel costs for the Berlin fair came in about 4,500 euros over our estimate.";
const LETTER_EN = `Hi Sarah,\n\n${BODY_EN}\n\nBest regards,\nTom\n`;
const BODY_DE = "Ihre Bestellung ist leider nicht am 6. Oktober angekommen, das tut mir leid. Unser Logistikpartner hatte eine St\u00f6rung im Transportnetz. "
    + "Wir haben das Paket neu verschickt, und es kommt bis Donnerstag, den 16. Oktober, bei Ihnen an.";
const LETTER_DE = `Sehr geehrter Herr Becker,\n\n${BODY_DE}\n\nMit freundlichen Gr\u00fc\u00dfen\n\nJulia Hartmann\nKundenservice`;
const ESSAY = "Remote work has changed how teams work together. Companies like Atlassian reported a 23 % rise in productivity after 2021. "
    + "Employees save about 72 minutes a day by not commuting.\n\nCommunication can become fragmented when teams rely only on chat tools.";

section("splitLetterFrame");
{
    check("German: the first word after \"Liebe ...,\" written small as in the original", greetingCase("Liebe Mitglieder,\n\n", "wir haben Neues.", "Ab dem 1. M\u00e4rz ist offen.", "de") === "ab dem 1. M\u00e4rz ist offen."
        && greetingCase("Liebe Mitglieder,\n\n", "wir haben Neues.", "Sie k\u00f6nnen kommen.", "de") === "Sie k\u00f6nnen kommen."
        && greetingCase("Liebe Mitglieder,\n\n", "wir haben Neues.", "Bibliotheken sind offen.", "de") === "Bibliotheken sind offen."
        && greetingCase("Liebe Mitglieder!\n\n", "Wir haben Neues.", "Ab dem 1. M\u00e4rz.", "de") === "Ab dem 1. M\u00e4rz."
        && greetingCase("Hi Sarah,\n\n", "the review is on.", "The review is on.", "en") === "The review is on."
        && greetingCase("", "wir", "Ab heute.", "de") === "Ab heute.");
    const f = splitLetterFrame(LETTER_EN);
    check("parts concatenate back", f.head + f.body + f.tail === LETTER_EN);
    check("greeting and sign-off apart", f.head === "Hi Sarah,\n\n" && f.tail === "\n\nBest regards,\nTom\n" && f.body === BODY_EN, JSON.stringify(f));
    check("is a letter", f.letter);
    const d = splitLetterFrame(LETTER_DE);
    check("German: sign-off block with blank line and role", d.body === BODY_DE && d.tail.startsWith("\n\nMit freundlichen") && d.tail.endsWith("Kundenservice"), JSON.stringify(d.tail));
    check("German parts concatenate back", d.head + d.body + d.tail === LETTER_DE);
    const e = splitLetterFrame(ESSAY);
    check("no frame in an essay", !e.letter && e.body === ESSAY && !e.head && !e.tail);
    check("a long last line is no sign-off", !splitLetterFrame("Hi team,\n\nThe review is on Thursday and the figures follow on Tuesday.").tail);
    check("only a greeting: no frame", splitLetterFrame("Hello there!").body === "Hello there!");
    check("a sign-off alone, no greeting", splitLetterFrame(`${BODY_EN}\n\nCheers,\nTom`).tail === "\n\nCheers,\nTom");
}

section("prompts");
{
    const c = buildCritiqueMessages(BODY_EN);
    check("critique: system and the text", c.length === 2 && c[1].content === BODY_EN && /machine-written/.test(c[0].content));
    const letter = buildWholeRewriteMessages(BODY_EN, "en", { letter: true, critique: "- \"comprehensive\": buzzword" })[0].content;
    check("letter rules for a letter", letter.includes("body of a letter") && !letter.includes("essay, post"));
    check("the critique goes in", letter.includes("- \"comprehensive\": buzzword"));
    check("names the language", letter.includes("Write in English"));
    const essay = buildWholeRewriteMessages(ESSAY, "en", {})[0].content;
    check("essay rules otherwise", essay.includes("essay, post") && essay.includes("\"say\", \"for example\""));
    check("without details: no invented experiences", /never for things that happened/.test(essay) && !essay.includes("details given below"));
    const withDetails = buildWholeRewriteMessages(ESSAY, "en", { details: "I run a  14-person agency\nin Leeds." })[0].content;
    check("details go in, on one line", withDetails.includes("I run a 14-person agency in Leeds.") && withDetails.includes("details given below"));
    const de = buildWholeRewriteMessages(BODY_DE, "de", { letter: true })[0].content;
    check("German examples in a German prompt", de.includes("sondern") && de.includes("Write in German") && !de.includes("not only A but also B"));
    const fr = buildWholeRewriteMessages("Le comit\u00e9 a examin\u00e9 la proposition.", "fr", {})[0].content;
    check("other languages: English examples, the language named", fr.includes("not only A but also B") && fr.includes("Write in French") && !fr.includes("German"));
    check("tone, extra and retry go in", buildWholeRewriteMessages(ESSAY, "en", { tone: "casual", extra: "British spelling", retry: "Shorter." })[0].content
        .includes("- British spelling\n- Shorter."));
    const fc = buildFactCheckMessages(BODY_EN, "x", "en", "I run the finance team.");
    check("fact check: original, details and rewrite", fc[1].content.startsWith("Original:\n") && fc[1].content.includes("Details the writer added") && fc[1].content.includes("Rewrite:\nx"));
    check("fact check: a reworded or split fact is no error", fc[0].content.includes("split over two sentences") && fc[0].content.includes("softer degree word"));
    const gone = buildFactCheckMessages(BODY_EN, "x", "en", "", true, ["4,500", "24/7"])[0].content;
    check("fact check, free: the lost numbers, an error only where their point stays", gone.includes("no longer in the rewrite: 4,500, 24/7") && gone.includes("still makes the point"));
    check("fact check, not free: no such list (a lost number is an error there anyway)", !buildFactCheckMessages(BODY_EN, "x", "en", "", false, ["4,500"])[0].content.includes("no longer in the rewrite"));
    check("review: at most the number asked for", buildSentenceReviewMessages("t", 2)[0].content.includes("at most 2.") && buildSentenceReviewMessages("t")[0].content.includes("at most 6."));
    check("fact check: German illustration markers", buildFactCheckMessages(BODY_DE, "x", "de")[0].content.includes("\"etwa\""));
    const fix = buildFactFixMessages(BODY_EN, "rewritten", "en", ["- \"x\" -> wrong"]);
    check("fix: errors listed, the rewrite edited, the original for facts only", fix[0].content.includes("- \"x\" -> wrong") && fix[1].content === "rewritten" && fix[0].content.includes("Never copy a sentence from the original") && fix[0].content.includes("make sense as a whole"));
    check("sentence fix: notes and the text", buildSentenceFixMessages("t", "en", "- \"a\" -> b")[0].content.includes("- \"a\" -> b"));
    const body = buildChatBody("", [{ role: "user", content: "x" }], 0.6, false);
    check("chat body: model, temperature, no thinking", body.model === "local-model" && body.temperature === 0.6 && body.chat_template_kwargs.enable_thinking === false && body.stream === false);
    check("chat body: every pass prompt gets the no-hidden-marks line", body.messages[0].role === "system" && /no invisible|invisible characters/.test(body.messages[0].content) && body.messages[1].content === "x");
    check("chat body without kwargs", !("chat_template_kwargs" in buildChatBody("m", [], 0.2, true)) && !("chat_template_kwargs" in buildChatBody("m", [], 0.2, true, "low")));
    const thinking = buildChatBody("m", [], 0.5, false, "low").chat_template_kwargs;
    check("chat body with thinking: on, at the effort asked for", thinking.enable_thinking === true && thinking.reasoning_effort === "low");
    check("passes: spots come last", WHOLE_PASSES.map(p => p.id).join() === "critique,plan,rewrite,retry,outline,draft,review,sentences,facts,fix,recheck,spots,slop,words,split,splitcheck,openers,kind,verdicts,objections,everyday,speaker,alternatives,proof");
    check("passes: every English Plainer pass has a pass entry", WHOLE_PLAIN_EN.every(p => WHOLE_PASSES.some(q => q.id === p.id)) && WHOLE_PLAIN_EN.length === 5);
}

section("wholeSpotNotes");
{
    const notes = wholeSpotNotes("Moreover, leadership is not a title, it's a service. We met on Monday.", "en");
    check("contrast and stock phrase named", notes.some(n => n.startsWith("- set-up contrast")) && notes.some(n => n.includes("\"Moreover\"")), notes);
    check("plain text: none", !wholeSpotNotes("We met on Monday and agreed on the budget.", "en").length);
    const copied = "I'll send the key figures soon. The travel costs for the Berlin fair came in about 4,500 euros over our estimate.";
    check("a sentence copied from the original", copiedSentences(BODY_EN, copied).join() === "The travel costs for the Berlin fair came in about 4,500 euros over our estimate.", copiedSentences(BODY_EN, copied));
    check("short shared runs don't count", !copiedSentences(BODY_EN, "The Q3 budget review is on Thursday, and the figures follow.").length);
    check("named as a spot with the original", wholeSpotNotes(copied, "en", BODY_EN).some(n => n.startsWith("- copied from the original")) && !wholeSpotNotes(copied, "en").length);
    check("German contrast", wholeSpotNotes("Das ist kein Sprint, sondern ein Marathon.", "de").some(n => n.includes("kein Sprint, sondern")));
    const plain = wholeSpotNotes("Mein Team brauchte mich nicht f\u00fcr Antworten, sondern f\u00fcr meine Haltung.", "de");
    check("German plain nicht ..., sondern", plain.length === 1 && plain[0].includes("nicht f\u00fcr Antworten, sondern"), plain);
    check("one note for an overlapping contrast", wholeSpotNotes("Das ist nicht nur ein Sprint, sondern ein Marathon.", "de").length === 1);
    check("German split contrast", wholeSpotNotes("Es geht ja nicht nur um Software. Es geht darum, dass wir wachsen.", "de").length === 1);
    check("German half contrast", wholeSpotNotes("Es geht hier nicht nur darum, dass jemand eine Software bedienen kann. Es ist auch eine Frage der Neugier.", "de").length === 1);
    const conc = wholeSpotNotes("Nat\u00fcrlich kostet Weiterbildung Geld und Zeit. Aber ich finde, das rechnet sich.", "de");
    check("German concession", conc.length === 1 && conc[0].startsWith("- concession:"), conc);
    check("German concession, aber later", wholeSpotNotes("Nat\u00fcrlich kostet Weiterbildung am Anfang Geld. Die Rechnung geht aber auf.", "de").some(n => n.startsWith("- concession:")));
    check("German concession with ja", wholeSpotNotes("Ja, es kostet erst einmal Geld und Zeit. Aber es lohnt sich.", "de").some(n => n.startsWith("- concession:")));
    check("German concession: drop the opener, keep the aber", conc[0].includes("keep both facts and the \"aber\""));
    check("German contrast: both sides kept, English unchanged", wholeSpotNotes("F\u00fchrung ist kein Titel, sondern ein Dienst.", "de")[0].includes("Keep both sides")
        && !wholeSpotNotes("Leadership is not a title, but a service.", "en").some(n => n.includes("Keep both sides")) && wholeSpotNotes("Leadership is not a title, but a service.", "en").length === 1);
    check("English concession", wholeSpotNotes("Of course, training costs money. But it pays off.", "en").some(n => n.startsWith("- concession:")));
    check("no concession in a plain sentence", !wholeSpotNotes("Klar war das teuer, und wir haben es trotzdem gemacht.", "de").length);
    for (const c of ["Das passiert selten lautstark, sondern in stillen Momenten.", "F\u00fcr mich ist F\u00fchrung weniger eine Position als eine Aufgabe.",
        "Mein Team brauchte mich nicht wegen der L\u00f6sungen. Es ging eher um meine Haltung.", "Meine Haltung war entscheidend, nicht meine L\u00f6sungen."]) check("German contrast: " + c.slice(0, 30), wholeSpotNotes(c, "de").length === 1, wholeSpotNotes(c, "de"));
    check("German triplet", wholeSpotNotes("Ich wollte schnell sein, effizient sein und Probleme sofort l\u00f6sen.", "de").some(n => n.startsWith("- list of three:")));
    check("English triplet", wholeSpotNotes("We wanted it fast, cheap and simple.", "en").some(n => n.startsWith("- list of three:")));
    check("a relative clause is no triplet", !wholeSpotNotes("Es geht um die Kultur eines Unternehmens, das Neugier und Wachstum f\u00f6rdert.", "de").length);
    check("a pair is no triplet", !wholeSpotNotes("Das ist gezielt und schnell auf die Bed\u00fcrfnisse abgestimmt.", "de").length);
    const filler = wholeSpotNotes("Ehrlich gesagt liegt die Arbeit im Alltag.", "de");
    check("candour filler", filler.length === 1 && filler[0].startsWith("- filler: \"Ehrlich gesagt\""), filler);
    check("English filler", wholeSpotNotes("To be honest, the budget was tight.", "en").some(n => n.includes("To be honest")));
    const essayRules = buildWholeRewriteMessages("Weiterbildung lohnt sich f\u00fcr kleine Firmen, weil sie schneller reagieren k\u00f6nnen.", "de", {})[0].content;
    const postRules = buildWholeRewriteMessages("Vor einem Jahr habe ich mein Team \u00fcbernommen, und ich lerne seitdem.", "de", {})[0].content;
    check("argued text: two illustrations, no pro-contra layout", essayRules.includes("Give two of the abstract claims") && essayRules.includes("pro, then contra") && !essayRules.includes("null"));
    check("first-person post: one illustration, no pro-contra rule", postRules.includes("Give one abstract claim") && !postRules.includes("pro, then contra") && !postRules.includes("null"));
    check("no voice example names a filler", !/honest|ehrlich/i.test(m.WHOLE_EXAMPLES.en.voice + m.WHOLE_EXAMPLES.de.voice));
}

section("missingNumbers");
{
    check("none missing", !missingNumbers(BODY_EN, "4,500 euros, Q3").length);
    check("a dropped figure", missingNumbers(ESSAY, "Atlassian saw productivity rise after 2021.").join() === "23,72");
    check("24/7 is one number", missingNumbers("Open 24/7, since 2021.", "Open day and night, since 2021.").join() === "24/7");
    check("a number written out counts as kept", !missingNumbers("12-hour shifts, 20 percent", "twelve-hour shifts, twenty percent").length
        && !missingNumbers("12 Stunden", "zw\u00f6lf Stunden").length && missingNumbers("12 or 3 people", "a dozen or three").join() === "12" && missingNumbers("8 rooms", "Achtung, rooms").join() === "8");
    check("compound number words", !addedNumbers("bursts of twenty-five minutes", "bursts of 25 minutes").length && !addedNumbers("einundzwanzig Tage", "21 Tage").length
        && !missingNumbers("47 Seiten", "siebenundvierzig Seiten").length && numberWords("30") === "thirty|drei\u00dfig" && numberWords("3.5") === "" && numberWords("120") === "");
    {
        const APP = "Downloading the app update by March 25 will ensure your key fob and digital key are synced to the new access system.";
        const APP2 = "Before the switch, download the latest FitLoop app update by March 25, which links your key fob and digital key to the new access system.";
        const r = repeatedSentences("Download the app update by March 25. It syncs your key fob.", `Starting April 1, the gym is open around the clock. ${APP}\n\nStaff are there from 6 a.m. to 10 p.m.\n\n${APP2}`);
        check("a point said twice", r.length === 1 && r[0][0] === APP && r[0][1] === APP2, r);
        check("not a question, not short sentences, not a repeat the original had", !repeatedSentences("x", "What was your biggest lesson in your first year as a leader? My biggest lesson in my first year as a leader was trust.").length
            && !repeatedSentences("x", "Plan the route. Plan the route.").length && !repeatedSentences("x", "Mein Team braucht mich weniger wegen meiner konkreten L\u00f6sungen. Es braucht mich wegen meiner Haltung.").length && !repeatedSentences(`${APP} Staff are there. ${APP2}`, `${APP} ${APP2}`).length);
    }
    check("a made-up number", addedNumbers("open 24/7, 12-hour shifts", "someone at 3 a.m., twelve-hour shifts, 24/7").join() === "3"
        && !addedNumbers("twelve-hour shifts", "12-hour shifts").length && !addedNumbers("um 11:00 Uhr", "um 11 Uhr").length);
    check("a full hour is the same time", !missingNumbers("von 11:00 bis 17.00 Uhr, 9.500 kWh", "von 11 bis 17 Uhr, 9.500 kWh").length && missingNumbers("um 11:30", "um 11 Uhr").join() === "11:30");
    check("German dates", missingNumbers(BODY_DE, "am 6. Oktober").join() === "16", missingNumbers(BODY_DE, "am 6. Oktober"));
    check("proofread prompt keeps the casual wording", /casual is not a mistake/.test(buildProofreadMessages("x", "de")[0].content) && buildProofreadMessages("x", "de")[0].content.includes("German"));
}

section("applyProofFixes");
{
    // Real find lists: a missing verb, a case slip, notes in place of fixes, a long rambling check.
    const T = "Die Isolation w\u00fcrde von einzelnen Haushalten zu einem allgemeinen Zustand. Der Verein hilft.\n\nEr kann nicht ersetzen, wenn \u00f6ffentliche Angebote fehlen. Die Solarpaneele bestehen aus Silikon-Zellen.";
    let p = applyProofFixes(T, "- \"Die Isolation w\u00fcrde von einzelnen Haushalten zu einem allgemeinen Zustand.\" -> \"Die Isolation w\u00fcrde von einzelnen Haushalten zu einem allgemeinen Zustand werden.\"\n"
        + "- \"Er kann nicht ersetzen, wenn \u00f6ffentliche Angebote fehlen.\" -> \"Er kann nicht ersetzen, was \u00f6ffentliche Angebote leisten, wenn diese fehlen.\"\n"
        + "- \"Die Solarpaneele bestehen aus Silikon-Zellen.\" -> \"Die Solarpaneele bestehen aus Siliziumzellen.\"");
    check("small fixes applied", p.fixes.length === 3 && p.listed === 3 && p.text.includes("Zustand werden.") && p.text.includes("was \u00f6ffentliche Angebote leisten") && p.text.includes("Siliziumzellen"), p);
    p = applyProofFixes(T, "- \"Der Verein hilft.\" -> \"Der Verein hilft.\" (Kein Fehler, aber pr\u00fcfen: stilistisch okay.)\n- \"Der Verein hilft.\" -> \"Der Verein hilft. (Hinweis: Hier ist kein Fehler)\"");
    check("a line that repeats its quote, or only adds a note, changes nothing", !p.fixes.length && p.listed === 2 && p.text === T, p);
    p = applyProofFixes(T, "1. \"Der Verein hilft.\" -> Korrekt.\n2. \"Er kann nicht ersetzen\" -> Korrekt.\n\nOK");
    check("a check list with no fixes", !p.fixes.length && !p.listed && p.text === T);
    p = applyProofFixes(T, "- \"Der Verein hilft.\" -> \"Der Sportverein der Stadt hilft allen Familien sehr.\"\n- \"Der Verein hilft.\" -> \"Der Verein hilft 20 Familien.\"\n- \"Das gibt es nicht.\" -> \"Das gibt es.\"");
    check("a fix that rewrites, adds a number or quotes nothing in the text is not applied", !p.fixes.length && p.text === T, p);
    p = applyProofFixes("Die Anlage braucht keine gro\u00dfe Zeit. Sie kostet einen dreistelligen bis vierstelligen Betrag.",
        "- \"braucht keine gro\u00dfe Zeit\" -> \"braucht nicht viel Zeit\"\n- \"einen dreistelligen bis vierstelligen Betrag\" -> \"einen f\u00fcnfstelligen bis sechsstelligen Betrag\"");
    check("two words may change in a short quote; a number inside a word may not", p.fixes.length === 1 && p.text.startsWith("Die Anlage braucht nicht viel Zeit. Sie kostet einen dreistelligen"), p);
    p = applyProofFixes("Er hilft. Er hilft.", "- \"Er hilft.\" -> \"Er half.\"");
    check("a quote found twice is not applied", !p.fixes.length);
    check("the find prompt asks for quote -> fix lines in German", /genaues Zitat aus dem Text/.test(buildProofFindMessages("x")[0].content) && /Stil, Satzl\u00e4nge/.test(buildProofFindMessages("x")[0].content) && buildProofFindMessages(" x ")[1].content === "x");
}

section("factCheckErrors");
{
    check("OK: none", !factCheckErrors("OK").length && !factCheckErrors("**OK**").length && !factCheckErrors("OK.").length);
    check("bullets", factCheckErrors("- \"a\" -> wrong date\n- \"b\" -> lost the 10 %").length === 2);
    check("only the arrow lines when there are some", factCheckErrors("- \"a\" -> wrong date\n- The original says X, the rewrite says Y, which is fine.").length === 1);
    check("a point called fine is dropped", !factCheckErrors("- \"Let me know\" is a reasonable summary\n- \"by Tuesday\" is accurate").length);
    check("numbered list", factCheckErrors("1. \"x\" -> missing name\n2) \"y\" -> wrong").length === 2);
    check("one sentence without a list is one error", factCheckErrors("The rewrite drops the discount.").length === 1);
    check("thinking stripped", !factCheckErrors("<think>- \"a\" -> b</think>OK").length);
}

section("isFactError");
{
    check("a lost date is a fact error", isFactError("- \"am Montag\" -> the original says 6. Oktober"));
    check("a weaker promise is a fact error", isFactError("- \"soll\" -> the original guarantees arrival, the rewrite only says it should arrive"));
    check("a dropped metaphor is not", !isFactError("- \"Das dauert\" -> The rewrite removes this specific metaphor (Marathon vs Sprint)."));
    check("a lost contrast is not", !isFactError("- \"Vertrauen\" -> missing the specific contrast of giving vs building"));
    check("tone is not", !isFactError("- \"Ich finde\" -> changes the tone and register of the original"));
    check("the quote alone doesn't decide", isFactError("- \"a saying from 2020\" -> the year 2020 is missing"));
}

section("acceptWholeRewrite");
{
    const re = "I'll send you the key figures by Tuesday, before the Q3 review next Thursday.\n\nBerlin: travel came in about 4,500 euros over budget.";
    check("a rewrite is accepted", acceptWholeRewrite(BODY_EN, BODY_EN, re, "en", "rewrite").ok);
    check("an echo is no rewrite", /barely changed/.test(acceptWholeRewrite(BODY_EN, BODY_EN, BODY_EN.replace("full", "complete"), "en", "rewrite").reason || ""));
    check("empty", acceptWholeRewrite(BODY_EN, BODY_EN, "  ", "en", "rewrite").reason === "empty reply");
    check("preamble refused", /introduction/.test(acceptWholeRewrite(BODY_EN, BODY_EN, "Here is the rewritten text: " + re, "en", "rewrite").reason || ""));
    check("much shorter refused", /shorter/.test(acceptWholeRewrite(BODY_EN, BODY_EN, "Review Thursday.", "en", "rewrite").reason || ""));
    check("wrong language refused", /German/.test(acceptWholeRewrite(BODY_EN, BODY_EN, BODY_DE, "en", "rewrite").reason || ""));
    const du = BODY_DE.replace("Ihre Bestellung", "Deine Bestellung").replace("bei Ihnen", "bei dir") + " Das ist f\u00fcr dich.";
    check("German form of address kept", acceptWholeRewrite(BODY_DE, BODY_DE, du, "de", "rewrite").address === "Sie");
    const small = re.replace("before the Q3", "ahead of the Q3");
    check("a fix that edits a few words is accepted", acceptWholeRewrite(BODY_EN, re, small, "en", "fix").ok);
    check("a fix that changed nothing", acceptWholeRewrite(BODY_EN, re, re, "en", "fix").unchanged);
    check("a fix that went back to the original is refused", /original wording/.test(acceptWholeRewrite(BODY_EN, re, BODY_EN, "en", "fix").reason || ""));
    const other = "Our trip to Berlin was expensive and the overview is late, we will talk about the budget on Thursday next week instead of Tuesday.";
    check("a fix that rewrote everything is refused", /far more/.test(acceptWholeRewrite(BODY_EN, re, other, "en", "spots").reason || ""));
    check("a pass that drops a number is refused", /dropped the number 4,500/.test(acceptWholeRewrite(BODY_EN, re, re.replace("about 4,500 euros", "a lot"), "en", "fix").reason || ""));
    check("a comment on the text is refused", /commented on the text/.test(acceptWholeRewrite(BODY_EN, BODY_EN, re + " Though the text does not specify the baseline.", "en", "rewrite").reason || ""));
    check("\"the original\" as a noun is a comment, as an adjective it isn't", /commented/.test(acceptWholeRewrite(BODY_EN, BODY_EN, re + " The original says nothing about the baseline.", "en", "rewrite").reason || "")
        && /commented/.test(acceptWholeRewrite(BODY_EN, BODY_EN, re + " The figures are as in the original.", "en", "rewrite").reason || "")
        && !/commented/.test(acceptWholeRewrite(BODY_EN, BODY_EN, re + " The original plan had us open five days.", "en", "rewrite").reason || ""));
    check("a cut announced in the text is refused", /commented/.test(acceptWholeRewrite(BODY_DE, BODY_DE, "Das Paket kam nicht am 6. Oktober. Die Gr\u00fcnde lassen wir hier weg. Es kommt bis 16. Oktober.", "de", "rewrite").reason || ""));
    check("German too", /commented/.test(acceptWholeRewrite(BODY_DE, BODY_DE, "Das Paket kam nicht am 6. Oktober, der Text nennt keinen Grund. Es kommt bis 16. Oktober, sagt das Original.", "de", "rewrite").reason || ""));
    const cut = re.split("\n\n")[0];
    {
        // A letter's body may come down to a quarter, with every number kept.
        const fluff = "Wir freuen uns sehr, Ihnen mitzuteilen, dass die Bibliothek ab dem 1. M\u00e4rz auch sonntags von 11 bis 17 Uhr ge\u00f6ffnet ist. "
            + "Dieser neue Zeitraum wurde ganz speziell f\u00fcr Sie geschaffen, um Ihnen flexible M\u00f6glichkeiten f\u00fcr Ihre Freizeitgestaltung zu bieten. Wir laden Sie herzlich ein, dieses besondere neue Angebot schon bald zu entdecken. ";
        const short = "Ab dem 1. M\u00e4rz ist die Bibliothek sonntags von 11 bis 17 Uhr offen. Es gibt keine Ausleihe.";
        const ratio = short.length / fluff.length;
        check("a letter's rewrite may be a quarter of it when it keeps every number", ratio > 0.25 && ratio < 0.3 && acceptWholeRewrite(fluff, fluff, short, "de", "rewrite", true).ok
            && /shorter/.test(acceptWholeRewrite(fluff, fluff, short, "de", "rewrite").reason || "")
            && /shorter/.test(acceptWholeRewrite(fluff, fluff, short.replace("11 bis 17", "elf bis abends"), "de", "rewrite", true).reason || ""), ratio);
    }
    check("a sentence pass that cuts is refused", /cut part/.test(acceptWholeRewrite(BODY_EN, re, cut, "en", "sentences").reason || ""));
    check("the fix may shorten", !/cut part/.test(acceptWholeRewrite(BODY_EN, re, re.replace(" next Thursday", ""), "en", "fix").reason || ""));
    check("wrapping quotes dropped", acceptWholeRewrite(BODY_EN, BODY_EN, `"${re}"`, "en", "rewrite").text === re);
}

section("cutFillerSentences");
{
    const T = "We moved the review to Thursday. This flexibility creates trust in the whole team.\n\nThe trip cost 4,500 euros. That shows how much it matters.";
    let c = cutFillerSentences(T, "- \"This flexibility creates trust in the whole team.\"\n- That shows how much it matters. 4,500\n- The trip cost 4,500 euros.");
    check("quoted filler cut, a sentence with a number kept, at most a third", c.cut.length === 1 && c.text === "We moved the review to Thursday.\n\nThe trip cost 4,500 euros. That shows how much it matters.", c);
    c = cutFillerSentences("A one. B two is here. C three is here. D four is here. E five is here. F six is here.", "- B two is here.\n- C three is here. -> generic");
    check("two of six, the arrow note ignored", c.cut.length === 2 && c.text === "A one. D four is here. E five is here. F six is here.", c.text);
    c = cutFillerSentences("Wir bauen um. Man sollte feste Zeiten haben. Diese Struktur schafft Vertrauen. Das Netz w\u00e4chst weiter.", "- Man sollte feste Zeiten haben.\n- Diese Struktur schafft Vertrauen.\n- Wir bauen um.", "de");
    check("German: advice and the writer's own sentences stay", c.cut.join() === "Diese Struktur schafft Vertrauen.", c.cut);
    c = cutFillerSentences("Der Anfang ist nicht billig. Ein Team arbeitet danach z\u00fcgiger, sodass sich der Aufwand amortisiert. Das ist gut so. Es bleibt dabei.", "- Ein Team arbeitet danach z\u00fcgiger, sodass sich der Aufwand amortisiert.\n- Das ist gut so.", "de");
    check("German: a sentence that carries the argument on stays", c.cut.join() === "Das ist gut so.", c.cut);
    check("OK cuts nothing", cutFillerSentences(T, "OK").text === T);
    c = cutFillerSentences("Short fact here.\n\nOnly filler sentence in here.\n\nAnother fact stays.", "- Only filler sentence in here.");
    check("an emptied paragraph goes", c.text === "Short fact here.\n\nAnother fact stays.", JSON.stringify(c.text));
}

section("wholeRewrite");
{
    const REWRITE = "I'll send you the key figures by Tuesday, before the Q3 review next Thursday. Moreover, the Berlin trip came in about 4,500 euros over the estimate.";
    const SENTENCES = REWRITE.replace("before the Q3", "ahead of the Q3");
    const SPOTS = SENTENCES.replace("Moreover, the", "The");
    const script = (facts, extra) => {
        const calls = [];
        const answers = { critique: "- \"comprehensive\": buzzword", rewrite: REWRITE, retry: REWRITE, review: "- \"before the Q3\" -> tidy", sentences: SENTENCES, facts, fix: SENTENCES.replace("4,500", "4,500"), spots: SPOTS, proof: c => c.find(x => x.id === "proof").messages[1].content, ...extra };
        return { calls, chat: async (id, messages, maxTokens, think) => { calls.push({ id, messages, maxTokens, think }); if (answers[id] instanceof Error) throw answers[id]; return typeof answers[id] === "function" ? answers[id](calls) : answers[id]; } };
    };
    let s = script("OK");
    let r = await wholeRewrite(LETTER_EN, "en", { details: "" }, s.chat);
    check("passes in order, no fix when the check is OK", s.calls.map(c => c.id).join() === "critique,rewrite,review,sentences,facts,spots,proof", s.calls.map(c => c.id));
    check("the body only goes to the model", s.calls.every(c => !c.messages[c.messages.length - 1].content.includes("Hi Sarah")));
    check("the result", r.body === SPOTS && r.frame.head === "Hi Sarah,\n\n" && r.info.letter, r.body);
    check("info", r.info.flagged === 1 && r.info.spotsFound === 1 && r.info.spotsLeft === 0 && !r.info.errors.length && r.info.change > 0.3, JSON.stringify(r.info));
    check("the critique reaches the rewrite", s.calls[1].messages[0].content.includes("buzzword"));

    s = script("- \"over the estimate\" -> it was the initial estimate", { fix: SENTENCES.replace("over the estimate", "over the initial estimate"), recheck: "- \"Berlin trip\" -> it was the Berlin fair" });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("errors: the fix runs before the spots", s.calls.map(c => c.id).join() === "critique,rewrite,review,sentences,facts,fix,recheck,spots,proof" && r.info.fixed && r.info.errors.length === 1);
    check("the recheck's findings are kept for the report", r.info.remaining.length === 1, r.info.remaining);
    check("the fix's errors are in its prompt", s.calls[5].messages[0].content.includes("initial estimate"));

    s = script("OK", { rewrite: REWRITE.replace("4,500", "several thousand"), sentences: SENTENCES.replace("4,500", "several thousand"), spots: SPOTS.replace("4,500", "several thousand"),
        fix: SENTENCES.replace("4,500", "several thousand").replace("ahead of", "just ahead of") });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("a lost number goes to the fix, and the report knows it is still missing", s.calls.find(c => c.id === "fix").messages[0].content.includes("the number \"4,500\"")
        && r.info.missing.join() === "4,500", r.info.missing);
    s = script("OK", { rewrite: REWRITE.replace("by Tuesday", "by Tuesday at 9 a.m."), sentences: SENTENCES.replace("by Tuesday", "by Tuesday at 9 a.m."), fix: SENTENCES });
    r = await wholeRewrite(LETTER_EN, "en", { free: true }, s.chat);
    check("a number the rewrite made up goes to the fix", (s.calls.find(c => c.id === "fix") || { messages: [{ content: "" }] }).messages[0].content.includes("\"9\" is not in the original")
        && !r.body.includes("9 a.m.") && r.info.errors.length === 1, s.calls.map(c => c.id));
    {
        const TWICE = SENTENCES + " The Berlin trip came in about 4,500 euros over the original estimate we made.";
        s = script("OK", { rewrite: REWRITE, sentences: TWICE, fix: SENTENCES });
        r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
        check("a point said twice goes to the fix", (s.calls.find(c => c.id === "fix") || { messages: [{ content: "" }] }).messages[0].content.includes("says again what") && r.info.errors.length === 1, s.calls.map(c => c.id));
    }
    check("an unchanged proofreading is not reported as skipped", !r.info.passes.some(p => p.id === "proof"));
    {
        // The errors found in code come first, so the 12-item cap never cuts them off.
        const TWO = "I'll send you the key figures by Tuesday, before the Q3 review next Thursday at 9.\n\nThe Berlin trip came in about 4,500 euros over the estimate.";
        s = script("- \"Berlin trip\" -> it was the Berlin fair\n- \"Tuesday\" -> it said Monday", { rewrite: TWO, review: "", spots: TWO, fix: TWO.replace(" at 9", "").replace("trip", "fair"), recheck: "OK" });
        r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
        check("facts: one check on the whole text, code-found errors first", s.calls.filter(c => c.id === "facts").length === 1 && s.calls.find(c => c.id === "facts").messages[1].content.includes("Rewrite:\nI'll send you")
            && r.info.errors.length === 3 && /"9" is not in the original/.test(r.info.errors[0]), r.info.errors);
    }

    // Rewrite freely: a plan between critique and rewrite, and a number that went with a
    // dropped point is no fact-check error.
    s = script("OK", { plan: "- drop the generic point", rewrite: REWRITE.replace(" Moreover, the Berlin trip came in about 4,500 euros over the estimate.", " Berlin was over budget."),
        sentences: SENTENCES.replace(" Moreover, the Berlin trip came in about 4,500 euros over the estimate.", " Berlin was over budget."), spots: SPOTS.replace(" The Berlin trip came in about 4,500 euros over the estimate.", " Berlin was over budget.") });
    r = await wholeRewrite(LETTER_EN, "en", { free: true }, s.chat);
    check("free: the plan runs after the critique and reaches the rewrite", s.calls.map(c => c.id).slice(0, 3).join() === "critique,plan,rewrite"
        && s.calls[2].messages[0].content.includes("drop the generic point") && s.calls[2].messages[0].content.includes("may change the content"), s.calls.map(c => c.id));
    check("free: a dropped number goes to the report, not to the fix", !s.calls.some(c => c.id === "fix") && r.info.missing.join() === "4,500" && r.info.free, s.calls.map(c => c.id));
    check("free: an essay's plan keeps a point that has a figure", m.buildPlanMessages(ESSAY, "en", "", false)[0].content.includes("a point that has one stays, with it"));
    check("free: the plan asks for no limit or doubt (it made claims up)", !/limit or doubt|unsure/.test(m.buildPlanMessages(ESSAY, "en", "", false)[0].content));
    check("free: the slop pass runs before the proofreading", s.calls.map(c => c.id).slice(-2).join() === "slop,proof", s.calls.map(c => c.id));
    check("free: the fact check allows dropped points", s.calls.find(c => c.id === "facts").messages[0].content.includes("allowed to change the content"));
    check("free: the fact check gets the lost number", s.calls.find(c => c.id === "facts").messages[0].content.includes("no longer in the rewrite: 4,500."));
    // Plainer, German: everyday words, then each long sentence split on its own, then a row opening alike; the fact check again after.
    const RW_DE = "Ihr Paket kam am 6. Oktober nicht an, das tut mir leid. Bei unserem Logistikpartner gab es eine St\u00f6rung im Transportnetz. "
        + "Wir haben es noch einmal losgeschickt, und es ist bis Donnerstag, den 16. Oktober, bei Ihnen.";
    const PLAIN_DE = "Ihr Paket kam am 6. Oktober nicht an, das tut mir leid. Bei unserem Logistikpartner gab es eine St\u00f6rung im Transportnetz. "
        + "Wir haben es noch einmal losgeschickt. Es ist bis Donnerstag, den 16. Oktober, bei Ihnen.";
    const echo = c => c[c.length - 1].messages[1].content;
    const scriptDe = extra => script("OK", { critique: "- stiff", rewrite: RW_DE, review: "", spots: RW_DE, words: PLAIN_DE, fix: PLAIN_DE, ...extra });
    s = scriptDe();
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: words, no split without a long sentence, then the fact check again", s.calls.map(c => c.id).slice(-3).join() === "words,facts,proof" && r.body === PLAIN_DE, s.calls.map(c => c.id));
    check("plain de: the words pass gets the current text and one rule", s.calls.find(c => c.id === "words").messages[1].content === RW_DE
        && s.calls.find(c => c.id === "words").messages[0].content.includes("\u00c4ndere nur eines: lange W\u00f6rter") && /Kein Satz wird geteilt/.test(s.calls.find(c => c.id === "words").messages[0].content));
    const CHOP = PLAIN_DE.replace("Wir haben es noch einmal losgeschickt. Es ist bis", "Wir haben es noch einmal losgeschickt. Wir haben es gepr\u00fcft. Wir haben es bis");
    s = scriptDe({ words: c => c.filter(x => x.id === "words").length === 1 ? CHOP : PLAIN_DE });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    const wordsCalls = s.calls.filter(c => c.id === "words");
    check("plain de: a row opening alike gets one second try with a note, in German", wordsCalls.length === 2 && wordsCalls[1].messages[0].content.includes("mit \"wir haben\" beginnen") && r.body === PLAIN_DE
        && r.info.passes.filter(p => p.id === "words").length === 1 && r.info.passes.find(p => p.id === "words").ok, [wordsCalls.length, r.info.passes]);
    const SPLITTY = "Ihr Paket kam am 6. Oktober nicht an. Das ist leider so. Das tut mir leid. Bei unserem Logistikpartner gab es eine St\u00f6rung. Sie war im Transportnetz. "
        + "Wir haben es noch einmal losgeschickt. Es ist bis Donnerstag, den 16. Oktober, bei Ihnen.";
    s = scriptDe({ words: c => c.filter(x => x.id === "words").length === 1 ? SPLITTY : PLAIN_DE });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: a words pass that splits gets one second try with a note", s.calls.filter(c => c.id === "words").length === 2
        && s.calls.filter(c => c.id === "words")[1].messages[0].content.includes("Teile keinen Satz") && r.body === PLAIN_DE, r.info.passes);
    s = scriptDe({ words: CHOP });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: only one second try", s.calls.filter(c => c.id === "words").length === 2 && r.info.passes.some(p => p.id === "words" && !p.ok) && r.body === RW_DE, r.body);
    // Each long sentence goes to the model on its own; a split that fails acceptSplit keeps it.
    const LONG = "Wenn Sie Dokumente hochladen oder \u00c4nderungen vornehmen, passiert das sofort in der \u00dcbersicht, was die administrativen H\u00fcrden f\u00fcr beide Seiten deutlich senkt.";
    const LONG_SPLIT = "Wenn Sie Dokumente hochladen oder \u00c4nderungen vornehmen, passiert das sofort in der \u00dcbersicht. Das senkt die administrativen H\u00fcrden f\u00fcr beide Seiten deutlich.";
    s = scriptDe({ rewrite: RW_DE + " " + LONG, spots: RW_DE + " " + LONG, words: echo, split: LONG_SPLIT });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: one split call per long sentence, with only that sentence", s.calls.filter(c => c.id === "split" && c.messages[1].content === LONG).length === 1, s.calls.map(c => c.id));
    check("plain de: the split goes into the text", r.body === RW_DE + " " + LONG_SPLIT && r.info.passes.some(p => p.id === "split" && p.ok) && r.info.splits.join() === "1,2", r.body);
    s = scriptDe({ rewrite: RW_DE + " " + LONG, spots: RW_DE + " " + LONG, words: echo, split: LONG_SPLIT, splitcheck: "nein: B sagt etwas zweimal" });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    const sc = s.calls.find(c => c.id === "splitcheck");
    check("plain de: a split the check call says no to keeps the sentence", r.body === RW_DE + " " + LONG && r.info.splits.join() === "0,2"
        && sc.messages[1].content === `A: ${LONG}\nB: ${LONG_SPLIT}` && /nur, wenn B etwas anderes behauptet/.test(sc.messages[0].content), [r.body, r.info.splits]);
    s = scriptDe({ rewrite: RW_DE + " " + LONG, spots: RW_DE + " " + LONG, words: echo, split: LONG.replace("Wenn", "Falls") });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: a split that is still one sentence keeps the sentence", r.body === RW_DE + " " + LONG && !r.info.passes.some(p => p.id === "split"), r.body);
    check("split prompt: whole sentences, the link, both sides", /Nebensatz .* bleibt an seinem Hauptsatz/.test(buildSplitMessages(LONG)[0].content) && /genau diesen Zusammenhang/.test(buildSplitMessages(LONG)[0].content) && /nie \"dabei\"/.test(buildSplitMessages(LONG)[0].content)
        && /beh\u00e4lt beide Seiten/.test(buildSplitMessages(LONG)[0].content) && /in der Reihenfolge/.test(buildSplitMessages(LONG)[0].content) && /statt \.\.\. zu/.test(buildSplitMessages(LONG)[0].content) && /\"damit\"/.test(buildSplitMessages(LONG)[0].content) && /mit \"oder\" verbunden/.test(buildSplitMessages(LONG)[0].content) && !/stattdessen/.test(buildSplitMessages(LONG)[0].content) && buildSplitMessages(LONG)[1].content === LONG);
    // Real splits: the bad ones lost a link, an "oder", a purpose, an "ohne", a "dass", a "w\u00e4hrend" contrast, left a "Statt ... zu" fragment,
    // said a clause twice or invented a link; the good ones keep the logic (a noun said again is fine, "W\u00e4hrend der Woche" is no contrast).
    const SPLIT_BAD = [
        ["Wer im Verein aktiv ist, f\u00fchlt sich dem Ort verbunden und bleibt auch dann, wenn die wirtschaftlichen Aussichten schlecht sind.",
            "Wer im Verein aktiv ist, f\u00fchlt sich dem Ort verbunden. Deshalb bleibt er auch dann, wenn die wirtschaftlichen Aussichten schlecht sind."],
        ["Was tags\u00fcber \u00fcbrig bleibt, kann ins Netz eingespeist oder in einem Batteriespeicher zwischengelagert werden, um es abends zu nutzen.",
            "Was tags\u00fcber \u00fcbrig bleibt, kann ins Netz eingespeist werden. Es kann in einem Batteriespeicher zwischengelagert werden, um es abends zu nutzen."],
        ["Eine gr\u00fcndliche Vorbereitung ist daher essenziell, damit man selbstbewusst auftritt und fair verhandeln kann.",
            "Eine gr\u00fcndliche Vorbereitung ist daher essenziell. Man tritt selbstbewusst auf und kann fair verhandeln."],
        ["Wer genau wei\u00df, was ihm im Paket am wichtigsten ist, kann im Gespr\u00e4ch abw\u00e4gen, wo er nachgeben kann, ohne dass es am Ende schlechter wird.",
            "Wer genau wei\u00df, was ihm im Paket am wichtigsten ist, kann im Gespr\u00e4ch abw\u00e4gen, wo er nachgeben kann. Es wird am Ende nicht schlechter."],
        ["Dabei kommt es darauf an, dass man sich direkt gegen\u00fcbersteht und spricht, weil man sich das \u00fcber Chat-Apps oder soziale Medien h\u00e4ufiger spart.",
            "Man sollte sich direkt gegen\u00fcberstehen und sprechen. Denn man spart sich das \u00fcber Chat-Apps oder soziale Medien h\u00e4ufiger."],
        ["Ich habe versucht, jeden Prozess selbst zu steuern, und habe so kaum Raum f\u00fcr Fehler gelassen.",
            "Ich habe versucht, jeden Prozess selbst zu steuern. Dabei habe ich kaum Raum f\u00fcr Fehler gelassen."],
        ["W\u00e4hrend das langsamer Fahren in engen Gassen mit vielen Fu\u00dfg\u00e4ngern und Radfahrern sinnvoll ist, verfehlt es auf breiten Durchgangsstra\u00dfen sein Ziel.",
            "Das langsamere Fahren in engen Gassen mit vielen Fu\u00dfg\u00e4ngern und Radfahrern ist sinnvoll. Es verfehlt auf breiten Durchgangsstra\u00dfen sein Ziel."],
        ["Ohne diese Kontakte w\u00fcrde die Isolation schnell greifen, besonders wo der letzte B\u00e4cker geschlossen hat oder die n\u00e4chste Bushaltestelle weit entfernt ist.",
            "Ohne diese Kontakte w\u00fcrde die Isolation schnell greifen. Besonders wo der letzte B\u00e4cker geschlossen hat oder die n\u00e4chste Bushaltestelle weit entfernt ist, w\u00fcrde die Isolation schnell greifen."],
        ["Statt pauschale Limits zu verh\u00e4ngen, sollten die Stra\u00dfen so gestaltet werden, dass sie sicher sind.",
            "Die Stra\u00dfen sollten so gestaltet werden, dass sie sicher sind. Statt pauschale Limits zu verh\u00e4ngen."],
        ["Wenn es im Gespr\u00e4ch zu viel Druck gibt und man gleich ja sagen soll, darf man ruhig um Bedenkzeit bitten, um das Angebot in Ruhe durchzusehen.",
            "Wenn es im Gespr\u00e4ch zu viel Druck gibt und man gleich ja sagen soll, darf man ruhig um Bedenkzeit bitten. Man darf um Bedenkzeit bitten, um das Angebot in Ruhe durchzusehen."],
    ];
    const SPLIT_OK = [
        ["Diese Zahlen sollte man aber nicht heilig nehmen, da sie nur wertvolle Einblicke in die \u00fcblichen Spannen bieten.",
            "Diese Zahlen sollte man aber nicht heilig nehmen. Denn sie bieten nur wertvolle Einblicke in die \u00fcblichen Spannen."],
        ["Weil sich die Menschen zunehmend in digitalen R\u00e4umen bewegen und der direkte Kontakt selten wird, wird diese physische Pr\u00e4senz wichtig.",
            "Die Menschen bewegen sich zunehmend in digitalen R\u00e4umen. Der direkte Kontakt wird selten. Deshalb wird diese physische Pr\u00e4senz wichtig."],
        ["Diese Grundlagen legen den Grundstein f\u00fcr ein kritisches Verst\u00e4ndnis, das mit zehn Jahren erst beginnen muss.",
            "Diese Grundlagen legen den Grundstein f\u00fcr ein kritisches Verst\u00e4ndnis. Dieses Verst\u00e4ndnis muss mit zehn Jahren erst beginnen."],
        ["Wer den selbst erzeugten Strom direkt nutzt, spart sich die teuren Kosten f\u00fcr den Strom aus dem Netz.",
            "Wer den selbst erzeugten Strom direkt nutzt, spart sich die teuren Kosten. Diese Kosten entstehen f\u00fcr den Strom aus dem Netz."],
        ["W\u00e4hrend der Woche ist die Bibliothek bis 19 Uhr offen und am Samstag nur bis zum fr\u00fchen Nachmittag.",
            "W\u00e4hrend der Woche ist die Bibliothek bis 19 Uhr offen. Am Samstag ist sie nur bis zum fr\u00fchen Nachmittag offen."],
    ];
    SPLIT_BAD.forEach(([a, b], i) => check(`acceptSplit refuses a split that loses the logic (${i + 1})`, acceptSplit(a, b) === null));
    SPLIT_OK.forEach(([a, b], i) => check(`acceptSplit keeps a split with the same logic (${i + 1})`, acceptSplit(a, b) === b));
    check("acceptSplit: two whole sentences", acceptSplit(LONG, LONG_SPLIT) === LONG_SPLIT && acceptSplit(LONG, "\"" + LONG_SPLIT + "\"") === LONG_SPLIT);
    check("acceptSplit: one sentence, a fragment, the same opening, a lost number", acceptSplit(LONG, LONG) === null && acceptSplit(LONG, LONG_SPLIT.replace("Das senkt die administrativen H\u00fcrden f\u00fcr beide Seiten deutlich.", "Das senkt H\u00fcrden."))
        === null && acceptSplit(LONG, LONG_SPLIT.replace(". Das senkt", ". Wenn das senkt")) === null && acceptSplit("Ab 1. Mai gilt das 2 Wochen lang f\u00fcr alle, die bei uns ein Konto haben und es auch nutzen wollen, weil es dann einfacher ist.", "Ab Mai gilt das zwei Wochen lang f\u00fcr alle mit Konto. Denn dann ist es einfacher f\u00fcr alle, die es nutzen.") === null);
    // A row opening alike after the splits gets its own pass.
    const RW_ROW = RW_DE + " Sie bekommen eine Mail. Sie bekommen auch eine Nummer.";
    s = scriptDe({ rewrite: RW_ROW, spots: RW_ROW, words: echo, openers: RW_DE + " Sie bekommen eine Mail und auch eine Nummer." });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: a row opening alike gets the openers pass", s.calls.find(c => c.id === "openers")?.messages[0].content.includes("beginnen mit \"sie bekommen\"") && r.body.endsWith("Mail und auch eine Nummer."), s.calls.map(c => c.id));
    s = scriptDe({ facts: c => c.filter(x => x.id === "facts").length > 1 ? "- \"16. Oktober\" -> es war der 15. Oktober" : "OK", fix: PLAIN_DE.replace("Es ist bis", "Es ist sicher bis") });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("plain de: an error it brings in goes to a fix", s.calls.map(c => c.id).slice(-4).join() === "words,facts,fix,proof" && r.info.errors.length === 1, s.calls.map(c => c.id));
    s = scriptDe({ proof: "- \"Es ist bis Donnerstag\" -> \"Es ist sp\u00e4testens bis Donnerstag\"\n- \"gab es eine St\u00f6rung\" -> \"gab es eine St\u00f6rung\"" });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("German proofreading: a find list, applied in code", s.calls.find(c => c.id === "proof").messages[0].content.includes("genaues Zitat") && r.body === PLAIN_DE.replace("Es ist bis", "Es ist sp\u00e4testens bis")
        && r.info.proofed.join() === "1,2" && r.info.passes.some(p => p.id === "proof" && p.ok), [r.body, r.info.proofed]);
    s = scriptDe({ proof: "OK" });
    r = await wholeRewrite(LETTER_DE, "de", { plain: true }, s.chat);
    check("German proofreading: OK changes nothing and is no refusal", r.body === PLAIN_DE && r.info.proofed.join() === "0,0" && !r.info.passes.some(p => p.id === "proof"));
    s = script("OK", { words: "x" });
    await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    check("plain: the German passes on German text only", !s.calls.some(c => ["words", "split", "openers"].includes(c.id)));
    check("plain: no thinking for German", !(await (async () => { const t = scriptDe(); await wholeRewrite(LETTER_DE, "de", { plain: true }, t.chat); return t.calls.some(c => c.think); })()));
    // Plainer on English text: five one-rule passes, each editing what the one before left.
    const step = (a, b) => c => c[c.length - 1].messages[1].content.replace(a, b);
    const scriptEn = extra => script("OK", { verdicts: step("I'll send you", "You get"), objections: step("key figures", "main numbers"), everyday: step("came in about", "ran about"),
        speaker: step("over the estimate", "over what we planned"), alternatives: step("ahead of the Q3", "before the Q3"), ...extra });
    s = scriptEn();
    r = await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    check("plain en: five passes before the proofreading, then the fact check again", s.calls.map(c => c.id).slice(-7).join() === "verdicts,objections,everyday,speaker,alternatives,facts,proof"
        && r.body === "You get the main numbers by Tuesday, before the Q3 review next Thursday. The Berlin trip ran about 4,500 euros over what we planned.", [s.calls.map(c => c.id), r.body]);
    check("plain en: each pass gets the text the one before left", s.calls.find(c => c.id === "objections").messages[1].content.startsWith("You get the key figures"));
    check("plain en: the rewrite and the five passes think, the checks don't", s.calls.filter(c => c.think === "low").map(c => c.id).join() === "rewrite,verdicts,objections,everyday,speaker,alternatives", s.calls.filter(c => c.think).map(c => c.id));
    s = scriptEn({ verdicts: "x" });
    r = await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    check("plain en: a refused pass leaves the text for the next", r.info.passes.some(p => p.id === "verdicts" && !p.ok) && s.calls.find(c => c.id === "objections").messages[1].content === SPOTS);
    s = scriptEn({ facts: c => c.filter(x => x.id === "facts").length > 1 ? "- \"main numbers\" -> the original says key figures" : "OK",
        fix: c => c[c.length - 1].messages[1].content + " I will send a full overview of the key figures by Tuesday.", spots: c => c.filter(x => x.id === "spots").length > 1 ? "You get the numbers by Tuesday." : SPOTS });
    r = await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    check("plain: a fix that copies the original's wording gets a spots pass", s.calls.map(c => c.id).slice(-4).join() === "facts,fix,spots,proof"
        && s.calls[s.calls.length - 2].messages[0].content.includes("copied from the original"), s.calls.map(c => c.id));
    s = scriptEn();
    await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("plain en: off unless asked for, and no thinking then", !s.calls.some(c => WHOLE_PLAIN_EN.some(p => p.id === c.id) || c.think));
    const om = buildOneRuleMessages("A text.", WHOLE_PLAIN_EN[0].rule);
    check("one-rule prompt: the rule, the keep-the-rest frame, and the text", om[0].content.includes("Change only one thing: two kinds of sentences change") && om[0].content.includes("Leave every other sentence exactly as it is") && om[1].content === "A text.");
    check("one-rule prompts name no other language", WHOLE_PLAIN_EN.every(p => !/German|Deutsch/.test(buildOneRuleMessages("t", p.rule)[0].content)));
    const long = "We moved the review to Friday. It helps everyone. Here's what that means. The team gets one more day. That is the fix.";
    check("verdicts may cut to half", acceptWholeRewrite(long, long, "We moved the review to Friday. The team gets one more day.", "en", "verdicts").ok);
    const short = "We moved the review to Friday, so the team gets one more day for testing.";
    check("a later pass is measured against the text it got, not the original", acceptWholeRewrite(long.repeat(4), short, "We moved the review to Friday. The team gets one more day for testing.", "en", "everyday").ok);
    check("other passes may not cut that much", !acceptWholeRewrite(long, long, "We moved the review to Friday. The team gets one more day.", "en", "everyday").ok);
    // The kind of text picks the one speaker form; it is read from the original.
    s = scriptEn({ kind: "C" });
    r = await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    const sp = s.calls.find(c => c.id === "speaker").messages[0].content;
    check("plain en: the kind pass runs before the five, on the original", s.calls.map(c => c.id).slice(-8, -6).join() === "kind,verdicts" && s.calls.find(c => c.id === "kind").messages[1].content === BODY_EN && r.info.kind === "argue", s.calls.map(c => c.id));
    check("plain en: an argued text gets only the writer's expectation", sp.includes("I'd expect") && !sp.includes("you'll find") && !sp.includes("we noticed"));
    s = scriptEn({ kind: "I'm not sure." });
    r = await wholeRewrite(LETTER_EN, "en", { plain: true }, s.chat);
    check("plain en: no kind, the rule with all three forms", s.calls.find(c => c.id === "speaker").messages[0].content.includes(WHOLE_PLAIN_EN.find(p => p.id === "speaker").rule) && r.info.kind === null);
    check("kind: the letter, in any dress", parseTextKind("B") === "B" && parseTextKind("**c** - argues") === "C" && parseTextKind("A = the writer") === "A" && parseTextKind("OK") === null && parseTextKind("Both") === null);
    check("kind prompt: the three kinds", /^A = .*\nB = .*\nC = /m.test(buildTextKindMessages("t")[0].content));
    check("speaker rule per kind: its own forms, at most one per paragraph, never on a fact", speakerRule("B").includes("\"you'll notice\", \"you'll find\"") && !speakerRule("B").includes("\"I think\"")
        && speakerRule("A").includes("\"we noticed\"") && speakerRule("C").includes("\"I doubt\"") && speakerRule("A").includes("Name no source")
        && ["A", "B", "C"].every(k => /at most one judgement/.test(speakerRule(k)) && /Never on a fact, a number, a step/.test(speakerRule(k)) && !/never the same words twice/.test(speakerRule(k))));
    // A row of sentences with the same opening is refused, unless it was there before or the pass is the fix.
    const listed = "In the portal you can see your orders, download invoices and change your billing details.";
    const chopped = "You can see your orders. You can download invoices. You can change your billing details.";
    check("same-opener run", sameOpenerRun(chopped).n === 3 && sameOpenerRun(chopped).words === "you can" && sameOpenerRun("You can go. You may stay. You can leave.").n === 1);
    check("a run across paragraphs doesn't count", sameOpenerRun("You can go.\n\nYou can stay.\n\nYou can leave.").n === 1);
    check("a pass that chops a sentence into a row is refused", /3 sentences in a row with "you can"/.test(acceptWholeRewrite(listed, listed, chopped, "en", "sentences").reason || ""));
    check("a row that was there before, or the fix, is let through", acceptWholeRewrite(chopped, chopped, chopped.replace("orders", "open orders"), "en", "everyday").ok && acceptWholeRewrite(listed, listed, chopped, "en", "fix").ok);
    // The review may flag at most a third of the sentences.
    s = script("OK");
    await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("review: at most a third of the sentences", s.calls.find(c => c.id === "review").messages[0].content.includes("at most 1."));

    s = scriptDe();
    await wholeRewrite(LETTER_DE, "de", {}, s.chat);
    check("plain: off unless asked for", !s.calls.some(c => ["words", "split", "openers"].includes(c.id)));
    check("long sentences: more than 12 words", longSentences("Das Portal startet im Mai. " + LONG).length === 1 && longSentences(LONG.split(" ").slice(0, 12).join(" ") + ".").length === 0 && longSentences(LONG.split(" ").slice(0, 13).join(" ") + ".").length === 1);
    // German "Sie sehen ... Sie k\u00f6nnen ... Sie m\u00fcssen ...": a row of four by the first word is refused.
    const SIE_IN = "Sie sehen den Status und k\u00f6nnen reagieren. Sie m\u00fcssen nicht warten. Dokumente laden Sie hoch.";
    const sie = "Sie sehen den Status. Sie k\u00f6nnen reagieren. Sie m\u00fcssen nicht warten. Sie laden Dokumente hoch.";
    check("German: four sentences opening with the same word are refused", /4 sentences in a row with "sie"/.test(acceptWholeRewrite(SIE_IN, SIE_IN, sie, "de", "sentences").reason || "")
        && acceptWholeRewrite(SIE_IN, SIE_IN, sie.replace("Sie laden", "Dokumente laden Sie"), "de", "sentences").ok);
    check("English: the first word alone doesn't count", sameOpenerRun("You see it. You can go. You may stay. You leave.", 1).n === 4 && acceptWholeRewrite(listed, listed, "You see it. You can go. You may stay. You leave.", "en", "everyday").run === undefined);
    // "words" may not split sentences.
    const SHORT = "Das Portal startet im Mai. Sie bekommen vorher die Zugangsdaten. Die Daten sind verschl\u00fcsselt.";
    const SPLIT = "Das Portal startet. Das ist im Mai. Sie bekommen vorher Daten. Das sind die Zugangsdaten. Die Daten sind verschl\u00fcsselt. Das ist sicher.";
    check("words: splitting sentences is refused", acceptWholeRewrite(SHORT, SHORT, SPLIT, "de", "words").split === true && acceptWholeRewrite(SHORT, SHORT, SPLIT, "de", "spots").split === undefined);
    check("not free: no plan, the keep-every-claim rules", !s.calls.length || !(await (async () => { const t = script("OK"); await wholeRewrite(LETTER_EN, "en", {}, t.chat); return t.calls.some(c => c.id === "plan") || t.calls[1].messages[0].content.includes("may change the content"); })()));

    s = script("OK", { spots: SENTENCES + " This is not just a fair, it's a showcase." });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("spots left after the spots pass get one more round", s.calls.filter(c => c.id === "spots").length === 2 && r.info.spotsLeft > 0
        && s.calls.filter(c => c.id === "spots")[1].messages[0].content.includes("not just a fair"), s.calls.map(c => c.id));

    s = script("OK", { rewrite: BODY_EN, retry: BODY_EN, outline: "- order delayed\n- new date", draft: BODY_EN });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("an echoed rewrite: retry, then a draft from notes, then the text stays", r.body === BODY_EN && /barely/.test(r.info.failed || "")
        && s.calls.map(c => c.id).join() === "critique,rewrite,retry,outline,draft" && r.info.passes.length === 1, s.calls.map(c => c.id));
    check("the second try is the hotter retry pass and says why", s.calls[2].id === "retry" && s.calls[2].messages[0].content.includes("copied most of the text"));
    const draft = s.calls.find(c => c.id === "draft").messages;
    check("the draft sees the notes, not the text", draft[1].content === "- order delayed\n- new date" && draft[0].content.includes("content of the text as notes"));
    check("the outline sees the text", s.calls.find(c => c.id === "outline").messages[1].content === BODY_EN);

    s = script("OK", { rewrite: BODY_EN, retry: BODY_EN, outline: "- notes", draft: REWRITE });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("a draft from notes can rescue it", r.body === SPOTS && !r.info.failed && r.info.passes[0].id === "rewrite" && r.info.passes[0].ok);

    s = script("OK", { rewrite: "Dear customer,\n\n" + REWRITE + "\n\nBest regards,\nTom" });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("a greeting or sign-off the model wrote into a letter body goes", r.body === SPOTS && r.frame.head + r.body + r.frame.tail === LETTER_EN.replace(BODY_EN, SPOTS), r.body);

    s = script("OK", { rewrite: "", retry: "" });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("no draft from notes for another refusal", !s.calls.some(c => c.id === "outline") && r.info.failed);

    s = script("OK", { rewrite: "", retry: REWRITE });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("a second try can rescue it", r.body === SPOTS && !r.info.failed);

    s = script("OK", { review: "No sentence would be flagged." });
    r = await wholeRewrite(ESSAY, "en", {}, s.chat);
    check("no flagged sentence: no sentence pass", !s.calls.some(c => c.id === "sentences") && r.info.flagged === 0);

    const stop = new Error("Stopped"); stop.name = "AbortError";
    s = script("OK", { review: stop });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    check("Stop keeps the finished rewrite", r.info.stopped && r.body === REWRITE);

    s = script("OK", { sentences: "Here is the edited text: " + SENTENCES });
    r = await wholeRewrite(LETTER_EN, "en", {}, s.chat);
    // The sentence pass is refused, so the spots pass gets the rewrite itself.
    check("a refused pass leaves the text as it was", r.info.passes.some(p => p.id === "sentences" && !p.ok) && s.calls.find(c => c.id === "spots").messages[1].content === REWRITE, r.info.passes);

    s = script("OK");
    r = await wholeRewrite("Hi Sarah,", "en", {}, s.chat);
    check("too short to rewrite", !s.calls.length && /too short/.test(r.info.failed || ""));
}

report();
