import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { computed, ref, type Ref } from "vue";
import type { AuthUser } from "../../shared/types/auth";
import type { Role } from "../../shared/utils/rbac";

// useMinhaConta com useAuth e fetch simulados (useAuth depende do runtime do Nuxt, "#app"). Nada de rede.
const h = vi.hoisted(() => ({ user: null as unknown as Ref<AuthUser | null> }));

vi.mock("../../app/composables/useAuth", () => ({
  useAuth: () => ({
    user: h.user,
    role: computed<Role | null>(() => h.user.value?.role ?? null),
  }),
}));

import { useMinhaConta } from "../../app/composables/useMinhaConta";

const SENHA_ATUAL = "SenhaAtual#2026";
const SENHA_NOVA = "NovaSenha#2026";

function logar(role: Role, extra: Partial<AuthUser> = {}): void {
  h.user = ref<AuthUser | null>({
    id: "u1",
    email: "fulano@farmaurora.com.br",
    role,
    nome: "Fulano de Tal",
    isAdmin: role === "administrador",
    ...extra,
  });
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  logar("socio");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("podeEditarNome por cargo", () => {
  it.each<[Role, boolean]>([
    ["consultor", false],
    ["operacional", false],
    ["socio", true],
    ["administrador", true],
  ])("%s → %s", (role, esperado) => {
    logar(role);
    expect(useMinhaConta().podeEditarNome.value).toBe(esperado);
  });

  it("sem usuário carregado → false", () => {
    h.user = ref<AuthUser | null>(null);
    expect(useMinhaConta().podeEditarNome.value).toBe(false);
  });
});

describe("alterarNome", () => {
  it("sucesso: PATCH com só o nome e user.value ganha o nome devolvido (sem load/refetch do usuário)", async () => {
    fetchMock.mockResolvedValue(respostaJson({ nome: "Fulano Souza" }));
    const { alterarNome, estadoNome } = useMinhaConta();

    const ok = await alterarNome("  Fulano Souza ");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/conta/nome");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ nome: "  Fulano Souza " });
    expect(h.user.value).toMatchObject({ id: "u1", role: "socio", email: "fulano@farmaurora.com.br", nome: "Fulano Souza" });
    expect(estadoNome.erro.value).toBeNull();
    expect(estadoNome.carregando.value).toBe(false);
  });

  it("erro do servidor: mensagem em pt-BR no estado e user.value INALTERADO", async () => {
    fetchMock.mockResolvedValue(respostaJson({ statusMessage: "O nome pode ter no máximo 80 caracteres." }, 400));
    const antes = { ...h.user.value! };
    const { alterarNome, estadoNome } = useMinhaConta();

    expect(await alterarNome("x")).toBe(false);

    expect(estadoNome.erro.value).toBe("O nome pode ter no máximo 80 caracteres.");
    expect(h.user.value).toEqual(antes);
  });

  it("consultor/operacional: nem chama o servidor, mostra a orientação de pedir ao administrador", async () => {
    for (const role of ["consultor", "operacional"] as const) {
      logar(role);
      const { alterarNome, estadoNome } = useMinhaConta();
      expect(await alterarNome("Novo Nome")).toBe(false);
      expect(estadoNome.erro.value).toMatch(/administrador/);
      expect(h.user.value?.nome).toBe("Fulano de Tal");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de rede vira a mensagem de conexão; o erro some na próxima tentativa que dá certo", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { alterarNome, estadoNome } = useMinhaConta();
    expect(await alterarNome("Novo")).toBe(false);
    expect(estadoNome.erro.value).toMatch(/conexão/);

    fetchMock.mockResolvedValueOnce(respostaJson({ nome: "Novo" }));
    expect(await alterarNome("Novo")).toBe(true);
    expect(estadoNome.erro.value).toBeNull();
  });

  it("ignora um segundo clique enquanto a primeira chamada não terminou", async () => {
    let liberar!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (liberar = r)));
    const { alterarNome, estadoNome } = useMinhaConta();

    const primeira = alterarNome("Novo");
    expect(estadoNome.carregando.value).toBe(true);
    expect(await alterarNome("Novo")).toBe(false);
    liberar(respostaJson({ nome: "Novo" }));
    expect(await primeira).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("alterarEmail", () => {
  it("sucesso: POST com senha atual + e-mail + confirmação e user.value ganha o e-mail devolvido", async () => {
    fetchMock.mockResolvedValue(respostaJson({ email: "novo@farmaurora.com.br" }));
    const { alterarEmail, estadoEmail } = useMinhaConta();

    expect(await alterarEmail("Novo@Farmaurora.com.br", "Novo@Farmaurora.com.br", SENHA_ATUAL)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/conta/email");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      senhaAtual: SENHA_ATUAL,
      email: "Novo@Farmaurora.com.br",
      emailConfirmacao: "Novo@Farmaurora.com.br",
    });
    // O que vale é o e-mail que o SERVIDOR devolveu (já normalizado), não o digitado.
    expect(h.user.value?.email).toBe("novo@farmaurora.com.br");
    expect(estadoEmail.erro.value).toBeNull();
  });

  it("erro (409 e-mail em uso): mensagem do servidor e e-mail do usuário inalterado", async () => {
    fetchMock.mockResolvedValue(respostaJson({ statusMessage: "Já existe uma conta com esse e-mail." }, 409));
    const { alterarEmail, estadoEmail } = useMinhaConta();

    expect(await alterarEmail("a@b.com", "a@b.com", SENHA_ATUAL)).toBe(false);

    expect(estadoEmail.erro.value).toBe("Já existe uma conta com esse e-mail.");
    expect(h.user.value?.email).toBe("fulano@farmaurora.com.br");
  });

  it("senha atual errada (400): mostra a mensagem e NÃO desloga nem altera o usuário", async () => {
    fetchMock.mockResolvedValue(respostaJson({ statusMessage: "A senha atual está incorreta." }, 400));
    const { alterarEmail, estadoEmail } = useMinhaConta();

    expect(await alterarEmail("a@b.com", "a@b.com", "errada")).toBe(false);

    expect(estadoEmail.erro.value).toBe("A senha atual está incorreta.");
    expect(h.user.value).not.toBeNull();
  });
});

describe("alterarSenha", () => {
  it("sucesso: POST com senha atual + nova; user.value não muda", async () => {
    fetchMock.mockResolvedValue(respostaJson({ atualizada: true }));
    const antes = { ...h.user.value! };
    const { alterarSenha, estadoSenha } = useMinhaConta();

    expect(await alterarSenha(SENHA_ATUAL, SENHA_NOVA)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/conta/senha");
    expect(JSON.parse(init.body)).toEqual({ senhaAtual: SENHA_ATUAL, novaSenha: SENHA_NOVA });
    expect(h.user.value).toEqual(antes);
    expect(estadoSenha.erro.value).toBeNull();
  });

  it("erro: mensagem do servidor no estado de senha (e só nele)", async () => {
    fetchMock.mockResolvedValue(respostaJson({ statusMessage: "A nova senha precisa ter pelo menos 8 caracteres." }, 400));
    const { alterarSenha, estadoSenha, estadoEmail, estadoNome } = useMinhaConta();

    expect(await alterarSenha(SENHA_ATUAL, "curta")).toBe(false);

    expect(estadoSenha.erro.value).toBe("A nova senha precisa ter pelo menos 8 caracteres.");
    expect(estadoEmail.erro.value).toBeNull();
    expect(estadoNome.erro.value).toBeNull();
  });

  it("sem corpo de erro legível usa a mensagem padrão em pt-BR", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));
    const { alterarSenha, estadoSenha } = useMinhaConta();

    expect(await alterarSenha(SENHA_ATUAL, SENHA_NOVA)).toBe(false);

    expect(estadoSenha.erro.value).toBe("Erro ao alterar a senha.");
  });
});

describe("estado sensível", () => {
  it("senhas e e-mails digitados não ficam guardados no estado do composable nem no usuário, no sucesso nem no erro", async () => {
    const composable = useMinhaConta();

    fetchMock.mockResolvedValueOnce(respostaJson({ atualizada: true }));
    await composable.alterarSenha(SENHA_ATUAL, SENHA_NOVA);
    fetchMock.mockResolvedValueOnce(respostaJson({ statusMessage: "A senha atual está incorreta." }, 400));
    await composable.alterarEmail("secreto@x.com", "secreto@x.com", SENHA_ATUAL);

    const estado = JSON.stringify({
      nome: [composable.estadoNome.carregando.value, composable.estadoNome.erro.value],
      email: [composable.estadoEmail.carregando.value, composable.estadoEmail.erro.value],
      senha: [composable.estadoSenha.carregando.value, composable.estadoSenha.erro.value],
      usuario: h.user.value,
    });
    for (const segredo of [SENHA_ATUAL, SENHA_NOVA, "secreto@x.com"]) {
      expect(estado).not.toContain(segredo);
    }
  });

  it("nada é logado (console) durante as ações", async () => {
    const espioes = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    fetchMock.mockResolvedValueOnce(respostaJson({ atualizada: true }));
    fetchMock.mockResolvedValueOnce(respostaJson({ statusMessage: "erro" }, 400));
    const { alterarSenha, alterarEmail } = useMinhaConta();

    await alterarSenha(SENHA_ATUAL, SENHA_NOVA);
    await alterarEmail("a@b.com", "a@b.com", SENHA_ATUAL);

    for (const espiao of espioes) expect(espiao).not.toHaveBeenCalled();
    for (const espiao of espioes) espiao.mockRestore();
  });
});
