import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { Permissoes } from "../../shared/utils/permissoesPagina";
import { autorizarApi } from "../../shared/utils/permissoesPagina";

// Os endpoints da PRÓPRIA conta (/api/auth/**) não podem ler nem mexer em app_metadata.permissoes: preservam o que
// está gravado (o nome faz MERGE) e nenhum campo do corpo vira permissão. Mesma harness de contaHandlers.spec.ts.
const h = vi.hoisted(() => ({
  body: {} as unknown,
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  rpc: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  notificar: vi.fn(),
}));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { listUsers: h.listUsers, getUserById: h.getUserById, updateUserById: h.updateUserById } },
    rpc: h.rpc,
  }),
  createSupabaseAnonClient: () => ({ auth: { signInWithPassword: h.signIn, signOut: h.signOut } }),
}));
vi.mock("../../server/utils/notificacoesStore", () => ({ notificarContaEditada: h.notificar }));

import senhaHandler from "../../server/api/auth/conta/senha.post";
import emailHandler from "../../server/api/auth/conta/email.post";
import nomeHandler from "../../server/api/auth/conta/nome.patch";
import meHandler from "../../server/api/auth/me.get";

const MAPA: Permissoes = { processos: "ver", pagamentos: "editar", patients: "ver" };
const MAPA_FORJADO: Permissoes = { processos: "editar", pagamentos: "editar", patients: "editar" };

function usuario(role: AuthUser["role"], extra: Partial<AuthUser> = {}): AuthUser {
  return { id: "u1", email: "fulano@farmaurora.com.br", role, nome: "Fulano de Tal", isAdmin: role === "administrador", ...extra };
}

async function chamar<T>(handler: (e: never) => Promise<T>, user: AuthUser | null, body: unknown): Promise<T> {
  h.body = body;
  return handler({ context: { user } } as never);
}

function contaAuth(id: string, email: string, appMetadata: Record<string, unknown>) {
  return { id, email, app_metadata: appMetadata };
}

beforeEach(() => {
  h.body = {};
  const metadata = { role: "socio", nome: "Fulano de Tal", provider: "email", permissoes: MAPA };
  h.listUsers.mockReset().mockResolvedValue({
    data: { users: [contaAuth("u1", "fulano@farmaurora.com.br", metadata)], nextPage: null },
    error: null,
  });
  h.getUserById.mockReset().mockResolvedValue({ data: { user: contaAuth("u1", "fulano@farmaurora.com.br", metadata) }, error: null });
  h.updateUserById.mockReset().mockImplementation(async (_id: string, attrs: { email?: string }) => ({
    data: { user: { id: "u1", email: attrs.email ?? "fulano@farmaurora.com.br" } },
    error: null,
  }));
  h.rpc.mockReset().mockResolvedValue({ data: false, error: null });
  h.signIn.mockReset().mockResolvedValue({ data: {}, error: null });
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.notificar.mockReset().mockResolvedValue(undefined);
});

