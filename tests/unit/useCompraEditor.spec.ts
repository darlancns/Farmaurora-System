import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Compra, CompraSalvarDTO } from "../../shared/types/compra";
import { validarCompraSalvar } from "../../shared/utils/compraValidacao";
import { corpoParaSalvar } from "../../shared/utils/compraPayload";
import { ApiError } from "../../app/utils/apiFetch";
import { DEBOUNCE_SALVAR_MS, RECUO_TENTATIVAS_MS, useCompraEditor, type ApiCompra } from "../../app/composables/useCompraEditor";

// useCompraEditor: autosave com debounce, nunca dois PATCH juntos, flush, 409 com as duas saídas, retry e somente leitura. Timers falsos
// e API simulada (sem rede). Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const compraBase = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_1",
  anoMes: "2026-11",
  sequencia: 1,
  cancelada: false,
  paciente: "",
  processoNumero: "",
  medico: "",
  localAplicacao: "",
  entrega: "",
  contatos: "",
  termoObservacao: "",
  despachante: "",
  isencaoPara: "",
  observacoes: "",
  vendedor: "",
  responsavel: "Cris",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: null,
  documentos: null,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  ordens: [],
  ...extra,
});

/** Um servidor de mentira: cada PATCH muda a versão; dá para segurar a resposta, falhar e consultar o que chegou. */
function servidor(inicial: Compra = compraBase()) {
  let atual = inicial;
  let n = 0;
  const salvamentos: Array<{ id: string; corpo: CompraSalvarDTO }> = [];
  let simultaneos = 0;
  let maxSimultaneos = 0;
  let falhas: Array<unknown> = [];
  let segurar: Promise<void> | null = null;
  const obter = vi.fn(async (id: string): Promise<Compra> => ({ ...atual, id }));
  const salvar = vi.fn(async (id: string, corpo: CompraSalvarDTO): Promise<Compra> => {
    simultaneos += 1;
    maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
    salvamentos.push({ id, corpo });
    try {
      if (segurar) await segurar;
      const falha = falhas.shift();
      if (falha !== undefined) throw falha;
      if (corpo.atualizadoEm !== atual.updatedAt) throw new ApiError("Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.", 409);
      n += 1;
      atual = { ...atual, ...(corpo as unknown as Partial<Compra>), id, ordens: atual.ordens, updatedAt: `2026-11-19T13:00:0${n}.000Z`, atualizadoPor: "Cris" };
      return atual;
    } finally {
      simultaneos -= 1;
    }
  });
  const api: ApiCompra = { obter, salvar };
  return {
    api,
    obter,
    salvar,
    salvamentos,
    get maxSimultaneos() {
      return maxSimultaneos;
    },
    get atual() {
      return atual;
    },
    /** Outra pessoa salva: a versão no servidor muda por baixo do editor. */
    outraPessoaSalva(mudancas: Partial<Compra> = { paciente: "ALTERADO POR OUTRA PESSOA" }) {
      n += 1;
      atual = { ...atual, ...mudancas, updatedAt: `2026-11-19T14:00:0${n}.000Z` };
    },
    falharProximas(...erros: unknown[]) {
      falhas = [...erros];
    },
    segurarRespostas(): () => void {
      let soltar: () => void = () => undefined;
      segurar = new Promise<void>((r) => {
        soltar = () => {
          segurar = null;
          r();
        };
      });
      return soltar;
    },
  };
}

const rede = (): TypeError => new TypeError("Failed to fetch");
const erro500 = (): ApiError => new ApiError("Erro interno.", 500);

function editor(s: ReturnType<typeof servidor>, extra: { somenteLeitura?: () => boolean; aoSalvar?: (c: Compra) => void } = {}) {
  return useCompraEditor({ api: s.api, somenteLeitura: extra.somenteLeitura ?? (() => false), aoSalvar: extra.aoSalvar, agora: () => new Date("2026-11-19T19:22:00Z") });
}

async function abrir(s: ReturnType<typeof servidor>, extra: Parameters<typeof editor>[1] = {}) {
  const e = editor(s, extra);
  await e.carregar("cmp_1");
  return e;
}

