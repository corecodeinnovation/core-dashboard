import { SetMetadata } from "@nestjs/common";
import type { Role } from "@core-dashboard/shared";

export const MIN_ROLE_KEY = "minRole";

// Rol mínimo para un handler/controlador REST. Sin decorador, el endpoint es
// público (viewer); el guard igual adjunta `req.user` para el resto de la app.
export const RequireRole = (role: Role) => SetMetadata(MIN_ROLE_KEY, role);
