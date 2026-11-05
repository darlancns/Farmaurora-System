import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import {
  LIMITE_BLOQUEIO_MINUTOS,
  LIMITE_FALHAS_SENHA_ATUAL,
  LIMITE_JANELA_MINUTOS,
} from "../../shared/constants/conta";

// Limite de tentativas ERRADAS da senha atual (Fase D). O Postgres é simulado por um "banco" em memória
// que espelha EXATAMENTE a lógica das 3 funções da migration 20261105100000_conta_tentativas.sql
// (registrar_falha_conta / zerar_falhas_conta / verificar_bloqueio_conta), com relógio controlável.
// Aqui se testa a integração em TypeScript (quando checar, contar, zerar, falhar aberto); a SQL em si
// se valida à mão — roteiro no relatório da Fase D.
interface Linha {
  falhas: number;
  janelaInicio: number;
  bloqueadoAte: number | null;
}

const h = vi.hoisted(() => ({
  body: {} as unknown,
  tabela: new Map<string, unknown>(),
  rpcChamadas: [] as Array<{ nome: string; args: Record<string, unknown> }>,
  rpcFalha: null as null | "erro" | "excecao",
  emails: {} as Record<string, string>,
  senhas: {} as Record<string, string>,
  getUserById: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  updateUserById: vi.fn(),
  listUsers: vi.fn(),
}));

const MIN = 60_000;
const tabela = h.tabela as Map<string, Linha>;
const minutos = (intervalo: unknown): number => Number(String(intervalo).split(" ")[0]) * MIN;

async function rpc(nome: string, args: Record<string, unknown>) {
  h.rpcChamadas.push({ nome, args });
  if (h.rpcFalha === "excecao") throw new Error("conexão recusada pelo banco");
  if (h.rpcFalha === "erro") {
    return { data: null, error: { code: "42883", message: "function public.registrar_falha_conta does not exist" } };
  }
  const agora = Date.now();
  const chave = `${args.p_user}|${args.p_tipo}`;

  if (nome === "verificar_bloqueio_conta") {
    const l = tabela.get(chave);
    return { data: !!l && l.bloqueadoAte !== null && l.bloqueadoAte > agora, error: null };
  }
  if (nome === "zerar_falhas_conta") {
    tabela.delete(chave);
    return { data: null, error: null };
  }
  if (nome === "registrar_falha_conta") {
    const max = Number(args.p_max);
    const janela = minutos(args.p_janela);
    const bloqueio = minutos(args.p_bloqueio);
    // limpeza sem cron: linhas sem bloqueio vigente e com a janela vencida
    for (const [k, l] of [...tabela]) {
      if ((l.bloqueadoAte === null || l.bloqueadoAte <= agora) && l.janelaInicio + janela <= agora) tabela.delete(k);
    }
    const l = tabela.get(chave);
    if (!l) {
      tabela.set(chave, { falhas: 1, janelaInicio: agora, bloqueadoAte: 1 >= max ? agora + bloqueio : null });
      return { data: 1 >= max, error: null };
    }
    const bloqueado = l.bloqueadoAte !== null && l.bloqueadoAte > agora;
    const vencido = (l.bloqueadoAte !== null && l.bloqueadoAte <= agora) || l.janelaInicio + janela <= agora;
    if (!bloqueado) {
      if (vencido) {
        l.falhas = 1;
        l.janelaInicio = agora;
        l.bloqueadoAte = 1 >= max ? agora + bloqueio : null;
      } else {
        l.falhas += 1;
        l.bloqueadoAte = l.falhas >= max ? agora + bloqueio : null;
      }
    }
    return { data: l.bloqueadoAte !== null && l.bloqueadoAte > agora, error: null };
  }
  throw new Error(`RPC inesperada: ${nome}`);
}

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { getUserById: h.getUserById, updateUserById: h.updateUserById, listUsers: h.listUsers } },
    rpc: (nome: string, args: Record<string, unknown>) => rpc(nome, args),
  }),
  createSupabaseAnonClient: () => ({ auth: { signInWithPassword: h.signIn, signOut: h.signOut } }),
}));
vi.mock("../../server/utils/notificacoesStore", () => ({ notificarContaEditada: vi.fn() }));

