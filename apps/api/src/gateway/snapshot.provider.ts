import type { StateSnapshot } from "@core-dashboard/shared";

export const STATE_SNAPSHOT_PROVIDER = "STATE_SNAPSHOT_PROVIDER";

// Fuente del snapshot completo que pide el cliente al (re)conectar.
// La implementación real vive en el módulo containers (inventario dockerode).
export interface StateSnapshotProvider {
  getSnapshot(): Promise<StateSnapshot>;
}
