/**
 * Política central de RBAC — usada pelo middleware server (autorização de API)
 * e pelo client (guarda de navegação + visibilidade de UI). Manter as regras
 * só aqui pra server e client nunca divergirem.
 *
 * Cargos (strings exatas, minúsculas, sem acento):
 * - consultor    → só Follow-up, somente leitura, filtrado pelo próprio nome.
 * - socio        → leitura de Patients, Processos e Pagamentos (tudo, sem filtro).
 * - operacional  → leitura + escrita de Processos e de Pagamentos (todos).
 * - administrador → acesso total (comportamento legado).
 */
export type Role = "consultor" | "socio" | "operacional" | "administrador";

export const ROLES: readonly Role[] = ["consultor", "socio", "operacional", "administrador"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Áreas protegidas do sistema. "config" ainda não tem página/endpoint.
 * "recados" é a única seção liberada pra TODOS os cargos, leitura e escrita —
 * Consultor e Sócio, read-only no resto do CRM, escrevem aqui (ver
 * docs/recados-spec.md seção 4). Cobre também GET /api/contas (seletor de
 * destinatário) e /api/notificacoes e /api/lembretes — mesmo RBAC, sem
 * mecanismo de "qualquer autenticado" separado.
 */
export type Section = "patients" | "processos" | "pagamentos" | "admin" | "config" | "recados";

const READ_ACCESS: Record<Section, readonly Role[]> = {
  patients: ["socio", "administrador"],
  processos: ["consultor", "socio", "operacional", "administrador"],
  pagamentos: ["socio", "operacional", "administrador"],
  admin: ["administrador"],
  config: ["administrador"],
  recados: ROLES,
};

const WRITE_ACCESS: Record<Section, readonly Role[]> = {
  patients: ["administrador"],
  processos: ["operacional", "administrador"],
  pagamentos: ["operacional", "administrador"],
  admin: ["administrador"],
  config: ["administrador"],
  recados: ROLES,
};

export function canReadSection(role: Role, section: Section): boolean {
  return READ_ACCESS[section].includes(role);
}

export function canWriteSection(role: Role, section: Section): boolean {
  return WRITE_ACCESS[section].includes(role);
}

/**
 * true quando o cargo só pode ver os próprios registros de Processo
 * (comparando Processo.consultor com AuthUser.consultorNome).
 */
export function isRowScopedToOwnConsultor(role: Role): boolean {
  return role === "consultor";
}

/**
 * true para os cargos que não param em Início — caem direto em Follow-up.
 * Regra única: antes vivia reescrita em 3 lugares (defaultRouteForRole aqui,
 * o guard de landing em authz.global.ts, e o filtro do link "Início" em
 * SidebarNav.vue) — confirmado que as 3 cópias usavam exatamente os mesmos 2
 * cargos e o mesmo sentido, só variando o jeito de testar a condição.
 */
export function landsOnProcessos(role: Role): boolean {
  return role === "consultor" || role === "operacional";
}

/** Rota de entrada padrão depois do login, por cargo. */
export function defaultRouteForRole(role: Role): string {
  return landsOnProcessos(role) ? "/processos" : "/inicio";
}

const WRITE_METHODS: readonly string[] = ["POST", "PUT", "PATCH", "DELETE"];

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.includes(method.toUpperCase());
}

/** Mapeia um path de API (`event.path`) para a seção protegida, ou null. */
export function sectionForApiPath(path: string): Section | null {
  const p = path.split("?")[0] ?? path;
  if (p === "/api/patients" || p.startsWith("/api/patients/")) return "patients";
  if (p === "/api/attachments" || p.startsWith("/api/attachments/")) return "patients";
  if (p === "/api/processos" || p.startsWith("/api/processos/")) return "processos";
  if (p === "/api/pagamentos" || p.startsWith("/api/pagamentos/")) return "pagamentos";
  if (p === "/api/admin" || p.startsWith("/api/admin/")) return "admin";
  if (p === "/api/recados" || p.startsWith("/api/recados/")) return "recados";
  if (p === "/api/contas" || p.startsWith("/api/contas/")) return "recados";
  if (p === "/api/notificacoes" || p.startsWith("/api/notificacoes/")) return "recados";
  if (p === "/api/lembretes" || p.startsWith("/api/lembretes/")) return "recados";
  return null;
}

/**
 * Prefixos de API que exigem só sessão válida (qualquer cargo autenticado),
 * sem checagem de seção — ex.: o próprio "quem sou eu". É a ÚNICA exceção à
 * regra de "nega por padrão": qualquer path `/api/**` que não mapeie para uma
 * seção (`sectionForApiPath` → null) e não bata aqui é rejeitado com 403 pelo
 * middleware (server/middleware/auth.ts).
 */
export const AUTHENTICATED_ANY_API_PREFIXES: readonly string[] = ["/api/auth/"];

/** true quando o path só precisa de sessão (está em AUTHENTICATED_ANY_API_PREFIXES). */
export function isAuthenticatedAnyApiPath(path: string): boolean {
  const p = path.split("?")[0] ?? path;
  return AUTHENTICATED_ANY_API_PREFIXES.some((prefix) => p.startsWith(prefix));
}

/** Mapeia uma rota de página para a seção protegida, ou null. */
export function sectionForPageRoute(path: string): Section | null {
  if (path === "/prestacao" || path.startsWith("/prestacao/")) return "patients";
  if (path === "/processos" || path.startsWith("/processos/")) return "processos";
  if (path === "/pagamentos" || path.startsWith("/pagamentos/")) return "pagamentos";
  if (path === "/configuracoes" || path.startsWith("/configuracoes/")) return "config";
  if (path === "/recados" || path.startsWith("/recados/")) return "recados";
  return null;
}