import { verificarSenhaAtual } from "../../server/utils/contaPropria";
import { MENSAGEM_LIMITE_TENTATIVAS } from "../../server/utils/contaLimite";
import senhaHandler from "../../server/api/auth/conta/senha.post";
import emailHandler from "../../server/api/auth/conta/email.post";

const SENHA_CERTA = "SenhaCerta#2026";
const SENHA_ERRADA = "SenhaErrada#999";
const EMAIL_U1 = "fulano@farmaurora.com.br";
const EMAIL_U2 = "beltrano@farmaurora.com.br";

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

/** Tenta `n` vezes com a senha errada (cada uma deve dar 400). */
async function errarVezes(userId: string, tipo: "senha" | "email", n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const e = await erroDe(verificarSenhaAtual(userId, SENHA_ERRADA, tipo));
    expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
  }
}

const usuario = (id: string, email: string): AuthUser => ({ id, email, role: "socio", nome: "Fulano", isAdmin: false });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T15:00:00.000Z"));
  h.tabela.clear();
  h.rpcChamadas.length = 0;
  h.rpcFalha = null;
  h.body = {};
  h.emails = { u1: EMAIL_U1, u2: EMAIL_U2 };
  h.senhas = { [EMAIL_U1]: SENHA_CERTA, [EMAIL_U2]: SENHA_CERTA };
  h.getUserById.mockReset().mockImplementation(async (id: string) => ({
    data: { user: { id, email: h.emails[id], app_metadata: { role: "socio" } } },
    error: null,
  }));
  h.signIn.mockReset().mockImplementation(async ({ email, password }: { email: string; password: string }) =>
    password === h.senhas[email]
      ? { data: {}, error: null }
      : { data: {}, error: { status: 400, message: "Invalid login credentials" } },
  );
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.updateUserById.mockReset().mockResolvedValue({ data: { user: { id: "u1", email: "x@y.com" } }, error: null });
  h.listUsers.mockReset().mockResolvedValue({ data: { users: [], nextPage: null }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("(a) 5 falhas bloqueiam; a sexta nem chama o Supabase Auth", () => {
  it("5 senhas erradas → 400 cada; a 6ª → 429 SEM chamar signInWithPassword (nem getUserById)", async () => {
    await errarVezes("u1", "senha", LIMITE_FALHAS_SENHA_ATUAL);
    expect(h.signIn).toHaveBeenCalledTimes(5);
    expect(h.getUserById).toHaveBeenCalledTimes(5);

    const sexta = await erroDe(verificarSenhaAtual("u1", SENHA_ERRADA, "senha"));
    expect(sexta).toEqual({ status: 429, msg: MENSAGEM_LIMITE_TENTATIVAS });
    expect(h.signIn).toHaveBeenCalledTimes(5); // não gastou a cota de login
    expect(h.getUserById).toHaveBeenCalledTimes(5);
  });

  it("bloqueado, até a senha CERTA é recusada enquanto durar o bloqueio", async () => {
    await errarVezes("u1", "senha", 5);
    const e = await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"));
    expect(e.status).toBe(429);
    expect(h.signIn).toHaveBeenCalledTimes(5);
  });

  it("as 4 primeiras falhas não bloqueiam (a senha certa ainda passa)", async () => {
    await errarVezes("u1", "senha", 4);
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });

  it("chama as RPCs com a política das constantes (5 falhas / 15 min / bloqueio de 15 min) e o tipo certo", async () => {
    await errarVezes("u1", "email", 1);
    const registrar = h.rpcChamadas.find((c) => c.nome === "registrar_falha_conta")!;
    expect(registrar.args).toEqual({
      p_user: "u1",
      p_tipo: "email",
      p_max: LIMITE_FALHAS_SENHA_ATUAL,
      p_janela: `${LIMITE_JANELA_MINUTOS} minutes`,
      p_bloqueio: `${LIMITE_BLOQUEIO_MINUTOS} minutes`,
    });
    expect(LIMITE_FALHAS_SENHA_ATUAL).toBe(5);
    expect(LIMITE_JANELA_MINUTOS).toBe(15);
    expect(LIMITE_BLOQUEIO_MINUTOS).toBe(15);
    // O bloqueio é checado ANTES de qualquer outra coisa.
    expect(h.rpcChamadas[0]!.nome).toBe("verificar_bloqueio_conta");
  });
});

describe("(b) acertar a senha zera o contador", () => {
  it("3 erros + 1 acerto → contador apagado; depois são necessários 5 erros NOVOS pra bloquear", async () => {
    await errarVezes("u1", "senha", 3);
    expect(tabela.get("u1|senha")?.falhas).toBe(3);

    await verificarSenhaAtual("u1", SENHA_CERTA, "senha");
    expect(tabela.has("u1|senha")).toBe(false);
    expect(h.rpcChamadas.some((c) => c.nome === "zerar_falhas_conta")).toBe(true);

    await errarVezes("u1", "senha", 4); // com o contador antigo (3) isto já teria bloqueado
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });
});

describe("(c) janela expirada reinicia", () => {
  it("4 falhas, passam 16 min, 1 falha → recomeça em 1 (e não bloqueia)", async () => {
    await errarVezes("u1", "senha", 4);
    vi.setSystemTime(Date.now() + 16 * MIN);

    await errarVezes("u1", "senha", 1);
    expect(tabela.get("u1|senha")?.falhas).toBe(1);
    expect(tabela.get("u1|senha")?.bloqueadoAte).toBeNull();

    await errarVezes("u1", "senha", 3); // 4 no total, ainda livre
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });

  it("falhas espalhadas dentro da mesma janela contam juntas", async () => {
    await errarVezes("u1", "senha", 2);
    vi.setSystemTime(Date.now() + 10 * MIN); // ainda dentro dos 15 min da 1ª falha
    await errarVezes("u1", "senha", 3);
    const e = await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"));
    expect(e.status).toBe(429);
  });

  it("o bloqueio dura 15 min: antes disso 429; depois, volta a deixar tentar (e a senha certa passa)", async () => {
    await errarVezes("u1", "senha", 5);
    vi.setSystemTime(Date.now() + 14 * MIN);
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"))).status).toBe(429);

    vi.setSystemTime(Date.now() + 2 * MIN); // 16 min depois do bloqueio
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
    expect(tabela.has("u1|senha")).toBe(false);
  });

  it("depois do bloqueio vencido a contagem recomeça do zero (não bloqueia na 1ª falha nova)", async () => {
    await errarVezes("u1", "senha", 5);
    vi.setSystemTime(Date.now() + 16 * MIN);
    await errarVezes("u1", "senha", 1);
    expect(tabela.get("u1|senha")?.falhas).toBe(1);
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });
});

describe("(d) o bloqueio de um usuário não afeta outro", () => {
  it("u1 bloqueado; u2 continua tentando e acertando, com o e-mail dele", async () => {
    await errarVezes("u1", "senha", 5);
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"))).status).toBe(429);

    h.signIn.mockClear();
    await expect(verificarSenhaAtual("u2", SENHA_CERTA, "senha")).resolves.toBeUndefined();
    expect(h.signIn).toHaveBeenCalledWith({ email: EMAIL_U2, password: SENHA_CERTA });
  });

  it("falhas de u2 não mexem no contador de u1", async () => {
    await errarVezes("u1", "senha", 2);
    await errarVezes("u2", "senha", 3);
    expect(tabela.get("u1|senha")?.falhas).toBe(2);
    expect(tabela.get("u2|senha")?.falhas).toBe(3);
  });

  it("o id do bloqueio é o da SESSÃO: um `id` no body não livra nem transfere o bloqueio", async () => {
    await errarVezes("u1", "senha", 5);
    h.body = { senhaAtual: SENHA_CERTA, novaSenha: "NovaSenha#2027", id: "u2" };
    const e = await erroDe(senhaHandler({ context: { user: usuario("u1", EMAIL_U1) } } as never));
    expect(e.status).toBe(429);
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
});

describe("(e) falha do banco → falha aberto, com log sem dados sensíveis", () => {
  for (const modo of ["erro", "excecao"] as const) {
    it(`RPC com ${modo === "erro" ? "erro retornado" : "exceção"}: senha certa passa, senha errada segue 400`, async () => {
      h.rpcFalha = modo;
      await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
      const e = await erroDe(verificarSenhaAtual("u1", SENHA_ERRADA, "senha"));
      expect(e).toEqual({ status: 400, msg: "A senha atual está incorreta." });
    });
  }

  it("o log registra a falha (operação e tipo) mas NUNCA a senha nem o e-mail", async () => {
    h.rpcFalha = "erro";
    await verificarSenhaAtual("u1", SENHA_CERTA, "senha");
    await erroDe(verificarSenhaAtual("u1", SENHA_ERRADA, "email"));

    const logado = vi.mocked(console.error).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logado).toContain("[conta] limite de tentativas indisponível");
    expect(logado).toMatch(/verificar, senha/);
    expect(logado).toMatch(/registrar, email/);
    for (const segredo of [SENHA_CERTA, SENHA_ERRADA, EMAIL_U1, "@"]) expect(logado).not.toContain(segredo);
  });

  it("exceção do banco também só loga a mensagem técnica, sem dados da conta", async () => {
    h.rpcFalha = "excecao";
    await erroDe(verificarSenhaAtual("u1", SENHA_ERRADA, "senha"));
    const logado = vi.mocked(console.error).mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logado).toContain("conexão recusada pelo banco");
    for (const segredo of [SENHA_CERTA, SENHA_ERRADA, EMAIL_U1]) expect(logado).not.toContain(segredo);
  });
});

describe("(f) senha e e-mail têm contadores independentes", () => {
  it("5 falhas em 'senha' bloqueiam só 'senha'; 'email' segue livre", async () => {
    await errarVezes("u1", "senha", 5);
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"))).status).toBe(429);
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "email")).resolves.toBeUndefined();
    expect(tabela.has("u1|email")).toBe(false);
  });

  it("falhas em 'email' não somam com as de 'senha' (cada uma conta até 5)", async () => {
    await errarVezes("u1", "senha", 3);
    await errarVezes("u1", "email", 3);
    expect(tabela.get("u1|senha")?.falhas).toBe(3);
    expect(tabela.get("u1|email")?.falhas).toBe(3);
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });

  it("acertar em 'senha' zera só 'senha'", async () => {
    await errarVezes("u1", "senha", 2);
    await errarVezes("u1", "email", 2);
    await verificarSenhaAtual("u1", SENHA_CERTA, "senha");
    expect(tabela.has("u1|senha")).toBe(false);
    expect(tabela.get("u1|email")?.falhas).toBe(2);
  });

  it("cada endpoint usa o seu tipo: o handler de e-mail bloqueia só e-mail", async () => {
    await errarVezes("u1", "email", 5);
    h.body = { senhaAtual: SENHA_CERTA, email: "novo@x.com", emailConfirmacao: "novo@x.com" };
    const e = await erroDe(emailHandler({ context: { user: usuario("u1", EMAIL_U1) } } as never));
    expect(e.status).toBe(429);

    // O de senha, com o mesmo usuário, passa do limite (nenhuma falha de 'senha').
    h.body = { senhaAtual: SENHA_CERTA, novaSenha: "NovaSenha#2027" };
    await expect(senhaHandler({ context: { user: usuario("u1", EMAIL_U1) } } as never)).resolves.toEqual({
      atualizada: true,
    });
  });
});

