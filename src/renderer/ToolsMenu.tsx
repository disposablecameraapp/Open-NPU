import { useEffect, useRef } from "react";
import type { CatalogItem } from "../shared/api";
import type { Effort, Settings } from "../shared/types";
import { Collapse } from "./Collapse";
import { Seg } from "./Seg";
import { useExit } from "./usePresence";
import { TOOL_COMMANDS } from "../core/toolCommands";
import { EFFORTS, effectiveEffort, effortsFor, thinkingSupport } from "../core/effort";
import { AgentsIcon, CheckShieldIcon, GlobeIcon, LoopIcon } from "./Icons";

function Row({ icon, label, hint, on, onToggle, children }: { icon: React.ReactNode; label: string; hint: string; on: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="tool-row">
      <button className="menu-row" role="menuitemcheckbox" aria-checked={on} onClick={onToggle} title={hint}>
        <span className="tool-icon">{icon}</span>
        <span className="menu-label">{label}<span className="muted small tool-hint">{hint}</span></span>
        <span className={`switch ${on ? "on" : ""}`} aria-hidden />
      </button>
      {children && <Collapse open={on}><div className="tool-opts">{children}</div></Collapse>}
    </div>
  );
}

/** The model's smart functions in one place, each one switch away: thinking, sub-agents, code check, web search, auto-improve. */
export function ToolsMenu({ settings, selected, onSave, onClose: onCloseProp }: { settings: Settings; selected: CatalogItem | null; onSave: (p: Partial<Settings>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { leaving, close: onClose } = useExit(onCloseProp);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);

  const support = selected ? thinkingSupport(selected.entry) : "none";
  const levels = effortsFor(support);
  const level = effectiveEffort(settings.effort ?? "auto", support);
  const needsKey = settings.searchProvider === "brave" && !settings.braveKey.trim();
  const needsUrl = settings.searchProvider === "searxng" && !settings.searxngUrl.trim();

  return (
    <div className="menu tools-menu" ref={ref} role="menu" data-state={leaving ? "closed" : "open"}>
      <div className="menu-title">Smart functions</div>
      <Row icon={<span aria-hidden>/</span>} label="Tools on command only" hint="A tool runs only if the message starts with its / word, whatever the model (faster answers)" on={!!settings.toolsOnCommand} onToggle={() => onSave({ toolsOnCommand: !settings.toolsOnCommand })}>
        <div className="muted small">{TOOL_COMMANDS.map((c) => `/${c.word}`).join("  ")}: e.g. “/web latest news on …”. Without a command it is a plain chat: no tool, no router, no file-building steps, no automatic fixes.</div>
      </Row>
      {levels.length > 0 && (
        <div className="tool-row">
          <div className="menu-row static">
            <span className="tool-icon">💡</span>
            <span className="menu-label">Thinking<span className="muted small tool-hint">How long it thinks before answering</span></span>
            <Seg className="small">
              {EFFORTS.filter((e) => levels.includes(e.id)).map((e) => <button key={e.id} className={e.id === level ? "on" : ""} onClick={() => onSave({ effort: e.id as Effort })} title={e.hint}>{e.label}</button>)}
            </Seg>
          </div>
        </div>
      )}
      <Row icon={<AgentsIcon />} label="Sub-agents" hint="Splits a big job into parts, one after another" on={settings.subagents} onToggle={() => onSave({ subagents: !settings.subagents })} />
      <Row icon={<CheckShieldIcon />} label="Code check" hint="Runs what it writes and fixes the errors" on={settings.autoCheck} onToggle={() => onSave({ autoCheck: !settings.autoCheck })}>
        <div className="muted small">{settings.reviewerModelId ? "A review model fixes what fails (Settings → Code check)." : "The writing model fixes its own errors. Pick a bigger review model in Settings → Code check."}</div>
      </Row>
      <Row icon={<GlobeIcon />} label="Web search" hint="Looks things up online and cites the sources" on={settings.webSearch} onToggle={() => onSave({ webSearch: !settings.webSearch })}>
        <label className="check small"><input type="checkbox" checked={settings.searchAlways} onChange={(e) => onSave({ searchAlways: e.target.checked })} /> Search for every message (small models rarely ask)</label>
        {(needsKey || needsUrl) && <div className="warn small">{needsKey ? "Brave Search needs an API key" : "SearXNG needs an instance address"}: Settings → Web search.</div>}
        {!needsKey && !needsUrl && <div className="muted small">Using {settings.searchProvider === "duckduckgo" ? "DuckDuckGo" : settings.searchProvider === "brave" ? "Brave Search" : "SearXNG"}{settings.searchModelId ? " and a search model to read the pages" : ""}.</div>}
      </Row>
      <Row icon={<GlobeIcon />} label="Pictures" hint="Adds a picture from Wikimedia Commons when it really helps" on={settings.wikimediaImages} onToggle={() => onSave({ wikimediaImages: !settings.wikimediaImages })}>
        <div className="muted small">Only when you ask to see something, three at most, with the author and licence under each. The keywords are sent to Wikimedia.</div>
      </Row>
      <Row icon={<LoopIcon />} label="Auto-improve" hint="Keeps improving the code round after round, on its own" on={settings.agentLoop} onToggle={() => onSave({ agentLoop: !settings.agentLoop })}>
        <div className="tool-fields">
          <label className="small">Rounds at most
            <select value={settings.agentRounds} onChange={(e) => onSave({ agentRounds: parseInt(e.target.value, 10) })}>{[2, 4, 6, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label className="small">Time at most
            <select value={settings.agentMinutes} onChange={(e) => onSave({ agentMinutes: parseInt(e.target.value, 10) })}>
              {[10, 30, 60, 120, 240, 480].map((n) => <option key={n} value={n}>{n < 60 ? `${n} min` : `${n / 60} h`}</option>)}
            </select>
          </label>
        </div>
        <input className="tool-goal" value={settings.agentGoal} placeholder="Direction, e.g. add 3D graphics, rainbows and unicorns" onChange={(e) => onSave({ agentGoal: e.target.value })} />
        <div className="muted small">After the first answer it makes one improvement per round, runs the result and keeps it only if it works. You can leave the PC running; Stop ends it.</div>
      </Row>
    </div>
  );
}
