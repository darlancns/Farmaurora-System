import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESPACHANTES_DIR,
  DESPACHANTE_COURIER_NA,
  OBSERVACAO_DIR_COMPRA_PARTICULAR,
  OBSERVACAO_DIR_RECORRENTE,
  OBSERVACOES_DIR,
} from "../../shared/constants/dir";
import { MODAL_AIR_CARGO, MODAL_COURIER_FORMAL, MODAL_COURIER_SIMPLES } from "../../shared/constants/processos";
import { DIR_MEDICAMENTO_MAX } from "../../shared/constants/compraChecklist";
import { dataBrasiliaDe } from "../../shared/utils/dataBrasilia";
import {
  DIR_ID_PREFIXO,
  despachanteDaOrdem,
  dirIdDaOrdem,
  montarLinhaDir,
  observacaoDaCompra,
  pacienteParaDir,
  temperaturaDaOrdem,
  temperaturaMistaDaOrdem,
  valoresDeTemperaturaDaOrdem,
  type CompraParaLinhaDir,
  type ItemParaLinhaDir,
  type OrdemParaLinhaDir,
} from "../../shared/utils/compraLinhaDir";
import { colunasDeDir } from "../../server/utils/dirMappers";
import { isValidDirPayload } from "../../server/utils/dirValidation";

// O mapa Compra → linha da DIR (shared/utils/compraLinhaDir.ts). Dados fictícios (TESTE).

const compra = (extra: Partial<CompraParaLinhaDir> = {}): CompraParaLinhaDir => ({
  paciente: "paciente teste",
  vendedor: "Mateus Morais",
  responsavel: "Rebeca",
  despachante: "Despachante Teste",
  recorrente: false,
  compraParticular: false,
  ...extra,
});

const item = (posicao: number, medicamento: string, temperatura: string, apresentacao = ""): ItemParaLinhaDir => ({ posicao, medicamento, apresentacao, temperatura });

const ordem = (extra: Partial<OrdemParaLinhaDir> = {}): OrdemParaLinhaDir => ({
  id: "ord_teste_1",
  po: "PO26-11-0001",
  fornecedor: "Fornecedor Teste",
  envio: MODAL_AIR_CARGO,
  cia: "Cia Teste",
  itens: [item(1, "MED TESTE", "2°C a 8°C", "10 mg")],
  ...extra,
});

