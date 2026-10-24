import { Component, type ReactNode } from "react";
import { resetConversations } from "./store";

/** A render error must never leave an empty window: show what failed and a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: "56px 32px 32px", maxWidth: 720, margin: "0 auto", font: "14px system-ui, sans-serif", color: "inherit" }}>
        <h2>Open NPU hit a problem drawing the window</h2>
        <p>Your files and models are untouched. If this keeps happening after a restart, clear the saved chat list below (only the chat history shown in the sidebar is removed).</p>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.8 }}>{error.stack || error.message}</pre>
        <p>
          <button onClick={() => location.reload()}>Reload</button>{" "}
          <button onClick={() => { resetConversations(); location.reload(); }}>Clear saved chats and reload</button>
        </p>
      </div>
    );
  }
}
