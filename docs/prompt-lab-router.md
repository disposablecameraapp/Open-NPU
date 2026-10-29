---
title: The router's closed questions, on hard requests
runs: 1
max_tokens: 12
greedy: on
thinking: off
system: You answer yes/no questions about a request that a person sent to an assistant. Reply with one word: yes or no. Judge by what the request asks for, not by the language it is written in.
---

# The router's closed questions, on hard requests

Every decision about a request is a closed question put to the router (`Q` in `src/core/router.ts`), never read from the words of the message. This series asks the same questions, in the same form (`yesNoPrompt`, `choicePrompt`), of requests that small models get wrong: a document that says "make", an Excel file that is not a program, a game question that is not a game, a typo, French, an exercise with figures.
Each prompt is one question about one request; the ideal is the right word. The score of a model is how many it gets right: read the table by question (program, sheet, word, site, calculator, exercise, web, file) to see which question a model cannot answer, and change the wording of that question in `Q` and run again. The questions marked `file` use another system message (see the first of them: set it by hand in the options if the page asks for it) and pick one word of a list.
Run it with the router model (Qwen3-0.6B) and with bigger ones (Qwen3.5-2B, 4B) to see what the router costs in accuracy against how long it takes (the time of each answer is in the table).


## program-01 short

Request: """make tetris"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-02 long game

Request: """I want a 2D game like the first Super Mario Bros. You play a little character who runs and jumps"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-03 French

Request: """fais moi un jeu de snake"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-04 bug report

Request: """le jeu plante quand je saute, corrige ça"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-05 calculator page

Request: """crée une calculatrice avec des boutons"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-06 app

Request: """a to-do app that saves in the browser"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-07 web page

Request: """a landing page for my bakery"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-08 change

Request: """ajoute un bouton pause et un score qui monte"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## program-09 Excel, not a program

Request: """fais un journal de comptabilité vide que je peux utiliser dans exel"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-10 document

Request: """do some research on american healthcare and make a research doc"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-11 joke

Request: """tell me a joke about games"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-12 question

Request: """what is the best game of 2020?"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-13 question about making

Request: """how do I make a game with unity?"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-14 story

Request: """écris une histoire sur un jeu vidéo"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-15 sheet

Request: """fais un tableau excel des dépenses du mois"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-16 chart

Request: """make me a chart of GDP by country"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-17 explanation

Request: """explique-moi comment marche un moteur de jeu"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-18 letter

Request: """write a cover letter for a barista job"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-19 thanks

Request: """merci beaucoup !"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-20 translation

Request: """traduis en anglais : bonjour tout le monde"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-21 summary

Request: """peux-tu me faire un résumé de ce texte ?"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-22 names

Request: """what's a good name for my game studio"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## program-23 accounting exercise

Request: """Hier, j'ai fait le tour. au 1novembre N, le stock etait de 1200pices evalueées a 170400€ matiere premiere 350000 frais de transport de matieres 15000 frais directs de production 260000 frais indirectcs de production 90 000 au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) determine le cout de production de 5000 jouets evaluer le stock sachant que l'entreprise utilise la methode CUMP"""
Question: Does it ask to build, write or change something that RUNS: a program, game, app, tool or web page, or say that something in one does not work or looks wrong? (Answer no for a chat, a question, an explanation, a chart, a spreadsheet, an Excel or Word file, a text document or a thanks.)
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-01 typo

Request: """fais un doc exel et met y les infos comptables et les reponses"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-02 empty sheet

Request: """an empty accounting journal I can use in Excel"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-03 French

Request: """tableur de suivi des heures de mon équipe"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-04 budget

Request: """make a monthly budget spreadsheet"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-05 exercise in Excel-like words

Request: """Hier, j'ai fait le tour. au 1novembre N, le stock etait de 1200pices evalueées a 170400€ matiere premiere 350000 frais de transport de matieres 15000 frais directs de production 260000 frais indirectcs de production 90 000 au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) determine le cout de production de 5000 jouets evaluer le stock sachant que l'entreprise utilise la methode CUMP"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-06 table

Request: """un tableau de suivi de stock"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## sheet-07 letter

Request: """write a letter to my landlord"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-08 game

Request: """make a snake game"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-09 question about Excel

Request: """explain what a pivot table is"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-10 question

Request: """what's the best spreadsheet software?"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-11 site

Request: """fais un site vitrine pour mon salon de coiffure"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## sheet-12 summary

Request: """résume ce rapport en trois phrases"""
Question: Does it ask for an Excel spreadsheet, a table of figures, or a sheet to fill in or to calculate in?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-01 letter

Request: """write a cover letter for a barista job"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## word-02 CV

Request: """fais-moi un CV pour un poste de comptable"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## word-03 research doc

Request: """do some research on american healthcare and make a research doc"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## word-04 minutes

