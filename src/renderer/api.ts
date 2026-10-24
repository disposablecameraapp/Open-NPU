import type { OpenNpuApi } from "../shared/api";

declare global {
  interface Window {
    opennpu: OpenNpuApi;
  }
}

export const api = (): OpenNpuApi => window.opennpu;
