import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_ERRO, LABORATORIO_ERRO } from "#shared/constants/processos";
import { validarProcessoForm } from "../../app/utils/processoFormPayload";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { VERSAO, formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Laboratório e Brand por medicamento — servidor. POST e PATCH aceitam e validam os dois campos por item (laboratorio:
// texto normalizado, até 120; brand: um dos valores ou ""; inválido = 400) e os gravam dentro do jsonb `medicamentos`.
// Os handlers e o processosStore são os REAIS; só h3 e o Supabase (em memória) são simulados.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");
const { erroCamposMedicamento, isValidProcessoPatch, isValidProcessoPayload, medicamentosCanonicos } = await import(
  "../../server/utils/processoValidation"
);

const T = "follow_up";
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];
const linha1 = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

function corpoPost(medicamentos: unknown[]): Record<string, unknown> {
  const r = validarProcessoForm(formCompleto(), [{ nome: "X", laboratorio: "", brand: "" }], [], "Poros - Turquia");
  if (!r.valido) throw new Error(r.erro);
  return { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [], medicamentos };
}

async function post(corpo: Record<string, unknown>) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return postHandler(evento);
}

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede: `undefined` some
  return patchHandler(evento);
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

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST — grava laboratório normalizado e brand dentro do jsonb", () => {
  it("vários medicamentos: normaliza o laboratório, mantém o brand e preenche '' em quem não tem", async () => {
    const criado = await post(
      corpoPost([
        { nome: "KEYTRUDA", quantidade: "2", laboratorio: "  bristol-myers   squibb ", brand: "referencia" },
        { nome: "OPDIVO", laboratorio: "teuto brasileiro", brand: "" },
        { nome: "YERVOY" }, // cliente antigo: sem as chaves
      ]),
    );
    const esperado = [
      { nome: "KEYTRUDA", quantidade: "2", laboratorio: "Bristol-Myers Squibb", brand: "referencia" },
      { nome: "OPDIVO", laboratorio: "Teuto Brasileiro", brand: "" },
      { nome: "YERVOY", laboratorio: "", brand: "" },
    ];
    expect(criado.medicamentos).toEqual(esperado);
    const gravada = fake.linhas(T).find((r) => r.id === criado.id)!;
    expect(gravada.medicamentos).toEqual(esperado);
  });

  it("null nos dois campos = '' (tolerante)", async () => {
    const criado = await post(corpoPost([{ nome: "A", laboratorio: null, brand: null }]));
    expect(criado.medicamentos).toEqual([{ nome: "A", laboratorio: "", brand: "" }]);
  });

  it("laboratório acima de 120 caracteres = 400 com mensagem própria, e nada é gravado", async () => {
    const antes = fake.linhas(T).length;
    const erro = await erroDe(post(corpoPost([{ nome: "A", laboratorio: "x".repeat(121), brand: "" }])));
    expect(erro).toEqual({ status: 400, msg: LABORATORIO_ERRO });
    expect(fake.linhas(T)).toHaveLength(antes);
  });

  it("exatamente 120 depois da normalização passa (espaços extras não contam)", async () => {
    const lab = `  ${"x".repeat(60)}     ${"y".repeat(59)}  `;
    const criado = await post(corpoPost([{ nome: "A", laboratorio: lab, brand: "" }]));
    expect(criado.medicamentos[0]!.laboratorio).toHaveLength(120);
  });

  it("brand fora da lista (rótulo com acento, outro texto, número) = 400", async () => {
    for (const brand of ["Referência", "referência", "generico", 1, true]) {
      const erro = await erroDe(post(corpoPost([{ nome: "A", laboratorio: "", brand }])));
      expect(erro, String(brand)).toEqual({ status: 400, msg: BRAND_ERRO });
    }
  });

  it("laboratório que não é texto (número, objeto) = 400", async () => {
    for (const laboratorio of [12, { a: 1 }, ["EMS"]]) {
      const erro = await erroDe(post(corpoPost([{ nome: "A", laboratorio, brand: "" }])));
      expect(erro.status, JSON.stringify(laboratorio)).toBe(400);
    }
  });
});