const avancar = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("debounce de 800 ms e o estado completo", () => {
  it("a constante é 800", () => {
    expect(DEBOUNCE_SALVAR_MS).toBe(800);
    expect(RECUO_TENTATIVAS_MS).toHaveLength(3);
  });

  it("uma mudança salva 800 ms depois (não antes); o estado fica 'pendente' até lá e 'salvo' depois", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "PACIENTE TESTE" });
    expect(e.estado.value).toBe("pendente");
    await avancar(799);
    expect(s.salvar).not.toHaveBeenCalled();
    await avancar(1);
    expect(s.salvar).toHaveBeenCalledTimes(1);
    expect(e.estado.value).toBe("salvo");
    expect(e.salvoEm.value).toEqual(new Date("2026-11-19T19:22:00Z"));
    expect(e.temPendencia.value).toBe(false);
  });

  it("mudanças em sequência reiniciam o relógio: UM só PATCH, 800 ms depois da ÚLTIMA", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "P" });
    await avancar(500);
    e.alterar({ paciente: "PA" });
    await avancar(500);
    e.alterar({ paciente: "PAC" });
    await avancar(799);
    expect(s.salvar).not.toHaveBeenCalled();
    await avancar(1);
    expect(s.salvar).toHaveBeenCalledTimes(1);
    expect(s.salvamentos[0]!.corpo.paciente).toBe("PAC");
  });

  it("salva o ESTADO COMPLETO (todos os campos, não só o que mudou) com o atualizadoEm que recebeu", async () => {
    const s = servidor(compraBase({ medico: "Dr. Teste", responsavel: "Cris", pendencias: ["Receita"] }));
    const e = await abrir(s);
    e.alterar({ paciente: "PACIENTE TESTE" });
    await avancar(800);
    const corpo = s.salvamentos[0]!.corpo;
    expect(corpo).toMatchObject({ atualizadoEm: "2026-11-19T12:00:00.000Z", paciente: "PACIENTE TESTE", medico: "Dr. Teste", responsavel: "Cris", pendencias: ["Receita"], recorrente: false, compraParticular: false });
    expect(Object.keys(corpo)).toEqual(expect.arrayContaining(["atualizadoEm", "paciente", "processoNumero", "medico", "vendedor", "responsavel", "compraParticular", "recorrente", "ordens"]));
  });

  it("o corpo é aceito pela validação do servidor (ida e volta), com ordens e itens", () => {
    const compra = compraBase({
      paciente: "PACIENTE TESTE",
      ordens: [{ id: "ord_000001", posicao: 1, fornecedor: "Fornecedor Teste", envio: "Air Cargo", cia: "", po: "PO26-11-0001", frete: 10, freteReal: null, dirId: "dir_1", encaminhadaEm: "2026-11-19T15:00:00.000Z", itens: [{ id: "itm_000001", posicao: 1, medicamento: "MED TESTE", medicamentoCadastroId: "med_1", preCadastroId: null, apresentacao: "10 mg", referencia: "", laboratorio: "", quantidade: "2", temperatura: "2°C a 8°C", valorUnitario: 5, valorReal: null }] }],
    });
    const r = validarCompraSalvar(corpoParaSalvar(compra, compra.updatedAt));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    const corpo = corpoParaSalvar(compra, compra.updatedAt);
    expect(JSON.stringify(corpo)).not.toMatch(/posicao|dirId|encaminhadaEm|dir_1/); // só o Encaminhar grava isso
  });

  it("depois do sucesso, o PATCH seguinte leva a versão devolvida pelo servidor", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "A" });
    await avancar(800);
    e.alterar({ paciente: "AB" });
    await avancar(800);
    expect(s.salvamentos.map((x) => x.corpo.atualizadoEm)).toEqual(["2026-11-19T12:00:00.000Z", "2026-11-19T13:00:01.000Z"]);
    expect(e.compra.value!.updatedAt).toBe("2026-11-19T13:00:02.000Z");
  });

  it("aoSalvar recebe a compra que o servidor devolveu (a lista do mês se atualiza com ela)", async () => {
    const s = servidor();
    const aoSalvar = vi.fn();
    const e = await abrir(s, { aoSalvar });
    e.alterar({ paciente: "PACIENTE TESTE" });
    await avancar(800);
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    expect(aoSalvar.mock.calls[0]![0]).toMatchObject({ id: "cmp_1", paciente: "PACIENTE TESTE", updatedAt: "2026-11-19T13:00:01.000Z" });
  });

  it("sem mudança nenhuma não há PATCH", async () => {
    const s = servidor();
    const e = await abrir(s);
    await avancar(10_000);
    expect(s.salvar).not.toHaveBeenCalled();
    expect(await e.flush()).toBe(true);
    expect(s.salvar).not.toHaveBeenCalled();
  });
});

