import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { CAMPOS_PROCESSO_LIMPAVEIS } from "#shared/constants/processos";
import { NUMERO_PO_ERRO } from "#shared/utils/numeroPo";
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

// Campo "PO" do Follow-Up (numeroPo / coluna numero_po), no formato da DIR (PO26-10-0471; só vazio ou PO COMPLETO):
// mapper, payload, patch diferencial, servidor (POST e PATCH), formulário e busca. A máscara e as travas do formato
// (mesma regex da DIR, mesma regra do CHECK do banco) estão em numeroPo.spec.ts.
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
const PO = "PO26-10-0471"; // o valor das fixtures
const recusado = { statusCode: 400, statusMessage: NUMERO_PO_ERRO };

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
    expect(colunasDeDTO({ numeroPo: "PO26-10-0471" })).toEqual({ numero_po: "PO26-10-0471" });
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
  const base = (numeroPo: string) => buildBasePayload({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "").numeroPo;

  it("vai normalizado (maiúsculas, sem espaços)", () => {
    expect(base("po26-10-0471")).toBe("PO26-10-0471");
    expect(base("  PO26-10-0471  ")).toBe("PO26-10-0471");
    expect(base("PO 26-10 - 0471")).toBe("PO26-10-0471");
  });

  it("o payload só normaliza: quem recusa incompleto é a validação (validarProcessoForm), não este montador", () => {
    expect(base("PO26-1")).toBe("PO26-1");
    expect(base("PO26")).toBe("PO26");
  });

  it("vazio, só espaços e 'PO' sozinho viram undefined (campo opcional)", () => {
    expect(base("PO")).toBeUndefined();
    expect(base("")).toBeUndefined();
    expect(base("  ")).toBeUndefined();
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
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "PO26-11-0001")))!;
    expect(patch).toEqual({ numeroPo: "PO26-11-0001", parcial: true });
  });

  it("só mudou a forma de escrever (minúsculas/espaços): continua não enviando", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = " po26-10-0471 ")));
    expect(patch).toBeNull();
  });

  it("esvaziar vira null", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "")))!;
    expect(patch).toEqual({ numeroPo: null, parcial: true });
    // "PO" (sobrou só o prefixo da máscara) também esvazia
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroPo = "PO")))).toEqual({
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
describe("formulário: só vazio ou PO COMPLETO salva", () => {
  const validar = (numeroPo: string, inicial = formCompleto()) =>
    validarProcessoForm({ ...formCompleto(), numeroPo }, MEDICAMENTOS, [], "", inicial);

  it("vazio, 'PO' sozinho e o PO completo salvam", () => {
    for (const v of ["", "  ", "PO", "PO26-10-0471", "po26-10-0471", " PO26-10-0471 "]) {
      expect(validar(v).valido, v).toBe(true);
    }
  });

  it("incompleto é RECUSADO, com a mensagem do formato correto", () => {
    for (const v of ["PO2", "PO26", "PO26-1", "PO26-10", "PO26-10-0", "PO26-10-04", "PO26-10-047"]) {
      expect(validar(v), v).toEqual({ valido: false, erro: NUMERO_PO_ERRO });
    }
  });

  it("o formato antigo (hífen depois de PO, sufixo /n) é RECUSADO", () => {
    for (const v of ["PO-", "PO-25", "PO-25-2652", "PO-25-2652/3", "PO-25-11/"]) {
      expect(validar(v), v).toEqual({ valido: false, erro: NUMERO_PO_ERRO });
    }
  });

  it("o payload leva o valor normalizado; 'PO' sozinho não leva nada", () => {
    const r = validar("po26-10-0471");
    expect(r.valido && r.payload.numeroPo).toBe("PO26-10-0471");
    const vazio = validar("PO");
    expect(vazio.valido && vazio.payload.numeroPo).toBeUndefined();
  });

  it("edição: um valor antigo fora do formato, IGUAL ao que o processo já tinha, não impede salvar os outros campos", () => {
    const inicial = { ...formCompleto(), numeroPo: "LEGADO 123" };
    expect(validar("LEGADO 123", inicial).valido).toBe(true);
    expect(validar("LEGADO123", inicial).valido).toBe(true); // mesma coisa escrita de outro jeito (normaliza igual)
    expect(validar("LEGADO 124", inicial)).toEqual({ valido: false, erro: NUMERO_PO_ERRO }); // mudou: vale a regra
    expect(validar("PO26-10-0471", inicial).valido).toBe(true); // trocar por um válido
  });

  it("criação (sem valor anterior): inválido é sempre recusado", () => {
    expect(validarProcessoForm({ ...formCompleto(), numeroPo: "LEGADO 123" }, MEDICAMENTOS, [], "")).toEqual({
      valido: false,
      erro: NUMERO_PO_ERRO,
    });
  });

  it("o PO inválido vem depois do paciente e da pasta, antes do consultor", () => {
    expect(validarProcessoForm({ ...formCompleto(), paciente: "", numeroPo: "PO2" }, MEDICAMENTOS, [], "")).toEqual({
      valido: false,
      erro: "Informe o nome do paciente.",
    });
    expect(validarProcessoForm({ ...formCompleto(), consultor: "", numeroPo: "PO2" }, MEDICAMENTOS, [], "")).toEqual({
      valido: false,
      erro: NUMERO_PO_ERRO,
    });
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

  it("digitar escreve o valor mascarado no estado E no campo (hífens automáticos; extras descartados)", () => {
    const f = useProcessoForm(() => null);
    const c = digitar(f, "po26100471xy99");
    expect(f.form.numeroPo).toBe("PO26-10-0471");
    expect(c.value).toBe("PO26-10-0471");
    expect(c.selectionStart).toBe(12);
  });

  it("digitar os hífens à mão dá o mesmo resultado", () => {
    const f = useProcessoForm(() => null);
    digitar(f, "po26-10-0471");
    expect(f.form.numeroPo).toBe("PO26-10-0471");
  });

  it("colar: 'po26100471', 'PO26-10-0471' e '26-10-0471' viram PO26-10-0471", () => {
    for (const colado of ["po26100471", "PO26-10-0471", "26-10-0471", "po 26 10 0471"]) {
      const f = useProcessoForm(() => null);
      const c = campo(colado);
      f.onNumeroPoInput(evento(c));
      expect(f.form.numeroPo, colado).toBe("PO26-10-0471");
      expect(c.value, colado).toBe("PO26-10-0471");
    }
  });

  it("apagar no meio mantém o cursor no ponto (não vai para o fim)", () => {
    const f = useProcessoForm(() => null);
    f.form.numeroPo = "PO26-10-0471";
    const c = campo("PO2-10-0471", 3); // apagou o "6" do ano
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO21-00-471");
    expect(c.selectionStart).toBe(3);
  });

  it("apagar no fim passa por PO26-10-0471 → PO26-10-047 → ... → PO26-1 → PO26", () => {
    const f = useProcessoForm(() => null);
    f.form.numeroPo = "PO26-10-0471";
    const c = campo("PO26-10-047");
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO26-10-047");
    f.form.numeroPo = "PO26-1";
    c.value = "PO26-";
    c.selectionStart = 5;
    f.onNumeroPoInput(evento(c));
    expect(f.form.numeroPo).toBe("PO26"); // o hífen nunca fica pendurado
  });

  it("incompleto NÃO salva: validar() recusa com a mensagem do formato e o payload não sai", () => {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    digitar(f, "po2610");
    expect(f.form.numeroPo).toBe("PO26-10");

    expect(f.validar()).toEqual({ valido: false, erro: NUMERO_PO_ERRO });
  });

  it("completo salva e o payload leva o valor", () => {
    const f = useProcessoForm(() => null);
    f.form.paciente = "Fulano";
    f.form.pasta = "2026 - 1";
    f.form.consultor = "Dani";
    digitar(f, "po26100471");
    const r = f.validar();
    expect(r.valido).toBe(true);
    expect(r.valido && r.payload.numeroPo).toBe("PO26-10-0471");
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

    f.form.numeroPo = "PO26-11-0009";
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { numeroPo: "PO26-11-0009", parcial: true } });

    f.form.numeroPo = "PO26-11";
    expect(f.validarEdicao()).toEqual({ valido: false, erro: NUMERO_PO_ERRO }); // incompleto: não salva
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
    const criado = await criar(corpo({ numeroPo: "  po26-10-0471  " }));
    expect(fake.linhas(T)[0]!.numero_po).toBe("PO26-10-0471");
    expect(criado.numeroPo).toBe("PO26-10-0471");
  });

  it("aceita o PO completo (com variações de caixa e espaços, que são normalizadas)", async () => {
    for (const [enviado, gravado] of [
      ["PO26-10-0471", "PO26-10-0471"],
      ["po26-10-0471", "PO26-10-0471"],
      ["PO 26-10-0471", "PO26-10-0471"],
      ["PO00-00-0000", "PO00-00-0000"],
    ] as const) {
      await criar(corpo({ numeroPo: enviado }));
      expect(fake.linhas(T)[0]!.numero_po, enviado).toBe(gravado);
    }
  });

  it("incompleto e formato antigo: 400 com a mensagem do formato correto, e nada é gravado", async () => {
    for (const numeroPo of [
      "PO2", "PO26", "PO26-1", "PO26-10", "PO26-10-", "PO26-10-0", "PO26-10-047", // incompleto
      "PO-25-2652", "PO-25-2652/3", "PO-25-11/", "PO-25", "PO-", // formato antigo
      "PO26-10-04711", "PO26-10-0471/1", "PO26100471", "XX26-10-0471", "26-10-0471", // outros formatos
    ]) {
      await expect(criar(corpo({ numeroPo })), numeroPo).rejects.toMatchObject(recusado);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("valor que não é texto: 400", async () => {
    for (const numeroPo of [123, true, {}, []]) {
      await expect(criar(corpo({ numeroPo })), JSON.stringify(numeroPo)).rejects.toMatchObject(recusado);
    }
  });

  it("vazio, só espaços, 'PO' sozinho, null e ausente: permitido, a coluna fica NULL", async () => {
    for (const extra of [{ numeroPo: "" }, { numeroPo: "   " }, { numeroPo: "PO" }, { numeroPo: null }, {}]) {
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
    const atualizado = await patch({ parcial: true, numeroPo: " po26-11-0002 " });
    expect(row().numero_po).toBe("PO26-11-0002");
    expect(atualizado.numeroPo).toBe("PO26-11-0002");
  });

  it("incompleto e formato antigo: 400 e a linha não muda", async () => {
    for (const numeroPo of [
      "PO26", "PO26-1", "PO26-11", "PO26-11-", "PO26-11-000", // incompleto
      "PO-26-0001", "PO-26-0001/1", "PO-26", "PO-", // formato antigo
      "PO26-11-00001", "PO26-11-0001/X", "PO261100001", "XX26-11-0001", "26-11-0001", 7, false,
    ]) {
      await expect(patch({ parcial: true, numeroPo }), String(numeroPo)).rejects.toMatchObject(recusado);
    }
    expect(row().numero_po).toBe(PO);
  });

  it("formato inválido recusa também sem 'parcial' (aba antiga que já conhece o campo)", async () => {
    await expect(patch({ numeroPo: "ZZZ" })).rejects.toMatchObject(recusado);
  });

  it("vazio, só espaços, 'PO' sozinho e null limpam a coluna", async () => {
    for (const numeroPo of ["", "   ", "PO", null]) {
      fake.tabelas[T] = [linhaCompleta()];
      await patch({ parcial: true, numeroPo });
      expect(row().numero_po, JSON.stringify(numeroPo)).toBeNull();
    }
  });

  it("patch sem a chave não toca o PO (e não o valida, nem se o gravado for antigo/inválido)", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })]; // formato antigo, de antes da regra
    await patch({ parcial: true, localEntrega: "Nova clínica" });
    expect(row().local_entrega).toBe("Nova clínica");
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
  });

  it("valor antigo inválido reenviado SEM mudar não impede salvar os outros campos", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })];
    await patch({ numeroPo: "po-25-0123/alfa", localEntrega: "Outra clínica" }); // formato antigo do PATCH: manda tudo
    expect(row().local_entrega).toBe("Outra clínica");
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
  });

  it("valor antigo inválido: MUDAR para outro inválido é recusado; para um válido, grava", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: "PO-25-0123/ALFA" })];
    await expect(patch({ parcial: true, numeroPo: "PO-25-0123/BETA" })).rejects.toMatchObject(recusado);
    expect(row().numero_po).toBe("PO-25-0123/ALFA");
    await patch({ parcial: true, numeroPo: "PO26-11-0004" });
    expect(row().numero_po).toBe("PO26-11-0004");
  });

  it("valor que não é texto nunca passa pela exceção do 'igual ao gravado'", async () => {
    fake.tabelas[T] = [linhaCompleta({ numero_po: null })];
    await expect(patch({ parcial: true, numeroPo: 7 })).rejects.toMatchObject(recusado);
  });

  it("patch versionado (atualizações) com numeroPo também é validado e normalizado", async () => {
    const novas = [{ data: "02/09", texto: "Nova" }];
    await expect(patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "ruim" })).rejects.toMatchObject(recusado);
    await patch({ atualizacoes: novas, versao: VERSAO, numeroPo: "po27-01-0002" });
    expect(row().numero_po).toBe("PO27-01-0002");
  });

  it("ida e volta do formulário: editar o PO e esvaziar", async () => {
    const processo = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);

    f.form.numeroPo = "PO28-02-0003";
    let r = f.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava patch");
    await patch(r.patch);
    expect(row().numero_po).toBe("PO28-02-0003");

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
    proc("a", "Maria Silva", "2026 - 100", "PO26-10-0471"),
    proc("b", "João Souza", "2026 - 375", "PO26-11-0002"),
    proc("c", "Ana Lima", "2026 - 200"), // sem PO
  ];
  const ids = (termo: string) => filtrarPorBusca(lista, termo).map((p) => p.id);

  it("normalizarOrdem: só letras e números, sem acento/maiúscula", () => {
    expect(normalizarOrdem("PO26-10-0471")).toBe("po26100471");
    expect(normalizarOrdem(" po 26-10 ")).toBe("po2610");
    expect(normalizarOrdem("---")).toBe("");
    expect(normalizarOrdem("ação/é")).toBe("acaoe");
  });

  it("PO26-10-0471 é achado por variações de maiúsculas, pontuação, espaços e prefixo", () => {
    for (const termo of [
      "po26100471", "PO26100471", "PO26-10-0471", "po26-10-0471", "26-10-0471", "26100471", "26 10 0471",
      "po 26 10 0471", "10-0471", "0471", "10 0471", "po-26-10-0471",
    ]) {
      expect(ids(termo), termo).toEqual(["a"]);
    }
  });

  it("PO26-10-0471: acha pelo valor inteiro e por um trecho do meio (261004); outro ano (PO25-10-0471) não acha", () => {
    expect(ids("PO26-10-0471")).toEqual(["a"]);
    expect(ids("261004")).toEqual(["a"]);
    expect(ids("PO25-10-0471")).toEqual([]);
  });

  it("PO26-11-0002 é achado por variações", () => {
    for (const termo of ["po26110002", "PO26-11-0002", "26-11-0002", "26110002", "11-0002", "0002", "po 26 11 0002"]) {
      expect(ids(termo), termo).toEqual(["b"]);
    }
  });

  it("prefixo comum acha todos que o têm; um termo só existe junto no mesmo valor", () => {
    expect(ids("PO26")).toEqual(["a", "b"]);
    expect(ids("po")).toEqual(["a", "b"]);
    // "PO26100002" junta o ano e o mês de um com a sequência do outro: não está contido em nenhum dos dois
    expect(ids("PO26100002")).toEqual([]);
  });

  it("paciente e pasta continuam funcionando", () => {
    expect(ids("maria")).toEqual(["a"]);
    expect(ids("SOUZA")).toEqual(["b"]);
    expect(ids("2026 - 200")).toEqual(["c"]);
    expect(ids("2026-375")).toEqual(["b"]);
    expect(ids("375")).toEqual(["b"]);
  });

  it("processo sem PO não casa por ele", () => {
    const termo = criarTermoBusca("PO26")!;
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
