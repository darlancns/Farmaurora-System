import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { montarPatchDiferencial, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { filtrarPorBusca, normalizarPasta, pastaCombina } from "../../app/utils/processoBusca";
import { contarProcessosPorPasta, remessaVisivelNaLinha } from "../../app/utils/remessaNaLinha";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { montarAvisosItensNovos } from "../../server/utils/notificacoesProcesso";
import { montarTextoAvisoChegada } from "../../shared/utils/avisoChegada";
import { pacienteComPasta, pastaLimpa, rotuloPastaPo, temPasta } from "../../shared/utils/rotuloPasta";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { MEDICAMENTOS, editado, estadoCompleto, formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Pasta OPCIONAL no Follow-Up (decisões da Cris): sem pasta = "" (texto vazio, NUNCA null); preenchida, a máscara de
// sempre; na edição pode ser apagada; na exibição é omitida; avisos sem pasta trazem só o nome do paciente.
// Os handlers de POST/PATCH e o processosStore são os REAIS; só h3 e o Supabase (em memória) são simulados.

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
const { isValidProcessoPatch, isValidProcessoPayload, pastaCanonica } = await import(
  "../../server/utils/processoValidation"
);

const T = "follow_up";
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];
const linha1 = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

function corpoPost(extra: Record<string, unknown> = {}, remover: string[] = []): Record<string, unknown> {
  const r = validarProcessoForm(formCompleto(), MEDICAMENTOS, [], "Poros - Turquia");
  if (!r.valido) throw new Error(r.erro);
  const corpo: Record<string, unknown> = { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [], ...extra };
  for (const chave of remover) delete corpo[chave];
  return corpo;
}

async function post(corpo: Record<string, unknown>) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return postHandler(evento);
}

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return patchHandler(evento);
}

async function statusErro(promessa: Promise<unknown>): Promise<number | null> {
  try {
    await promessa;
    return null;
  } catch (e) {
    return (e as { statusCode: number }).statusCode;
  }
}

function proc(id: string, pasta: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()]; // pasta "2026 - 1"
  fake.chamadas.length = 0;
});

describe("validação do servidor", () => {
  it("POST aceita pasta ausente, vazia e só espaços; recusa null e não texto", () => {
    expect(isValidProcessoPayload(corpoPost({}, ["pasta"]))).toBe(true);
    expect(isValidProcessoPayload(corpoPost({ pasta: "" }))).toBe(true);
    expect(isValidProcessoPayload(corpoPost({ pasta: "   " }))).toBe(true);
    expect(isValidProcessoPayload(corpoPost({ pasta: null }))).toBe(false);
    expect(isValidProcessoPayload(corpoPost({ pasta: 2026 }))).toBe(false);
  });

  it("PATCH aceita pasta ausente, vazia e só espaços; recusa null e não texto", () => {
    expect(isValidProcessoPatch({ paciente: "Beltrano" })).toBe(true);
    expect(isValidProcessoPatch({ pasta: "" })).toBe(true);
    expect(isValidProcessoPatch({ pasta: "  " })).toBe(true);
    expect(isValidProcessoPatch({ pasta: null })).toBe(false);
    expect(isValidProcessoPatch({ pasta: 1 })).toBe(false);
  });

  it("pastaCanonica: sem espaços nas pontas; vazio = \"\"; ausente = undefined (não toca a coluna)", () => {
    expect(pastaCanonica(" 2026 - 3 ")).toBe("2026 - 3");
    expect(pastaCanonica("   ")).toBe("");
    expect(pastaCanonica("")).toBe("");
    expect(pastaCanonica(undefined)).toBeUndefined();
  });
});