describe("(g) o 429 do limite não revela números de tentativas nem de tempo", () => {
  it("mensagem fixa, sem dígitos nem 'restam/faltam'", () => {
    expect(MENSAGEM_LIMITE_TENTATIVAS).toBe("Muitas tentativas. Tente novamente em alguns minutos.");
    expect(MENSAGEM_LIMITE_TENTATIVAS).not.toMatch(/\d/);
    expect(MENSAGEM_LIMITE_TENTATIVAS).not.toMatch(/rest|falt/i);
  });

  it("os dois handlers respondem 429 com essa mensagem exata, sem corpo extra de tentativas", async () => {
    await errarVezes("u1", "senha", 5);
    await errarVezes("u1", "email", 5);
    const ctx = { context: { user: usuario("u1", EMAIL_U1) } } as never;

    h.body = { senhaAtual: SENHA_CERTA, novaSenha: "NovaSenha#2027" };
    const porSenha = await senhaHandler(ctx).catch((e: unknown) => e as Record<string, unknown>);
    h.body = { senhaAtual: SENHA_CERTA, email: "novo@x.com", emailConfirmacao: "novo@x.com" };
    const porEmail = await emailHandler(ctx).catch((e: unknown) => e as Record<string, unknown>);

    for (const erro of [porSenha, porEmail]) {
      expect(erro.statusCode).toBe(429);
      expect(erro.statusMessage).toBe(MENSAGEM_LIMITE_TENTATIVAS);
      expect(erro.data).toBeUndefined();
      expect(JSON.stringify(erro.statusMessage)).not.toMatch(/\d/);
    }
    expect(h.updateUserById).not.toHaveBeenCalled();
  });
});