describe("montarLinhaDir — a linha inteira", () => {
  it("o mapa coluna a coluna (e o padrão de linha nova no resto)", () => {
    const r = montarLinhaDir(compra({ recorrente: true }), ordem(), { hoje: "2026-11-20" });
    expect(r.id).toBe("dir_ord_teste_1");
    expect(r.temperaturaMista).toBe(false);
    expect(r.dto).toEqual({
      po: "PO26-11-0001",
      paciente: "PACIENTE TESTE",
      vendedor: "Mateus Morais",
      responsavel: "Rebeca",
      medicamento: "MED TESTE 10 MG",
      fornecedor: "Fornecedor Teste",
      envio: "Air Cargo",
      companhiaAerea: "Cia Teste",
      awb: "",
      despachante: "Despachante Teste",
      temperatura: "2°C a 8°C",
      observacao: "RECORRENTE",
      receita: "",
      contratoCambio: "",
      banco: "",
      status: "on_going",
      dataEmissao: "2026-11-20",
      dataCobrancaFornecedores: "",
      dataEntrega: "",
      dataPagamento: "",
      conferido: false,
      exigencia: false,
      operacaoEncerrada: false,
      fechamentoRestante: false,
      dactes: false,
      dsiDirDuimp: false,
      logger: false,
      fechamento: false,
      numerario: false,
      protocoloAssinado: false,
      swift: false,
      termometro: false,
    });
  });

  it("o DTO é aceito pela validação da DIR (todas as chaves, cada uma válida)", () => {
    const { dto } = montarLinhaDir(compra(), ordem(), { hoje: "2026-11-20" });
    expect(isValidDirPayload(dto)).toBe(true);
  });

  it("passando pelo mapeador da DIR: vazio vira NULL, status on_going, data de emissão e PO como esperado", () => {
    const { dto } = montarLinhaDir(compra({ despachante: "" }), ordem({ cia: "" }), { hoje: "2026-11-20" });
    const colunas = colunasDeDir(dto);
    expect(colunas.companhia_aerea).toBeNull();
    expect(colunas.despachante).toBeNull();
    expect(colunas.awb).toBeNull();
    expect(colunas.receita).toBeNull();
    expect(colunas.banco).toBeNull();
    expect(colunas.observacao).toBeNull();
    expect(colunas.data_cobranca_fornecedores).toBeNull();
    expect(colunas.status).toBe("on_going");
    expect(colunas.data_emissao).toBe("2026-11-20");
    expect(colunas.po).toBe("PO26-11-0001");
    expect(colunas.fechamento_restante).toBe(false);
    expect(colunas.operacao_encerrada).toBe(false);
  });

  it("o PO sai normalizado (maiúsculas, sem espaços)", () => {
    expect(montarLinhaDir(compra(), ordem({ po: " po26-11-0001 " }), { hoje: "2026-11-20" }).dto.po).toBe("PO26-11-0001");
  });

  it("não altera a compra nem a ordem recebidas", () => {
    const c = compra({ paciente: "  josé   da  silva " });
    const o = ordem({ itens: [item(2, "B", "Ambiente"), item(1, "A", "2°C a 8°C")] });
    const antes = JSON.stringify([c, o]);
    montarLinhaDir(c, o, { hoje: "2026-11-20" });
    expect(JSON.stringify([c, o])).toBe(antes);
  });

  it("o id é determinístico: dir_ + id da ordem (a mesma ordem sempre dá o mesmo id)", () => {
    expect(DIR_ID_PREFIXO).toBe("dir_");
    expect(dirIdDaOrdem("ord_x")).toBe("dir_ord_x");
    const a = montarLinhaDir(compra(), ordem({ id: "ord_abc" }), { hoje: "2026-11-20" }).id;
    const b = montarLinhaDir(compra({ paciente: "outro" }), ordem({ id: "ord_abc", po: "PO26-11-0002" }), { hoje: "2026-11-21" }).id;
    expect(a).toBe("dir_ord_abc");
    expect(b).toBe(a);
  });
});

