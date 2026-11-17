import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "../../shared/types/processo";
import type { AuthUser } from "../../shared/types/auth";
import {
  avisoPrazoAnvisaDevido,
  montarTextoAvisoPrazoAnvisa,
  podeDarCienciaPrazoAnvisa,
  podeVerAvisoPrazoAnvisa,
  TITULO_AVISO_PRAZO_ANVISA,
} from "../../shared/utils/avisoPrazoAnvisa";
import { calcularAvisosPrazoAnvisa } from "../../app/utils/avisosPrazoAnvisa";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Aviso "Prazo limite pra Manifestação da ANVISA": DERIVADO (função pura) + ciência gravada por endpoint.
// "Agora" é sempre um instante fixo; Brasília = UTC-3 (o resultado não depende do fuso da máquina).

const BRT = (dia: string, hhmm = "09:00"): Date => new Date(`${dia}T${hhmm}:00-03:00`);

// `prazo` vira datas.prazoAnvisa (padrão 2026-11-19); `datas` explícito tem precedência (ex.: `{}` = sem prazo).
function proc(extra: Partial<Processo> & { prazo?: string } = {}): Processo {
  const { prazo = "2026-11-19", ...resto } = extra;
  return {
    id: "p1",
    paciente: "Maria",
    numeroRemessa: 1,
    pasta: "2026 - 301",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    medicamentos: [],
    status: "desembaraco",
    datas: { prazoAnvisa: prazo },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "v1",
    ...resto,
  };
}

describe("avisoPrazoAnvisaDevido — quando aparece", () => {
  it("prazo quinta 19/11/2026 (20/11 feriado): aviso na segunda 23/11, a partir das 00h; não antes", () => {
    const p = proc({ prazo: "2026-11-19" });
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-20", "23:59")).devido).toBe(false); // feriado
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-22", "23:59")).devido).toBe(false); // domingo
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-23", "00:00"))).toEqual({
      devido: true,
      prazo: "2026-11-19",
      diaAviso: "2026-11-23",
    });
  });

  it("prazo sexta 27/11: segunda 30/11; prazo sábado 21/11: segunda 23/11; quinta comum: sexta", () => {
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "2026-11-27" }), BRT("2026-11-29")).devido).toBe(false);
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "2026-11-27" }), BRT("2026-11-30")).diaAviso).toBe("2026-11-30");
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "2026-11-21" }), BRT("2026-11-23")).devido).toBe(true);
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "2026-12-03" }), BRT("2026-12-04")).devido).toBe(true);
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "2026-12-03" }), BRT("2026-12-03", "23:59")).devido).toBe(false);
  });

  it("ninguém abriu no dia: aparece na primeira abertura depois e continua até a ciência", () => {
    const p = proc({ prazo: "2026-11-19" });
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-12-15")).devido).toBe(true);
    expect(avisoPrazoAnvisaDevido(p, BRT("2027-02-01")).devido).toBe(true);
  });

  it("'hoje' é o de Brasília: 22:30 de domingo 22/11 (já segunda em UTC) ainda não avisa", () => {
    const p = proc({ prazo: "2026-11-19" });
    expect(avisoPrazoAnvisaDevido(p, new Date("2026-11-23T01:30:00Z")).devido).toBe(false);
    expect(avisoPrazoAnvisaDevido(p, new Date("2026-11-23T03:00:00Z")).devido).toBe(true);
  });
});

