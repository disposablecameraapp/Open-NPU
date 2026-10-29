---
title: Une feuille Excel en plusieurs étapes
runs: 2
max_tokens: 700
thinking: off
---

# Une feuille Excel en plusieurs étapes

Le même exercice de comptabilité que dans la série précédente, mais découpé comme le moteur de construction des programmes découpe un jeu : les exigences, la structure (combien de feuilles), les données de l'énoncé, les calculs en mots, puis l'écriture de la feuille, puis la correction. Chaque prompt est UNE étape, avec en entrée le résultat idéal de l'étape d'avant : on mesure donc chaque étape seule, avec une entrée parfaite. Ce qu'on cherche : quelles étapes un petit modèle réussit, lesquelles il rate, et si le découpage fait mieux que la feuille demandée d'un seul coup (série précédente, meilleur 4B : 86 de ressemblance mais des formules fausses).
Les étapes e1, e2 et e3 comparent trois façons d'écrire les formules : sans consigne, avec des noms de lignes entre crochets (l'app les transforme en adresses), avec des adresses de cellules. Les étapes f1 et f2 sont la correction d'une feuille fausse (celle du 4B à 86), avec ou sans la liste des fautes.
Le score mesure la ressemblance avec l'idéal. Pour les étapes d'écriture et de correction, le vrai test est de lire la valeur calculée : coût de production 715000, CUMP 142,81, valeur retenue 285613.

## a1 exigences en lignes

You are the lead of a small team that builds spreadsheets. Do NOT build the sheet. List what the sheet must do for this request, one short numbered statement per line, each testable and about one thing only. Reply with lines only, no title, no code fence. Form:
R1 | statement

The request:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

### Checks

- lines: 4-8
- regex: ^R\d \| .+
- contains: CUMP
- regex: march|market
- max_chars: 1200

### Options

max_tokens: 500

### Ideal

```
R1 | Compute the cost of production of the 5000 toys as the sum of the four costs of the period.
R2 | Compute the unit cost of production.
R3 | Value the final stock of 2000 toys with the CUMP method: the opening stock of 1200 toys at 170400 plus the production of the period.
R4 | Compare the CUMP value of the final stock with the market price of 300000 and keep the lower.
R5 | Put every figure of the statement in a cell, and every result as a formula.
```

## a2 exigences en questions

List the questions that the sheet must answer, then what it must show, for this request. One line each, form:
R1 | what the sheet must give
Keep to what the person asked, nothing more. Reply with lines only, no title, no code fence.

The request:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

### Checks

- lines: 4-8
- regex: ^R\d \| .+
- contains: CUMP
- max_chars: 1200

### Options

max_tokens: 500

### Ideal

```
R1 | Compute the cost of production of the 5000 toys as the sum of the four costs of the period.
R2 | Compute the unit cost of production.
R3 | Value the final stock of 2000 toys with the CUMP method: the opening stock of 1200 toys at 170400 plus the production of the period.
R4 | Compare the CUMP value of the final stock with the market price of 300000 and keep the lower.
R5 | Put every figure of the statement in a cell, and every result as a formula.
```

## b1 combien de feuilles

Decide how many sheets this spreadsheet needs and what each one holds. One sheet per line, as few as the request allows. Reply with lines only, no title, no code fence. Form:
sheet name | what it holds | what it needs from other sheets

The requirements:
R1 | Compute the cost of production of the 5000 toys as the sum of the four costs of the period.
R2 | Compute the unit cost of production.
R3 | Value the final stock of 2000 toys with the CUMP method: the opening stock of 1200 toys at 170400 plus the production of the period.
R4 | Compare the CUMP value of the final stock with the market price of 300000 and keep the lower.
R5 | Put every figure of the statement in a cell, and every result as a formula.

### Checks

- lines: 1-3
- regex: ^[^|]+ \| .+ \| .+$
- max_chars: 400

### Options

max_tokens: 300

### Ideal

```
Calculs | the costs of the period, the cost of production, the CUMP and the value of the final stock, on one page | nothing
```

## b2 combien de feuilles (demande brute)

How many sheets (tabs) should the Excel file of this request have, and what goes in each? One line per sheet, a single sheet when one is enough. Reply with lines only, no title, no code fence. Form:
sheet name | what it holds | what it needs from other sheets

The request:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

### Checks