describe("despachante POR ORDEM (Courier Simples)", () => {
  it("Courier Simples → COURIER I N/A, mesmo com despachante na compra", () => {
    expect(despachanteDaOrdem(compra({ despachante: "Despachante Teste" }), { envio: MODAL_COURIER_SIMPLES })).toBe("COURIER I N/A");
    expect(montarLinhaDir(compra(), ordem({ envio: MODAL_COURIER_SIMPLES }), { hoje: "2026-11-20" }).dto.despachante).toBe(DESPACHANTE_COURIER_NA);
  });

  it("Courier Simples com a compra SEM despachante também leva COURIER I N/A (nunca vazio)", () => {
    expect(montarLinhaDir(compra({ despachante: "" }), ordem({ envio: MODAL_COURIER_SIMPLES }), { hoje: "2026-11-20" }).dto.despachante).toBe("COURIER I N/A");
  });

  it("Air Cargo e Courier Formal levam o despachante da compra (vazio fica vazio)", () => {
    for (const envio of [MODAL_AIR_CARGO, MODAL_COURIER_FORMAL]) {
      expect(montarLinhaDir(compra({ despachante: "Despachante Teste" }), ordem({ envio }), { hoje: "2026-11-20" }).dto.despachante, envio).toBe("Despachante Teste");
      expect(montarLinhaDir(compra({ despachante: "" }), ordem({ envio }), { hoje: "2026-11-20" }).dto.despachante, envio).toBe("");
    }
  });

  it("numa compra com ordens de envios diferentes, cada linha decide pela SUA ordem", () => {
    const c = compra({ despachante: "Despachante Teste" });
    const simples = montarLinhaDir(c, ordem({ id: "o1", envio: MODAL_COURIER_SIMPLES }), { hoje: "2026-11-20" }).dto.despachante;
    const cargo = montarLinhaDir(c, ordem({ id: "o2", envio: MODAL_AIR_CARGO }), { hoje: "2026-11-20" }).dto.despachante;
    expect([simples, cargo]).toEqual(["COURIER I N/A", "Despachante Teste"]);
  });

  it("o valor existe na lista de despachantes da DIR e o texto não é digitado solto em outro arquivo de produção", () => {
    expect(DESPACHANTES_DIR).toContain(DESPACHANTE_COURIER_NA);
    expect(DESPACHANTE_COURIER_NA).toBe("COURIER I N/A");
    const achados: string[] = [];
    const varrer = (pasta: string): void => {
      for (const nome of readdirSync(pasta)) {
        if (["node_modules", ".nuxt", ".output"].includes(nome)) continue;
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (/\.(ts|vue|mjs)$/.test(nome) && readFileSync(caminho, "utf-8").includes("COURIER I N/A")) achados.push(caminho.replace(/\\/g, "/").split("/crm-integracao/").pop()!);
      }
    };
    for (const p of ["app", "server", "shared"]) varrer(join(process.cwd(), p));
    expect(achados).toEqual(["shared/constants/dir.ts"]);
  });
});

describe("temperatura da ordem (valores INTEIROS e distintos, unidos por ' / ')", () => {
  const t = (...valores: string[]): Pick<OrdemParaLinhaDir, "itens"> => ({ itens: valores.map((v, i) => item(i + 1, `MED ${i + 1}`, v)) });

  it("um valor: ele mesmo; todos iguais: um só", () => {
    expect(temperaturaDaOrdem(t("2°C a 8°C"))).toBe("2°C a 8°C");
    expect(temperaturaDaOrdem(t("Ambiente", "Ambiente", "Ambiente"))).toBe("Ambiente");
    expect(temperaturaMistaDaOrdem(t("Ambiente", "Ambiente"))).toBe(false);
  });

  it("dois valores distintos: unidos por ' / ' na ordem de aparição, e mista", () => {
    expect(temperaturaDaOrdem(t("2°C a 8°C", "Ambiente"))).toBe("2°C a 8°C / Ambiente");
    expect(temperaturaDaOrdem(t("Ambiente", "2°C a 8°C"))).toBe("Ambiente / 2°C a 8°C");
    expect(temperaturaMistaDaOrdem(t("2°C a 8°C", "Ambiente"))).toBe(true);
  });

  it("três valores distintos: todos, na ordem", () => {
    expect(temperaturaDaOrdem(t("2°C a 8°C", "Ambiente", "Abaixo de 30C"))).toBe("2°C a 8°C / Ambiente / Abaixo de 30C");
    expect(temperaturaDaOrdem(t("2°C a 8°C", "Ambiente", "2°C a 8°C", "Abaixo de 30C", "Ambiente"))).toBe("2°C a 8°C / Ambiente / Abaixo de 30C");
  });

  it("variantes de caixa, acento e espaço são o MESMO valor: fica o texto da primeira aparição", () => {
    expect(valoresDeTemperaturaDaOrdem(t("Ambiente", "ambiente", "AMBIENTE", "  Ambiente  ", "Ambiente  "))).toEqual(["Ambiente"]);
    expect(temperaturaDaOrdem(t("ambiente", "Ambiente"))).toBe("ambiente");
    expect(temperaturaDaOrdem(t("Refrigerado Ámbar", "refrigerado ambar", "Ambiente"))).toBe("Refrigerado Ámbar / Ambiente");
    expect(temperaturaDaOrdem(t("2°C  a  8°C", "2°C a 8°C"))).toBe("2°C  a  8°C");
    expect(temperaturaMistaDaOrdem(t("Ambiente", "AMBIENTE"))).toBe(false);
  });

  it("valor composto do Cadastro continua INTEIRO (não se parte em ' / ')", () => {
    expect(valoresDeTemperaturaDaOrdem(t("Ambiente / 2°C a 8°C no Brasil"))).toEqual(["Ambiente / 2°C a 8°C no Brasil"]);
    expect(valoresDeTemperaturaDaOrdem(t("Ambiente / 2°C a 8°C", "2°C a 8°C"))).toEqual(["Ambiente / 2°C a 8°C", "2°C a 8°C"]);
  });

  it("item sem temperatura (vazio ou só espaços) é ignorado; nenhum com temperatura = ''", () => {
    expect(temperaturaDaOrdem(t("", "2°C a 8°C", "   "))).toBe("2°C a 8°C");
    expect(temperaturaMistaDaOrdem(t("", "2°C a 8°C", "   "))).toBe(false);
    expect(temperaturaDaOrdem(t("", "  "))).toBe("");
    expect(temperaturaDaOrdem({ itens: [] })).toBe("");
  });

  it("vale a ordem de POSIÇÃO dos medicamentos, não a do array", () => {
    const o: Pick<OrdemParaLinhaDir, "itens"> = { itens: [item(2, "B", "Ambiente"), item(1, "A", "2°C a 8°C")] };
    expect(temperaturaDaOrdem(o)).toBe("2°C a 8°C / Ambiente");
  });

  it("na linha: a flag temperaturaMista acompanha e a temperatura vai no DTO", () => {
    const r = montarLinhaDir(compra(), ordem({ itens: [item(1, "A", "2°C a 8°C"), item(2, "B", "Ambiente")] }), { hoje: "2026-11-20" });
    expect(r.temperaturaMista).toBe(true);
    expect(r.dto.temperatura).toBe("2°C a 8°C / Ambiente");
  });
});