describe("nunca dois PATCH ao mesmo tempo", () => {
  it("mudou durante o salvamento: marca sujo e salva de novo DEPOIS, com o estado mais novo", async () => {
    const s = servidor();
    const soltar = s.segurarRespostas();
    const e = await abrir(s);
    e.alterar({ paciente: "A" });
    await avancar(800); // o PATCH 1 sai e fica pendurado
    expect(s.salvar).toHaveBeenCalledTimes(1);
    expect(e.estado.value).toBe("salvando");

    e.alterar({ paciente: "AB" });
    await avancar(800); // o relógio dispara com o PATCH 1 ainda em curso
    expect(s.salvar).toHaveBeenCalledTimes(1); // NÃO saiu um segundo
    e.alterar({ medico: "Dr. Teste" });
    await avancar(5000);
    expect(s.salvar).toHaveBeenCalledTimes(1);

    soltar();
    await avancar(0);
    await avancar(1000);
    expect(s.salvar).toHaveBeenCalledTimes(2);
    expect(s.maxSimultaneos).toBe(1);
    expect(s.salvamentos[1]!.corpo).toMatchObject({ paciente: "AB", medico: "Dr. Teste", atualizadoEm: "2026-11-19T13:00:01.000Z" });
    expect(e.estado.value).toBe("salvo");
    expect(e.temPendencia.value).toBe(false);
  });

  it("digitação contínua por vários ciclos: no máximo UM em voo, e o último estado sempre chega ao servidor", async () => {
    const s = servidor();
    const e = await abrir(s);
    for (let i = 1; i <= 30; i++) {
      e.alterar({ paciente: `P${i}` });
      await avancar(300);
    }
    await avancar(2000);
    expect(s.maxSimultaneos).toBe(1);
    expect(s.atual.paciente).toBe("P30");
    expect(e.estado.value).toBe("salvo");
  });
});

describe("flush: descarrega o pendente antes de trocar de compra, de mês ou sair", () => {
  it("salva já (sem esperar o debounce) e devolve true", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "PACIENTE TESTE" });
    const promessa = e.flush();
    await avancar(0);
    expect(await promessa).toBe(true);
    expect(s.salvar).toHaveBeenCalledTimes(1);
    expect(s.atual.paciente).toBe("PACIENTE TESTE");
    await avancar(5000); // o relógio de antes foi cancelado: não há segundo PATCH
    expect(s.salvar).toHaveBeenCalledTimes(1);
  });

  it("espera o salvamento em curso e salva o que mudou depois dele", async () => {
    const s = servidor();
    const soltar = s.segurarRespostas();
    const e = await abrir(s);
    e.alterar({ paciente: "A" });
    await avancar(800);
    e.alterar({ paciente: "AB" });
    const promessa = e.flush();
    soltar();
    expect(await promessa).toBe(true);
    expect(s.atual.paciente).toBe("AB");
    expect(s.maxSimultaneos).toBe(1);
  });

  it("falha ao salvar: devolve FALSE (quem chama não troca) e o estado local continua", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "PACIENTE TESTE" });
    s.falharProximas(rede());
    expect(await e.flush()).toBe(false);
    expect(e.compra.value!.paciente).toBe("PACIENTE TESTE");
    expect(e.estado.value).toBe("erro");
    expect(e.temPendencia.value).toBe(true);
  });

  it("em conflito devolve false; sem nada pendente devolve true", async () => {
    const s = servidor();
    const e = await abrir(s);
    expect(await e.flush()).toBe(true);
    s.outraPessoaSalva();
    e.alterar({ paciente: "MINHA" });
    expect(await e.flush()).toBe(false);
    expect(e.estado.value).toBe("conflito");
    expect(await e.flush()).toBe(false);
  });

  it("somente leitura: sempre true, sem chamar nada", async () => {
    const s = servidor();
    const e = await abrir(s, { somenteLeitura: () => true });
    expect(await e.flush()).toBe(true);
    expect(s.salvar).not.toHaveBeenCalled();
  });
});