describe("PATCH — versionado (409) e grava os dois campos", () => {
  it("grava laboratório normalizado e brand; troca a versão", async () => {
    const res = await patch({
      medicamentos: [{ nome: "DROGA", dosagem: "10MG", quantidade: "2", laboratorio: "ems s.a.", brand: "bioequivalente" }],
      versao: VERSAO,
      parcial: true,
    });
    const esperado = [{ nome: "DROGA", dosagem: "10MG", quantidade: "2", laboratorio: "Ems S.a.", brand: "bioequivalente" }];
    expect(res.medicamentos).toEqual(esperado);
    expect(linha1().medicamentos).toEqual(esperado);
    expect(linha1().updated_at).not.toBe(VERSAO);
  });

  it("versão velha = 409 e NADA muda (inclusive laboratório/brand já gravados)", async () => {
    await patch({ medicamentos: [{ nome: "DROGA", laboratorio: "EMS", brand: "referencia" }], versao: VERSAO, parcial: true });
    const gravado = structuredClone(linha1().medicamentos);
    const erro = await erroDe(
      patch({ medicamentos: [{ nome: "DROGA", laboratorio: "Outro", brand: "" }], versao: VERSAO, parcial: true }),
    );
    expect(erro.status).toBe(409);
    expect(linha1().medicamentos).toEqual(gravado);
  });

  it("sem versão = 400 (como sempre para listas)", async () => {
    const erro = await erroDe(patch({ medicamentos: [{ nome: "A", laboratorio: "EMS", brand: "" }], parcial: true }));
    expect(erro.status).toBe(400);
  });

  it("laboratório longo ou brand inválido = 400 com mensagem própria, e a linha fica como estava", async () => {
    const antes = structuredClone(linha1());
    expect(
      await erroDe(patch({ medicamentos: [{ nome: "A", laboratorio: "x".repeat(121), brand: "" }], versao: VERSAO, parcial: true })),
    ).toEqual({ status: 400, msg: LABORATORIO_ERRO });
    expect(
      await erroDe(patch({ medicamentos: [{ nome: "A", laboratorio: "", brand: "Referência" }], versao: VERSAO, parcial: true })),
    ).toEqual({ status: 400, msg: BRAND_ERRO });
    expect(linha1()).toEqual(antes);
  });

  it("patch sem `medicamentos` não toca os campos dos itens", async () => {
    await patch({ medicamentos: [{ nome: "DROGA", laboratorio: "EMS", brand: "referencia" }], versao: VERSAO, parcial: true });
    const gravado = structuredClone(linha1().medicamentos);
    await patch({ localEntrega: "Outra clínica", parcial: true });
    expect(linha1().medicamentos).toEqual(gravado);
  });
});

// Decisão do item 4: item SEM as chaves = "" (não "preserva o do mesmo índice"). Segura porque a gravação de
// medicamentos é sempre versionada: só passa se a linha é a mesma que o cliente viu.
describe("PATCH de cliente antigo (aba aberta antes destes campos)", () => {
  it("cliente antigo reenvia os itens que recebeu com TODAS as chaves (`...item`): laboratório/brand gravados ficam", async () => {
    const r1 = await patch({
      medicamentos: [
        { nome: "A", laboratorio: "EMS", brand: "referencia" },
        { nome: "B", laboratorio: "Teuto", brand: "" },
      ],
      versao: VERSAO,
      parcial: true,
    });
    // A aba antiga carregou r1 e edita só a quantidade do item B (o JS antigo espalha o item: as chaves novas seguem).
    const itensDaAba = r1.medicamentos.map((m) => ({ ...m }));
    itensDaAba[1]!.quantidade = "3";
    const r2 = await patch({ medicamentos: itensDaAba, versao: r1.updatedAt, parcial: true });
    expect(r2.medicamentos).toEqual([
      { nome: "A", laboratorio: "EMS", brand: "referencia" },
      { nome: "B", laboratorio: "Teuto", brand: "", quantidade: "3" },
    ]);
  });

  it("aba antiga com a lista de ANTES dos campos: a versão é velha, então 409 — os campos gravados no meio tempo não se perdem", async () => {
    // Alguém grava laboratório/brand depois que a aba antiga abriu (na versão VERSAO).
    await patch({ medicamentos: [{ nome: "DROGA", laboratorio: "EMS", brand: "referencia" }], versao: VERSAO, parcial: true });
    // A aba antiga salva os itens SEM as chaves, com a versão que viu: 409.
    const erro = await erroDe(patch({ medicamentos: [{ nome: "DROGA", quantidade: "9" }], versao: VERSAO, parcial: true }));
    expect(erro.status).toBe(409);
    expect(linha1().medicamentos).toEqual([{ nome: "DROGA", laboratorio: "EMS", brand: "referencia" }]);
  });

  it("item sem as chaves com a versão atual (item novo, ou que nunca as teve) grava '' — nada é puxado por índice", async () => {
    const r1 = await patch({
      medicamentos: [
        { nome: "A", laboratorio: "EMS", brand: "referencia" },
        { nome: "B", laboratorio: "Teuto", brand: "bioequivalente" },
      ],
      versao: VERSAO,
      parcial: true,
    });
    // A pessoa remove o item A; o B passa ao índice 0 e um item novo C (sem chaves) entra no índice 1.
    const r2 = await patch({
      medicamentos: [{ ...r1.medicamentos[1]! }, { nome: "C" }],
      versao: r1.updatedAt,
      parcial: true,
    });
    expect(r2.medicamentos).toEqual([
      { nome: "B", laboratorio: "Teuto", brand: "bioequivalente" },
      { nome: "C", laboratorio: "", brand: "" }, // NÃO herdou "Teuto"/"bioequivalente" do índice 1 antigo
    ]);
  });
});