- lines: 1-3
- regex: ^[^|]+ \| .+ \| .+$
- max_chars: 400

### Options

max_tokens: 300

### Ideal

```
Calculs | the costs of the period, the cost of production, the CUMP and the value of the final stock, on one page | nothing
```

## c1 les données de l'énoncé

List every figure given in this statement, one per line, each with a short label, its value as a plain number (no spaces, no currency sign) and its unit. Leave out what is a question or a method. Reply with lines only, no title, no code fence. Form:
label | value | unit

The statement:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

### Checks

- lines: 9-11
- regex: ^[^|]+ \| \d+ \| .+$
- regex: 170400
- not: CUMP

### Options

max_tokens: 500

### Ideal

```
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €
```

## c2 les données (avec la structure)

The sheet will be one page named Calculs. Fill its INPUT rows from the statement: one line per figure with a short label, the number alone and the unit. Reply with lines only, no title, no code fence. Form:
label | value | unit

The structure:
Calculs | the costs of the period, the cost of production, the CUMP and the value of the final stock, on one page | nothing

The statement:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

### Checks

- lines: 9-11
- regex: ^[^|]+ \| \d+ \| .+$
- regex: 170400
- not: CUMP

### Options

max_tokens: 500

### Ideal

```
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €
```

## d1 les calculs en mots

Write the calculations of the sheet, one per line, in the order they are made. Each: a label, what it is in words (no cell addresses), and the labels of the inputs or earlier results it uses, exactly as written below. Reply with lines only, no title, no code fence. Form:
label | how it is calculated | uses

The requirements:
R1 | Compute the cost of production of the 5000 toys as the sum of the four costs of the period.
R2 | Compute the unit cost of production.
R3 | Value the final stock of 2000 toys with the CUMP method: the opening stock of 1200 toys at 170400 plus the production of the period.
R4 | Compare the CUMP value of the final stock with the market price of 300000 and keep the lower.
R5 | Put every figure of the statement in a cell, and every result as a formula.

The input rows:
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €

### Checks

- lines: 6-9
- regex: ^[^|]+ \| .+ \| .+$
- contains: CUMP
- max_chars: 1500

### Options

max_tokens: 700

### Ideal

```
Coût de production | the sum of the four costs | Matières premières, Transport de matières, Frais directs de production, Frais indirects de production
Coût unitaire de production | the cost of production divided by the toys produced | Coût de production, Jouets produits
Quantité disponible | the opening quantity plus the toys produced | Stock initial (quantité), Jouets produits
Valeur disponible | the opening value plus the cost of production | Stock initial (valeur), Coût de production
CUMP | the value available divided by the quantity available | Valeur disponible, Quantité disponible
Valeur du stock final au CUMP | the final quantity times the CUMP | Stock final (quantité), CUMP
Valeur retenue du stock final | the lower of the CUMP value and the market price | Valeur du stock final au CUMP, Prix de marché du stock final
```

## d2 les calculs (méthode donnée)

Write the calculations of the sheet, one per line, in the order they are made. CUMP = (value of the opening stock + value of the production) / (quantity of the opening stock + quantity produced). The cost of production is the sum of the four costs. Form:
label | how it is calculated | uses
Use the labels of the input rows exactly as written. Reply with lines only, no title, no code fence.

The input rows:
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €

What is asked: the cost of production of the 5000 toys, and the value of the final stock of 2000 toys, kept at the lower of the CUMP value and the market price.

### Checks

- lines: 6-9
- regex: ^[^|]+ \| .+ \| .+$
- contains: CUMP
- max_chars: 1500

### Options

max_tokens: 700

### Ideal

```
Coût de production | the sum of the four costs | Matières premières, Transport de matières, Frais directs de production, Frais indirects de production
Coût unitaire de production | the cost of production divided by the toys produced | Coût de production, Jouets produits
Quantité disponible | the opening quantity plus the toys produced | Stock initial (quantité), Jouets produits
Valeur disponible | the opening value plus the cost of production | Stock initial (valeur), Coût de production
CUMP | the value available divided by the quantity available | Valeur disponible, Quantité disponible
Valeur du stock final au CUMP | the final quantity times the CUMP | Stock final (quantité), CUMP
Valeur retenue du stock final | the lower of the CUMP value and the market price | Valeur du stock final au CUMP, Prix de marché du stock final
```

