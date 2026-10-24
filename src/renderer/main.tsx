import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installMockIfNeeded } from "./mock";
import "./styles.css";
import "./motion.css";
import "./composer.css";
import "./polish.css";

installMockIfNeeded();
createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);