describe("o que NÃO conta como tentativa errada", () => {
  it("429 do próprio Supabase Auth: continua com a mensagem dele e não soma falha", async () => {
    h.signIn.mockResolvedValue({ data: {}, error: { status: 429, message: "rate limit" } });
    const e = await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"));
    expect(e).toEqual({ status: 429, msg: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    expect(e.msg).not.toBe(MENSAGEM_LIMITE_TENTATIVAS);
    expect(h.rpcChamadas.some((c) => c.nome === "registrar_falha_conta")).toBe(false);
    expect(tabela.size).toBe(0);
  });

  it("falha de rede/Auth (5xx ou sem status) → 502 e nenhuma falha contada", async () => {
    h.signIn.mockResolvedValueOnce({ data: {}, error: { status: 500, message: "boom" } });
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"))).status).toBe(502);
    h.signIn.mockResolvedValueOnce({ data: {}, error: { message: "network" } });
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"))).status).toBe(502);
    expect(tabela.size).toBe(0);
  });

  it("não conseguir ler a conta (getUserById) → 502 e nenhuma falha contada", async () => {
    h.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: "x" } });
    expect((await erroDe(verificarSenhaAtual("u1", SENHA_ERRADA, "senha"))).status).toBe(502);
    expect(h.rpcChamadas.some((c) => c.nome === "registrar_falha_conta")).toBe(false);
  });

  it("falhas de rede no meio não 'queimam' tentativas: 4 erros + 1 queda de rede + 1 erro ainda não bloqueiam antes do 5º erro real", async () => {
    await errarVezes("u1", "senha", 4);
    h.signIn.mockResolvedValueOnce({ data: {}, error: { status: 503, message: "indisponível" } });
    await erroDe(verificarSenhaAtual("u1", SENHA_CERTA, "senha"));
    expect(tabela.get("u1|senha")?.falhas).toBe(4);
    await expect(verificarSenhaAtual("u1", SENHA_CERTA, "senha")).resolves.toBeUndefined();
  });
});
