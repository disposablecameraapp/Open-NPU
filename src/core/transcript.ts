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

/** The text, or "" when it is something the recognizer made up. `rms` and `ms` describe the sound it was given. */
export function cleanTranscript(text: string, sound?: { rms: number; ms: number }): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (ALWAYS.some((re) => re.test(t))) return "";
  if (sound && sound.rms < 0.03 && sound.ms < 2500 && WHEN_QUIET.test(t)) return "";
  return t;
}
