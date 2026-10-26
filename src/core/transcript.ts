/**
 * What a recognizer says about silence and noise is not always empty: Whisper in particular writes a caption of a video ("Thanks for
 * watching", "Sous-titrage ST' 501") or a tag ("[BLANK_AUDIO]"). Those are dropped so they never reach the chat.
 */
const ALWAYS = [
  /^[\[(*♪\s]*(blank[_ ]audio|silence|music|musique|applause|applaudissements|bruit|noise|inaudible)[\])*♪\s.]*$/i,
  /sous-?titr(age|és?)\s+(st'?\s*\d+|par|réalisé|fait|société)/i,
  /amara\.org|subtitles? by|sous-titres? (réalisés?|par)/i,
  /thanks? for watching|thank you for watching|merci d'avoir regardé|n'oubliez pas de (vous )?abonner|abonnez-vous/i,
  /^[\s.,!?…\-–—♪*]*$/
];
/** Words Whisper invents on a quiet or short sound: dropped only when the sound really was quiet. */
const WHEN_QUIET = /^(thank you|thanks|merci|you|oh|uh|um|hmm|bye|okay|ok|ah|euh|hm)[\s.!?]*$/i;

/**
 * Sound descriptions a recognizer writes between brackets, parentheses, asterisks or notes: "(coughing)", "[Music]", "*sighs*", "(toux)",
 * "♪ la la ♪". Speech never comes out that way, so they go wherever they sit in the text, not only when they are the whole text.
 */
const ANNOTATION = /\[[^\]]{0,60}\]|\([^)]{0,60}\)|\{[^}]{0,60}\}|<[^>]{0,60}>|\*[^*\n]{1,60}\*|♪[^♪]*♪?|♫[^♫]*♫?/g;

/** The text without the sound descriptions in it. */
export function stripAnnotations(text: string): string {
  return text.replace(ANNOTATION, " ").replace(/\s+/g, " ").replace(/\s+([,.…])/g, "$1").trim();
}

/** The text, or "" when it is something the recognizer made up. `rms` and `ms` describe the sound it was given. */
export function cleanTranscript(text: string, sound?: { rms: number; ms: number }): string {
  const t = stripAnnotations(text.trim());
  if (!t) return "";
  if (ALWAYS.some((re) => re.test(t))) return "";
  if (sound && sound.rms < 0.03 && sound.ms < 2500 && WHEN_QUIET.test(t)) return "";
  return t;
}

/** Sounds a person makes that are not said to the assistant: coughs and laughs a recognizer writes as words, hesitations, one-letter bits. */
const NOT_SPEECH = new Set(["euh", "heu", "hum", "hmm", "mm", "mmm", "ah", "oh", "eh", "ha", "haha", "hahaha", "hihi", "hehe", "uh", "um", "uhm", "tss", "pff", "pfff", "bah", "ben", "hé", "ouf", "toux", "cough", "laugh"]);

/** Words of a live transcription that were really said to the assistant: none when it holds only annotations, laughs, coughs or hesitations. */
export function speechWords(text: string): string[] {
  const t = cleanTranscript(text);
  return t.split(/\s+/).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")).filter((w) => w.length > 1 && !NOT_SPEECH.has(w) && !/^(h[aei]){2,}h?$/.test(w));
}
