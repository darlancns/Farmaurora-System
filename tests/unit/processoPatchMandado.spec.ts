import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { Processo } from "../../shared/types/processo";

// PATCH /api/processos/:id — resolver o alerta de Mandado só para administrador e para o operacional
// responsável DA LINHA; os demais campos seguem como antes. h3 (readBody/getRouterParam) e o store
// são simulados; createError/defineEventHandler são os reais.
const h = vi.hoisted(() => ({
  body: {} as unknown,
  id: "proc_1" as string | undefined,
  getProcesso: vi.fn(),
  patchProcesso: vi.fn(),
}));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/processosStore", () => ({
  getProcesso: h.getProcesso,
  patchProcesso: h.patchProcesso,
}));

import handler from "../../server/api/processos/[id].patch";

function processo(responsavelOperacional?: string): Processo {
  return {
    id: "proc_1",
    paciente: "Fulano",
    pasta: "2026 - 345",
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    ...(responsavelOperacional ? { responsavelOperacional } : {}),
    medicamentos: [],
    status: "desembaraco",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const conta = (role: AuthUser["role"], nome?: string): AuthUser => ({
  id: "u1",
  email: "u@x.com",
  role,
  nome,
  isAdmin: role === "administrador",
});

async function chamar(user: AuthUser | null, body: unknown) {
  h.body = body;
  const evento = { context: { user } } as unknown as Parameters<typeof handler>[0];
  return handler(evento);
}

async function statusDoErro(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

beforeEach(() => {
  h.id = "proc_1";
  h.getProcesso.mockReset().mockResolvedValue(processo("Bruno"));
  h.patchProcesso
    .mockReset()
    .mockImplementation(async (_id: string, patch: object) => ({ ...processo("Bruno"), ...patch }));
});

describe("PATCH alertaMandadoResolvido", () => {
  it("200 para administrador (qualquer responsável)", async () => {
    const res = await chamar(conta("administrador", "Cris"), { alertaMandadoResolvido: true });
    expect(res.alertaMandadoResolvido).toBe(true);
    expect(h.patchProcesso).toHaveBeenCalledWith("proc_1", { alertaMandadoResolvido: true });
  });

  it("200 para o operacional responsável daquela linha (primeiro nome, sem acento/caixa)", async () => {
    await chamar(conta("operacional", "BRUNO Alves"), { alertaMandadoResolvido: true });
    expect(h.patchProcesso).toHaveBeenCalledTimes(1);
  });

  it("403 para operacional que NÃO é o responsável — e nada é gravado", async () => {
    const erro = await statusDoErro(chamar(conta("operacional", "Rebeca Alcântara"), { alertaMandadoResolvido: true }));
    expect(erro.status).toBe(403);
    expect(erro.msg).toMatch(/administrador ou o operacional responsável/);
    expect(h.patchProcesso).not.toHaveBeenCalled();
  });

  it("403 também para reabrir (false) quando não é o responsável", async () => {
    const erro = await statusDoErro(chamar(conta("operacional", "Rebeca"), { alertaMandadoResolvido: false }));
    expect(erro.status).toBe(403);
    expect(h.patchProcesso).not.toHaveBeenCalled();
  });

  it("403 para sócio, consultor, operacional sem nome e sem sessão", async () => {
    for (const user of [conta("socio", "Bruno"), conta("consultor", "Bruno"), conta("operacional"), null]) {
      const erro = await statusDoErro(chamar(user, { alertaMandadoResolvido: true }));
      expect(erro.status).toBe(403);
    }
    expect(h.patchProcesso).not.toHaveBeenCalled();
  });

  it("403 quando a linha não tem responsável (operacional); administrador passa", async () => {
    h.getProcesso.mockResolvedValue(processo(undefined));
    expect((await statusDoErro(chamar(conta("operacional", "Bruno"), { alertaMandadoResolvido: true }))).status).toBe(403);
    await chamar(conta("administrador"), { alertaMandadoResolvido: true });
    expect(h.patchProcesso).toHaveBeenCalledTimes(1);
  });

  it("usa o responsável GRAVADO na linha, não o do corpo do PATCH", async () => {
    const erro = await statusDoErro(
      chamar(conta("operacional", "Rebeca"), { alertaMandadoResolvido: true, responsavelOperacional: "Rebeca" }),
    );
    expect(erro.status).toBe(403);
  });

  it("404 quando o processo não existe", async () => {
    h.getProcesso.mockResolvedValue(null);
    expect((await statusDoErro(chamar(conta("administrador"), { alertaMandadoResolvido: true }))).status).toBe(404);
  });

  it("400 para valor que não é booleano (nada é lido nem gravado)", async () => {
    const erro = await statusDoErro(chamar(conta("administrador"), { alertaMandadoResolvido: "sim" }));
    expect(erro.status).toBe(400);
    expect(h.getProcesso).not.toHaveBeenCalled();
    expect(h.patchProcesso).not.toHaveBeenCalled();
  });
});

describe("PATCH de outros campos segue como antes", () => {
  it("não lê a linha nem checa o responsável: operacional que não é o responsável edita normalmente", async () => {
    const res = await chamar(conta("operacional", "Rebeca"), { paciente: "Novo Nome" });
    expect(res.paciente).toBe("Novo Nome");
    expect(h.getProcesso).not.toHaveBeenCalled();
    expect(h.patchProcesso).toHaveBeenCalledWith("proc_1", { paciente: "Novo Nome" });
  });

  it("alertaFornecedorResolvido não passa pela checagem do Mandado", async () => {
    await chamar(conta("operacional", "Rebeca"), { alertaFornecedorResolvido: true });
    expect(h.getProcesso).not.toHaveBeenCalled();
    expect(h.patchProcesso).toHaveBeenCalledWith("proc_1", { alertaFornecedorResolvido: true });
  });

  it("validação e 404 de sempre: corpo inválido = 400; processo inexistente = 404", async () => {
    expect((await statusDoErro(chamar(conta("administrador"), { paciente: "" }))).status).toBe(400);
    h.patchProcesso.mockResolvedValue(null);
    expect((await statusDoErro(chamar(conta("administrador"), { paciente: "X" }))).status).toBe(404);
  });
});