Request: """rédige un compte rendu de la réunion d'hier"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## word-05 contract

Request: """make a freelance contract for a web designer"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## word-06 sheet

Request: """make me a budget in Excel"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-07 question

Request: """what is a CV for?"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-08 poem

Request: """write a poem about the sea"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-09 game

Request: """make tetris"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-10 greeting

Request: """bonjour"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## word-11 translation

Request: """traduis ce paragraphe en espagnol"""
Question: Does it ask for a written document to be made (a letter, a report, a CV, minutes, a contract, a research document)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## site-01 landing

Request: """a landing page for my bakery"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## site-02 site

Request: """fais un site web pour mon restaurant"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## site-03 portfolio

Request: """portfolio website with a dark mode"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## site-04 question

Request: """how do I host a website for free?"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## site-05 text

Request: """write a blog post about websites"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## site-06 calculator

Request: """make a calculator"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## site-07 game

Request: """fais un jeu de pong"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## site-08 letter

Request: """rédige une lettre de motivation"""
Question: Does it ask for a website, a landing page or a web page to show to people?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## calculator-01 converter

Request: """convertisseur euros dollars"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## calculator-02 calculator

Request: """BMI calculator"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## calculator-03 simulator

Request: """simulateur de prêt immobilier"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## calculator-04 just compute

Request: """what's 15% of 80?"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## calculator-05 sheet

Request: """make an Excel loan table"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## calculator-06 game

Request: """snake game"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## calculator-07 explain

Request: """explique les intérêts composés"""
Question: Does it ask for a small calculator, converter or simulator page with inputs and a result?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## exercise-01 the exercise

Request: """Hier, j'ai fait le tour. au 1novembre N, le stock etait de 1200pices evalueées a 170400€ matiere premiere 350000 frais de transport de matieres 15000 frais directs de production 260000 frais indirectcs de production 90 000 au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) determine le cout de production de 5000 jouets evaluer le stock sachant que l'entreprise utilise la methode CUMP"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## exercise-02 figures

Request: """mon loyer est de 800€, charges 120€, calcule le total sur un an dans excel"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## exercise-03 figures

Request: """calculate the VAT on 1200 at 20% in a sheet"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## exercise-04 empty

Request: """fais un tableau de budget vide"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## exercise-05 template

Request: """make an inventory template"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## exercise-06 tracker

Request: """tableur pour suivre mes dépenses"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## exercise-07 explain

Request: """explique le CUMP"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## exercise-08 no figures given

Request: """make a table of the planets"""
Question: Does it give its own figures and ask for something to be worked out or answered from them (an exercise, a cost, a valuation), rather than an empty sheet or a general template?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-01 research

Request: """do some research on american healthcare"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## web-02 price today

Request: """quel est le prix du bitcoin aujourd'hui ?"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## web-03 latest

Request: """what is the latest Qwen model release?"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## web-04 news

Request: """qui a gagné le match hier soir ?"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## web-05 weather

Request: """météo à Lyon demain"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12


## web-06 poem

Request: """write a poem about the sea"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-07 game

Request: """make tetris"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-08 explain

Request: """explain recursion with an example"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-09 translation

Request: """traduis : good morning"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-10 greeting

Request: """bonjour"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## web-11 known fact

Request: """what is the capital of France?"""
Question: Does answering it need recent facts, or looking something up on the web, that a model would not know by heart?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12


## file-01 sheet

Request: """fais un journal de comptabilité vide que je peux utiliser dans exel"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: sheet

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-02 sheet

Request: """an empty accounting journal I can use in Excel"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: sheet

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-03 sheet

Request: """Hier, j'ai fait le tour. au 1novembre N, le stock etait de 1200pices evalueées a 170400€ matiere premiere 350000 frais de transport de matieres 15000 frais directs de production 260000 frais indirectcs de production 90 000 au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) determine le cout de production de 5000 jouets evaluer le stock sachant que l'entreprise utilise la methode CUMP"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: sheet

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-04 document

Request: """do some research on american healthcare and make a research doc"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: document

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-05 document

Request: """write a cover letter for a barista job"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: document

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-06 document

Request: """fais-moi un CV"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: document

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-07 document

Request: """rédige un compte rendu de la réunion d'hier"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: document

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-08 site

Request: """a landing page for my bakery"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: site

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-09 site

Request: """fais un site web pour mon restaurant"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: site

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-10 calculator

Request: """convertisseur euros dollars"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: calculator

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-11 calculator

Request: """BMI calculator"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: calculator

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-12 calculator

Request: """simulateur de prêt"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: calculator

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-13 none

Request: """make tetris"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-14 none