describe("409: alguém salvou antes", () => {
  it("para o autosave (nem as mudanças seguintes salvam) e fica em 'conflito'; o local não some", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.outraPessoaSalva();
    e.alterar({ paciente: "MINHA VERSAO" });
    await avancar(800);
    expect(e.estado.value).toBe("conflito");
    expect(s.salvar).toHaveBeenCalledTimes(1);
    e.alterar({ paciente: "MINHA VERSAO 2" });
    await avancar(10_000);
    expect(s.salvar).toHaveBeenCalledTimes(1); // parou
    expect(e.compra.value!.paciente).toBe("MINHA VERSAO 2");
    expect(e.estado.value).toBe("conflito");
    expect(e.temPendencia.value).toBe(true);
  });

  it("'Carregar a versão salva': descarta as minhas mudanças e volta a funcionar", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.outraPessoaSalva({ paciente: "DA OUTRA PESSOA" });
    e.alterar({ paciente: "MINHA VERSAO" });
    await avancar(800);
    expect(e.estado.value).toBe("conflito");

    await e.carregarVersaoSalva();
    expect(e.compra.value!.paciente).toBe("DA OUTRA PESSOA");
    expect(e.estado.value).toBe("ocioso");
    expect(e.temPendencia.value).toBe(false);
    e.alterar({ medico: "Dr. Depois" });
    await avancar(800);
    expect(e.estado.value).toBe("salvo");
    expect(s.atual).toMatchObject({ paciente: "DA OUTRA PESSOA", medico: "Dr. Depois" });
  });

  it("'Manter as minhas e salvar por cima': reenvia o meu estado com a versão ATUAL do servidor", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.outraPessoaSalva({ paciente: "DA OUTRA PESSOA", medico: "Dr. Da Outra" });
    e.alterar({ paciente: "MINHA VERSAO" });
    await avancar(800);
    expect(e.estado.value).toBe("conflito");
    const versaoDoServidor = s.atual.updatedAt;

    await e.manterMinhas();
    expect(s.salvar).toHaveBeenCalledTimes(2);
    expect(s.salvamentos[1]!.corpo.atualizadoEm).toBe(versaoDoServidor);
    expect(s.atual.paciente).toBe("MINHA VERSAO");
    expect(e.estado.value).toBe("salvo");
    expect(e.compra.value!.paciente).toBe("MINHA VERSAO");
  });

  it("se mais alguém salvar no meio do 'manter as minhas', volta ao conflito (nada some em silêncio)", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.outraPessoaSalva();
    e.alterar({ paciente: "MINHA" });
    await avancar(800);
    s.obter.mockImplementationOnce(async (id: string) => {
      const lida = { ...s.atual, id };
      s.outraPessoaSalva({ paciente: "MAIS UMA PESSOA" }); // muda logo depois de eu ler a versão
      return lida;
    });
    await e.manterMinhas();
    expect(e.estado.value).toBe("conflito");
    expect(e.compra.value!.paciente).toBe("MINHA");
  });
});

