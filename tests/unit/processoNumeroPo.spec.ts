import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "#shared/constants/processos";
import { NUMERO_ORDEM_ERRO } from "#shared/utils/numeroOrdem";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { filtrarPorBusca, normalizarOrdem, processoCombinaBusca, criarTermoBusca } from "../../app/utils/processoBusca";
import { buildBasePayload, montarPatchDiferencial, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  MEDICAMENTOS,
  VERSAO,
  editado,
  estadoCompleto,
  formCompleto,
  linhaCompleta,
} from "./helpers/processoEdicaoFixtures";

// Item 7 do lote Follow-Up (regra da Cris, 2ª versão) — campo "PO" (numeroPo / coluna numero_po): mapper,
// payload, patch diferencial, servidor (POST e PATCH), formulário e busca. A máscara em si está em numeroOrdem.spec.ts.
// Handlers e store REAIS; só h3 (readBody/getRouterParam) e o Supabase (em memória) são simulados.

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

const T = "follow_up";
const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];
const PO = "PO-25-2652/3"; // o valor das fixtures
const recusado = { statusCode: 400, statusMessage: NUMERO_ORDEM_ERRO };

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
});

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede
  return patchHandler(evento);
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("mapper (linha ↔ Processo)", () => {
  it("numero_po vira numeroPo na leitura", () => {
    expect(montarProcesso(linhaCompleta() as unknown as FollowUpRow).numeroPo).toBe(PO);
  });

  it("NULL, ausente (linha de antes da coluna) → a chave some", () => {
    expect("numeroPo" in montarProcesso(linhaCompleta({ numero_po: null }) as unknown as FollowUpRow)).toBe(false);
    const semColuna = linhaCompleta();
    delete semColuna.numero_po;
    expect("numeroPo" in montarProcesso(semColuna as unknown as FollowUpRow)).toBe(false);
  });

  it("numeroPo vira numero_po na gravação; null/undefined limpam; chave ausente não toca", () => {
    expect(colunasDeDTO({ numeroPo: "PO-25-2652" })).toEqual({ numero_po: "PO-25-2652" });
    expect(colunasDeDTO({ numeroPo: null })).toEqual({ numero_po: null });
    expect(colunasDeDTO({ numeroPo: undefined })).toEqual({ numero_po: null });
    expect("numero_po" in colunasDeDTO({ paciente: "X" })).toBe(false);
  });

  it("numeroPo é um campo limpável (esvaziar na edição manda null)", () => {
    expect(CAMPOS_PROCESSO_LIMPAVEIS).toContain("numeroPo");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("payload do formulário", () => {
  it("vai normalizado (maiúsculas, sem espaços nas pontas, sem barra final vazia)", () => {
    const base = (numeroPo: string) => buildBasePayload({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "").numeroPo;
    expect(base("po-25-2652/3")).toBe("PO-25-2652/3");
    expect(base("  PO-25-2652  ")).toBe("PO-25-2652");
    expect(base("PO-25-11/")).toBe("PO-25-11");
  });

  it("incompleto vai como está (salvar incompleto é permitido)", () => {
    const base = (numeroPo: string) => buildBasePayload({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "").numeroPo;
    expect(base("PO-25-1")).toBe("PO-25-1");
    expect(base("PO-25")).toBe("PO-25");
    expect(base("PO-2")).toBe("PO-2");
  });

  it("vazio, 'PO' e 'PO-' viram undefined (campo opcional)", () => {
    expect(buildBasePayload({ ...formCompleto(), numeroPo: "PO-" }, MEDICAMENTOS, [], "").numeroPo).toBeUndefined();
    expect(buildBasePayload({ ...formCompleto(), numeroPo: "PO" }, MEDICAMENTOS, [], "").numeroPo).toBeUndefined();
    expect(buildBasePayload({ ...formCompleto(), numeroPo: "" }, MEDICAMENTOS, [], "").numeroPo).toBeUndefined();
    expect(buildBasePayload({ ...formCompleto(), numeroPo: "  " }, MEDICAMENTOS, [], "").numeroPo).toBeUndefined();
  });
});

describe("patch diferencial", () => {
  it("sem alteração: nada é enviado (nem numeroPo)", () => {
    expect(montarPatchDiferencial(estadoCompleto(), estadoCompleto())).toBeNull();
  });

  it("alterou OUTRO campo: numeroPo não vai", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.localEntrega = "Outro")))!;
    expect("numeroPo" in patch).toBe(false);
  });

  it("alterou o PO: vai só ele (normalizado)", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "PO-26-0001")))!;
    expect(patch).toEqual({ numeroPo: "PO-26-0001", parcial: true });
  });

  it("só mudou a forma de escrever (minúsculas/espaços): continua não enviando", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = " po-25-2652/3 ")));
    expect(patch).toBeNull();
  });

  it("esvaziar vira null", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "")))!;
    expect(patch).toEqual({ numeroPo: null, parcial: true });
    // "PO-" (sobrou só o prefixo) também esvazia
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "PO-")))).toEqual({
      numeroPo: null,
      parcial: true,
    });
    expect(JSON.parse(JSON.stringify(patch)).numeroPo).toBeNull(); // sobrevive ao JSON
  });

  it("preencher quando estava vazio", () => {
    const inicial = { ...estadoCompleto(), form: { ...formCompleto(), numeroPo: "" } };
    const patch = montarPatchDiferencial(inicial, estadoCompleto())!;
    expect(patch).toEqual({ numeroPo: PO, parcial: true });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("formulário: salvar incompleto é permitido (sem trava)", () => {
  const validar = (numeroPo: string, inicial = formCompleto()) =>
    validarProcessoForm({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "", inicial);

  it("vazio, incompleto e completo salvam", () => {
    for (const v of ["", "PO-", "PO-2", "PO-25", "PO-25-1", "PO-25-11", "PO-25-2652", "PO-25-11/", "PO-25-2652/3"]) {
      expect(validar(v).valido, v).toBe(true);
    }
  });

  it("o payload leva o valor normalizado", () => {
    const r = validar("PO-25-1");
    expect(r.valido && r.payload.numeroPo).toBe("PO-25-1");
    const vazio = validar("PO-");
    expect(vazio.valido && vazio.payload.numeroPo).toBeUndefined();
  });

  it("valor gravado fora do formato também não impede salvar", () => {
    const inicial = { ...formCompleto(), numeroPo: "LEGADO 123" };
    expect(validar("LEGADO 123", inicial).valido).toBe(true);
  });

  it("o resultado inválido de outras regras não traz campo de PO", () => {
    const r = validarProcessoForm({ ...formCompleto(), paciente: "" }, MEDICAMENTOS, [], "");
    expect(r).toEqual({ valido: false, erro: "Informe o nome do paciente." });
  });
});

describe("formulário (composable): máscara ao digitar/colar e erro no campo", () => {
  // Campo de mentira: guarda valor e seleção como um <input>.
  function campo(valor: string, cursor = valor.length) {
    const c = {
      value: valor,
      selectionStart: cursor as number | null,
      setSelectionRange(a: number, b: number) {
        c.selectionStart = a;
        void b;
      },
    };
    return c;
  }
  const evento = (c: ReturnType<typeof campo>) => ({ target: c }) as unknown as Event;

  function digitar(f: ReturnType<typeof useProcessoForm>, texto: string) {
    const c = campo(f.form.numeroPo);
    for (const ch of texto) {
      const inicio = c.selectionStart ?? c.value.length;
      c.value = c.value.slice(0, inicio) + ch + c.value.slice(inicio);
      c.selectionStart = inicio + 1;
      f.onNumeroPoInput(evento(c));
    }
    return c;
  }

  it("digitar escreve o valor mascarado no estado E no campo (barra automática; extras descartados)", () => {
    const f = useProcessoForm(() => null);
    const c = digitar(f, "po2526523/xy");
    expect(f.form.numeroPo).toBe("PO-25-2652/3");
    expect(c.value).toBe("PO-25-2652/3");
    expect(c.selectionStart).toBe(12);
  });

  it("barra manual: 'PO-25-11' + '/' mostra 'PO-25-11/'", () => {
    const f = useProcessoForm(() => null);
    const c = digitar(f, "po2511/");
    expect(f.form.numeroPo).toBe("PO-25-11/");
    expect(c.value).toBe("PO-25-11/");
  });

  it("colar", () => {
    const f = useProcessoForm(() => null);
    const c = campo("po 25 2652-3");
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-2652/3");
    expect(c.value).toBe("PO-25-2652/3");
  });

  it("apagar no meio mantém o cursor no ponto (não vai para o fim)", () => {
    const f = useProcessoForm(() => null);
    f.form.numeroPo = "PO-25-2652";
    const c = campo("PO-25-252", 7); // apagou o "6"
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-252");
    expect(c.selectionStart).toBe(7);
  });

  it("apagar no fim passa por PO-25-11/3 → PO-25-11/ → PO-25-11", () => {
    const f = useProcessoForm(() => null);
    f.form.numeroPo = "PO-25-11/3";
    const c = campo("PO-25-11/");
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-11/");
    c.value = "PO-25-11";
    c.selectionStart = 8;
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-11");
  });

  it("incompleto SALVA: não há erro de campo, validar() aceita e o payload leva o valor", () => {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    digitar(f, "po251");
    expect(f.form.numeroPo).toBe("PO-25-1");

    const r = f.validar();
    expect(r.valido).toBe(true);
    expect(r.valido && r.payload.numeroPo).toBe("PO-25-1");
    expect("erroNumeroPo" in f).toBe(false);
  });

  it("vazio é permitido e o payload não leva numeroPo", () => {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    const r = f.validar();
    expect(r.valido).toBe(true);
    expect(r.valido && r.payload.numeroPo).toBeUndefined();
  });

  it("edição: carrega o valor gravado; trocar vira patch só com numeroPo; limpar vira null", () => {
    const processo: Processo = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);
    expect(f.form.numeroPo).toBe(PO);

    const nada = f.validarEdicao();
    expect(nada).toEqual({ valido: true, patch: null });

    f.form.numeroPo = "";
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { numeroPo: null, parcial: true } });

    f.form.numeroPo = "PO-26-9";
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { numeroPo: "PO-26-9", parcial: true } });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("servidor: POST", () => {
  function corpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const r = validarProcessoForm(formCompleto(), MEDICAMENTOS, [], "Poros - Turquia");
    if (!r.valido) throw new Error(r.erro);
    const base = JSON.parse(JSON.stringify(r.payload)) as Record<string, unknown>;
    delete base.numeroPo;
    return { ...base, atualizacoes: [], ...extra };
  }
  async function criar(c: Record<string, unknown>) {
    h.body = c;
    fake.tabelas[T] = [];
    return postHandler(evento);
  }

  it("grava o valor normalizado e devolve numeroPo", async () => {
    const criado = await criar(corpo({ numeroPo: "  po-25-2652/3  " }));
    expect(fake.linhas(T)[0]!.numero_po).toBe("PO-25-2652/3");
    expect(criado.numeroPo).toBe("PO-25-2652/3");
  });

  it("aceita tudo que a máscara produz, inclusive incompleto", async () => {
    for (const numeroPo of ["PO-25-2652", "PO-25-11", "PO-25-11/3", "PO-25-11/12", "PO-25-1", "PO-25", "PO-2"]) {
      await criar(corpo({ numeroPo }));
      expect(fake.linhas(T)[0]!.numero_po, numeroPo).toBe(numeroPo);
    }
  });

  it("barra final sem dígitos é removida ao gravar (PO-25-11/ → PO-25-11)", async () => {
    await criar(corpo({ numeroPo: "PO-25-11/" }));
    expect(fake.linhas(T)[0]!.numero_po).toBe("PO-25-11");
  });

  it("formato inválido: 400 com a mensagem em português, e nada é gravado", async () => {
    for (const numeroPo of ["PO-25-0123/ABC", "XX-25-1", "PO-255", "PO-25-12345", "PO-25-11/ABC", "PO-25-", "25-11", 123, true, {}]) {
      await expect(criar(corpo({ numeroPo })), String(numeroPo)).rejects.toMatchObject(recusado);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("vazio, só espaços, 'PO', 'PO-', null e ausente: permitido, a coluna fica NULL", async () => {
    for (const extra of [{ numeroPo: "" }, { numeroPo: "   " }, { numeroPo: "PO-" }, { numeroPo: "PO" }, { numeroPo: null }, {}]) {
      const criado = await criar(corpo(extra));
      expect(fake.linhas(T)[0]!.numero_po ?? null, JSON.stringify(extra)).toBeNull();
      expect("numeroPo" in criado).toBe(false);
    }
  });

  it("aba antiga (corpo sem numeroPo) continua funcionando", async () => {
    const criado = await criar(corpo());
    expect(criado.paciente).toBe("Fulano");
    expect("numero_po" in fake.linhas(T)[0]!).toBe(false); // o insert nem leva a coluna
  });
});

describe("servidor: PATCH", () => {
  it("grava normalizado", async () => {
    const atualizado = await patch({ parcial: true, numeroPo: " po-26-1/2 " });
    expect(row().numero_po).toBe("PO-26-1/2");
    expect(atualizado.numeroPo).toBe("PO-26-1/2");
  });

  it("aceita incompleto e normaliza a barra final", async () => {
    for (const [enviado, gravado] of [["PO-26", "PO-26"], ["PO-26-1", "PO-26-1"], ["PO-26-11/", "PO-26-11"], ["PO-2", "PO-2"]] as const) {
      fake.tabelas[T] = [linhaCompleta()];
      await patch({ parcial: true, numeroPo: enviado });
      expect(row().numero_po, enviado).toBe(gravado);
    }
  });

  it("formato inválido: 400 e a linha não muda", async () => {
    for (const numeroPo of ["PO-26-0001/X", "26-0001", "PO-266", "PO-26-12345", "XX-26-1", "PO-26-", 7, false]) {
      await expect(patch({ parcial: true, numeroPo }), String(numeroPo)).rejects.toMatchObject(recusado);
    }
    expect(row().numero_po).toBe(PO);
  });

  it("formato inválido recusa também sem 'parcial' (aba antiga que já conhece o campo)", async () => {
    await expect(patch({ numeroPo: "ZZZ" })).rejects.toMatchObject(recusado);
  });

  it("vazio, só espaços, 'PO-' e null limpam a coluna", async () => {
    for (const numeroPo of ["", "   ", "PO-", null]) {
      fake.tabelas[T] = [linhaCompleta()];
      await patch({ parcial: true, numeroPo });
      expect(row().numero_po, JSON.stringify(numeroPo)).toBeNull();
    }
  });

  it("patch sem a chave não toca o PO (e não o valida, nem se o gravado for antigo/inválido)", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })]; // texto livre, de antes da regra
    await patch({ parcial: true, localEntrega: "Nova clínica" });
    expect(row().local_entrega).toBe("Nova clínica");
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
  });

  it("valor antigo inválido reenviado SEM mudar não impede salvar os outros campos", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })];
    await patch({ numeroPo: "po-25-0123/alfa", localEntrega: "Outra clínica" }); // formato antigo: manda tudo
    expect(row().local_entrega).toBe("Outra clínica");
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
  });

  it("valor antigo inválido: MUDAR para outro inválido é recusado; para um válido, grava", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })];
    await expect(patch({ parcial: true, numeroPo: "PO-25-0123/BETA" })).rejects.toMatchObject(recusado);
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
    await patch({ parcial: true, numeroPo: "PO-25-0123/4" });
    expect(row().numero_po).toBe("PO-25-0123/4");
  });

  it("valor que não é texto nunca passa pela exceção do 'igual ao gravado'", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: null })];
    await expect(patch({ parcial: true, numeroPo: 7 })).rejects.toMatchObject(recusado);
  });

  it("patch versionado (atualizações) com numeroPo também é validado e normalizado", async () => {
    const novas = [{ data: "02/09", texto: "Nova" }];
    await expect(patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "ruim" })).rejects.toMatchObject(recusado);
    await patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "po-27-2" });
    expect(row().numero_po).toBe("PO-27-2");
  });

  it("ida e volta do formulário: editar o PO e esvaziar", async () => {
    const processo = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);

    f.form.numeroPo = "PO-28-3";
    let r = f.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava patch");
    await patch(r.patch);
    expect(row().numero_po).toBe("PO-28-3");

    f.form.numeroPo = "";
    r = f.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava patch");
    await patch(r.patch);
    expect(row().numero_po).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("busca", () => {
  function proc(id: string, paciente: string, pasta: string, numeroPo?: string): Processo {
    return {
      id,
      paciente,
      pasta,
      ...(numeroPo ? { numeroPo } : {}),
      empresa: "FARMAURORA",
      consultor: "Dani",
      medicamentos: [],
      status: "em_transito",
      datas: {},
      pendencias: [],
      atualizacoes: [],
      createdAt: "",
      updatedAt: "",
    };
  }
  const lista = [
    proc("a", "Maria Silva", "2026 - 100", "PO-25-11"),
    proc("b", "João Souza", "2026 - 375", "PO-25-2652/3"),
    proc("c", "Ana Lima", "2026 - 200"), // sem PO
  ];
  const ids = (termo: string) => filtrarPorBusca(lista, termo).map((p) => p.id);

  it("normalizarOrdem: só letras e números, sem acento/maiúscula", () => {
    expect(normalizarOrdem("PO-25-2652/3")).toBe("po2526523");
    expect(normalizarOrdem(" po 25-11 ")).toBe("po2511");
    expect(normalizarOrdem("---")).toBe("");
    expect(normalizarOrdem("ação/é")).toBe("acaoe");
  });

  it("PO-25-11 é achado por variações de maiúsculas, pontuação, espaços e prefixo", () => {
    for (const termo of ["po-25-11", "PO-25-11", "PO2511", "po 25 11", "25-11", "25 11", "2511", "PO-25-11/"]) {
      expect(ids(termo), termo).toEqual(["a"]);
    }
  });

  it("PO-25-2652/3 é achado por variações, inclusive pela barra", () => {
    for (const termo of ["po-25-2652/3", "PO2526523", "po 25 2652 3", "2652/3", "2652 3", "25-2652", "52/3", "26523"]) {
      expect(ids(termo), termo).toEqual(["b"]);
    }
  });

  it("prefixo comum acha todos que o têm; um termo só existe junto no mesmo valor", () => {
    expect(ids("PO-25")).toEqual(["a", "b"]);
    expect(ids("po")).toEqual(["a", "b"]);
    // "PO25112652" junta o PO de um com a sequência do outro: não está contido em nenhum dos dois
    expect(ids("PO25112652")).toEqual([]);
  });

  it("paciente e pasta continuam funcionando", () => {
    expect(ids("maria")).toEqual(["a"]);
    expect(ids("SOUZA")).toEqual(["b"]);
    expect(ids("2026 - 200")).toEqual(["c"]);
    expect(ids("2026-375")).toEqual(["b"]);
    expect(ids("375")).toEqual(["b"]);
  });

  it("processo sem PO não casa por ele", () => {
    const termo = criarTermoBusca("PO-25")!;
    expect(processoCombinaBusca(lista[2]!, termo)).toBe(false);
  });

  it("termo só de pontuação não casa com tudo (nem por pasta nem por ordem)", () => {
    expect(ids("-")).toEqual([]);
    expect(ids("/")).toEqual([]);
  });

  it("sem termo: a lista inteira (restauro ao apagar)", () => {
    expect(ids("")).toEqual(["a", "b", "c"]);
    expect(ids("   ")).toEqual(["a", "b", "c"]);
  });
});
