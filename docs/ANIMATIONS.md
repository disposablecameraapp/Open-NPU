# Animation catalog

Every motion added in this pass, so each one can be judged ("nice" / "not good") by name.
Rules used everywhere: 120–350 ms, ease-out, 4–8 px of travel, nothing bouncy. Loops only where something is really happening (working, listening). Everything switches off under `prefers-reduced-motion`.

Tokens (`:root`): `--ease-out: cubic-bezier(.22,1,.36,1)` · `--ease-in-out: cubic-bezier(.65,0,.35,1)` · `--dur-fast .12s` · `--dur .2s` · `--dur-slow .35s`.

**See them:** `npm run dev:renderer`, open the printed URL (browser preview with a fake model). Type `hello` (thinking + streaming), `make a page` (artifact), `use 3 sub-agents` (work cards). Web search, code check and auto-improve cards need the real app.

Files: chat stream → `motion.css`, `Activity.tsx`, `useSmoothText.ts`, `Markdown.tsx`, `Code.tsx`, `ArtifactView.tsx` · composer → `composer.css`, `ComposerParts.tsx` · everywhere else → `polish.css`, `usePresence.ts`, `Collapse.tsx`, `Seg.tsx`, `Skeleton.tsx`.

## While the model works (chat stream)

| # | Name | What you see | Timing |
|---|------|--------------|--------|
| 1 | **Your message lands** | Bubble rises from the bottom-right and settles (scale .96 → 1). | .34 s |
| 2 | **Presence line** | Before the first token: a small chip mark whose pins light in turn, shimmering text that changes wording every ~2.8 s ("Thinking", "Pondering", "Mulling it over"…), a seconds counter after 4 s. Says "Loading the model onto the NPU" while the server starts, "Putting it together" between steps. | text rises .35 s, shimmer 2 s loop |
| 3 | **Thinking block** | Header (chip mark) shimmers with a live timer; under it the latest finished thought fades up as one italic line. Click: the full thought unfolds (smooth height), the chevron turns. Done: becomes "Thought for 12s" with a still icon. | unfold .35 s |
| 4 | **Even-paced streaming** | Tokens arrive in bursts on a slow NPU; the text is revealed at a steady pace instead, never more than ~½ s behind, word by word (never half a word). Drains quickly when the answer ends. | adaptive 40–1200 chars/s |
| 5 | **Word fade-in** | Each new word fades in; words already there stay still (only the last block re-renders). | .45 s |
| 6 | **Block rise** | A new paragraph / list / code block rises 5 px as it starts. | .35 s |
| 7 | **Breathing dot** | A soft accent dot pulses at the end of the text while it is being written. | 1.3 s loop |
| 8 | **Code being written** | Lines slide in one after another (30 ms stagger, max 10); accent border and a light sweeping along the top; blinking block caret. | .28 s per line |
| 9 | **Status marks** | Spinner arc while running; the ✓ draws itself; the ✕ draws and shakes once. | .4 s |
| 10 | **Work cards** (sub-agents, code check, auto-improve) | Card rises in; accent border + a light sweeping along the bottom while running; opens by itself while running and folds when done; output follows its end; steps slide in; auto-improve shows a round progress bar. | .35 s |
| 11 | **Web search pill** | Globe with a ripple while searching, shimmering pill; text goes "Searching the web…" → "Reading the results"; when done the sources appear as little chips (first letter badge + site), staggered. Click to unfold the details. | chips .4 s, 55 ms apart |
| 12 | **Artifact card** | While writing: page icon whose lines draw in turn, "Writing · 42 lines", a sweep along the bottom. When done: a small pop and "Open" slides in on hover. | pop .5 s |
| 13 | **Artifact panel** | Slides in from the right (28 px + fade); "writing" with a spark and a light along the top while it is written; code types in line by line at the even pace; documents stream like the chat does. | .38 s |
| 14 | **Page preview without flashing** | Each new version of the page is loaded invisibly on top of the old one and fades in when ready (no white flash every 0.9 s). | .25 s |
| 15 | **Auto-follow** | The view keeps following the text as it is revealed; scroll up and it lets go. | — |
| 16 | **Actions fade in** | Copy / read aloud / stats appear after the answer ends. | .4 s |

## Composer and messages

| # | Name | What you see |
|---|------|--------------|
| 17 | **Growing box** | The input grows smoothly with your text (up to 40 % of the window), shrinks back after sending. |
| 18 | **Jump to latest** | A pill slides up above the composer when you scroll away from the bottom; click: smooth scroll down. |
| 19 | **Starter chips** | Four suggestions fade in with a stagger on a new chat; click fills the box. |
| 20 | **Message actions** | Edit / copy on your messages, Regenerate on the last answer, fade in on hover. "Stopped" note when you press Stop. |

## Everywhere else

| # | Name | What you see |
|---|------|--------------|
| 21 | **Menus and popovers** | Scale + fade in from their corner, and a real exit animation (model menu, smart-functions menu, profile menu). Nested options (thinking level, tool options) unfold smoothly. |
| 22 | **Modals** | Backdrop fades, window scales/slides in and out; Esc closes; Tab stays inside; focus returns where it was. Models ⇄ Settings crossfades. |
| 23 | **Page changes** | Search / Projects / Artifacts / Tasks / Customize fade in with a 4 px slide. (The chat stays mounted so a running answer never restarts.) |
| 24 | **Sidebar** | Active-chat bar slides in; new chats grow in; deleting a chat collapses its row before it disappears; folding sections animate; the answering chat's title shimmers (earlier work, kept). |
| 25 | **Buttons and switches** | Press feedback (scale .97); switch knob glides with a slight press stretch; the segmented control (Models / Explore / Settings / Artifacts) has a **sliding pill** instead of an instant swap; filter chips pop when toggled. |
| 26 | **Progress bars** | Smooth `scaleX` with a sheen while active; indeterminate state is a travelling bar. |
| 27 | **Cards and lists** | Model cards / rows fade in with a stagger (max 10 items) and lift slightly on hover. |
| 28 | **Skeletons** | Shimmering placeholder rows while Explore / the model list load, instead of "Looking…". |
| 29 | **First-run setup** | Steps stagger in; running step has a spinner; a finished step draws its ✓; an error shakes once. |
| 30 | **Voice orb** | Layered halo and ring; listening breathes, hearing glows with your voice level, thinking/transcribing shows a turning arc, speaking pulses; fades in. |
| 31 | **Small details** | One focus ring everywhere, input focus transitions, placeholder fade, tabular numbers for stats, thin scrollbars that appear on hover, smooth scrolling on pages. |

## Known gaps

- Voice overlay and the context-window popover only animate in (no exit); the pinned-icon pop wasn't built.
- Pages fade in but the old page doesn't fade out (no true crossfade).
- Native hover tooltips (`title`) can't be timed from CSS.
- Dark mode was written but only lightly checked visually.
