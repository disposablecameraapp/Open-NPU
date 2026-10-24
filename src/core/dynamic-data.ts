import type { DynamicData } from "./dynamic";
import raw from "./dynamic-data.json";

/** The sizes of Dynamic and which model does which kind of task, from public independent benchmarks (docs/dynamic-model-research.md). */
export const DYNAMIC_DATA = raw as DynamicData;