describe("validação e normalização (funções puras)", () => {
  it("isValidProcessoPayload / isValidProcessoPatch: aceitam ausente, null, '' e válidos; recusam o resto", () => {
    const base = corpoPost([]);
    const com = (m: unknown) => ({ ...base, medicamentos: [m] });
    expect(isValidProcessoPayload(com({ nome: "A" }))).toBe(true);
    expect(isValidProcessoPayload(com({ nome: "A", laboratorio: null, brand: null }))).toBe(true);
    expect(isValidProcessoPayload(com({ nome: "A", laboratorio: "EMS", brand: "referencia" }))).toBe(true);
    expect(isValidProcessoPayload(com({ nome: "A", brand: "Referência" }))).toBe(false);
    expect(isValidProcessoPayload(com({ nome: "A", laboratorio: 1 }))).toBe(false);
    expect(isValidProcessoPatch({ medicamentos: [{ nome: "A", laboratorio: "x".repeat(121) }], versao: VERSAO })).toBe(false);
    expect(isValidProcessoPatch({ medicamentos: [{ nome: "A", brand: "bioequivalente" }], versao: VERSAO })).toBe(true);
  });

  it("erroCamposMedicamento: null quando está tudo certo ou não há lista", () => {
    expect(erroCamposMedicamento({})).toBeNull();
    expect(erroCamposMedicamento({ medicamentos: "x" })).toBeNull();
    expect(erroCamposMedicamento({ medicamentos: [{ nome: "A", laboratorio: "EMS", brand: "" }] })).toBeNull();
  });

  it("medicamentosCanonicos não troca as outras chaves", () => {
    expect(
      medicamentosCanonicos([{ nome: "keytruda", dosagem: "100mg", marca: "MSD", laboratorio: "msd", brand: "" } as never]),
    ).toEqual([{ nome: "keytruda", dosagem: "100mg", marca: "MSD", laboratorio: "Msd", brand: "" }]);
  });
});

describe("mapeador — itens antigos", () => {
  it("linha com itens sem laboratório/brand (e com null) → '' nos dois; nunca erro", () => {
    const p = montarProcesso(
      linhaCompleta({
        medicamentos: [{ nome: "A", quantidade: "1" }, { nome: "B", laboratorio: null, brand: null }, null],
      }) as unknown as FollowUpRow,
    );
    expect(p.medicamentos).toEqual([
      { nome: "A", quantidade: "1", laboratorio: "", brand: "" },
      { nome: "B", laboratorio: "", brand: "" },
      { nome: "", laboratorio: "", brand: "" },
    ]);
  });

  it("linha com os campos → volta igual; colunasDeDTO grava o jsonb com os campos", () => {
    const itens = [{ nome: "A", laboratorio: "EMS", brand: "referencia" as const }];
    expect(montarProcesso(linhaCompleta({ medicamentos: itens }) as unknown as FollowUpRow).medicamentos).toEqual(itens);
    expect(colunasDeDTO({ medicamentos: itens }).medicamentos).toEqual(itens);
  });
});
