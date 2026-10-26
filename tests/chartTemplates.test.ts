import { describe, expect, it } from "vitest";
import { chartBlocks, chartFlaw, chartModel, parseChartSpec } from "../src/core/chart";
import { templateChart } from "../src/core/chartTemplates";
import { routeVisual } from "../src/core/visualRoute";

const ASK = "fais un diagram d'interet composer ou je peux choisir le taux annuelle, le montant de depart et la durée du placement de la somme, qui montre la formule de base, la formule avec mes valeurs et un graph de la some sur la durée donner\n\nje veux pouvoir rentrer le nombre exact pour chaque des valeurs";

describe("ready-made calculators", () => {
  it("the compound interest request is a calculator and gets a chart that draws", () => {
    expect(routeVisual(ASK)?.kind).toBe("calculator");
    const t = templateChart(ASK)!;
    expect(t).not.toBeNull();
    const [b] = chartBlocks(t.block);
    expect(chartFlaw(b.raw)).toBeNull();
    const spec = parseChartSpec(b.raw);
    expect(typeof spec).not.toBe("string");
    const m = chartModel(spec as any);
    expect(m.problem).toBeUndefined();
  });

  it("the loan chart draws and its monthly payment is right", () => {
    const t = templateChart("fais un simulateur de prêt où je choisis le montant, le taux et la durée")!;
    expect(t).not.toBeNull();
    const [b] = chartBlocks(t.block);
    expect(chartFlaw(b.raw)).toBeNull();
  });

  it("other requests have no template", () => {
    expect(templateChart("fais un graphique des ventes par mois")).toBeNull();
  });
});