Request: """fais moi un jeu de snake"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-15 none

Request: """le jeu plante quand je saute"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-16 none

Request: """bonjour"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-17 none

Request: """what is a spreadsheet?"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-18 none

Request: """explain how websites work"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-19 none

Request: """make me a chart of GDP by country"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-20 none

Request: """merci !"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-21 none

Request: """traduis ce texte en anglais"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.


## file-22 none

Request: """write a poem about the sea"""
Question: What file does the request ask to be made? sheet = an Excel spreadsheet or a table of figures; document = a written document (a letter, a report, a CV, minutes, a contract, a research document); site = a website or a landing page; calculator = a small calculator, converter or simulator page; none = anything else (a program, a game, a chat, a question, a chart).
Answer with one of: sheet, document, site, calculator, none.
Answer:

### Checks

- starts: none

### Options

max_tokens: 12
system: You sort a request that a person sent to an assistant. Reply with one word from the list. Judge by what the request asks for, not by the language it is written in.

## produce-01 help, not a file

Request: """J'ai besoin d'aide pour réviser ce truc de comptabilité, est-ce que tu peux m'aider ?"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-02 hands a document over

Request: """tiens un document"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-03 Excel to produce

Request: """fais un doc exel et met y les infos comptables et les reponses"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produce-04 letter to produce

Request: """write me a cover letter for a barista job"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produce-05 explanation

Request: """peux-tu m'expliquer comment marche un tableau croisé dynamique ?"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-06 review

Request: """review my essay and tell me what is weak"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-07 summary in the chat

Request: """résume ce document en cinq lignes"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-08 CV

Request: """fais-moi un CV pour un poste de comptable"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produce-09 research doc

Request: """do some research on american healthcare and make a research doc"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produce-10 learning

Request: """je voudrais comprendre le CUMP avant mon examen"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-11 help

Request: """can you help me with my budget?"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-12 spreadsheet to produce

Request: """make me a budget spreadsheet for my family"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produce-13 opinion

Request: """what do you think of this contract?"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produce-14 greeting

Request: """bonjour, ça va ?"""
Question: Does the person ask you to PRODUCE a file or a document now (make it, write it, create it), rather than ask for help, advice, an explanation, a summary, a review, or just talk?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-01 help, not a file

Request: """J'ai besoin d'aide pour réviser ce truc de comptabilité, est-ce que tu peux m'aider ?"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-02 hands a document over

Request: """tiens un document"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-03 Excel to produce

Request: """fais un doc exel et met y les infos comptables et les reponses"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produceb-04 letter to produce

Request: """write me a cover letter for a barista job"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produceb-05 explanation

Request: """peux-tu m'expliquer comment marche un tableau croisé dynamique ?"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-06 review

Request: """review my essay and tell me what is weak"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-07 summary in the chat

Request: """résume ce document en cinq lignes"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-08 CV

Request: """fais-moi un CV pour un poste de comptable"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produceb-09 research doc

Request: """do some research on american healthcare and make a research doc"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produceb-10 learning

Request: """je voudrais comprendre le CUMP avant mon examen"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-11 help

Request: """can you help me with my budget?"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-12 spreadsheet to produce

Request: """make me a budget spreadsheet for my family"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## produceb-13 opinion

Request: """what do you think of this contract?"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## produceb-14 greeting

Request: """bonjour, ça va ?"""
Question: Does the message tell you to make, write or create a new file or document for the person (a letter, a sheet, a report, a CV)?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-01 help, not a file

Request: """J'ai besoin d'aide pour réviser ce truc de comptabilité, est-ce que tu peux m'aider ?"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-02 hands a document over

Request: """tiens un document"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-03 Excel to produce

Request: """fais un doc exel et met y les infos comptables et les reponses"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## producec-04 letter to produce

Request: """write me a cover letter for a barista job"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## producec-05 explanation

Request: """peux-tu m'expliquer comment marche un tableau croisé dynamique ?"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-06 review

Request: """review my essay and tell me what is weak"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-07 summary in the chat

Request: """résume ce document en cinq lignes"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-08 CV

Request: """fais-moi un CV pour un poste de comptable"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## producec-09 research doc

Request: """do some research on american healthcare and make a research doc"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## producec-10 learning

Request: """je voudrais comprendre le CUMP avant mon examen"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-11 help

Request: """can you help me with my budget?"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-12 spreadsheet to produce

Request: """make me a budget spreadsheet for my family"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: yes

### Options

max_tokens: 12

## producec-13 opinion

Request: """what do you think of this contract?"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12

## producec-14 greeting

Request: """bonjour, ça va ?"""
Question: Is the thing wanted a NEW file or document as the result, rather than an answer in the chat?
Answer (yes or no):

### Checks

- starts: no

### Options

max_tokens: 12