describe("erro de rede ou 5xx: tenta sozinho com recuo, 3 vezes, e depois espera o clique", () => {
  it("o estado local fica; as tentativas saem em 2 s, 5 s e 10 s; na 4ª falha espera o clique", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.falharProximas(rede(), erro500(), rede(), rede());
    e.alterar({ paciente: "PACIENTE TESTE" });
    await avancar(800);
    expect(s.salvar).toHaveBeenCalledTimes(1);
    expect(e.estado.value).toBe("erro");
    expect(e.esperandoClique.value).toBe(false);
    expect(e.compra.value!.paciente).toBe("PACIENTE TESTE");

    await avancar(1999);
    expect(s.salvar).toHaveBeenCalledTimes(1);
    await avancar(1);
    expect(s.salvar).toHaveBeenCalledTimes(2);
    await avancar(5000);
    expect(s.salvar).toHaveBeenCalledTimes(3);
    await avancar(10_000);
    expect(s.salvar).toHaveBeenCalledTimes(4);
    expect(e.estado.value).toBe("erro");
    expect(e.esperandoClique.value).toBe(true);
    await avancar(60_000);
    expect(s.salvar).toHaveBeenCalledTimes(4); // depois espera clique
    expect(e.compra.value!.paciente).toBe("PACIENTE TESTE");
  });

  it("uma tentativa que dá certo zera tudo: 'salvo' e o servidor tem o estado local", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.falharProximas(rede());
    e.alterar({ paciente: "PACIENTE TESTE" });
    await avancar(800);
    expect(e.estado.value).toBe("erro");
    await avancar(2000);
    expect(e.estado.value).toBe("salvo");
    expect(e.esperandoClique.value).toBe(false);
    expect(s.atual.paciente).toBe("PACIENTE TESTE");
  });

  it("depois das tentativas, 'Tentar de novo' salva (e recomeça a contagem)", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.falharProximas(rede(), rede(), rede(), rede());
    e.alterar({ paciente: "PACIENTE TESTE" });
    await avancar(800 + 2000 + 5000 + 10_000);
    expect(e.esperandoClique.value).toBe(true);
    await e.tentarDeNovo();
    expect(e.estado.value).toBe("salvo");
    expect(s.atual.paciente).toBe("PACIENTE TESTE");
    expect(e.esperandoClique.value).toBe(false);
  });

  it("recusa do servidor (422): não repete sozinho, mostra a mensagem dele e espera o clique", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.falharProximas(new ApiError("Vendedor inválido: escolha um consultor ativo do Cadastro.", 422));
    e.alterar({ vendedor: "Ninguém" });
    await avancar(800);
    expect(e.estado.value).toBe("erro");
    expect(e.esperandoClique.value).toBe(true);
    expect(e.mensagemErro.value).toBe("Vendedor inválido: escolha um consultor ativo do Cadastro.");
    await avancar(60_000);
    expect(s.salvar).toHaveBeenCalledTimes(1);
  });

  it("mexer de novo num campo depois de uma falha dá novas tentativas (e o PATCH leva o estado mais novo)", async () => {
    const s = servidor();
    const e = await abrir(s);
    s.falharProximas(rede(), rede(), rede(), rede());
    e.alterar({ paciente: "A" });
    await avancar(800 + 2000 + 5000 + 10_000);
    expect(e.esperandoClique.value).toBe(true);
    e.alterar({ paciente: "AB" });
    await avancar(800);
    expect(e.estado.value).toBe("salvo");
    expect(s.atual.paciente).toBe("AB");
  });
});

describe("trocar de compra", () => {
  it("carregar abre outra compra e zera o estado de salvamento", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "A" });
    await e.flush();
    await e.carregar("cmp_2");
    expect(e.compra.value!.id).toBe("cmp_2");
    expect(e.estado.value).toBe("ocioso");
    expect(e.temPendencia.value).toBe(false);
  });

  it("o resultado de um salvamento de uma compra que já foi trocada é descartado (não contamina a outra)", async () => {
    const s = servidor();
    const soltar = s.segurarRespostas();
    const aoSalvar = vi.fn();
    const e = await abrir(s, { aoSalvar });
    e.alterar({ paciente: "A" });
    await avancar(800);
    e.definir(compraBase({ id: "cmp_2", sequencia: 2, updatedAt: "2026-11-19T11:00:00.000Z" })); // trocou no meio
    soltar();
    await avancar(1000);
    expect(e.compra.value!.id).toBe("cmp_2");
    expect(e.compra.value!.updatedAt).toBe("2026-11-19T11:00:00.000Z");
    expect(e.estado.value).toBe("ocioso");
  });

  it("definir(null) esvazia e cancela o relógio", async () => {
    const s = servidor();
    const e = await abrir(s);
    e.alterar({ paciente: "A" });
    e.definir(null);
    await avancar(10_000);
    expect(s.salvar).not.toHaveBeenCalled();
    expect(e.compra.value).toBeNull();
  });
});

