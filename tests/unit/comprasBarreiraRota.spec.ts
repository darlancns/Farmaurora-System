import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { AuthUser } from "#shared/types/auth";
import { NIVEIS_PERMISSAO, permissoesTudoNenhum, type Permissoes } from "#shared/utils/permissoesPagina";
import { ROLES, type Role } from "#shared/utils/rbac";

// O guarda de rotas REAL (app/middleware/authz.global.ts) diante de /compras, com o runtime do Nuxt simulado (o mesmo molde de
// authzGlobal.spec.ts). A página Compras é, por ora, um placeholder; o que se prova é quem entra e para onde vai quem não pode.
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
  const user: AuthUser = { id: "u1", email: "u@x.com", role, isAdmin: role === "administrador", ...(permissoes ? { permissoes } : {}) };
  estado<AuthUser | null>("auth-user", null).value = user;
}

async function ir(path: string): Promise<Resultado> {
  return (await (guarda as unknown as (to: { path: string }) => Promise<Resultado>)({ path })) as Resultado;
}

const ROTAS = ["/compras", "/compras/", "/compras/nova", "/compras/12/editar"];

beforeEach(() => {
  h.estados.clear();
  estado<AuthUser | null>("auth-user", null);
  estado<boolean>("auth-user-loaded", true);
});

describe("guarda de rotas — /compras sem mapa na conta (regra do cargo)", () => {
  it.each(["administrador", "operacional", "socio"] as const)("%s abre /compras e as subrotas", async (role) => {
    entrar(role);
    for (const rota of ROTAS) expect(await ir(rota), `${role} ${rota}`).toBeUndefined();
  });

  it("o consultor não abre /compras: vai para /processos, a página dele", async () => {
    entrar("consultor");
    for (const rota of ROTAS) expect(await ir(rota), rota).toMatchObject({ redireciona: "/processos" });
  });

  it("as páginas de antes continuam como estavam (o consultor segue abrindo /processos e /recados)", async () => {
    entrar("consultor");
    expect(await ir("/processos")).toBeUndefined();
    expect(await ir("/recados")).toBeUndefined();
    expect(await ir("/configuracoes")).toBeUndefined();
    entrar("socio");
    expect(await ir("/dir")).toMatchObject({ redireciona: "/processos" });
  });
});

describe("guarda de rotas — /compras com mapa na conta", () => {
  for (const role of ["socio", "operacional"] as const) {
    for (const nivel of NIVEIS_PERMISSAO) {
      it(`${role} com compras = "${nivel}": ${nivel === "nenhum" ? "redireciona" : "abre"}`, async () => {
        // Com processos = ver, a página inicial de quem fica sem Compras é /processos.
        entrar(role, { ...permissoesTudoNenhum(), processos: "ver", compras: nivel });
        for (const rota of ROTAS) {
          const r = await ir(rota);
          if (nivel === "nenhum") expect(r, `${role} ${rota}`).toMatchObject({ redireciona: "/processos" });
          else expect(r, `${role} ${rota}`).toBeUndefined();
        }
      });
    }

    it(`${role} com mapa gravado ANTES de Compras (sem a chave): redireciona, mesmo podendo editar tudo o mais`, async () => {
      entrar(role, { processos: "editar", pagamentos: "editar", dir: "editar", patients: "editar" });
      expect(await ir("/compras")).toMatchObject({ redireciona: "/processos" });
    });

    it(`${role} com tudo 'nenhum' cai em /recados ao tentar /compras (nunca num loop)`, async () => {
      entrar(role, permissoesTudoNenhum());
      expect(await ir("/compras")).toMatchObject({ redireciona: "/recados" });
      expect(await ir("/recados")).toBeUndefined();
    });

    it(`${role} que só lê Compras: a página inicial é /compras e o guarda não a redireciona`, async () => {
      entrar(role, { ...permissoesTudoNenhum(), compras: "ver" });
      expect(await ir("/")).toMatchObject({ redireciona: "/compras" });
      expect(await ir("/compras")).toBeUndefined();
      expect(await ir("/processos")).toMatchObject({ redireciona: "/compras" });
    });
  }

  it("administrador e consultor ignoram o mapa", async () => {
    entrar("administrador", permissoesTudoNenhum());
    expect(await ir("/compras")).toBeUndefined();
    entrar("consultor", { ...permissoesTudoNenhum(), compras: "editar" });
    expect(await ir("/compras")).toMatchObject({ redireciona: "/processos" });
  });

  it("todos os cargos: /compras nunca derruba a navegação (sempre abre ou redireciona para algo que abre)", async () => {
    for (const role of ROLES) {
      entrar(role);
      const r = await ir("/compras");
      if (r) expect(await ir(r.redireciona), `${role} -> ${r.redireciona}`).toBeUndefined();
    }
  });
});
