import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { montarPatchDiferencial } from "../../app/utils/processoFormPayload";
import { DESPACHANTE_OPTIONS, MODAL_ENVIO_OPTIONS } from "../../app/utils/processoOptions";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  ATUALIZACOES,
  VERSAO,
  editado,
  estadoCompleto,
  linhaCompleta,
} from "./helpers/processoEdicaoFixtures";

// Item 1d — a edição do processo envia SOMENTE o que o usuário alterou (patch diferencial).
// O handler do PATCH e o processosStore são os REAIS; só h3 e o Supabase (em memória) são simulados.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: handler } = await import("../../server/api/processos/[id].patch");
const { isValidProcessoPatch } = await import("../../server/utils/processoValidation");

const T = "follow_up";
const row = () => fake.linhas(T).find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];

async function enviar(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede: `undefined` some
  return handler(evento);
}

// "Abre o Editar processo" a partir de uma linha do banco, pelo carregador REAL do formulário.
function abrir(extra: Record<string, unknown> = {}) {
  const processo: Processo = montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);
  return useProcessoForm(() => processo);
}

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()];
  fake.chamadas.length = 0;
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (a) Ida e volta com valores reais: carregar, NÃO mexer, salvar → patch vazio (nada é apagado).
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("ida e volta: abrir e salvar sem alterar não envia nada", () => {
  const COURIER_SIMPLES = { modal_envio: "Courier Simples" };

  const VALORES: Array<[string, Record<string, unknown>]> = [
    ...["Andreza Faconi", "Marcelo Lima", "Andreza Bernardes"].map(
      (v): [string, Record<string, unknown>] => [`despachante ${v}`, { despachante: v }],
    ),
    ["despachante null", { despachante: null, ...COURIER_SIMPLES }],
    ...["Speciality - Índia", "Pharyx - China", "Poros - Turquia", "Venecza", "Baiyue", "Beldimed - Bélgica", "Can Pharma", "Medlin", "Tosun"].map(
      (v): [string, Record<string, unknown>] => [`fornecedor ${v}`, { fornecedor: v }],
    ),
    ["fornecedor null", { fornecedor: null }],
    ["fornecedor com espaços ao redor", { fornecedor: "  Venecza  " }],
    ["modal Air Cargo", { modal_envio: "Air Cargo" }],
    ["modal Courier Simples", COURIER_SIMPLES],
    ["modal Courier Formal", { modal_envio: "Courier Formal" }],
    ["modal null", { modal_envio: null }],
    ["modal legado 'Courier'", { modal_envio: "Courier" }],
    ["ordem null", { ordem: null }],
    ...["Ordem 1", "Ordem 2", "Ordem 5"].map((v): [string, Record<string, unknown>] => [`ordem ${v}`, { ordem: v }]),
    // Não representáveis pelo campo (o formulário os carrega como vazio):
    ["ordem fora do formato 'Ordem 2 (complemento)'", { ordem: "Ordem 2 (complemento)" }],
    ["ordem só o número '2'", { ordem: "2" }],
    ["ordem minúscula 'ordem 3 '", { ordem: "ordem 3 " }],
    ["responsável Rebeca", { responsavel_operacional: "Rebeca" }],
    ["responsável Bruno", { responsavel_operacional: "Bruno" }],
    ["responsável legado fora da lista", { responsavel_operacional: "Rebeca Alcântara" }],
    ["pagamento null", { status_pagamento: null }],
    ["pagamento pago", { status_pagamento: "pago" }],
    ["transportadora AJC", { transportadora_nacional_nome: "AJC" }],
    ["transportadora Doctor", { transportadora_nacional_nome: "Doctor" }],
    [
      "transportadora null",
      { transportadora_nacional_nome: null, transportadora_nacional_cotacao: null, transportadora_nacional_valor: null },
    ],
    ["transportadora com valor 0 (o formulário o descarta ao montar o payload)", { transportadora_nacional_valor: 0 }],
    ["transportadora com valor decimal", { transportadora_nacional_valor: 1808.56 }],
    ["empresa FARMAURORA", { empresa: "FARMAURORA" }],
    ["empresa MAINZFARMA", { empresa: "MAINZFARMA" }],
    ["data com texto livre", { data_embarque: "05/09 (China adiantou o processo)" }],
    ["data com espaços", { data_compra_po: "  05/09  " }],
    ["data inválida 'ASD'", { registro_lpco: "ASD" }],
    ["medicamento sem nome (descartado ao montar o payload)", { medicamentos: [{ nome: "", dosagem: "10MG" }, { nome: "DROGA" }] }],
    ["pendência vazia e com espaços", { pendencias: ["", "  Enviar laudo  "] }],
    ["status Outro com texto", { status: "outro", status_outro: "Aguardando X" }],
  ];

  it.each(VALORES)("%s", (_nome, extra) => {
    const f = abrir(extra);
    const r = f.validarEdicao();

    expect(r.valido).toBe(true);
    if (r.valido) expect(r.patch).toBeNull();
  });

  it("valores fora das listas continuam no estado do formulário (o select só mostra 'Selecione')", () => {
    const desp = abrir({ despachante: "Andreza Bernardes" });
    expect(DESPACHANTE_OPTIONS.map((o) => o.value)).not.toContain("Andreza Bernardes");
    expect(desp.form.despachante).toBe("Andreza Bernardes");

    const modal = abrir({ modal_envio: "Courier" });
    expect(MODAL_ENVIO_OPTIONS.map((o) => o.value)).not.toContain("Courier");
    expect(modal.form.modalEnvio).toBe("Courier");

    const forn = abrir({ fornecedor: "Venecza" });
    expect(forn.fornecedor.state.select).toBe("Outro");
    expect(forn.fornecedor.state.outroTexto).toBe("Venecza");

    const ordem = abrir({ ordem: "Ordem 2 (complemento)" });
    expect(ordem.form.ordem).toBe(""); // não representável: carrega vazio
  });

  it("salvar sem alterar um valor não representável nunca o apaga no banco (nenhum PATCH é enviado)", () => {
    const f = abrir({ ordem: "Ordem 2 (complemento)", despachante: "Andreza Bernardes", modal_envio: "Courier" });
    const r = f.validarEdicao();
    expect(r).toEqual({ valido: true, patch: null });
    expect(fake.chamadas).toHaveLength(0);
  });

  it("alterar OUTRO campo ao lado de um valor não representável não leva o valor junto", async () => {
    fake.tabelas[T] = [linhaCompleta({ ordem: "Ordem 2 (complemento)", despachante: "Andreza Bernardes" })];
    const f = abrir({ ordem: "Ordem 2 (complemento)", despachante: "Andreza Bernardes" });
    f.form.localEntrega = "Outro lugar";

    const r = f.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava um patch");
    expect(r.patch).toEqual({ localEntrega: "Outro lugar", parcial: true });

    await enviar(r.patch);
    expect(row().ordem).toBe("Ordem 2 (complemento)");
    expect(row().despachante).toBe("Andreza Bernardes");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (b) (c) só o campo alterado; só o campo esvaziado.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("o patch traz só o que mudou", () => {
  it("(b) mudar um campo envia só ele", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.localEntrega = "Outro lugar")));
    expect(patch).toEqual({ localEntrega: "Outro lugar", parcial: true });
  });

  it("(c) esvaziar um campo envia null só dele", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroAwb = "")));
    expect(patch).toEqual({ numeroAwb: null, parcial: true });
  });

  it("nada alterado: patch null", () => {
    expect(montarPatchDiferencial(estadoCompleto(), estadoCompleto())).toBeNull();
  });

  it("trocar um valor por outro e voltar ao original: patch null", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroAwb = "957-12345678  ")));
    expect(patch).toBeNull(); // só difere por espaço (a normalização aparece o trim)
  });

  it("obrigatórios só vão se mudaram", () => {
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.paciente = "Beltrano")))).toEqual({
      paciente: "Beltrano",
      parcial: true,
    });
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.consultor = "Bráulio")))).toEqual({
      consultor: "Bráulio",
      parcial: true,
    });
  });

  it("ordem: o número é convertido para o rótulo e só vai se mudou", () => {
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.ordem = "3")))).toEqual({
      ordem: "Ordem 3",
      parcial: true,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (d) (e) datas.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("datas", () => {
  it("(d) editar uma data envia só a chave dela; as outras 8 não são limpas no banco", async () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.previsaoEntrega = "21/09")));
    expect(patch).toEqual({ datas: { previsaoEntrega: "21/09" }, parcial: true });

    await enviar(patch);
    expect(row().previsao_entrega).toBe("21/09");
    expect(row().data_compra_po).toBe("01/09");
    expect(row().data_embarque).toBe("05/09");
    expect(row().abertura_thread).toBe("06/09");
    expect(row().data_chegada_brasil).toBe("10/09");
    expect(row().registro_radar).toBe("11/09");
    expect(row().registro_duimp).toBe("12/09");
    expect(row().registro_lpco).toBe("13/09");
    expect(row().suposta_estimativa).toBe("fim de setembro");
  });

  it("esvaziar uma data envia a chave com null", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.registroLpco = "")));
    expect(patch).toEqual({ datas: { registroLpco: null }, parcial: true });
  });

  it("(e) servidor, formato novo (parcial): chave de data ausente NÃO limpa; null limpa", async () => {
    await enviar({ parcial: true, datas: { dataEmbarque: null } });
    expect(row().data_embarque).toBeNull();
    expect(row().data_compra_po).toBe("01/09");
    expect(row().previsao_entrega).toBe("20/09");

    await enviar({ parcial: true, datas: {} });
    expect(row().data_compra_po).toBe("01/09");
  });

  it("(e) servidor, formato ANTIGO (sem parcial): datas completas ainda aceitas — e chave ausente continua limpando, como sempre", async () => {
    // O que a versão antiga do JavaScript manda: o objeto `datas` com as datas PREENCHIDAS.
    const corpoAntigo = {
      datas: { dataCompraPO: "02/09", previsaoEntrega: "22/09" },
      medicamentos: [],
      pendencias: [],
    };
    expect(isValidProcessoPatch(corpoAntigo)).toBe(true);
    await enviar(corpoAntigo);

    expect(row().data_compra_po).toBe("02/09");
    expect(row().previsao_entrega).toBe("22/09");
    expect(row().data_embarque).toBeNull(); // formato antigo: ausente = limpa (nada a mais que antes)
  });

  it("formato antigo: transportadora completa substitui as três colunas, como sempre", async () => {
    await enviar({ transportadoraNacional: { nome: "Doctor" } });
    expect(row().transportadora_nacional_nome).toBe("Doctor");
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
  });

  it("parcial: valores de data que não são texto/null são recusados", () => {
    expect(isValidProcessoPatch({ parcial: true, datas: { dataEmbarque: 5 } })).toBe(false);
    expect(isValidProcessoPatch({ parcial: true, datas: { dataEmbarque: null } })).toBe(true);
    expect(isValidProcessoPatch({ parcial: "sim" })).toBe(false);
  });

  it("colunasDeDTO: parcial só monta as colunas das chaves presentes", () => {
    expect(colunasDeDTO({ datas: { dataEmbarque: "10/10" } }, { parcial: true })).toEqual({ data_embarque: "10/10" });
    expect(colunasDeDTO({ datas: { dataEmbarque: null } }, { parcial: true })).toEqual({ data_embarque: null });
    // sem parcial (criação / formato antigo): as 9 colunas
    expect(Object.keys(colunasDeDTO({ datas: { dataEmbarque: "10/10" } }))).toHaveLength(9);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// transportadora por chave
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("transportadora por chave", () => {
  it("mudar só a cotação envia só a cotação", async () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.transportadoraCotacao = "COT-10")));
    expect(patch).toEqual({ transportadoraNacional: { cotacao: "COT-10" }, parcial: true });

    await enviar(patch);
    expect(row().transportadora_nacional_cotacao).toBe("COT-10");
    expect(row().transportadora_nacional_nome).toBe("AJC");
    expect(row().transportadora_nacional_valor).toBe(1500);
  });

  it("mudar só o valor envia só o valor (número)", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.transportadoraValor = "1600.5")));
    expect(patch).toEqual({ transportadoraNacional: { valor: 1600.5 }, parcial: true });
  });

  it("esvaziar o nome envia transportadoraNacional: null e limpa as três colunas", async () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.transportadoraNome = "")));
    expect(patch).toEqual({ transportadoraNacional: null, parcial: true });

    await enviar(patch);
    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
  });

  it("servidor, parcial: nome null dentro do objeto também limpa as três (sem nome não há transportadora)", async () => {
    await enviar({ parcial: true, transportadoraNacional: { nome: null } });
    expect(row().transportadora_nacional_nome).toBeNull();
    expect(row().transportadora_nacional_cotacao).toBeNull();
    expect(row().transportadora_nacional_valor).toBeNull();
  });

  it("não havia transportadora e o usuário digitou só o nome: vai só o nome", () => {
    const inicial = estadoCompleto();
    Object.assign(inicial.form, { transportadoraNome: "", transportadoraCotacao: "", transportadoraValor: "" });
    const atual = estadoCompleto();
    Object.assign(atual.form, { transportadoraNome: "Doctor", transportadoraCotacao: "", transportadoraValor: "" });
    expect(montarPatchDiferencial(inicial, atual)).toEqual({
      transportadoraNacional: { nome: "Doctor" },
      parcial: true,
    });
  });

  it("parcial: formato inválido da transportadora é recusado", () => {
    expect(isValidProcessoPatch({ parcial: true, transportadoraNacional: { valor: "1" } })).toBe(false);
    expect(isValidProcessoPatch({ parcial: true, transportadoraNacional: { nome: "" } })).toBe(false);
    expect(isValidProcessoPatch({ parcial: true, transportadoraNacional: { cotacao: null, valor: null } })).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (f) status + statusOutro
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("status + statusOutro viajam juntos", () => {
  function emOutro(texto: string): ReturnType<typeof estadoCompleto> {
    const e = estadoCompleto();
    e.form.status = "outro";
    e.form.statusOutro = texto;
    return e;
  }

  it("mudar só o texto do status 'Outro' envia status + statusOutro", async () => {
    fake.tabelas[T] = [linhaCompleta({ status: "outro", status_outro: "Aguardando X" })];
    const inicial = emOutro("Aguardando X");
    const atual = emOutro("Aguardando Y");

    const patch = montarPatchDiferencial(inicial, atual);
    expect(patch).toEqual({ status: "outro", statusOutro: "Aguardando Y", parcial: true });
    expect(isValidProcessoPatch(JSON.parse(JSON.stringify(patch)))).toBe(true);

    await enviar(patch);
    expect(row().status).toBe("outro");
    expect(row().status_outro).toBe("Aguardando Y");
  });

  it("ir para 'Outro' com texto envia os dois", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), emOutro("Novo"));
    expect(patch).toEqual({ status: "outro", statusOutro: "Novo", parcial: true });
  });

  it("sair de 'Outro' envia só o status — o servidor zera o texto", async () => {
    fake.tabelas[T] = [linhaCompleta({ status: "outro", status_outro: "Aguardando X" })];
    const atual = estadoCompleto();
    atual.form.status = "entregue";

    const patch = montarPatchDiferencial(emOutro("Aguardando X"), atual);
    expect(patch).toEqual({ status: "entregue", parcial: true });

    await enviar(patch);
    expect(row().status).toBe("entregue");
    expect(row().status_outro).toBeNull();
  });

  it("mudar OUTRO campo não manda status nem statusOutro (o texto do 'Outro' fica intacto)", async () => {
    fake.tabelas[T] = [linhaCompleta({ status: "outro", status_outro: "Aguardando X" })];
    const inicial = emOutro("Aguardando X");
    const atual = emOutro("Aguardando X");
    atual.form.localEntrega = "Outro lugar";

    const patch = montarPatchDiferencial(inicial, atual);
    expect(patch).toEqual({ localEntrega: "Outro lugar", parcial: true });

    await enviar(patch);
    expect(row().status).toBe("outro");
    expect(row().status_outro).toBe("Aguardando X");
  });

  it("o servidor continua recusando statusOutro sozinho (sem status)", () => {
    expect(isValidProcessoPatch({ statusOutro: "x", parcial: true })).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (g) (h) atualizações/alertas intocados; blocos só vão se mudaram.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("blocos e o que o formulário não controla", () => {
  it("(g) atualizações e alertas resolvidos nunca vão e ficam intactos", async () => {
    const patch = montarPatchDiferencial(
      estadoCompleto(),
      editado((e) => {
        e.form.localEntrega = "Outro lugar";
        e.pendencias = ["Nova"];
      }),
    );
    expect(patch).not.toHaveProperty("atualizacoes");
    expect(patch).not.toHaveProperty("alertaFornecedorResolvido");
    expect(patch).not.toHaveProperty("alertaMandadoResolvido");

    await enviar(patch);
    expect(row().atualizacoes).toEqual(ATUALIZACOES);
    expect(row().alerta_fornecedor_resolvido).toBe(true);
    expect(row().alerta_mandado_resolvido).toBe(true);
  });

  it("(h) pendências e medicamentos NÃO mudaram: nenhuma das duas listas vai", () => {
    const patch = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.localEntrega = "X")));
    expect(patch).not.toHaveProperty("pendencias");
    expect(patch).not.toHaveProperty("medicamentos");
    expect(patch).not.toHaveProperty("datas");
    expect(patch).not.toHaveProperty("transportadoraNacional");
  });

  it("(h) pendência alterada: vai a lista inteira (substitui, como sempre)", async () => {
    const patch = montarPatchDiferencial(
      estadoCompleto(),
      editado((e) => (e.pendencias = ["Enviar laudo", "Ligar para a clínica"])),
    );
    expect(patch).toEqual({ pendencias: ["Enviar laudo", "Ligar para a clínica"], parcial: true });

    await enviar(patch);
    expect(row().pendencias).toEqual(["Enviar laudo", "Ligar para a clínica"]);
  });

  it("(h) medicamento alterado: vai a lista inteira, normalizada", () => {
    const patch = montarPatchDiferencial(
      estadoCompleto(),
      editado((e) => {
        e.medicamentos = [
          { nome: "DROGA", dosagem: "10MG", quantidade: "2" },
          { nome: "OUTRA", dosagem: "", quantidade: "" },
        ];
      }),
    );
    expect(patch).toEqual({
      medicamentos: [
        { nome: "DROGA", dosagem: "10MG", quantidade: "2" },
        { nome: "OUTRA" },
      ],
      parcial: true,
    });
  });

  it("(h) só reordenar espaços numa pendência não é alteração", () => {
    expect(montarPatchDiferencial(estadoCompleto(), editado((e) => (e.pendencias = ["  Enviar laudo "])))).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// (i) edição concorrente: A abre, B grava, A salva outra coisa — o que B gravou permanece.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("(i) edição concorrente no Supabase em memória", () => {
  function linhaVaziaDeAwb() {
    return linhaCompleta({
      numero_awb: null,
      data_chegada_brasil: null,
      pendencias: [],
      transportadora_nacional_nome: null,
      transportadora_nacional_cotacao: null,
      transportadora_nacional_valor: null,
      companhia_aerea: null,
    });
  }

  it("A carrega; B grava AWB, data, pendência, cia e transportadora; A edita só o local de entrega: tudo de B permanece", async () => {
    fake.tabelas[T] = [linhaVaziaDeAwb()];
    // A abre o formulário com o processo como estava (sem AWB, ...).
    const pessoaA = useProcessoForm(() => montarProcesso(linhaVaziaDeAwb() as unknown as FollowUpRow));

    // B grava, pelo mesmo caminho de sempre (PATCH).
    await enviar({
      parcial: true,
      numeroAwb: "AWB-DE-B",
      companhiaAerea: "Emirates",
      datas: { dataChegadaBrasil: "15/09" },
      pendencias: ["Pendência de B"],
      transportadoraNacional: { nome: "Doctor", cotacao: "C-1", valor: 99 },
    });
    expect(row().numero_awb).toBe("AWB-DE-B");

    // A, com a tela velha, altera só o local de entrega e salva.
    pessoaA.form.localEntrega = "Clínica nova";
    const r = pessoaA.validarEdicao();
    if (!r.valido || !r.patch) throw new Error("esperava um patch");
    expect(r.patch).toEqual({ localEntrega: "Clínica nova", parcial: true });
    await enviar(r.patch);

    expect(row().local_entrega).toBe("Clínica nova");
    expect(row().numero_awb).toBe("AWB-DE-B");
    expect(row().companhia_aerea).toBe("Emirates");
    expect(row().data_chegada_brasil).toBe("15/09");
    expect(row().pendencias).toEqual(["Pendência de B"]);
    expect(row().transportadora_nacional_nome).toBe("Doctor");
    expect(row().transportadora_nacional_valor).toBe(99);
  });

  it("A e B alteram campos diferentes: as duas alterações valem", async () => {
    fake.tabelas[T] = [linhaVaziaDeAwb()];
    const pessoaA = useProcessoForm(() => montarProcesso(linhaVaziaDeAwb() as unknown as FollowUpRow));
    const pessoaB = useProcessoForm(() => montarProcesso(linhaVaziaDeAwb() as unknown as FollowUpRow));

    pessoaB.form.numeroAwb = "AWB-DE-B";
    const rb = pessoaB.validarEdicao();
    if (!rb.valido || !rb.patch) throw new Error("patch de B");
    await enviar(rb.patch);

    pessoaA.form.localEntrega = "Clínica nova";
    const ra = pessoaA.validarEdicao();
    if (!ra.valido || !ra.patch) throw new Error("patch de A");
    await enviar(ra.patch);

    expect(row().numero_awb).toBe("AWB-DE-B");
    expect(row().local_entrega).toBe("Clínica nova");
  });
});
