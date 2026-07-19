import Docker from "dockerode";

export const DOCKER_CLIENT = "DOCKER_CLIENT";

// Cliente dockerode inyectable: los tests lo sustituyen por un fake.
// El socket se monta read-only en el contenedor; aquí solo se lee estado,
// nunca se ejecutan acciones (las acciones con RBAC van por otro módulo).
export function createDockerClient(): Docker {
  return new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
}
