import type { Role } from "../utils/rbac";
import { ROLES } from "../utils/rbac";

/** Rótulos de exibição dos cargos (as strings de valor seguem minúsculas/sem acento). */
export const ROLE_LABEL: Record<Role, string> = {
  consultor: "Consultor",
  socio: "Sócio",
  operacional: "Operacional",
  administrador: "Administrador",
};

interface RoleOption {
  value: Role;
  label: string;
}

export const ROLE_OPTIONS: RoleOption[] = ROLES.map((value) => ({
  value,
  label: ROLE_LABEL[value],
}));
