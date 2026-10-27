/**
 * The general construction engine: any program is built the same way, by walking a small model through short, checked steps.
 * Nothing in this folder knows a genre of program. What the engine knows is the shape of a program (what it remembers, what it
 * decides, what it shows, what it reacts to) and how to keep every step small, tested and given only the context it needs.
 */

/** What a unit of a program is, from the point of view of what it may touch. */
export type UnitKind = "state" | "layout" | "fn" | "view" | "handler";
export const UNIT_KINDS: UnitKind[] = ["state", "layout", "fn", "view", "handler"];

export interface Example { call: string; expect: string }

/** One piece of the program: written in one go, by a session that sees only what its `uses` and its task say. */
export interface Unit {
  id: string;
  kind: UnitKind;
  /** The identifier of a function or view, `S` for the state, `layout` for the page structure. */
  name: string;
  /** One sentence: what it does. */
  does: string;
  /** The requirements it serves (R1, R2...): a unit that serves none has no reason to exist. */
  serves: string[];
  /** The names of the units it calls or reads. */
  uses: string[];
  /** For a function: `name(arg, arg) -> what it returns`. */
  signature?: string;
  /** For a function: cases that must hold, as JavaScript expressions (`call` must equal `expect`). */
  examples: Example[];
  /** For a handler: the event that calls it (`click #id`, `key`, `tick 500`, `load`, `input #id`, `submit #id`, `change #id`). */
  on?: string;
  /** For a view: the id of the element of the page it draws into (the layout must have it). */
  into?: string;
}

export interface Requirement { id: string; text: string }

export interface Plan {
  title: string;
  language: string;
  requirements: Requirement[];
  units: Unit[];
}

/** A unit once written: its code, and how far it is trusted. */
export interface Accepted {
  code: string;
  /** Its examples all held (a function), or it parsed and met its contract (the other kinds). */
  verified: boolean;
  /** What is still wrong with it, shown in the log and given to a repair. */
  problems: string[];
}

/** The events a build reports; the same as the ones the page builders use. */
export type { XEvent, XHost, XResult } from "../xbuild";