describe("avisoPrazoAnvisaDevido — quando some", () => {
  const depois = BRT("2026-11-25");

  it("ciência para o prazo atual: some", () => {
    expect(avisoPrazoAnvisaDevido(proc({ alertaAnvisaCientePrazo: "2026-11-19" }), depois).devido).toBe(false);
  });

  it("prazo ALTERADO depois da ciência: volta (para o prazo novo, no dia útil seguinte a ele)", () => {
    const p = proc({ prazo: "2026-11-23", alertaAnvisaCientePrazo: "2026-11-19" });
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-23")).devido).toBe(false);
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-24"))).toEqual({ devido: true, prazo: "2026-11-23", diaAviso: "2026-11-24" });
  });

  it("prazo apagado (ou valor que não é data): não há aviso", () => {
    expect(avisoPrazoAnvisaDevido(proc({ datas: {} }), depois)).toEqual({ devido: false, prazo: null, diaAviso: null });
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "" }), depois).devido).toBe(false);
    expect(avisoPrazoAnvisaDevido(proc({ prazo: "19/11/2026" }), depois).devido).toBe(false);
  });

  it("Entregue: some; Liberado (e os outros): continua até a ciência", () => {
    expect(avisoPrazoAnvisaDevido(proc({ status: "entregue" }), depois).devido).toBe(false);
    expect(avisoPrazoAnvisaDevido(proc({ status: "liberado" }), depois).devido).toBe(true);
    expect(avisoPrazoAnvisaDevido(proc({ status: "em_transito" }), depois).devido).toBe(true);
  });
});

describe("texto", () => {
  it("título, paciente · pasta e o prazo com o ano", () => {
    expect(montarTextoAvisoPrazoAnvisa({ paciente: "Maria", pasta: " 2026 - 301 ", prazo: "2026-11-25" })).toEqual({
      titulo: "Prazo limite pra Manifestação da ANVISA",
      linhaProcesso: "Maria · 2026 - 301",
      linhaPrazo: "Prazo: 25/11/2026",
    });
    expect(TITULO_AVISO_PRAZO_ANVISA).toBe("Prazo limite pra Manifestação da ANVISA");
  });

  it("pasta vazia: só o paciente, sem '·' sobrando", () => {
    expect(montarTextoAvisoPrazoAnvisa({ paciente: "Maria", pasta: "   ", prazo: "2026-11-25" }).linhaProcesso).toBe("Maria");
    expect(montarTextoAvisoPrazoAnvisa({ paciente: "Maria", pasta: "", prazo: "2026-11-25" }).linhaProcesso).toBe("Maria");
  });
});

describe("quem vê e quem dá ciência (regra do Mandado)", () => {
  it.each([
    [{ role: "administrador" as const, nome: "Cris" }, "Bruno", true],
    [{ role: "operacional" as const, nome: "Bruno Alves" }, "Bruno", true],
    [{ role: "operacional" as const, nome: "Rebeca Alcântara" }, "Bruno", false],
    [{ role: "operacional" as const, nome: "Bruno" }, undefined, false],
    [{ role: "consultor" as const, nome: "Dani" }, "Bruno", false],
    [{ role: "socio" as const, nome: "Sócio" }, "Bruno", false],
    [{ role: null, nome: null }, "Bruno", false],
  ])("%j no processo de %s -> %s", (usuario, responsavel, esperado) => {
    expect(podeVerAvisoPrazoAnvisa(usuario, responsavel)).toBe(esperado);
    expect(podeDarCienciaPrazoAnvisa(usuario, responsavel)).toBe(esperado);
  });

  it("calcularAvisosPrazoAnvisa: admin vê todos; operacional só os seus; consultor nada; mais antigos primeiro", () => {
    const lista = [
      proc({ id: "a", prazo: "2026-11-23", responsavelOperacional: "Rebeca", paciente: "Ana" }),
      proc({ id: "b", prazo: "2026-11-19", responsavelOperacional: "Bruno", paciente: "Beto", pasta: "" }),
      proc({ id: "c", prazo: "2026-11-27", responsavelOperacional: "Bruno" }), // ainda não (30/11)
    ];
    const agora = BRT("2026-11-25");
    const admin = calcularAvisosPrazoAnvisa(lista, { role: "administrador", nome: "Cris" }, agora);
    expect(admin.map((a) => a.processoId)).toEqual(["b", "a"]);
    expect(admin[0]).toMatchObject({ chave: "b|2026-11-19", linhaProcesso: "Beto", linhaPrazo: "Prazo: 19/11/2026" });
    expect(calcularAvisosPrazoAnvisa(lista, { role: "operacional", nome: "Bruno Alves" }, agora).map((a) => a.processoId)).toEqual(["b"]);
    expect(calcularAvisosPrazoAnvisa(lista, { role: "consultor", nome: "Dani" }, agora)).toEqual([]);
  });
});