describe("observação da compra", () => {
  it("as quatro combinações", () => {
    expect(observacaoDaCompra({ recorrente: false, compraParticular: false })).toBe("");
    expect(observacaoDaCompra({ recorrente: true, compraParticular: false })).toBe("RECORRENTE");
    expect(observacaoDaCompra({ recorrente: false, compraParticular: true })).toBe("COMPRA PARTICULAR");
    expect(observacaoDaCompra({ recorrente: true, compraParticular: true })).toBe("RECORRENTE / COMPRA PARTICULAR");
  });

  it("os dois textos simples são itens da lista de observações da DIR", () => {
    expect(OBSERVACOES_DIR).toContain(OBSERVACAO_DIR_RECORRENTE);
    expect(OBSERVACOES_DIR).toContain(OBSERVACAO_DIR_COMPRA_PARTICULAR);
  });

  it("vai para a linha, e a mesma observação vale em todas as ordens", () => {
    const c = compra({ recorrente: true, compraParticular: true });
    expect(montarLinhaDir(c, ordem({ id: "o1" }), { hoje: "2026-11-20" }).dto.observacao).toBe("RECORRENTE / COMPRA PARTICULAR");
    expect(montarLinhaDir(c, ordem({ id: "o2" }), { hoje: "2026-11-20" }).dto.observacao).toBe("RECORRENTE / COMPRA PARTICULAR");
  });
});

