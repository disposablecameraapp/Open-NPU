import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installMockIfNeeded } from "./mock";
import "./styles.css";

installMockIfNeeded();
createRoot(document.getElementById("root")!).render(<App />);