// ── Endpoint POST /api/processos/:id/anvisa-ciente (handler e store REAIS; h3 e Supabase simulados) ──────────
const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" }));
const fake = new FakeSupabase();
vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({ createSupabaseAdminClient: () => fake.asClient() }));
const { default: cienteHandler } = await import("../../server/api/processos/[id]/anvisa-ciente.post");

const T = "follow_up";
const linha = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const conta = (role: AuthUser["role"], nome?: string): AuthUser => ({ id: "u1", email: "u@x", role, nome, isAdmin: role === "administrador" });

async function ciente(user: AuthUser | null, corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return cienteHandler({ context: { user } } as unknown as Parameters<typeof cienteHandler>[0]);
}
async function erroDe(p: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava erro HTTP");
}

describe("POST /api/processos/:id/anvisa-ciente", () => {
  beforeEach(() => {
    h.id = "proc_1";
    fake.tabelas[T] = [linhaCompleta({ prazo_anvisa: "2026-11-19", responsavel_operacional: "Bruno" })];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("operacional dono: grava a ciência para o prazo atual, sem mexer em updated_at; o aviso some", async () => {
    const antes = linha().updated_at;
    const p = await ciente(conta("operacional", "Bruno Alves"), { prazo: "2026-11-19" });
    expect(linha().alerta_anvisa_ciente_prazo).toBe("2026-11-19");
    expect(linha().updated_at).toBe(antes);
    expect(p.alertaAnvisaCientePrazo).toBe("2026-11-19");
    expect(avisoPrazoAnvisaDevido(p, BRT("2026-11-25")).devido).toBe(false);
  });

  it("administrador também pode", async () => {
    await ciente(conta("administrador", "Cris"), { prazo: "2026-11-19" });
    expect(linha().alerta_anvisa_ciente_prazo).toBe("2026-11-19");
  });

  it("403 para operacional de outro processo, consultor, sócio e sem login — nada é gravado", async () => {
    for (const u of [conta("operacional", "Rebeca"), conta("consultor", "Dani"), conta("socio", "S"), null]) {
      expect((await erroDe(ciente(u, { prazo: "2026-11-19" }))).status).toBe(403);
    }
    expect(linha().alerta_anvisa_ciente_prazo).toBeNull();
  });

  it("409 quando o prazo enviado não é mais o atual (trocado no meio) — nada é gravado", async () => {
    const e = await erroDe(ciente(conta("operacional", "Bruno"), { prazo: "2026-11-18" }));
    expect(e).toEqual({ status: 409, msg: "O prazo da ANVISA deste processo mudou. Confira o prazo novo antes de dar ciência." });
    expect(linha().alerta_anvisa_ciente_prazo).toBeNull();
  });

  it("409 também quando não há mais prazo", async () => {
    fake.tabelas[T] = [linhaCompleta({ prazo_anvisa: null, responsavel_operacional: "Bruno" })];
    expect((await erroDe(ciente(conta("operacional", "Bruno"), { prazo: "2026-11-19" }))).status).toBe(409);
  });

  it("400 para prazo inválido ou ausente; 404 para processo que não existe", async () => {
    for (const corpo of [{}, { prazo: "19/11/2026" }, { prazo: "2026-02-30" }, { prazo: 20261119 }]) {
      expect((await erroDe(ciente(conta("operacional", "Bruno"), corpo))).status).toBe(400);
    }
    h.id = "nao_existe";
    expect((await erroDe(ciente(conta("administrador", "Cris"), { prazo: "2026-11-19" }))).status).toBe(404);
  });
});