describe("paciente em MAIÚSCULAS", () => {
  it("com acento, espaços colapsados e pontas limpas", () => {
    expect(pacienteParaDir("josé da conceição")).toBe("JOSÉ DA CONCEIÇÃO");
    expect(pacienteParaDir("  maria   ângela  d'ávila ")).toBe("MARIA ÂNGELA D'ÁVILA");
    expect(pacienteParaDir("iara ítalo")).toBe("IARA ÍTALO");
    expect(pacienteParaDir("ÃO já em maiúsculas")).toBe("ÃO JÁ EM MAIÚSCULAS");
  });

  it("tabulação e quebra de linha também colapsam", () => {
    expect(pacienteParaDir("ana\t\nbeatriz")).toBe("ANA BEATRIZ");
  });

  it("vai para a linha da DIR", () => {
    expect(montarLinhaDir(compra({ paciente: "ágata  d'oliveira" }), ordem(), { hoje: "2026-11-20" }).dto.paciente).toBe("ÁGATA D'OLIVEIRA");
  });
});

describe("medicamento (texto da DIR até 300)", () => {
  it("itens unidos por ' + ', em maiúsculas, na ordem de posição", () => {
    const o = ordem({ itens: [item(2, "outro med", "Ambiente", "5 mg"), item(1, "med um", "Ambiente", " 10  mg ")] });
    expect(montarLinhaDir(compra(), o, { hoje: "2026-11-20" }).dto.medicamento).toBe("MED UM 10 MG + OUTRO MED 5 MG");
  });

  it("exatamente 300 caracteres é aceito pela validação da DIR; 301 não (o checklist da compra barra antes)", () => {
    const med = (n: number): string => "A".repeat(n);
    const com300 = montarLinhaDir(compra(), ordem({ itens: [item(1, med(300), "Ambiente")] }), { hoje: "2026-11-20" });
    expect(com300.dto.medicamento).toHaveLength(DIR_MEDICAMENTO_MAX);
    expect(isValidDirPayload(com300.dto)).toBe(true);
    const com301 = montarLinhaDir(compra(), ordem({ itens: [item(1, med(301), "Ambiente")] }), { hoje: "2026-11-20" });
    expect(isValidDirPayload(com301.dto)).toBe(false);
  });

  it("ordem sem medicamento: ''", () => {
    expect(montarLinhaDir(compra(), ordem({ itens: [] }), { hoje: "2026-11-20" }).dto.medicamento).toBe("");
  });
});

describe("data de emissão = o dia de BRASÍLIA do encaminhamento", () => {
  it("o dia que vem em `hoje` é o da emissão, sem passar por fuso nenhum", () => {
    expect(montarLinhaDir(compra(), ordem(), { hoje: "2026-11-19" }).dto.dataEmissao).toBe("2026-11-19");
  });

  it("virada de dia: 23h30 em Brasília ainda é o dia anterior (UTC já virou); 00h00 em Brasília é o dia novo", () => {
    // Estes testes não dependem do fuso da máquina: valem em TZ=UTC, America/Sao_Paulo e Pacific/Honolulu.
    const dia = (iso: string): string => montarLinhaDir(compra(), ordem(), { hoje: dataBrasiliaDe(new Date(iso)) }).dto.dataEmissao;
    expect(dia("2026-11-20T02:30:00.000Z")).toBe("2026-11-19"); // 23h30 de 19/11 em Brasília
    expect(dia("2026-11-20T02:59:59.999Z")).toBe("2026-11-19");
    expect(dia("2026-11-20T03:00:00.000Z")).toBe("2026-11-20"); // 00h00 de 20/11 em Brasília
    expect(dia("2026-11-20T23:59:59.000Z")).toBe("2026-11-20");
    expect(dia("2026-12-01T02:59:59.000Z")).toBe("2026-11-30"); // vira o mês
    expect(dia("2027-01-01T02:00:00.000Z")).toBe("2026-12-31"); // vira o ano
  });

  it("o atalho toISOString().slice(0, 10) erraria justamente na virada (por isso nunca é usado)", () => {
    const instante = new Date("2026-11-20T02:30:00.000Z");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(dataBrasiliaDe(instante)).toBe("2026-11-19");
  });
});
