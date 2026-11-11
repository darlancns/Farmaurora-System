import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { AuthUser } from "#shared/types/auth";
import { podeEscrever, podeLer, type Permissoes } from "#shared/utils/permissoesPagina";
import type { Role } from "#shared/utils/rbac";
import { resolveAuthUser } from "../../server/utils/authUser";

// Plugin real (app/plugins/authUser.server.ts) com o runtime do Nuxt simulado: prova que `permissoes` chega ao
// front junto com o resto do usuário, sem nenhum código a mais.
const h = vi.hoisted(() => ({
  estados: new Map<string, unknown>(),
  usuarioDoServidor: { current: null as unknown },
}));

vi.mock("#app", () => ({
  defineNuxtPlugin: <T>(plugin: T): T => plugin,
  useRequestEvent: () => ({ context: { user: h.usuarioDoServidor.current } }),
  useState: <T>(chave: string, init?: () => T): Ref<T> => {
    if (!h.estados.has(chave)) h.estados.set(chave, ref(init ? init() : undefined));
    return h.estados.get(chave) as Ref<T>;
  },
}));

const base = { id: "u1", email: "x@farmaurora.com.br" };

function resolver(appMetadata: Record<string, unknown>, adminEmails: string[] = []): AuthUser {
  return resolveAuthUser({ ...base, app_metadata: appMetadata } as never, adminEmails);
}

describe("resolveAuthUser — permissoes (leitura de app_metadata.permissoes)", () => {
  it.each<Role>(["consultor", "socio", "operacional", "administrador"])(
    "%s sem a chave: nada muda (a propriedade nem existe)",
    (role) => {
      const u = resolver(role === "consultor" ? { role, consultorNome: "André Vitório" } : { role, nome: "Fulano" });
      expect(u).not.toHaveProperty("permissoes");
      expect(u.permissoes).toBeUndefined();
    },
  );

  it("o objeto de uma conta sem a chave é idêntico ao de antes (mesmas chaves, nenhuma a mais)", () => {
    expect(resolver({ role: "operacional", nome: "Bruno Alves" })).toStrictEqual({
      id: "u1",
      email: "x@farmaurora.com.br",
      role: "operacional",
      consultorNome: undefined,
      nome: "Bruno Alves",
      isAdmin: false,
    });
  });

  it.each(["socio", "operacional"] as const)("%s com mapa válido: lê o mapa completo", (role) => {
    const u = resolver({
      role,
      permissoes: { processos: "ver", pagamentos: "editar", patients: "ver" },
    });
    expect(u.permissoes).toEqual({ processos: "ver", pagamentos: "editar", patients: "ver" });
  });

  it.each(["socio", "operacional"] as const)("%s com mapa parcial: seções ausentes viram 'nenhum'", (role) => {
    const u = resolver({ role, permissoes: { processos: "editar" } });
    expect(u.permissoes).toEqual({ processos: "editar", pagamentos: "nenhum", patients: "nenhum" });
    expect(podeLer(u, "pagamentos")).toBe(false);
  });

  it.each(["socio", "operacional"] as const)("%s com valores inválidos: sanitizados para 'nenhum'", (role) => {
    const u = resolver({ role, permissoes: { processos: "EDITAR", pagamentos: 3, patients: "ver", extra: "editar" } });
    expect(u.permissoes).toEqual({ processos: "nenhum", pagamentos: "nenhum", patients: "ver" });
  });

  it.each(["socio", "operacional"] as const)("%s com mapa gravado vazio, ilegível ou de tipo errado: tudo 'nenhum'", (role) => {
    const nenhum = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };
    for (const lixo of [{}, "editar", 1, true, [], ["processos"]]) {
      const u = resolver({ role, permissoes: lixo });
      expect(u.permissoes, JSON.stringify(lixo)).toEqual(nenhum);
      expect(podeLer(u, "processos")).toBe(false);
    }
  });

  it.each(["socio", "operacional"] as const)("%s com permissoes null: vale a regra do cargo (sem mapa)", (role) => {
    const u = resolver({ role, permissoes: null });
    expect(u).not.toHaveProperty("permissoes");
    expect(podeLer(u, "processos")).toBe(true);
    expect(podeEscrever(u, "processos")).toBe(true);
  });

  it("consultor e administrador IGNORAM a chave, mesmo com mapa gravado", () => {
    const mapa: Permissoes = { processos: "nenhum", pagamentos: "nenhum", patients: "nenhum" };
    const consultor = resolver({ role: "consultor", consultorNome: "André Vitório", permissoes: mapa });
    const adm = resolver({ role: "administrador", permissoes: mapa });
    expect(consultor).not.toHaveProperty("permissoes");
    expect(adm).not.toHaveProperty("permissoes");
    expect(podeLer(consultor, "processos")).toBe(true);
    expect(podeEscrever(adm, "pagamentos")).toBe(true);
  });

  it("administrador pelo fallback de e-mail (sem role gravado) também ignora a chave", () => {
    const u = resolver({ permissoes: { processos: "nenhum" } }, ["x@farmaurora.com.br"]);
    expect(u.role).toBe("administrador");
    expect(u).not.toHaveProperty("permissoes");
  });

  it("conta sem role (cai em consultor) ignora a chave", () => {
    const u = resolver({ permissoes: { processos: "editar" } });
    expect(u.role).toBe("consultor");
    expect(u).not.toHaveProperty("permissoes");
  });

  it("a decisão usa o AuthUser direto: 'ver' lê e não escreve", () => {
    const u = resolver({ role: "operacional", permissoes: { processos: "ver", pagamentos: "editar", patients: "nenhum" } });
    expect(podeLer(u, "processos")).toBe(true);
    expect(podeEscrever(u, "processos")).toBe(false);
    expect(podeEscrever(u, "pagamentos")).toBe(true);
    expect(podeLer(u, "patients")).toBe(false);
  });
});

describe("plugin authUser.server — permissoes chega ao front (useState 'auth-user')", () => {
  beforeEach(() => {
    h.estados.clear();
    h.usuarioDoServidor.current = null;
  });

  async function rodarPlugin(): Promise<void> {
    const plugin = (await import("../../app/plugins/authUser.server")).default as unknown as () => void;
    plugin();
  }

  it("copia o usuário inteiro, com o mapa sanitizado, e marca o estado como carregado", async () => {
    const user = resolver({ role: "operacional", nome: "Bruno Alves", permissoes: { processos: "ver", pagamentos: "editar" } });
    h.usuarioDoServidor.current = user;
    await rodarPlugin();

    const estado = (h.estados.get("auth-user") as Ref<AuthUser | null>).value;
    expect(estado).toEqual({
      id: "u1",
      email: "x@farmaurora.com.br",
      role: "operacional",
      nome: "Bruno Alves",
      permissoes: { processos: "ver", pagamentos: "editar", patients: "nenhum" },
      isAdmin: false,
    });
    expect((h.estados.get("auth-user-loaded") as Ref<boolean>).value).toBe(true);
    // É uma cópia JSON (o mesmo formato de /api/auth/me), não a referência do servidor.
    expect(estado).not.toBe(user);
    expect(estado?.permissoes).not.toBe(user.permissoes);
  });

  it("conta sem a chave: o estado do front também não tem permissoes", async () => {
    h.usuarioDoServidor.current = resolver({ role: "socio", nome: "Sócio" });
    await rodarPlugin();
    const estado = (h.estados.get("auth-user") as Ref<AuthUser | null>).value;
    expect(estado).not.toHaveProperty("permissoes");
  });
});
