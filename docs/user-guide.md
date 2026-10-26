# Open NPU: details moved out of the interface

- **Dynamic packs.** Pick the memory of your PC and you get three sizes: Flash (smallest, instant), Flux (the reasonable one) and Forge (the biggest your NPU holds). Each size is a pack of models, each the best at one job: code, a natural mail, facts, reasoning. Install a pack and every request goes to the right model of it.
- **Recommended models.** The tested models worth the download on this kind of PC. A model tested on both engines is shown once, on the faster one. Measured on a Snapdragon X Plus; a gap of a few points is not a ranking.
- **Not tested models.** They may work very well, but nobody measured them. Microsoft Foundry Local offers many models: only the ones listed as tested were tried.
- **Project folder.** The assistant can list, open and search files in the folder in every chat of the project. It only reads, cannot leave the folder, and what it opens goes into the model's context window.
- **Tasks.** Tasks run while Open NPU runs. Closing the window keeps the app in the system tray. A task missed while the app was closed runs once at the next start.
- **Voice placement.** With enough NPU memory or smaller models, chat, dictation and read-aloud can all run on the NPU. Open NPU checks the total before loading.
- **Building files.** Files are built one at a time; each job can use its own model, and the NPU switches models (a few seconds) at most once per job. Pages are run in a hidden window without network (keys pressed, buttons clicked); JavaScript and Python are parsed; failures are fixed before you see them.
- **Review model.** A bigger, slower model reads the code and errors and fixes them with small edits. It loads after the answer is written and the writing model returns for the next message.
- **Web search.** The model writes a search, Open NPU runs it, reads the best pages and returns the text so the answer can cite sources; web text is untrusted. A search model keeps only the facts; it is loaded for each search. The Brave key is stored in the app's settings file on this PC.
