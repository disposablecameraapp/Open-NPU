import candidates from "./bench-candidates.json";

/** A model picked by hand for being good at something specific, whose repo and Q4_0 file were checked on Hugging Face. */
export interface Candidate { name: string; repo: string; altRepos?: string[]; quant: string; sizeGB: number; paramsB: number | null; arch: string | null; specialty: string; tags: string[] }
export const CANDIDATES = candidates as Candidate[];
/** What each specialist is known for, by model name. */
export const CANDIDATE_TAGS: Record<string, string[]> = Object.fromEntries(CANDIDATES.map((c) => [c.name, c.tags]));
