---
title: Une feuille Excel en JSON fermé (données, opérations, réponses)
runs: 2
max_tokens: 900
thinking: off
---

# Une feuille Excel en JSON fermé

Le modèle ne fait ni arithmétique ni adresse de cellule : il écrit seulement des DONNÉES (libellé, valeur, unité) et des OPÉRATIONS (somme, différence, produit, quotient, minimum, maximum, moyenne) sur des libellés, puis dit quelle étape répond à quelle question. L'app (ou, ici, une petite fonction `calc` du test) fait les calculs. C'est ce qui rendrait la feuille fiable même avec un petit modèle.
Cette série mesure si les modèles savent remplir ce plan, et le score est ici le VRAI résultat : le code de l'answer est exécuté et les nombres sont comparés (coût de production 715000, valeur retenue du stock final 285613). La ressemblance au texte idéal ne compte presque plus.
Le lab n'impose pas encore la forme par une grammaire (l'app le ferait avec un schéma JSON contraint, qui force des libellés valides) : ici le modèle peut donc se tromper de forme, et c'est une mesure plus dure que l'app.
j01 à j07 : tout en une fois (données + calculs + réponses), avec ou sans méthode, avec un exemple, en français, avec moins d'opérations, avec les étapes en commentaires d'abord. j08 à j11 : les calculs seuls, les données étant fournies (avec la méthode, ou avec les calculs en mots à traduire, avec un exemple d'étape). j12 et j13 : seulement l'extraction des neuf chiffres de l'énoncé.
Lecture : si j12-j13 passent et j10-j11 aussi mais pas j01, le découpage en étapes aide ; si j08 passe, le modèle sait poser les calculs lui-même.

## j01 tout en une fois (forme seule)

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", "max", "avg", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j02 la méthode donnée

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", "max", "avg", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.

The cost of production is the sum of the four costs of the period. CUMP = (value of the opening stock + cost of production) / (quantity of the opening stock + toys produced). The final stock is valued at the lower of its CUMP value and the market price.

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j03 forme et exemple

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", "max", "avg", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.

Example of the form, for another subject (a loan paid in 12 months):
```
const spec = {
  inputs: [{"label":"Capital","value":12000,"unit":"€"},{"label":"Mois","value":12,"unit":"mois"},{"label":"Intérêts","value":600,"unit":"€"}],
  steps: [{"label":"Total à rembourser","op":"sum","args":["Capital","Intérêts"]},{"label":"Mensualité","op":"div","args":["Total à rembourser","Mois"]}],
  answers: {"total":"Total à rembourser","monthly":"Mensualité"}
};
```

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j04 exemple et méthode

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", "max", "avg", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.

Example of the form, for another subject (a loan paid in 12 months):
```
const spec = {
  inputs: [{"label":"Capital","value":12000,"unit":"€"},{"label":"Mois","value":12,"unit":"mois"},{"label":"Intérêts","value":600,"unit":"€"}],
  steps: [{"label":"Total à rembourser","op":"sum","args":["Capital","Intérêts"]},{"label":"Mensualité","op":"div","args":["Total à rembourser","Mois"]}],
  answers: {"total":"Total à rembourser","monthly":"Mensualité"}
};
```

The cost of production is the sum of the four costs of the period. CUMP = (value of the opening stock + cost of production) / (quantity of the opening stock + toys produced). The final stock is valued at the lower of its CUMP value and the market price.

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j05 les étapes en commentaires d'abord

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", "max", "avg", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.
Before the constant, write the steps in words as comment lines (// ...), one per step, then the constant.

The cost of production is the sum of the four costs of the period. CUMP = (value of the opening stock + cost of production) / (quantity of the opening stock + toys produced). The final stock is valued at the lower of its CUMP value and the market price.

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 1200

### Ideal

```
// Coût de production = the sum of the four costs
// Coût unitaire = cost of production / toys produced
// Quantité disponible = opening quantity + toys produced
// Valeur disponible = opening value + cost of production
// CUMP = value available / quantity available
// Valeur du stock final au CUMP = final quantity * CUMP
// Valeur retenue = the lower of that and the market price
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j06 consigne en français

Réponds avec du JavaScript seulement, sans explication : une constante `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs : un objet par chiffre de l'énoncé, {label, value, unit} (libellé court et unique, valeur en nombre simple, unité).
steps : les calculs dans l'ordre, {label, op, args} : libellé unique, op parmi "sum", "sub", "mul", "div", "min", "max", "avg", args = les libellés des données ou des étapes précédentes (sub et div prennent deux libellés : le premier moins ou divisé par le second).
answers : {production_cost, stock_value} : le libellé de l'étape qui donne le coût de production des 5000 jouets, et celui de l'étape qui donne la valeur retenue du stock final.
Ne calcule jamais toi-même : seulement des libellés et des op.

L'énoncé :
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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j07 peu d'opérations

Reply with JavaScript only, no explanation: one constant `const spec = { inputs: [...], steps: [...], answers: {...} };`
inputs: one object per figure of the statement, {label, value, unit}: a short unique label, the value as a plain number, the unit.
steps: the calculations in the order they are made, {label, op, args}: a unique label, op one of "sum", "sub", "mul", "div", "min", and args the labels of inputs or of earlier steps (sub and div take two: the first minus or divided by the second).
answers: {production_cost, stock_value}: the label of the step that gives the cost of production of the 5000 toys, and the label of the step that gives the value kept for the final stock.
Never calculate yourself and never write a formula: only labels and ops.

The cost of production is the sum of the four costs of the period. CUMP = (value of the opening stock + cost of production) / (quantity of the opening stock + toys produced). The final stock is valued at the lower of its CUMP value and the market price.

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- loads
- run: Math.abs(calc(spec)[spec.answers.production_cost] - 715000) < 1 => true
- run: Math.abs(calc(spec)[spec.answers.stock_value] - 285613) < 1 => true
- run: spec.inputs.length >= 9 => true

### Options

max_tokens: 900

### Ideal

```
const spec = {
  inputs: [
    {"label": "Matières premières", "value": 350000, "unit": "€"},
    {"label": "Transport de matières", "value": 15000, "unit": "€"},
    {"label": "Frais directs de production", "value": 260000, "unit": "€"},
    {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
    {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
    {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
    {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
    {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
    {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
  ],
  steps: [
    {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
    {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
    {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
    {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
    {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
    {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
    {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
  ],
  answers: {"production_cost": "Coût de production", "stock_value": "Valeur retenue du stock final"}
};
```

## j08 les calculs seuls

The inputs are already written:
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];

Write the calculations only, as `const steps = [...];` with {label, op, args} objects, JavaScript only, no explanation. op is one of "sum", "sub", "mul", "div", "min", "max", "avg"; args are labels of the inputs above or of earlier steps (sub and div take two: the first minus or divided by the second). Never calculate yourself.
The steps must give the cost of production of the 5000 toys and the value of the final stock (CUMP method).

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

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- given: const inputs = [{"label": "Matières premières", "value": 350000, "unit": "€"}, {"label": "Transport de matières", "value": 15000, "unit": "€"}, {"label": "Frais directs de production", "value": 260000, "unit": "€"}, {"label": "Frais indirects de production", "value": 90000, "unit": "€"}, {"label": "Jouets produits", "value": 5000, "unit": "jouets"}, {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"}, {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"}, {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"}, {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}];
- loads
- run: Math.abs(calc({inputs: inputs, steps: steps})['Coût de production'] - 715000) < 1 => true
- run: Math.abs(calc({inputs: inputs, steps: steps})['Valeur retenue du stock final'] - 285613) < 1 => true

### Options

max_tokens: 900

### Ideal

```
const steps = [
  {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
  {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
  {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
  {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
  {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
  {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
  {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
];
```

## j09 les calculs seuls, méthode donnée

The inputs are already written:
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];

Write the calculations only, as `const steps = [...];` with {label, op, args} objects, JavaScript only, no explanation. op is one of "sum", "sub", "mul", "div", "min", "max", "avg"; args are labels of the inputs above or of earlier steps (sub and div take two: the first minus or divided by the second). Never calculate yourself.
The cost of production is the sum of the four costs of the period. CUMP = (value of the opening stock + cost of production) / (quantity of the opening stock + toys produced). The final stock is valued at the lower of its CUMP value and the market price.
Name the step that gives the cost of production exactly "Coût de production" and the last step exactly "Valeur retenue du stock final".

### Checks

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- given: const inputs = [{"label": "Matières premières", "value": 350000, "unit": "€"}, {"label": "Transport de matières", "value": 15000, "unit": "€"}, {"label": "Frais directs de production", "value": 260000, "unit": "€"}, {"label": "Frais indirects de production", "value": 90000, "unit": "€"}, {"label": "Jouets produits", "value": 5000, "unit": "jouets"}, {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"}, {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"}, {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"}, {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}];
- loads
- run: Math.abs(calc({inputs: inputs, steps: steps})['Coût de production'] - 715000) < 1 => true
- run: Math.abs(calc({inputs: inputs, steps: steps})['Valeur retenue du stock final'] - 285613) < 1 => true

### Options

max_tokens: 900

### Ideal

```
const steps = [
  {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
  {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
  {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
  {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
  {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
  {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
  {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
];
```

## j10 traduire les calculs en opérations

The inputs are already written:
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];

Turn these calculations into `const steps = [...];` with {label, op, args} objects, in this order, JavaScript only, no explanation. op is one of "sum", "sub", "mul", "div", "min", "max", "avg"; args are labels of the inputs above or of earlier steps (sub and div take two: the first minus or divided by the second).

Coût de production: the sum of the four costs
Coût unitaire de production: the cost of production divided by the toys produced
Quantité disponible: the opening quantity plus the toys produced
Valeur disponible: the opening value plus the cost of production
CUMP: the value available divided by the quantity available
Valeur du stock final au CUMP: the final quantity times the CUMP
Valeur retenue du stock final: the lower of the CUMP value and the market price

### Checks

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- given: const inputs = [{"label": "Matières premières", "value": 350000, "unit": "€"}, {"label": "Transport de matières", "value": 15000, "unit": "€"}, {"label": "Frais directs de production", "value": 260000, "unit": "€"}, {"label": "Frais indirects de production", "value": 90000, "unit": "€"}, {"label": "Jouets produits", "value": 5000, "unit": "jouets"}, {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"}, {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"}, {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"}, {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}];
- loads
- run: Math.abs(calc({inputs: inputs, steps: steps})['Coût de production'] - 715000) < 1 => true
- run: Math.abs(calc({inputs: inputs, steps: steps})['Valeur retenue du stock final'] - 285613) < 1 => true

### Options

max_tokens: 700

### Ideal

```
const steps = [
  {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
  {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
  {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
  {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
  {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
  {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
  {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
];
```

## j11 traduire, avec un pas d'exemple

The inputs are already written:
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];

Turn these calculations into `const steps = [...];` with {label, op, args} objects, in this order, JavaScript only, no explanation. op is one of "sum", "sub", "mul", "div", "min", "max", "avg"; args are labels of the inputs above or of earlier steps.
Example of one step: the line "Quantité disponible: the opening quantity plus the toys produced" becomes {"label":"Quantité disponible","op":"sum","args":["Stock initial (quantité)","Jouets produits"]}.

Coût de production: the sum of the four costs
Coût unitaire de production: the cost of production divided by the toys produced
Quantité disponible: the opening quantity plus the toys produced
Valeur disponible: the opening value plus the cost of production
CUMP: the value available divided by the quantity available
Valeur du stock final au CUMP: the final quantity times the CUMP
Valeur retenue du stock final: the lower of the CUMP value and the market price

### Checks

- given: function calc(s){var v={};s.inputs.forEach(function(i){v[i.label]=Number(i.value)});s.steps.forEach(function(t){var a=t.args.map(function(l){if(!(l in v))throw new Error('unknown '+l);return v[l]});var r;switch(t.op){case 'sum':r=a.reduce(function(x,y){return x+y},0);break;case 'sub':r=a[0]-a[1];break;case 'mul':r=a.reduce(function(x,y){return x*y},1);break;case 'div':r=a[0]/a[1];break;case 'min':r=Math.min.apply(null,a);break;case 'max':r=Math.max.apply(null,a);break;case 'avg':r=a.reduce(function(x,y){return x+y},0)/a.length;break;default:throw new Error('op '+t.op)}v[t.label]=r});return v}
- given: const inputs = [{"label": "Matières premières", "value": 350000, "unit": "€"}, {"label": "Transport de matières", "value": 15000, "unit": "€"}, {"label": "Frais directs de production", "value": 260000, "unit": "€"}, {"label": "Frais indirects de production", "value": 90000, "unit": "€"}, {"label": "Jouets produits", "value": 5000, "unit": "jouets"}, {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"}, {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"}, {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"}, {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}];
- loads
- run: Math.abs(calc({inputs: inputs, steps: steps})['Coût de production'] - 715000) < 1 => true
- run: Math.abs(calc({inputs: inputs, steps: steps})['Valeur retenue du stock final'] - 285613) < 1 => true

### Options

max_tokens: 700

### Ideal

```
const steps = [
  {"label": "Coût de production", "op": "sum", "args": ["Matières premières", "Transport de matières", "Frais directs de production", "Frais indirects de production"]},
  {"label": "Coût unitaire de production", "op": "div", "args": ["Coût de production", "Jouets produits"]},
  {"label": "Quantité disponible", "op": "sum", "args": ["Stock initial (quantité)", "Jouets produits"]},
  {"label": "Valeur disponible", "op": "sum", "args": ["Stock initial (valeur)", "Coût de production"]},
  {"label": "CUMP", "op": "div", "args": ["Valeur disponible", "Quantité disponible"]},
  {"label": "Valeur du stock final au CUMP", "op": "mul", "args": ["Stock final (quantité)", "CUMP"]},
  {"label": "Valeur retenue du stock final", "op": "min", "args": ["Valeur du stock final au CUMP", "Prix de marché du stock final"]}
];
```

## j12 extraire les données

Write every figure of this statement as `const inputs = [...];`, JavaScript only, no explanation. One object per figure: {label, value, unit} with a short unique label, the value as a plain number (no space, no currency sign) and the unit. Leave out what is a question or a method, and the average storage time.

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

- loads
- run: inputs.map(function(x){return Number(x.value)}).sort(function(a,b){return a-b}).join() => '1200,2000,5000,15000,90000,170400,260000,300000,350000'
- run: inputs.every(function(x){return typeof x.label === 'string' && x.label.length > 2}) => true

### Options

max_tokens: 600

### Ideal

```
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];
```

## j13 extraire les données avec un exemple

Write every figure of this statement as `const inputs = [...];`, JavaScript only, no explanation. One object per figure, like {"label":"Capital","value":12000,"unit":"€"}: a short unique label, the value as a plain number and the unit. Leave out what is a question or a method, and the average storage time. Nine figures are expected.

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

- loads
- run: inputs.map(function(x){return Number(x.value)}).sort(function(a,b){return a-b}).join() => '1200,2000,5000,15000,90000,170400,260000,300000,350000'
- run: inputs.every(function(x){return typeof x.label === 'string' && x.label.length > 2}) => true

### Options

max_tokens: 600

### Ideal

```
const inputs = [
  {"label": "Matières premières", "value": 350000, "unit": "€"},
  {"label": "Transport de matières", "value": 15000, "unit": "€"},
  {"label": "Frais directs de production", "value": 260000, "unit": "€"},
  {"label": "Frais indirects de production", "value": 90000, "unit": "€"},
  {"label": "Jouets produits", "value": 5000, "unit": "jouets"},
  {"label": "Stock initial (quantité)", "value": 1200, "unit": "jouets"},
  {"label": "Stock initial (valeur)", "value": 170400, "unit": "€"},
  {"label": "Stock final (quantité)", "value": 2000, "unit": "jouets"},
  {"label": "Prix de marché du stock final", "value": 300000, "unit": "€"}
];
```
