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
