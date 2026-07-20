import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AuthUser } from "@core-dashboard/shared";

import { ContainersService } from "../containers/containers.service";
import { PrismaService } from "../prisma/prisma.service";

// Proyectos de compose que nunca se pueden reiniciar desde acá: el propio
// dashboard (se cortaría a sí mismo) y el auth service (todo el ecosistema
// depende de él para validar tokens). El túnel de Cloudflare no corre como
// contenedor de compose gestionado, así que ni aparece en el inventario.
const DEFAULT_PROTECTED_PROJECTS = "core-dashboard,cci-auth-service";

// Evita restarts repetidos del MISMO contenedor (doble click, UI con retry).
const CONTAINER_COOLDOWN_MS = 30_000;

// Presupuesto global: evita que un cliente (con bug o malicioso) reinicie
// contenedores en ráfaga, sin importar cuál.
const GLOBAL_LIMIT = 10;
const GLOBAL_WINDOW_MS = 5 * 60_000;

@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);
  private readonly lastRestartAt = new Map<string, number>();
  private readonly globalRestarts: number[] = [];

  constructor(
    private readonly containers: ContainersService,
    private readonly prisma: PrismaService,
  ) {}

  async restartContainer(containerName: string, user: AuthUser): Promise<{ container: string }> {
    const managed = await this.containers.findManagedByName(containerName);
    if (!managed) throw new NotFoundException(`contenedor desconocido: ${containerName}`);
    if (this.isProtected(managed.project)) {
      throw new ForbiddenException(`"${managed.project}" es un proyecto protegido, no se reinicia`);
    }
    this.checkRateLimit(containerName);

    // Se registra el "gasto" del rate limit ANTES de la llamada a Docker:
    // evita que dos clicks concurrentes pasen ambos el check mientras el
    // primer restart todavía está en vuelo.
    this.recordRestart(containerName);

    try {
      await this.containers.restart(containerName);
    } catch (err) {
      await this.audit(user, containerName, "error");
      throw new HttpException(
        `no se pudo reiniciar ${containerName}: ${(err as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.audit(user, containerName, "ok");
    this.logger.log(`restart ejecutado: ${containerName} (por ${user.email ?? user.sub})`);
    // El aviso de RF-06 sale solo: el restart real dispara eventos die+restart
    // en Docker, que ContainersService ya reenvía y AlertsService ya escucha
    // (con el coalescing die→restart, llega una única notificación).
    return { container: containerName };
  }

  private isProtected(project: string): boolean {
    const list = process.env.PROTECTED_PROJECTS ?? DEFAULT_PROTECTED_PROJECTS;
    const projects = list
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return projects.includes(project);
  }

  private checkRateLimit(containerName: string): void {
    const now = Date.now();
    const last = this.lastRestartAt.get(containerName);
    if (last !== undefined && now - last < CONTAINER_COOLDOWN_MS) {
      const waitSec = Math.ceil((CONTAINER_COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpException(
        `esperá ${waitSec}s antes de volver a reiniciar ${containerName}`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const recent = this.globalRestarts.filter((t) => now - t < GLOBAL_WINDOW_MS);
    if (recent.length >= GLOBAL_LIMIT) {
      throw new HttpException(
        `límite de ${GLOBAL_LIMIT} restarts cada ${GLOBAL_WINDOW_MS / 60_000} min alcanzado`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordRestart(containerName: string): void {
    const now = Date.now();
    this.lastRestartAt.set(containerName, now);
    this.globalRestarts.push(now);
    // Poda ocasional: evita que el array crezca sin límite en una sesión larga.
    if (this.globalRestarts.length > GLOBAL_LIMIT * 4) {
      const cutoff = now - GLOBAL_WINDOW_MS;
      this.globalRestarts.splice(
        0,
        this.globalRestarts.length,
        ...this.globalRestarts.filter((t) => t >= cutoff),
      );
    }
  }

  private async audit(user: AuthUser, target: string, result: "ok" | "error"): Promise<void> {
    // Garantizado no-null: el guard exige rol operator+ antes de llegar acá,
    // así que siempre hay un usuario identificado. Fallback defensivo igual.
    await this.prisma.auditLog.create({
      data: {
        userSub: user.sub ?? "unknown",
        userEmail: user.email ?? "unknown",
        role: user.role,
        action: "restart",
        target,
        result,
      },
    });
  }
}
