# Rules of a good slide (checked by the app)

The app, not the model, keeps these rules: `src/core/slideRules.ts` checks every slide it makes, mends what it can without a model
(extra lines go to the speaker notes, a lone bullet becomes the message of the slide) and gives the rest back to the writer as the reason
to write the slide again. `improveLayout` in `src/core/deckBuild.ts` chooses the layout (figure cards, timeline, columns, closing message)
from what was written.

| Rule | Where it comes from | What the app does |
|---|---|---|
| One idea per slide, at most 6 lines (4 with a visual) | Duarte, *Slide:ology*; Reynolds, *Presentation Zen* | extra lines go to the notes |
| At most 40 words of body text (28 beside a visual) | Kawasaki's 10/20/30; Duarte (a slide is read at a glance); Mayer's coherence principle | the last lines go to the notes |
| Body text never under 18 pt | Kawasaki (30 pt), Duarte (24 pt) | lines go to the notes until the text can be drawn larger |
| A title that states the point, 3 to 9 words | Alley's assertion-evidence slides | the writer is asked again |
| Evidence is visual, not a list of bullets; no list of one term | Garner & Alley 2013 (comprehension and recall), Mayer's multimedia principle | figures become cards, dates a timeline, a lone bullet the message of the slide |
| A diagram never repeats the bullets of its slide | Mayer's redundancy principle | the diagram is dropped, and the layout is chosen again |
| No white space over half the slide, no near-empty slide | Duarte, Reynolds (signal over noise, but a slide that says nothing is not simple) | a picture when pictures are on, else the text drawn larger |
| No two text-only slides in a row | Reynolds, Duarte (rhythm) | the next one gets another layout when its content allows |
| Bullets are phrases, no full stop | Reynolds, Duarte | the full stop is removed |
| A pie has at most 6 slices and no negative value; charts only from numbers the user gave | Tufte, Few | the chart becomes a bar chart; no chart without data |
| Text and figures stand out from the background (4.5:1, 3:1 for large text) | WCAG 2; Duarte (a clear signal) | the colour that fails is dropped |
| Titles differ; at most a third of the slides restyled, two fonts for the deck | Tufte (no decoration that carries no data), Reynolds (one look) | extra styles are removed |
| A quotation is exact; facts from the web are numbered and listed | academic practice | `verifyQuotes`, the sources slide |

## What guarantees them

- **The facts come from the text.** Before each slide a short session copies the passages of the text it needs (`FACT_EXTRACTOR`); each line is checked to be in the text and set right when reworded, and the writer works from those passages only. Then `src/core/ground.ts` checks every figure and every proper name of the slide against the text and takes out what is not there, whatever the model wrote. An emptied slide is written from its own passages, word for word. Names that open a sentence are not checked (they are capital anyway).
- **The deck is tested** before it is drawn and again at the end (`auditDeck`): no empty slide, titles differ, titles say something, every figure and name is in the text, the text is covered. A failure is mended and tested again; the result is part of the answer.
- **The rules are tested** in `tests/slideGuarantees.test.ts`: a hundred random slides must come out of `applyRules` passing every repairable rule, and applying the rules again changes nothing; a model that invents figures cannot get them on a slide.
- **The request wins.** A rule is only a default. What the user asks (lots of text, a small font, 8 bullets per slide, one-word titles, only bullets, outside knowledge, different fonts) switches the matching rules off: first by patterns in English and French, then, when the request talks about the form of the slides, by a short model session that must quote the user's own words for every rule it switches off (a quote that is not in the request is ignored). The rules switched off are shown in the "Rules" stage and given to the summary.
