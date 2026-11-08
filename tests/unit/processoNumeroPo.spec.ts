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

// Item 7 do lote Follow-Up — campo "Nº Ordem" (numeroPo / coluna numero_po): mapper, payload, patch
// diferencial, servidor (POST e PATCH), formulário e busca. A máscara em si está em numeroOrdem.spec.ts.
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
const PO = "PO-25-0123/ALFA"; // o valor das fixtures
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
    expect(colunasDeDTO({ numeroPo: "PO-25-0123" })).toEqual({ numero_po: "PO-25-0123" });
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
    expect(base("po-25-0123/alfa")).toBe("PO-25-0123/ALFA");
    expect(base("  PO-25-0123  ")).toBe("PO-25-0123");
    expect(base("PO-25-0123/")).toBe("PO-25-0123");
  });

  it("vazio vira undefined (campo opcional)", () => {
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

  it("alterou o Nº Ordem: vai só ele (normalizado)", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "PO-26-0001")))!;
    expect(patch).toEqual({ numeroPo: "PO-26-0001", parcial: true });
  });

  it("só mudou a forma de escrever (minúsculas/espaços): continua não enviando", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = " po-25-0123/alfa ")));
    expect(patch).toBeNull();
  });

  it("esvaziar vira null", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "")))!;
    expect(patch).toEqual({ numeroPo: null, parcial: true });
    expect(JSON.parse(JSON.stringify(patch)).numeroPo).toBeNull(); // sobrevive ao JSON
  });

  it("preencher quando estava vazio", () => {
    const inicial = { ...estadoCompleto(), form: { ...formCompleto(), numeroPo: "" } };
    const patch = montarPatchDiferencial(inicial, estadoCompleto())!;
    expect(patch).toEqual({ numeroPo: PO, parcial: true });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("formulário: validação ao salvar", () => {
  const validar = (numeroPo: string, inicial = formCompleto()) =>
    validarProcessoForm({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "", inicial);

  it("vazio é permitido", () => {
    expect(validar("").valido).toBe(true);
  });

  it("completo é aceito (com ou sem texto livre)", () => {
    expect(validar("PO-25-0123").valido).toBe(true);
    expect(validar("PO-25-0123/ALGO").valido).toBe(true);
  });

  it("incompleto: erro apontando o campo, e não salva", () => {
    for (const v of ["PO-25-01", "PO-", "PO-25", "PO-2"]) {
      const r = validar(v);
      expect(r, v).toEqual({ valido: false, erro: NUMERO_ORDEM_ERRO, campo: "numeroPo" });
    }
  });

  it("sem o 'inicial' (chamada antiga) também valida", () => {
    const r = validarProcessoForm({ ...formCompleto(), numeroPo: "PO-25-01" }, MEDICAMENTOS, [], "");
    expect(r.valido).toBe(false);
  });

  it("valor já gravado fora do formato (e não alterado) não impede salvar outra coisa", () => {
    const inicial = { ...formCompleto(), numeroPo: "LEGADO 123" };
    expect(validar("LEGADO 123", inicial).valido).toBe(true);
    expect(validar("PO-25-01", inicial).valido).toBe(false); // mas alterar para incompleto, não
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

  it("digitar escreve o valor mascarado no estado E no campo", () => {
    const f = useProcessoForm(() => null);
    const c = digitar(f, "po250123/xy");
    expect(f.form.numeroPo).toBe("PO-25-0123/XY");
    expect(c.value).toBe("PO-25-0123/XY");
    expect(c.selectionStart).toBe(13);
  });

  it("colar", () => {
    const f = useProcessoForm(() => null);
    const c = campo("po 25 0123/abc");
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-0123/ABC");
    expect(c.value).toBe("PO-25-0123/ABC");
  });

  it("apagar no meio mantém o cursor no ponto (não vai para o fim)", () => {
    const f = useProcessoForm(() => null);
    f.form.numeroPo = "PO-25-0123";
    const c = campo("PO-25-023", 7); // apagou o "1"
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO-25-023");
    expect(c.selectionStart).toBe(7);
  });

  it("incompleto ao salvar: erro junto ao campo, validar() recusa; digitar limpa o erro", () => {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    digitar(f, "po2501");
    expect(f.erroNumeroPo.value).toBe("");

    const r = f.validar();
    expect(r.valido).toBe(false);
    expect(f.erroNumeroPo.value).toBe(NUMERO_ORDEM_ERRO);

    digitar(f, "23");
    expect(f.erroNumeroPo.value).toBe("");
    const ok = f.validar();
    expect(ok.valido).toBe(true);
    expect(ok.valido && ok.payload.numeroPo).toBe("PO-25-0123");
    expect(f.erroNumeroPo.value).toBe("");
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

    f.form.numeroPo = "PO-26-0009";
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { numeroPo: "PO-26-0009", parcial: true } });
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
    const criado = await criar(corpo({ numeroPo: "  po-25-0123/alfa  " }));
    expect(fake.linhas(T)[0]!.numero_po).toBe("PO-25-0123/ALFA");
    expect(criado.numeroPo).toBe("PO-25-0123/ALFA");
  });

  it("barra final sem texto é removida ao gravar", async () => {
    await criar(corpo({ numeroPo: "PO-25-0123/" }));
    expect(fake.linhas(T)[0]!.numero_po).toBe("PO-25-0123");
  });

  it("formato inválido: 400 com a mensagem em português, e nada é gravado", async () => {
    for (const numeroPo of ["PO-25-01", "25-0123", "PO-25-0123X", "XYZ", 123, true, {}]) {
      await expect(criar(corpo({ numeroPo })), String(numeroPo)).rejects.toMatchObject(recusado);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("vazio, só espaços, null e ausente: permitido (a coluna fica NULL)", async () => {
    for (const extra of [{ numeroPo: "" }, { numeroPo: "   " }, { numeroPo: null }, {}]) {
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
    const atualizado = await patch({ parcial: true, numeroPo: " po-26-0001/beta " });
    expect(row().numero_po).toBe("PO-26-0001/BETA");
    expect(atualizado.numeroPo).toBe("PO-26-0001/BETA");
  });

  it("formato inválido: 400 e a linha não muda", async () => {
    for (const numeroPo of ["PO-26-01", "26-0001", "PO-26-0001X", 7, false]) {
      await expect(patch({ parcial: true, numeroPo }), String(numeroPo)).rejects.toMatchObject(recusado);
    }
    expect(row().numero_po).toBe(PO);
  });

  it("formato inválido recusa também sem 'parcial' (aba antiga que já conhece o campo)", async () => {
    await expect(patch({ numeroPo: "ZZZ" })).rejects.toMatchObject(recusado);
  });

  it("vazio, só espaços e null limpam a coluna", async () => {
    for (const numeroPo of ["", "   ", null]) {
      fake.tabelas[T] = [linhaCompleta()];
      await patch({ parcial: true, numeroPo });
      expect(row().numero_po, JSON.stringify(numeroPo)).toBeNull();
    }
  });

  it("patch sem a chave não toca o Nº Ordem (e não o valida, nem se o gravado for antigo/inválido)", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "LEGADO" })];
    await patch({ parcial: true, localEntrega: "Nova clínica" });
    expect(row().local_entrega).toBe("Nova clínica");
    expect(row().numero_po).toBe("LEGADO");
  });

  it("patch versionado (atualizações) com numeroPo também é validado e normalizado", async () => {
    const novas = [{ data: "02/09", texto: "Nova" }];
    await expect(patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "ruim" })).rejects.toMatchObject(recusado);
    await patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "po-27-0002" });
    expect(row().numero_po).toBe("PO-27-0002");
  });

  it("ida e volta do formulário: editar o Nº Ordem e esvaziar", async () => {
    const processo = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);

    f.form.numeroPo = "PO-28-0003";
    let r = f.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava patch");
    await patch(r.patch);
    expect(row().numero_po).toBe("PO-28-0003");

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
    proc("a", "Maria Silva", "2026 - 100", "PO-25-0123/XYZ"),
    proc("b", "João Souza", "2026 - 375", "PO-25-0999"),
    proc("c", "Ana Lima", "2026 - 200"), // sem Nº Ordem
  ];
  const ids = (termo: string) => filtrarPorBusca(lista, termo).map((p) => p.id);

  it("normalizarOrdem: só letras e números, sem acento/maiúscula", () => {
    expect(normalizarOrdem("PO-25-0123/XYZ")).toBe("po250123xyz");
    expect(normalizarOrdem(" po 25-0123 ")).toBe("po250123");
    expect(normalizarOrdem("---")).toBe("");
    expect(normalizarOrdem("ação/é")).toBe("acaoe");
  });

  it("acha pelo Nº Ordem: minúsculas, sem pontuação, sem prefixo", () => {
    expect(ids("po-25-0123")).toEqual(["a"]);
    expect(ids("PO250123")).toEqual(["a"]);
    expect(ids("25-0123")).toEqual(["a"]);
    expect(ids("25 0123")).toEqual(["a"]);
    expect(ids("po-25-0123/xyz")).toEqual(["a"]);
    expect(ids("xyz")).toEqual(["a"]);
  });

  it("prefixo comum acha todos que o têm", () => {
    expect(ids("PO-25")).toEqual(["a", "b"]);
  });

  it("paciente e pasta continuam funcionando", () => {
    expect(ids("maria")).toEqual(["a"]);
    expect(ids("SOUZA")).toEqual(["b"]);
    expect(ids("2026 - 200")).toEqual(["c"]);
    expect(ids("2026-375")).toEqual(["b"]);
    expect(ids("375")).toEqual(["b"]);
  });

  it("processo sem Nº Ordem não casa por ele", () => {
    expect(ids("po")).toEqual(["a", "b"]);
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