## e1 écrire la feuille

Reply with the sheet only: a line with two # signs and the name of the sheet (## Calculs), then a Markdown table with two columns, Élément and Valeur. Do not write column letters or row numbers. A cell that starts with = is a formula.
First the input rows with their numbers, then one row per calculation.

The input rows:
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €

The calculations:
Coût de production | the sum of the four costs | Matières premières, Transport de matières, Frais directs de production, Frais indirects de production
Coût unitaire de production | the cost of production divided by the toys produced | Coût de production, Jouets produits
Quantité disponible | the opening quantity plus the toys produced | Stock initial (quantité), Jouets produits
Valeur disponible | the opening value plus the cost of production | Stock initial (valeur), Coût de production
CUMP | the value available divided by the quantity available | Valeur disponible, Quantité disponible
Valeur du stock final au CUMP | the final quantity times the CUMP | Stock final (quantité), CUMP
Valeur retenue du stock final | the lower of the CUMP value and the market price | Valeur du stock final au CUMP, Prix de marché du stock final

### Checks

- lines: 14-22
- contains: CUMP
- contains: =SUM(

### Options

max_tokens: 900

### Ideal

```
## Calculs
| Élément | Valeur |
|---|---|
| Matières premières | 350000 |
| Transport de matières | 15000 |
| Frais directs de production | 260000 |
| Frais indirects de production | 90000 |
| Jouets produits | 5000 |
| Stock initial (quantité) | 1200 |
| Stock initial (valeur) | 170400 |
| Stock final (quantité) | 2000 |
| Prix de marché du stock final | 300000 |
| Coût de production | =SUM([Matières premières]:[Frais indirects de production]) |
| Coût unitaire de production | =[Coût de production]/[Jouets produits] |
| Quantité disponible | =[Stock initial (quantité)]+[Jouets produits] |
| Valeur disponible | =[Stock initial (valeur)]+[Coût de production] |
| CUMP | =[Valeur disponible]/[Quantité disponible] |
| Valeur du stock final au CUMP | =[Stock final (quantité)]*[CUMP] |
| Valeur retenue du stock final | =MIN([Valeur du stock final au CUMP],[Prix de marché du stock final]) |
```

## e2 écrire la feuille avec les noms de lignes

Reply with the sheet only: a line with two # signs and the name of the sheet (## Calculs), then a Markdown table with two columns, Élément and Valeur. Do not write column letters or row numbers. A cell that starts with = is a formula.
First the input rows with their numbers, then one row per calculation. In a formula, name a row by its label between square brackets, for example =[Coût de production]/[Jouets produits] or =SUM([Matières premières]:[Frais indirects de production]); never count rows or write cell addresses.

The input rows:
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €

The calculations:
Coût de production | the sum of the four costs | Matières premières, Transport de matières, Frais directs de production, Frais indirects de production
Coût unitaire de production | the cost of production divided by the toys produced | Coût de production, Jouets produits
Quantité disponible | the opening quantity plus the toys produced | Stock initial (quantité), Jouets produits
Valeur disponible | the opening value plus the cost of production | Stock initial (valeur), Coût de production
CUMP | the value available divided by the quantity available | Valeur disponible, Quantité disponible
Valeur du stock final au CUMP | the final quantity times the CUMP | Stock final (quantité), CUMP
Valeur retenue du stock final | the lower of the CUMP value and the market price | Valeur du stock final au CUMP, Prix de marché du stock final

### Checks

- lines: 14-22
- contains: CUMP
- contains: =SUM(
- regex: =.*\[[^\]]+\]
- not: =B

### Options

max_tokens: 900

### Ideal

```
## Calculs
| Élément | Valeur |
|---|---|
| Matières premières | 350000 |
| Transport de matières | 15000 |
| Frais directs de production | 260000 |
| Frais indirects de production | 90000 |
| Jouets produits | 5000 |
| Stock initial (quantité) | 1200 |
| Stock initial (valeur) | 170400 |
| Stock final (quantité) | 2000 |
| Prix de marché du stock final | 300000 |
| Coût de production | =SUM([Matières premières]:[Frais indirects de production]) |
| Coût unitaire de production | =[Coût de production]/[Jouets produits] |
| Quantité disponible | =[Stock initial (quantité)]+[Jouets produits] |
| Valeur disponible | =[Stock initial (valeur)]+[Coût de production] |
| CUMP | =[Valeur disponible]/[Quantité disponible] |
| Valeur du stock final au CUMP | =[Stock final (quantité)]*[CUMP] |
| Valeur retenue du stock final | =MIN([Valeur du stock final au CUMP],[Prix de marché du stock final]) |
```

## e3 écrire la feuille avec les adresses

Reply with the sheet only: a line with two # signs and the name of the sheet (## Calculs), then a Markdown table with two columns, Élément and Valeur. Do not write column letters or row numbers. A cell that starts with = is a formula.
First the input rows with their numbers (row 1 is the header line), then one row per calculation. In a formula, use cell addresses of column B (the first data row is row 2).

The input rows:
Matières premières | 350000 | €
Transport de matières | 15000 | €
Frais directs de production | 260000 | €
Frais indirects de production | 90000 | €
Jouets produits | 5000 | jouets
Stock initial (quantité) | 1200 | jouets
Stock initial (valeur) | 170400 | €
Stock final (quantité) | 2000 | jouets
Prix de marché du stock final | 300000 | €

The calculations:
Coût de production | the sum of the four costs | Matières premières, Transport de matières, Frais directs de production, Frais indirects de production
Coût unitaire de production | the cost of production divided by the toys produced | Coût de production, Jouets produits
Quantité disponible | the opening quantity plus the toys produced | Stock initial (quantité), Jouets produits
Valeur disponible | the opening value plus the cost of production | Stock initial (valeur), Coût de production
CUMP | the value available divided by the quantity available | Valeur disponible, Quantité disponible
Valeur du stock final au CUMP | the final quantity times the CUMP | Stock final (quantité), CUMP
Valeur retenue du stock final | the lower of the CUMP value and the market price | Valeur du stock final au CUMP, Prix de marché du stock final

### Checks

- lines: 14-22
- contains: CUMP
- contains: =SUM(
- regex: =.*B\d

### Options

max_tokens: 900

### Ideal

```
## Calculs
| Élément | Valeur |
|---|---|
| Matières premières | 350000 |
| Transport de matières | 15000 |
| Frais directs de production | 260000 |
| Frais indirects de production | 90000 |
| Jouets produits | 5000 |
| Stock initial (quantité) | 1200 |
| Stock initial (valeur) | 170400 |
| Stock final (quantité) | 2000 |
| Prix de marché du stock final | 300000 |
| Coût de production | =SUM(B2:B5) |
| Coût unitaire de production | =B11/B6 |
| Quantité disponible | =B7+B6 |
| Valeur disponible | =B8+B11 |
| CUMP | =B14/B13 |
| Valeur du stock final au CUMP | =B9*B15 |
| Valeur retenue du stock final | =MIN(B16,B10) |
```

## f1 corriger avec la liste des fautes

This sheet has faults. Rewrite the whole sheet without them, in the form below. In a formula, name a row by its label between square brackets, like =[Coût de production]/[Jouets produits]; never write cell addresses. Reply with lines only, no title, no code fence.

The sheet:
| Élément | Quantité | Montant (€) | Coût unitaire (€) |
| :--- | :--- | :--- | :--- |
| Matières premières | 5000 | =350000 | =B2/B1 |
| Transport de matières | 5000 | =15000 | =B3/B1 |
| Frais directs de production | 5000 | =260000 | =B4/B1 |
| Frais indirects de production | 5000 | =90000 | =B5/B1 |
| Coût de production | 5000 | =SUM(B2:B5) | =B6/B1 |
| Stock initial | 1200 | =170400 | =B7/B7 |
| Stock disponible | 6200 | =SUM(B7:B8) | =B8/B7 |
| Stock final | 2000 | =B9*C9 | =B10/B9 |
| Prix de marché | 2000 | =300000 | =B11/B10 |
| Valeur retenue | 2000 | =MIN(B10,B11) | =C12 |

The faults:
- The unit cost formulas divide by B1, which is a title cell, not a quantity.
- The sums and the MIN read column B (quantities) instead of column C (amounts).
- The CUMP is never calculated: the opening stock (1200 toys, 170400) and the production (5000 toys, the cost of production) must be added together and divided.
- The value of the final stock must be its quantity times the CUMP.

The statement of the exercise:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

Form: a line ## Calculs, then a table with two columns, Élément and Valeur.

### Checks

- lines: 14-22
- contains: CUMP
- contains: =SUM(
- regex: =.*\[[^\]]+\]
- not: =B

### Options

max_tokens: 900

### Ideal

```
## Calculs
| Élément | Valeur |
|---|---|
| Matières premières | 350000 |
| Transport de matières | 15000 |
| Frais directs de production | 260000 |
| Frais indirects de production | 90000 |
| Jouets produits | 5000 |
| Stock initial (quantité) | 1200 |
| Stock initial (valeur) | 170400 |
| Stock final (quantité) | 2000 |
| Prix de marché du stock final | 300000 |
| Coût de production | =SUM([Matières premières]:[Frais indirects de production]) |
| Coût unitaire de production | =[Coût de production]/[Jouets produits] |
| Quantité disponible | =[Stock initial (quantité)]+[Jouets produits] |
| Valeur disponible | =[Stock initial (valeur)]+[Coût de production] |
| CUMP | =[Valeur disponible]/[Quantité disponible] |
| Valeur du stock final au CUMP | =[Stock final (quantité)]*[CUMP] |
| Valeur retenue du stock final | =MIN([Valeur du stock final au CUMP],[Prix de marché du stock final]) |
```

## f2 corriger sans la liste

Check this sheet against the exercise, find what is wrong and rewrite the whole sheet correctly, in the form below. In a formula, name a row by its label between square brackets, like =[Coût de production]/[Jouets produits]; never write cell addresses. Reply with lines only, no title, no code fence.

The sheet:
| Élément | Quantité | Montant (€) | Coût unitaire (€) |
| :--- | :--- | :--- | :--- |
| Matières premières | 5000 | =350000 | =B2/B1 |
| Transport de matières | 5000 | =15000 | =B3/B1 |
| Frais directs de production | 5000 | =260000 | =B4/B1 |
| Frais indirects de production | 5000 | =90000 | =B5/B1 |
| Coût de production | 5000 | =SUM(B2:B5) | =B6/B1 |
| Stock initial | 1200 | =170400 | =B7/B7 |
| Stock disponible | 6200 | =SUM(B7:B8) | =B8/B7 |
| Stock final | 2000 | =B9*C9 | =B10/B9 |
| Prix de marché | 2000 | =300000 | =B11/B10 |
| Valeur retenue | 2000 | =MIN(B10,B11) | =C12 |

The exercise:
fais un doc exel et met y les infos comptable et les reponses au questions suivante:

au 1novembre N, le stock etait de 1200pices evalueées a 170400€
depenses engagées pendant les mois novembre et decembre de l'exercice pour 5000 jouets:
matiere premiere 350000
frais de transport de matieres 15000
frais directs de production 260000
frais indirectcs de production 90 000
au 31/12/N il reste en stock 2000 jouets qui sont evaluées a 300000 (prix marché) la durée moyene de stockage est de 2mois

determine le cout de production de 5000 jouets
evaluer le stock sachant que l'entreprise utilise la methode CUMP

Form: a line ## Calculs, then a table with two columns, Élément and Valeur.

### Checks

- lines: 14-22
- contains: CUMP
- contains: =SUM(
- regex: =.*\[[^\]]+\]
- not: =B

### Options

max_tokens: 900

### Ideal

```
## Calculs
| Élément | Valeur |
|---|---|
| Matières premières | 350000 |
| Transport de matières | 15000 |
| Frais directs de production | 260000 |
| Frais indirects de production | 90000 |
| Jouets produits | 5000 |
| Stock initial (quantité) | 1200 |
| Stock initial (valeur) | 170400 |
| Stock final (quantité) | 2000 |
| Prix de marché du stock final | 300000 |
| Coût de production | =SUM([Matières premières]:[Frais indirects de production]) |
| Coût unitaire de production | =[Coût de production]/[Jouets produits] |
| Quantité disponible | =[Stock initial (quantité)]+[Jouets produits] |
| Valeur disponible | =[Stock initial (valeur)]+[Coût de production] |
| CUMP | =[Valeur disponible]/[Quantité disponible] |
| Valeur du stock final au CUMP | =[Stock final (quantité)]*[CUMP] |
| Valeur retenue du stock final | =MIN([Valeur du stock final au CUMP],[Prix de marché du stock final]) |
```
