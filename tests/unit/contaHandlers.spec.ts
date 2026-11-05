import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthWeakPasswordError } from "@supabase/supabase-js";
import type { AuthUser } from "../../shared/types/auth";

// Endpoints da PRÓPRIA conta (server/api/auth/conta/**) com h3.readBody, o Supabase (admin e anon) e o
// fan-out de notificações simulados; createError/defineEventHandler são os reais. Nada de rede.
const h = vi.hoisted(() => ({
  body: {} as unknown,
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  rpc: vi.fn(), // funções do limite de tentativas (contaLimite.ts); aqui sempre "não bloqueado"
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

const SENHA_ATUAL = "SenhaAtual#2026";
const SENHA_NOVA = "NovaSenha#2026";

function usuario(role: AuthUser["role"], extra: Partial<AuthUser> = {}): AuthUser {
  return { id: "u1", email: "fulano@farmaurora.com.br", role, nome: "Fulano de Tal", isAdmin: role === "administrador", ...extra };
}

async function chamar<T>(handler: (e: never) => Promise<T>, user: AuthUser | null, body: unknown): Promise<T> {
  h.body = body;
  return handler({ context: { user } } as never);
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

function contaAuth(id: string, email: string, appMetadata: Record<string, unknown> = { role: "socio" }) {
  return { id, email, app_metadata: appMetadata };
}

beforeEach(() => {
  h.body = {};
  h.listUsers.mockReset().mockResolvedValue({
    data: {
      users: [contaAuth("u1", "fulano@farmaurora.com.br"), contaAuth("u2", "Beltrano@Farmaurora.com.br")],
      nextPage: null,
    },
    error: null,
  });
  h.getUserById.mockReset().mockResolvedValue({
    data: { user: contaAuth("u1", "fulano@farmaurora.com.br", { role: "socio", nome: "Fulano de Tal", provider: "email" }) },
    error: null,
  });
  h.updateUserById.mockReset().mockImplementation(async (_id: string, attrs: { email?: string }) => ({
    data: { user: { id: "u1", email: attrs.email ?? "fulano@farmaurora.com.br" } },
    error: null,
  }));
  h.rpc.mockReset().mockResolvedValue({ data: false, error: null });
  h.signIn.mockReset().mockResolvedValue({ data: {}, error: null });
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.notificar.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/auth/conta/senha", () => {
  const corpo = { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA };

  it("sem sessão → 401", async () => {
    expect((await erroDe(chamar(senhaHandler, null, corpo))).status).toBe(401);
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it("troca a senha DA SESSÃO (id do contexto, ignorando id/role/consultorNome/isAdmin do body) e notifica", async () => {
    const res = await chamar(senhaHandler, usuario("socio"), {
      ...corpo,
      id: "outra-conta",
      role: "administrador",
      consultorNome: "Dani",
      isAdmin: true,
    });

    expect(res).toEqual({ atualizada: true });
    expect(h.signIn).toHaveBeenCalledWith({ email: "fulano@farmaurora.com.br", password: SENHA_ATUAL });
    expect(h.updateUserById).toHaveBeenCalledTimes(1);
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { password: SENHA_NOVA });
    expect(h.notificar).toHaveBeenCalledWith({ id: "u1", nome: "Fulano de Tal" }, "senha");
  });

  it("encerra a sessão da conferência só no escopo local (o global derrubaria o navegador da pessoa)", async () => {
    await chamar(senhaHandler, usuario("socio"), corpo);
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("senha atual errada → 400 (nunca 401), nada é gravado nem notificado", async () => {
    h.signIn.mockResolvedValue({ data: {}, error: { status: 400, message: "Invalid login credentials" } });
    const e = await erroDe(chamar(senhaHandler, usuario("socio"), corpo));
    expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(h.notificar).not.toHaveBeenCalled();
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("limite de tentativas do Supabase (429) → 429 com mensagem clara; falha do Auth → 502", async () => {
    h.signIn.mockResolvedValue({ data: {}, error: { status: 429, message: "rate" } });
    expect((await erroDe(chamar(senhaHandler, usuario("socio"), corpo))).status).toBe(429);
    h.signIn.mockResolvedValue({ data: {}, error: { status: 500, message: "boom" } });
    expect((await erroDe(chamar(senhaHandler, usuario("socio"), corpo))).status).toBe(502);
    h.signIn.mockResolvedValue({ data: {}, error: { message: "network" } });
    expect((await erroDe(chamar(senhaHandler, usuario("socio"), corpo))).status).toBe(502);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("senha nova curta/igual à atual → 400 antes de qualquer chamada ao Supabase", async () => {
    expect((await erroDe(chamar(senhaHandler, usuario("socio"), { senhaAtual: SENHA_ATUAL, novaSenha: "curta" }))).status).toBe(400);
    expect((await erroDe(chamar(senhaHandler, usuario("socio"), { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_ATUAL }))).status).toBe(400);
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it("senha fraca segundo o Supabase → 400 com o motivo em português", async () => {
    h.updateUserById.mockResolvedValue({
      data: { user: null },
      error: new AuthWeakPasswordError("weak", 422, ["pwned"]),
    });
    const e = await erroDe(chamar(senhaHandler, usuario("socio"), corpo));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/vazamentos/);
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("outro erro do Supabase ao gravar → 502 sem repassar a mensagem original", async () => {
    h.updateUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: `falha com ${SENHA_NOVA}` } });
    const e = await erroDe(chamar(senhaHandler, usuario("socio"), corpo));
    expect(e.status).toBe(502);
    expect(e.msg).not.toContain(SENHA_NOVA);
  });

  it("notificação falha → a troca NÃO é desfeita, a resposta é de sucesso e o log não tem senha", async () => {
    h.notificar.mockRejectedValue(new Error("Supabase: falha ao criar notificações — enum"));
    const res = await chamar(senhaHandler, usuario("socio"), corpo);

    expect(res).toEqual({ atualizada: true });
    expect(h.updateUserById).toHaveBeenCalledTimes(1);
    const logado = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logado).toContain("senha");
    expect(logado).not.toContain(SENHA_ATUAL);
    expect(logado).not.toContain(SENHA_NOVA);
    expect(logado).not.toContain("fulano@");
  });

  it("nenhuma mensagem de erro de nenhum caminho contém as senhas", async () => {
    h.signIn.mockResolvedValue({ data: {}, error: { status: 400, message: "x" } });
    const e = await erroDe(chamar(senhaHandler, usuario("socio"), corpo));
    expect(e.msg).not.toContain(SENHA_ATUAL);
    expect(e.msg).not.toContain(SENHA_NOVA);
  });
});

describe("POST /api/auth/conta/email", () => {
  const corpo = { senhaAtual: SENHA_ATUAL, email: "  Novo@Farmaurora.com.br ", emailConfirmacao: "novo@farmaurora.com.br" };

  it("sem sessão → 401", async () => {
    expect((await erroDe(chamar(emailHandler, null, corpo))).status).toBe(401);
  });

  it("troca direto: e-mail normalizado, email_confirm:true, app_metadata intocado, id da sessão", async () => {
    const res = await chamar(emailHandler, usuario("socio"), { ...corpo, id: "outra", role: "administrador" });

    expect(res).toEqual({ email: "novo@farmaurora.com.br" });
    expect(h.updateUserById).toHaveBeenCalledTimes(1);
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { email: "novo@farmaurora.com.br", email_confirm: true });
    const atributos = h.updateUserById.mock.calls[0]![1] as Record<string, unknown>;
    expect(atributos).not.toHaveProperty("app_metadata");
    expect(atributos).not.toHaveProperty("password");
    expect(h.notificar).toHaveBeenCalledWith({ id: "u1", nome: "Fulano de Tal" }, "email");
  });

  it("e-mails diferentes → 400 e nada é consultado", async () => {
    const e = await erroDe(chamar(emailHandler, usuario("socio"), { ...corpo, emailConfirmacao: "outro@x.com" }));
    expect(e).toEqual({ status: 400, msg: "Os e-mails não coincidem." });
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("e-mail igual ao atual → 400", async () => {
    const e = await erroDe(
      chamar(emailHandler, usuario("socio"), { ...corpo, email: "FULANO@farmaurora.com.br", emailConfirmacao: "fulano@farmaurora.com.br" }),
    );
    expect(e.status).toBe(400);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("senha atual errada → 400; não olha a lista de contas (sem enumerar e-mails)", async () => {
    h.signIn.mockResolvedValue({ data: {}, error: { status: 400, message: "Invalid login credentials" } });
    const e = await erroDe(chamar(emailHandler, usuario("socio"), corpo));
    expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
    expect(h.listUsers).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("e-mail já usado por outra conta (checagem prévia, sem diferenciar caixa) → 409", async () => {
    const e = await erroDe(
      chamar(emailHandler, usuario("socio"), { ...corpo, email: "beltrano@farmaurora.com.br", emailConfirmacao: "beltrano@farmaurora.com.br" }),
    );
    expect(e).toEqual({ status: 409, msg: "Já existe uma conta com esse e-mail." });
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("422 / 'already registered' do Auth (corrida) → 409; outro erro → 502", async () => {
    h.updateUserById.mockResolvedValue({ data: { user: null }, error: { status: 422, message: "email_exists" } });
    expect((await erroDe(chamar(emailHandler, usuario("socio"), corpo))).status).toBe(409);
    h.updateUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: "boom" } });
    expect((await erroDe(chamar(emailHandler, usuario("socio"), corpo))).status).toBe(502);
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("conta sem cargo gravado em app_metadata (admin só pelo fallback de e-mail) → 409, nada é trocado", async () => {
    h.listUsers.mockResolvedValue({
      data: { users: [contaAuth("u1", "fulano@farmaurora.com.br", {})], nextPage: null },
      error: null,
    });
    const e = await erroDe(chamar(emailHandler, usuario("administrador"), corpo));
    expect(e.status).toBe(409);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("notificação falha → a troca vale, e o log não traz e-mail nem senha", async () => {
    h.notificar.mockRejectedValue(new Error("falha"));
    const res = await chamar(emailHandler, usuario("socio"), corpo);
    expect(res.email).toBe("novo@farmaurora.com.br");
    const logado = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logado).not.toContain("novo@");
    expect(logado).not.toContain(SENHA_ATUAL);
  });
});

describe("PATCH /api/auth/conta/nome", () => {
  it("sem sessão → 401", async () => {
    expect((await erroDe(chamar(nomeHandler, null, { nome: "X" }))).status).toBe(401);
  });

  it("consultor → 403 pedindo ao administrador, sem tocar no Supabase", async () => {
    const e = await erroDe(chamar(nomeHandler, usuario("consultor", { consultorNome: "Mateus Morais" }), { nome: "Mateus Soares" }));
    expect(e.status).toBe(403);
    expect(e.msg).toMatch(/administrador/);
    expect(h.getUserById).not.toHaveBeenCalled();
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("operacional → 403 pedindo ao administrador (o nome liga ao alerta de Mandado)", async () => {
    const e = await erroDe(chamar(nomeHandler, usuario("operacional", { nome: "Bruno Alves" }), { nome: "Bruninho" }));
    expect(e.status).toBe(403);
    expect(e.msg).toMatch(/administrador/);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it.each<AuthUser["role"]>(["socio", "administrador"])("%s edita: MERGE com o app_metadata, id da sessão, body ignorado", async (role) => {
    h.getUserById.mockResolvedValue({
      data: { user: contaAuth("u1", "fulano@farmaurora.com.br", { role, nome: "Fulano de Tal", provider: "email", consultorNome: null }) },
      error: null,
    });

    const res = await chamar(nomeHandler, usuario(role), {
      nome: "  Fulano Souza ",
      id: "outra",
      role: "consultor",
      consultorNome: "Dani",
      isAdmin: false,
    });

    expect(res).toEqual({ nome: "Fulano Souza" });
    expect(h.getUserById).toHaveBeenCalledWith("u1");
    expect(h.updateUserById).toHaveBeenCalledWith("u1", {
      app_metadata: { role, nome: "Fulano Souza", provider: "email", consultorNome: null },
    });
    expect(h.notificar).toHaveBeenCalledWith({ id: "u1", nome: "Fulano de Tal" }, "nome");
  });

  it("a notificação usa o nome de ANTES e a resposta devolve só o nome novo", async () => {
    await chamar(nomeHandler, usuario("socio", { nome: "Nome Antigo" }), { nome: "Nome Novo" });
    expect(h.notificar.mock.calls[0]![0]).toEqual({ id: "u1", nome: "Nome Antigo" });
  });

  it("nome igual ao atual → não grava e não notifica", async () => {
    const res = await chamar(nomeHandler, usuario("socio"), { nome: "Fulano de Tal" });
    expect(res).toEqual({ nome: "Fulano de Tal" });
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("nome vazio, com quebra de linha ou acima de 80 caracteres → 400", async () => {
    for (const nome of ["", "  ", "Ana\nMaria", "a".repeat(81)]) {
      expect((await erroDe(chamar(nomeHandler, usuario("socio"), { nome }))).status).toBe(400);
    }
    expect(h.updateUserById).not.toHaveBeenCalled();
  });

  it("falha ao gravar → 502 e nenhuma notificação", async () => {
    h.updateUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: "boom" } });
    expect((await erroDe(chamar(nomeHandler, usuario("socio"), { nome: "Novo Nome" }))).status).toBe(502);
    expect(h.notificar).not.toHaveBeenCalled();
  });

  it("notificação falha → o nome foi gravado e a resposta é de sucesso", async () => {
    h.notificar.mockRejectedValue(new Error("falha"));
    const res = await chamar(nomeHandler, usuario("socio"), { nome: "Novo Nome" });
    expect(res).toEqual({ nome: "Novo Nome" });
    expect(h.updateUserById).toHaveBeenCalledTimes(1);
  });
});

// ── E-mail em cache (event.context.user vem do cache de 8s do middleware) ────
// Logo depois de uma troca de e-mail, `event.context.user.email` ainda é o ANTIGO por até 8s. Os
// endpoints não podem usá-lo pra conferir a senha nem pra decidir "igual ao atual".
describe("e-mail desatualizado no cache do middleware", () => {
  const ANTIGO = "antigo@farmaurora.com.br"; // o que o cache ainda devolve
  const REAL = "novo-real@farmaurora.com.br"; // o que a conta tem de verdade no Supabase

  function contaComEmailReal(): void {
    h.getUserById.mockResolvedValue({
      data: { user: contaAuth("u1", REAL, { role: "socio", nome: "Fulano de Tal", provider: "email" }) },
      error: null,
    });
    h.listUsers.mockResolvedValue({
      data: { users: [contaAuth("u1", REAL), contaAuth("u2", "Beltrano@Farmaurora.com.br")], nextPage: null },
      error: null,
    });
  }
  const cacheAntigo = () => usuario("socio", { email: ANTIGO });
  const emails = (): string[] => h.signIn.mock.calls.map((c) => (c[0] as { email: string }).email);

  it("(a) senha: a conferência usa o e-mail REAL da conta (não o do cache) e passa com a senha certa", async () => {
    contaComEmailReal();
    const res = await chamar(senhaHandler, cacheAntigo(), { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA });

    expect(res).toEqual({ atualizada: true });
    expect(h.getUserById).toHaveBeenCalledWith("u1"); // o id continua vindo SÓ da sessão
    expect(emails()).toEqual([REAL]);
    expect(h.signIn).toHaveBeenCalledWith({ email: REAL, password: SENHA_ATUAL });
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { password: SENHA_NOVA });
  });

  it("(a) e-mail: idem — o login da conferência usa o e-mail real, e a troca segue", async () => {
    contaComEmailReal();
    const res = await chamar(emailHandler, cacheAntigo(), {
      senhaAtual: SENHA_ATUAL,
      email: "terceiro@farmaurora.com.br",
      emailConfirmacao: "terceiro@farmaurora.com.br",
    });

    expect(res).toEqual({ email: "terceiro@farmaurora.com.br" });
    expect(emails()).toEqual([REAL]);
    expect(h.updateUserById).toHaveBeenCalledWith("u1", { email: "terceiro@farmaurora.com.br", email_confirm: true });
  });

  it("o id lido vem da sessão mesmo que o body traga outro id", async () => {
    contaComEmailReal();
    await chamar(senhaHandler, cacheAntigo(), { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA, id: "u2", email: "x@y.com" });
    expect(h.getUserById).toHaveBeenCalledTimes(1);
    expect(h.getUserById).toHaveBeenCalledWith("u1");
    expect(emails()).toEqual([REAL]);
  });

  it("(b) senha errada continua 400 (nunca 401), com o e-mail real, e signOut local", async () => {
    contaComEmailReal();
    h.signIn.mockResolvedValue({ data: {}, error: { status: 400, message: "Invalid login credentials" } });

    const e = await erroDe(chamar(senhaHandler, cacheAntigo(), { senhaAtual: "errada-123", novaSenha: SENHA_NOVA }));

    expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
    expect(emails()).toEqual([REAL]);
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(h.updateUserById).not.toHaveBeenCalled();
    expect(h.notificar).not.toHaveBeenCalled();
  });

  describe("(c) getUserById com erro ou sem e-mail → erro genérico, sem vazar dados", () => {
    const MENSAGEM = "Não foi possível conferir a senha agora. Tente novamente em instantes.";
    const casos: Array<[string, unknown]> = [
      ["erro do Supabase", { data: { user: null }, error: { status: 500, message: `falha com ${REAL} e ${ANTIGO}` } }],
      ["conta não encontrada (404)", { data: { user: null }, error: { status: 404, message: `user ${REAL} not found` } }],
      ["resposta sem usuário", { data: { user: null }, error: null }],
      ["usuário sem e-mail", { data: { user: { id: "u1", app_metadata: { role: "socio" } } }, error: null }],
      ["usuário com e-mail vazio", { data: { user: { id: "u1", email: "", app_metadata: { role: "socio" } } }, error: null }],
    ];

    for (const [nome, resposta] of casos) {
      it(`senha — ${nome}`, async () => {
        h.getUserById.mockResolvedValue(resposta);
        const e = await erroDe(chamar(senhaHandler, cacheAntigo(), { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA }));

        expect(e).toEqual({ status: 502, msg: MENSAGEM });
        expect(e.msg).not.toContain("@");
        expect(e.msg).not.toContain(SENHA_ATUAL);
        expect(h.signIn).not.toHaveBeenCalled();
        expect(h.updateUserById).not.toHaveBeenCalled();
        expect(h.notificar).not.toHaveBeenCalled();
      });

      it(`e-mail — ${nome}`, async () => {
        h.getUserById.mockResolvedValue(resposta);
        const corpo = { senhaAtual: SENHA_ATUAL, email: "novo@farmaurora.com.br", emailConfirmacao: "novo@farmaurora.com.br" };
        const e = await erroDe(chamar(emailHandler, cacheAntigo(), corpo));

        expect(e).toEqual({ status: 502, msg: MENSAGEM });
        expect(h.signIn).not.toHaveBeenCalled();
        expect(h.listUsers).not.toHaveBeenCalled();
        expect(h.updateUserById).not.toHaveBeenCalled();
      });
    }

    it("a falha ao buscar a conta não vai pro console (nem e-mail, nem senha)", async () => {
      h.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: `falha ${REAL}` } });
      await erroDe(chamar(senhaHandler, cacheAntigo(), { senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA }));
      const logado = JSON.stringify(vi.mocked(console.error).mock.calls);
      expect(logado).not.toContain(REAL);
      expect(logado).not.toContain(SENHA_ATUAL);
    });
  });

  describe("(d) 'e-mail igual ao atual' compara com o e-mail REAL, não com o do cache", () => {
    const corpoPara = (email: string) => ({ senhaAtual: SENHA_ATUAL, email, emailConfirmacao: email });

    it("digitar o e-mail real (que o cache ainda não conhece) → 400 'já é o e-mail da sua conta', nada é gravado", async () => {
      contaComEmailReal();
      const e = await erroDe(chamar(emailHandler, cacheAntigo(), corpoPara(REAL)));

      expect(e).toEqual({ status: 400, msg: "Esse já é o e-mail da sua conta." });
      expect(h.updateUserById).not.toHaveBeenCalled();
      expect(h.notificar).not.toHaveBeenCalled();
    });

    it("digitar o e-mail ANTIGO (o do cache) é uma troca de verdade, não 'igual ao atual' — volta pro e-mail anterior", async () => {
      contaComEmailReal();
      const res = await chamar(emailHandler, cacheAntigo(), corpoPara(ANTIGO));

      expect(res).toEqual({ email: ANTIGO });
      expect(h.updateUserById).toHaveBeenCalledWith("u1", { email: ANTIGO, email_confirm: true });
    });

    it("sem diferenciar caixa/espaços: o e-mail real digitado de outro jeito também é recusado", async () => {
      contaComEmailReal();
      const e = await erroDe(chamar(emailHandler, cacheAntigo(), corpoPara(`  ${REAL.toUpperCase()} `)));
      expect(e.status).toBe(400);
      expect(h.updateUserById).not.toHaveBeenCalled();
    });

    it("com a senha errada o erro é o da senha — a comparação só acontece depois de provar a senha", async () => {
      contaComEmailReal();
      h.signIn.mockResolvedValue({ data: {}, error: { status: 400, message: "Invalid login credentials" } });
      const e = await erroDe(chamar(emailHandler, cacheAntigo(), corpoPara(REAL)));
      expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
      expect(h.listUsers).not.toHaveBeenCalled();
    });
  });

  it("nome: não usa o e-mail (a comparação é com o nome do app_metadata lido agora) — nada muda com o cache atrasado", async () => {
    contaComEmailReal();
    const res = await chamar(nomeHandler, cacheAntigo(), { nome: "Fulano Souza" });
    expect(res).toEqual({ nome: "Fulano Souza" });
    expect(h.signIn).not.toHaveBeenCalled();
  });
});
