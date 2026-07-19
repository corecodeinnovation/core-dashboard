import { Injectable } from "@nestjs/common";
import type { StateSnapshot } from "@core-dashboard/shared";

export const STATE_SNAPSHOT_PROVIDER = "STATE_SNAPSHOT_PROVIDER";

// Fuente del snapshot completo que pide el cliente al (re)conectar.
export interface StateSnapshotProvider {
  getSnapshot(): Promise<StateSnapshot>;
}

// Stub: lo reemplaza el módulo containers (1-04) con el inventario real
// vía dockerode. Mantiene el contrato de resync funcionando desde ya.
@Injectable()
export class EmptySnapshotProvider implements StateSnapshotProvider {
  async getSnapshot(): Promise<StateSnapshot> {
    return { services: [], generatedAt: new Date().toISOString() };
  }
}
