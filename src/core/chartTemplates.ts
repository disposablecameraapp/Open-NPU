import { chartFlaw } from "./chart";

/**
 * Calculators that come up all the time, written once and tested, so a small model is not asked to write their JSON: it fails at it (brackets
 * in place of objects, unquoted ids), twice in a row even when asked to correct itself. The request decides, with no model call.
 */
const COMPOUND = /\bint[ée]r[eê]ts?\s+compos(?:[ée]e?s?|er|ers)\b|\bcompound(?:ed)?\s+interest\b|\bcapitalisation\b/i;
const LOAN = /\b(?:pr[êe]t|cr[ée]dit|emprunt|loan|mortgage|pr[êe]t immobilier|mensualit[ée]s?)\b/i;

const compound = {
  type: "area",
  title: "Intérêts composés",
  x: { label: "Années", min: 0, max: "t", step: 1 },
  yLabel: "Euros",
  params: [
    { id: "P", label: "Montant de départ", min: 0, max: 1000000, value: 10000, step: 500, unit: "€" },
    { id: "r", label: "Taux annuel", min: 0, max: 20, value: 5, step: 0.1, unit: "%" },
    { id: "t", label: "Durée", min: 1, max: 50, value: 10, step: 1, unit: "ans" }
  ],
  formulas: [
    { label: "Formule de base", tex: "A = P\\left(1+\\frac{r}{100}\\right)^{t}" },
    { label: "Avec vos valeurs", tex: "A = [[P]]\\times\\left(1+\\frac{[[r]]}{100}\\right)^{[[t]]} = [[=P*(1+r/100)^t]]" }
  ],
  outputs: [
    { label: "Montant final", y: "P*(1+r/100)^t", unit: "€" },
    { label: "Intérêts gagnés", y: "P*(1+r/100)^t-P", unit: "€" }
  ],
  series: [
    { name: "Avec intérêts", y: "P*(1+r/100)^x" },
    { name: "Sans intérêts", y: "P" }
  ]
};

const loan = {
  type: "line",
  title: "Prêt à mensualités constantes",
  x: { label: "Années", min: 0, max: "t", step: 1 },
  yLabel: "Euros",
  params: [
    { id: "P", label: "Montant emprunté", min: 1000, max: 1000000, value: 200000, step: 1000, unit: "€" },
    { id: "r", label: "Taux annuel", min: 0.1, max: 15, value: 4, step: 0.1, unit: "%" },
    { id: "t", label: "Durée", min: 1, max: 30, value: 20, step: 1, unit: "ans" }
  ],
  formulas: [
    { label: "Formule de base", tex: "M = P\\times\\frac{i}{1-(1+i)^{-12t}},\\quad i=\\frac{r}{1200}" },
    { label: "Avec vos valeurs", tex: "M = [[P]]\\times\\frac{[[=r/1200]]}{1-(1+[[=r/1200]])^{-12\\times[[t]]}} = [[=P*(r/1200)/(1-(1+r/1200)^(-12*t))]]" }
  ],
  outputs: [
    { label: "Mensualité", y: "P*(r/1200)/(1-(1+r/1200)^(-12*t))", unit: "€" },
    { label: "Coût total", y: "12*t*P*(r/1200)/(1-(1+r/1200)^(-12*t))", unit: "€" },
    { label: "Intérêts payés", y: "12*t*P*(r/1200)/(1-(1+r/1200)^(-12*t))-P", unit: "€" }
  ],
  series: [
    { name: "Capital restant dû", y: "P*(1+r/1200)^(12*x)-P*(r/1200)/(1-(1+r/1200)^(-12*t))*((1+r/1200)^(12*x)-1)/(r/1200)" },
    { name: "Total remboursé", y: "12*x*P*(r/1200)/(1-(1+r/1200)^(-12*t))" }
  ]
};

/** The ready-made chart block text for a request that is a known calculator, or null. */
export function templateChart(request: string): { block: string; intro: string } | null {
  const pick = COMPOUND.test(request) ? { spec: compound, intro: "Voici le calculateur d'intérêts composés : entrez le taux, le montant de départ et la durée." }
    : LOAN.test(request) && /\b(mensualit|taux|dur[ée]e|montant)/i.test(request) ? { spec: loan, intro: "Voici le simulateur de prêt : entrez le montant, le taux et la durée." }
    : null;
  if (!pick) return null;
  const raw = JSON.stringify(pick.spec);
  if (chartFlaw(raw) !== null) return null;
  return { block: "```chart\n" + raw + "\n```", intro: pick.intro };
}