describe("somente leitura", () => {
  it("sem permissão: nenhum campo muda, nenhum timer, nenhum PATCH, sem pendência", async () => {
    const s = servidor();
    const e = await abrir(s, { somenteLeitura: () => true });
    e.alterar({ paciente: "NAO PODE" });
    await avancar(10_000);
    expect(e.compra.value!.paciente).toBe("");
    expect(s.salvar).not.toHaveBeenCalled();
    expect(e.somenteLeituraAgora.value).toBe(true);
    expect(e.temPendencia.value).toBe(false);
    expect(e.estado.value).toBe("ocioso");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("compra cancelada: igual (e a permissão de escrita não muda isso)", async () => {
    const s = servidor(compraBase({ cancelada: true }));
    const e = await abrir(s);
    e.alterar({ paciente: "NAO PODE" });
    await avancar(10_000);
    expect(e.compra.value!.paciente).toBe("");
    expect(s.salvar).not.toHaveBeenCalled();
    expect(e.somenteLeituraAgora.value).toBe(true);
    expect(e.temPendencia.value).toBe(false);
  });

  it("a permissão é lida a cada uso (carrega depois do editor): passou a poder, edita", async () => {
    const s = servidor();
    let pode = false;
    const e = await abrir(s, { somenteLeitura: () => !pode });
    e.alterar({ paciente: "X" });
    expect(e.compra.value!.paciente).toBe("");
    pode = true;
    e.alterar({ paciente: "X" });
    await avancar(800);
    expect(s.atual.paciente).toBe("X");
  });

  it("sem compra aberta é somente leitura", () => {
    expect(editor(servidor()).somenteLeituraAgora.value).toBe(true);
  });
});

describe("temPendencia (é o que o aviso de sair da página olha)", () => {
  it("true da mudança até o sucesso; false depois", async () => {
    const s = servidor();
    const soltar = s.segurarRespostas();
    const e = await abrir(s);
    expect(e.temPendencia.value).toBe(false);
    e.alterar({ paciente: "A" });
    expect(e.temPendencia.value).toBe(true);
    await avancar(800);
    expect(e.temPendencia.value).toBe(true); // salvando
    soltar();
    await avancar(0);
    expect(e.temPendencia.value).toBe(false);
  });
});

describe("Courier Simples da compra é DERIVADO das ordens e sincronizado a cada mudança delas", () => {
  const ordem = (id: string, envio: string): Compra["ordens"][number] => ({
    id,
    posicao: 1,
    fornecedor: "",
    envio,
    cia: "",
    po: "",
    frete: null,
    freteReal: null,
    dirId: null,
    encaminhadaEm: null,
    itens: [],
  });

  it("todas Courier Simples liga; uma que não é desliga; sem ordens desliga; vai no PATCH", async () => {
    const s = servidor(compraBase({ ordens: [] }));
    const e = await abrir(s);
    e.alterar({ ordens: [ordem("ord_000001", "Courier Simples")] });
    expect(e.compra.value!.courierSimples).toBe(true);
    e.alterar({ ordens: [ordem("ord_000001", "Courier Simples"), ordem("ord_000002", "Air Cargo")] });
    expect(e.compra.value!.courierSimples).toBe(false);
    e.alterar({ ordens: [ordem("ord_000001", "Courier Simples"), ordem("ord_000002", "Courier Simples")] });
    expect(e.compra.value!.courierSimples).toBe(true);
    await avancar(800);
    expect(s.salvamentos.at(-1)!.corpo.courierSimples).toBe(true);
    e.alterar({ ordens: [] });
    expect(e.compra.value!.courierSimples).toBe(false);
  });

  it("mudar só um campo da compra (sem ordens) não mexe no courier_simples", async () => {
    const s = servidor(compraBase({ courierSimples: true, ordens: [ordem("ord_000001", "Courier Simples")] }));
    const e = await abrir(s);
    e.alterar({ paciente: "PACIENTE TESTE" });
    expect(e.compra.value!.courierSimples).toBe(true);
  });
});
