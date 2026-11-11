import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { AuthUser } from "#shared/types/auth";
import type { Permissoes } from "#shared/utils/permissoesPagina";
import { ROLES, type Role } from "#shared/utils/rbac";

// O guarda de rotas REAL (app/middleware/authz.global.ts) e o useAuth real, com o runtime do Nuxt simulado.
// Roda o ramo do client (import.meta.server é indefinido no vitest); o ramo do SSR só troca a origem do usuário
// (event.context.user) e chama a mesma função de decisão.
const h = vi.hoisted(() => ({ estados: new Map<string, unknown>() }));

vi.mock("#app", () => ({
  defineNuxtRouteMiddleware: <T>(fn: T): T => fn,
  navigateTo: (to: string, opcoes?: unknown) => ({ redireciona: to, opcoes }),
  useRequestEvent: () => undefined,
  useState: <T>(chave: string, init?: () => T): Ref<T> => {
    if (!h.estados.has(chave)) h.estados.set(chave, ref(init ? init() : undefined));
    return h.estados.get(chave) as Ref<T>;
  },
}));

import guarda from "../../app/middleware/authz.global";

type Resultado = { redireciona: string; opcoes?: unknown } | undefined;

function estado<T>(chave: string, inicial: T): Ref<T> {
  if (!h.estados.has(chave)) h.estados.set(chave, ref(inicial));
  return h.estados.get(chave) as Ref<T>;
}

function entrar(role: Role, permissoes?: Permissoes): void {
  const user: AuthUser = {
    id: "u1",
    email: "u@x.com",
    role,
    isAdmin: role === "administrador",
    ...(permissoes ? { permissoes } : {}),
  };
  estado<AuthUser | null>("auth-user", null).value = user;
}

async function ir(path: string): Promise<Resultado> {
  return (await (guarda as unknown as (to: { path: string }) => Promise<Resultado>)({ path })) as Resultado;
}

const TUDO_NENHUM: Permissoes = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };

beforeEach(() => {
  h.estados.clear();
  estado<AuthUser | null>("auth-user", null);
  // `loaded` verdadeiro: useAuth().load() devolve o usuário do estado, sem ir à rede.
  estado<boolean>("auth-user-loaded", true);
});

describe("guarda de rotas — conta SEM mapa: igual ao comportamento de antes, nos 4 cargos", () => {
  // Páginas que cada cargo NÃO abre (esperado escrito à mão, regra de antes desta mudança).
  const proibidas: Record<Role, string[]> = {
    consultor: ["/pagamentos", "/prestacao"],
    socio: [],
    operacional: ["/prestacao"],
    administrador: [],
  };
  const todas = ["/processos", "/pagamentos", "/prestacao", "/recados", "/configuracoes", "/processos/abc"];

  it.each(ROLES)("%s: abre o que lia, e o resto redireciona para /processos", async (role) => {
    entrar(role);
    for (const rota of todas) {
      const bloqueada = proibidas[role].some((p) => rota === p || rota.startsWith(`${p}/`));
      const r = await ir(rota);
      if (bloqueada) expect(r, `${role} ${rota}`).toMatchObject({ redireciona: "/processos" });
      else expect(r, `${role} ${rota}`).toBeUndefined();
    }
  });

  it.each(ROLES)("%s: '/' e a página removida /inicio vão para /processos", async (role) => {
    entrar(role);
    expect(await ir("/")).toMatchObject({ redireciona: "/processos" });
    expect(await ir("/inicio")).toMatchObject({ redireciona: "/processos", opcoes: { replace: true } });
  });

  it("/login nunca é tratado pelo guarda, e sem usuário ele não faz nada", async () => {
    entrar("operacional", TUDO_NENHUM);
    expect(await ir("/login")).toBeUndefined();
    estado<AuthUser | null>("auth-user", null).value = null;
    expect(await ir("/processos")).toBeUndefined();
  });
});

describe("guarda de rotas — com mapa gravado", () => {
  it.each(["socio", "operacional"] as const)("%s com tudo 'nenhum': vai para /recados e NÃO entra em loop", async (role) => {
    entrar(role, TUDO_NENHUM);
    for (const rota of ["/processos", "/pagamentos", "/prestacao", "/", "/inicio", "/processos/abc"]) {
      expect(await ir(rota), `${role} ${rota}`).toMatchObject({ redireciona: "/recados" });
    }
    // o destino do redirecionamento abre sem novo redirecionamento; Configurações e Recados seguem abertos
    expect(await ir("/recados")).toBeUndefined();
    expect(await ir("/configuracoes")).toBeUndefined();
  });

  it("vai para a primeira página legível, não para /processos", async () => {
    entrar("operacional", { processos: "nenhum", pagamentos: "ver", patients: "nenhum" });
    expect(await ir("/processos")).toMatchObject({ redireciona: "/pagamentos" });
    expect(await ir("/")).toMatchObject({ redireciona: "/pagamentos" });
    expect(await ir("/pagamentos")).toBeUndefined();
    expect(await ir("/prestacao")).toMatchObject({ redireciona: "/pagamentos" });
  });

  it("'ver' basta para abrir a página (a escrita é decidida dentro dela)", async () => {
    entrar("socio", { processos: "ver", pagamentos: "nenhum", patients: "nenhum" });
    expect(await ir("/processos")).toBeUndefined();
    expect(await ir("/")).toMatchObject({ redireciona: "/processos" });
  });

  it("operacional com 'editar' em Prestação abre a página (o cargo sozinho não abria)", async () => {
    entrar("operacional", { patients: "editar" });
    expect(await ir("/prestacao")).toBeUndefined();
  });

  it("consultor e administrador ignoram o mapa", async () => {
    entrar("administrador", TUDO_NENHUM);
    for (const rota of ["/processos", "/pagamentos", "/prestacao"]) expect(await ir(rota), rota).toBeUndefined();
    expect(await ir("/")).toMatchObject({ redireciona: "/processos" });
    entrar("consultor", TUDO_NENHUM);
    expect(await ir("/processos")).toBeUndefined();
    expect(await ir("/pagamentos")).toMatchObject({ redireciona: "/processos" });
  });
});