describe("POST — pasta opcional (nunca NULL)", () => {
  beforeEach(() => {
    fake.tabelas[T] = [];
  });

  it("sem a chave pasta: grava \"\" e devolve \"\"", async () => {
    const criado = await post(corpoPost({}, ["pasta"]));
    expect(fake.linhas(T)[0]!.pasta).toBe("");
    expect(criado.pasta).toBe("");
  });

  it("pasta \"\" ou só espaços: grava \"\"", async () => {
    await post(corpoPost({ pasta: "" }));
    await post(corpoPost({ pasta: "    " }));
    expect(fake.linhas(T).map((r) => r.pasta)).toEqual(["", ""]);
  });

  it("pasta preenchida: grava sem espaços nas pontas", async () => {
    const criado = await post(corpoPost({ pasta: "  2026 - 77 " }));
    expect(fake.linhas(T)[0]!.pasta).toBe("2026 - 77");
    expect(criado.pasta).toBe("2026 - 77");
  });

  it("pasta null: 400, nada gravado", async () => {
    expect(await statusErro(post(corpoPost({ pasta: null })))).toBe(400);
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("nenhuma linha criada fica com pasta NULL", async () => {
    await post(corpoPost({}, ["pasta"]));
    await post(corpoPost({ pasta: " " }));
    for (const r of fake.linhas(T)) expect(r.pasta).not.toBeNull();
  });
});

describe("PATCH — pasta opcional", () => {
  it("\"\" LIMPA a pasta existente (grava \"\", não NULL)", async () => {
    const r = await patch({ pasta: "", parcial: true });
    expect(linha1().pasta).toBe("");
    expect(r.pasta).toBe("");
  });

  it("só espaços também limpa", async () => {
    await patch({ pasta: "   ", parcial: true });
    expect(linha1().pasta).toBe("");
  });

  it("sem a chave: a pasta não é tocada", async () => {
    await patch({ paciente: "Beltrano", parcial: true });
    expect(linha1().pasta).toBe("2026 - 1");
  });

  it("valor novo: grava sem espaços nas pontas", async () => {
    await patch({ pasta: " 2026 - 9 ", parcial: true });
    expect(linha1().pasta).toBe("2026 - 9");
  });

  it("null: 400 e a pasta fica como estava", async () => {
    expect(await statusErro(patch({ pasta: null, parcial: true }))).toBe(400);
    expect(linha1().pasta).toBe("2026 - 1");
  });
});

describe("formulário — criar e editar sem pasta", () => {
  it("edição: apagar a pasta manda pasta \"\" no patch diferencial (não null)", () => {
    const p = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.pasta = "")));
    expect(p).toEqual({ pasta: "", parcial: true });
  });

  it("formulário de edição abre sem erro com pasta NULL de linha antiga (vira \"\")", () => {
    const processo = montarProcesso(linhaCompleta({ pasta: null }) as unknown as FollowUpRow);
    const form = useProcessoForm(() => processo);
    expect(form.form.pasta).toBe("");
  });

  it("formulário de edição tira os espaços nas pontas ao abrir", () => {
    const processo = montarProcesso(linhaCompleta({ pasta: " 2026 - 1 " }) as unknown as FollowUpRow);
    expect(useProcessoForm(() => processo).form.pasta).toBe("2026 - 1");
  });
});

describe("mapeadores", () => {
  it("linha com pasta NULL (dado antigo) vira \"\"", () => {
    expect(montarProcesso(linhaCompleta({ pasta: null }) as unknown as FollowUpRow).pasta).toBe("");
  });

  it("colunasDeDTO: pasta presente vai sem espaços nas pontas; vazia vai \"\"; ausente não entra", () => {
    expect(colunasDeDTO({ pasta: " 2026 - 2 " }).pasta).toBe("2026 - 2");
    expect(colunasDeDTO({ pasta: "  " }).pasta).toBe("");
    expect("pasta" in colunasDeDTO({ paciente: "X" })).toBe(false);
  });
});

describe("remessa na linha ignora pasta vazia", () => {
  it("vários processos sem pasta NÃO se agrupam nem mostram 'Ordem N'", () => {
    const todos = [proc("a", ""), proc("b", ""), proc("c", "   "), proc("d", null as unknown as string)];
    const contagem = contarProcessosPorPasta(todos);
    expect(contagem.has("")).toBe(false);
    for (const p of todos) expect(remessaVisivelNaLinha(p, contagem), p.id).toBe(false);
  });

  it("sem pasta, mas Nº Remessa > 1: continua mostrando", () => {
    const p = proc("a", "", { numeroRemessa: 2 });
    expect(remessaVisivelNaLinha(p, contarProcessosPorPasta([p, proc("b", "")]))).toBe(true);
  });

  it("pasta repetida continua mostrando (regra de sempre)", () => {
    const todos = [proc("a", "2026 - 5"), proc("b", "2026-5"), proc("c", "")];
    const contagem = contarProcessosPorPasta(todos);
    expect(remessaVisivelNaLinha(todos[0]!, contagem)).toBe(true);
    expect(remessaVisivelNaLinha(todos[2]!, contagem)).toBe(false);
  });
});