describe("nome.patch — MERGE preserva as permissões gravadas", () => {
  it("sócio com mapa renomeia: o app_metadata enviado carrega o MESMO mapa (e role e provider)", async () => {
    await chamar(nomeHandler, usuario("socio", { permissoes: MAPA }), { nome: "Fulano Souza" });
    expect(h.updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { role: "socio", nome: "Fulano Souza", provider: "email", permissoes: MAPA },
    });
  });

  it("um `permissoes` (ou role) forjado no corpo é ignorado: o que vale é o mapa gravado", async () => {
    await chamar(nomeHandler, usuario("socio", { permissoes: MAPA }), {
      nome: "Fulano Souza",
      permissoes: MAPA_FORJADO,
      role: "administrador",
      "app_metadata": { permissoes: MAPA_FORJADO },
    });
    const { app_metadata } = h.updateUserById.mock.calls[0]![1] as { app_metadata: Record<string, unknown> };
    expect(app_metadata.permissoes).toEqual(MAPA);
    expect(app_metadata.role).toBe("socio");
    expect((app_metadata.permissoes as Permissoes).patients).toBe("ver"); // o forjado dava "editar" em tudo
  });

  it("conta sem mapa continua sem mapa depois de renomear", async () => {
    const semMapa = { role: "socio", nome: "Fulano de Tal", provider: "email" };
    h.getUserById.mockResolvedValue({ data: { user: contaAuth("u1", "fulano@farmaurora.com.br", semMapa) }, error: null });
    await chamar(nomeHandler, usuario("socio"), { nome: "Outro Nome", permissoes: MAPA_FORJADO });
    const { app_metadata } = h.updateUserById.mock.calls[0]![1] as { app_metadata: Record<string, unknown> };
    expect(app_metadata).not.toHaveProperty("permissoes");
  });

  it("operacional (com ou sem mapa) não renomeia: 403 e nada é gravado", async () => {
    await expect(chamar(nomeHandler, usuario("operacional", { permissoes: MAPA }), { nome: "Novo", permissoes: MAPA_FORJADO })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
});

describe("email.post e senha.post — não tocam em app_metadata", () => {
  it("e-mail: updateUserById sem app_metadata, mesmo com permissoes forjadas no corpo", async () => {
    await chamar(emailHandler, usuario("socio", { permissoes: MAPA }), {
      senhaAtual: "SenhaAtual#2026",
      email: "novo@farmaurora.com.br",
      emailConfirmacao: "novo@farmaurora.com.br",
      permissoes: MAPA_FORJADO,
      role: "administrador",
    });
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { email: "novo@farmaurora.com.br", email_confirm: true });
    expect(h.updateUserById.mock.calls[0]![1]).not.toHaveProperty("app_metadata");
  });

  it("senha: só a senha vai para o Auth, mesmo com permissoes forjadas no corpo", async () => {
    await chamar(senhaHandler, usuario("operacional", { permissoes: MAPA }), {
      senhaAtual: "SenhaAtual#2026",
      novaSenha: "NovaSenha#2026",
      permissoes: MAPA_FORJADO,
    });
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { password: "NovaSenha#2026" });
  });

  it("me.get só devolve o usuário do contexto (leitura): não grava nada", async () => {
    const eu = usuario("operacional", { permissoes: MAPA });
    expect(await chamar(meHandler, eu, {})).toBe(eu);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
});

describe("nenhum endpoint de /api/auth/** lê ou grava permissoes", () => {
  function arquivos(pasta: string): string[] {
    return readdirSync(pasta).flatMap((nome) => {
      const caminho = join(pasta, nome);
      return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
    });
  }

  it("o código dos handlers e dos utilitários da conta própria nem menciona 'permissoes'", () => {
    const alvos = [
      ...arquivos(join(process.cwd(), "server/api/auth")),
      join(process.cwd(), "server/utils/contaPropria.ts"),
      join(process.cwd(), "server/utils/contaValidation.ts"),
    ];
    expect(alvos.length).toBeGreaterThanOrEqual(6);
    for (const arquivo of alvos) {
      expect(readFileSync(arquivo, "utf-8"), arquivo).not.toMatch(/permissoes/i);
    }
  });

  it("os únicos pontos que gravam app_metadata na pasta são o nome (merge) — o resto não toca nele", () => {
    const comMetadata = arquivos(join(process.cwd(), "server/api/auth")).filter((a) => /app_metadata/.test(readFileSync(a, "utf-8")));
    expect(comMetadata.map((a) => a.replace(/\\/g, "/").split("server/api/auth/")[1]).sort()).toEqual(["conta/email.post.ts", "conta/nome.patch.ts"]);
  });

  it("o middleware trata /api/auth/** como 'qualquer sessão': o que protege é o handler não aceitar o campo", () => {
    for (const role of ["socio", "operacional"] as const) {
      expect(autorizarApi({ role, permissoes: MAPA }, "/api/auth/conta/nome", "PATCH").permitido).toBe(true);
    }
  });
});