describe("helper de exibição (shared/utils/rotuloPasta)", () => {
  it("pasta e PO, só pasta, só PO, nenhum", () => {
    expect(rotuloPastaPo("2026 - 1", "PO26-10-0471")).toBe("2026 - 1 · PO26-10-0471");
    expect(rotuloPastaPo("2026 - 1", undefined)).toBe("2026 - 1");
    expect(rotuloPastaPo("", "PO26-10-0471")).toBe("PO26-10-0471");
    expect(rotuloPastaPo("", undefined)).toBe("");
  });

  it("espaços e null contam como vazio", () => {
    expect(rotuloPastaPo("   ", "  ")).toBe("");
    expect(rotuloPastaPo(null, null)).toBe("");
    expect(rotuloPastaPo("  2026 - 1 ", null)).toBe("2026 - 1");
    expect(pastaLimpa(undefined)).toBe("");
    expect(temPasta("  ")).toBe(false);
    expect(temPasta("2026 - 1")).toBe(true);
  });

  it("prefixo só entra quando há pasta", () => {
    expect(rotuloPastaPo("2026 - 1", "PO26-10-0471", "Pasta ")).toBe("Pasta 2026 - 1 · PO26-10-0471");
    expect(rotuloPastaPo("", "PO26-10-0471", "Pasta ")).toBe("PO26-10-0471");
    expect(rotuloPastaPo(" ", undefined, "Pasta ")).toBe("");
  });

  it("pacienteComPasta: com pasta entre parênteses; sem pasta, só o nome", () => {
    expect(pacienteComPasta("Maria", "2026 - 1")).toBe("Maria (2026 - 1)");
    expect(pacienteComPasta("Maria", "")).toBe("Maria");
    expect(pacienteComPasta("Maria", "  ")).toBe("Maria");
    expect(pacienteComPasta("Maria", null)).toBe("Maria");
  });
});

describe("textos de avisos e notificações sem sobras", () => {
  it("notificações de pendência/atualização: sem pasta, só o nome do paciente (sem '()')", () => {
    const [pend, atu] = montarAvisosItensNovos({ paciente: "Maria", pasta: "" }, ["Enviar laudo"], [
      { data: "10/11", texto: "Embarcou" },
    ]);
    expect(pend!.mensagem).toBe("Nova pendência · Maria: Enviar laudo");
    expect(atu!.mensagem).toBe("Nova atualização · Maria: Embarcou");
    for (const a of [pend!, atu!]) expect(a.mensagem).not.toContain("(");
  });

  it("notificações com pasta: como sempre, '(pasta)' depois do nome", () => {
    const [pend] = montarAvisosItensNovos({ paciente: "Maria", pasta: "2026 - 1" }, ["Enviar laudo"], []);
    expect(pend!.mensagem).toBe("Nova pendência · Maria (2026 - 1): Enviar laudo");
  });

  it("aviso de chegada: sem pasta, a linha termina no nome (sem '·' sobrando)", () => {
    const base = { papel: "operacional" as const, paciente: "Maria", numeroRemessa: 1, remessaVisivel: false, rotuloData: "06/11", diasAtraso: 0 };
    expect(montarTextoAvisoChegada({ ...base, pasta: "" }).linhaProcesso).toBe("Ordem de Maria");
    expect(montarTextoAvisoChegada({ ...base, pasta: "  " }).linhaProcesso).toBe("Ordem de Maria");
    expect(montarTextoAvisoChegada({ ...base, pasta: "2026 - 1" }).linhaProcesso).toBe("Ordem de Maria · 2026 - 1");
  });
});

describe("busca null-safe", () => {
  it("normalizarPasta e pastaCombina aceitam null/undefined", () => {
    expect(normalizarPasta(null)).toBe("");
    expect(normalizarPasta(undefined)).toBe("");
    expect(pastaCombina(null, "375")).toBe(false);
  });

  it("processo sem pasta (\"\" ou null) é achado pelo paciente e não quebra a busca", () => {
    const lista = [proc("a", "", { paciente: "Maria" }), proc("b", null as unknown as string, { paciente: "João" }), proc("c", "2026 - 375")];
    expect(filtrarPorBusca(lista, "maria").map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPorBusca(lista, "375").map((p) => p.id)).toEqual(["c"]);
    expect(filtrarPorBusca(lista, "-").map((p) => p.id)).toEqual([]);
  });
});
