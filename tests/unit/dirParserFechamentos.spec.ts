import { describe, expect, it } from "vitest";
import { parseDirCsv } from "../../shared/utils/dirParser";
import { CABECALHO, csv, linhaCsv, EM_ABERTO } from "./helpers/dirCsv";

// Lista "FECHAMENTOS RESTANTES" (coluna manual da planilha): mapeamento texto → PO.
//   a) texto idêntico ao PACIENTE de EXATAMENTE 1 PO → marca esse PO;
//   b) texto idêntico a vários POs → marca o ÚNICO com FECHAMENTO falso e operação em andamento;
//   c) mais de um candidato em (b) (ou nenhum) → ambígua: NÃO marca nada;
//   d) nenhum PO com o texto → não encontrada: NÃO marca nada.
// CSV 100% sintético (tests/unit/helpers/dirCsv.ts). Sem datas novas aqui, mas roda com TZ=UTC,
// America/Sao_Paulo e Pacific/Honolulu como o resto do parser.

const marcados = (r: ReturnType<typeof parseDirCsv>) =>
  r.linhas.filter((l) => l.registro?.fechamentoRestante).map((l) => l.registro!.po);

describe("parseDirCsv — lista FECHAMENTOS RESTANTES", () => {
  it("(a) texto idêntico ao PACIENTE de exatamente 1 PO marca esse PO", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "ANA TESTE", restantes: "ANA TESTE" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "BETO TESTE" }),
      ),
    );
    expect(r.temColunaFechamentosRestantes).toBe(true);
    expect(r.fechamentosRestantes).toHaveLength(1);
    expect(r.fechamentosRestantes[0]).toMatchObject({ linha: 2, desfecho: "unico", po: "PO26-01-0001", linhaPo: 2 });
    expect(marcados(r)).toEqual(["PO26-01-0001"]);
  });

  it("(a) a entrada vive numa linha qualquer: não precisa ser a do próprio PO", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "ANA TESTE" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "BETO TESTE", restantes: "ANA TESTE" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ linha: 3, desfecho: "unico", po: "PO26-01-0001", linhaPo: 2 });
    expect(marcados(r)).toEqual(["PO26-01-0001"]);
  });

  it("(a) ignora diferença de caixa e de espaços entre a lista e o PACIENTE", () => {
    const r = parseDirCsv(csv(linhaCsv({ po: "PO26-01-0001", paciente: "ANA  TESTE", restantes: "  ana teste " })));
    expect(r.fechamentosRestantes[0]?.desfecho).toBe("unico");
    expect(marcados(r)).toEqual(["PO26-01-0001"]);
  });

  it('(a) o "(N)" faz parte do texto: "ANA TESTE (2)" casa com o PACIENTE "ANA TESTE (2)" e não com "ANA TESTE"', () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "ANA TESTE (1)" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "ANA TESTE (2)", restantes: "ANA TESTE (2)" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "unico", po: "PO26-01-0002" });
    expect(marcados(r)).toEqual(["PO26-01-0002"]);
  });

  it("(a) marca o PO como está, mesmo com FECHAMENTO verdadeiro (as linhas 14 e 58 da planilha real)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-07-0351", paciente: "CARLA TESTE", operacao: "Em andamento", fechamento: "VERDADEIRO", restantes: "CARLA TESTE" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "unico", po: "PO26-07-0351" });
    expect(r.linhas[0]!.registro).toMatchObject({ fechamento: true, operacaoEncerrada: false, fechamentoRestante: true });
  });

  it("(b) vários POs: marca o ÚNICO com FECHAMENTO falso e operação em andamento", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "DANI TESTE" }), // encerrado, FECHAMENTO verdadeiro
        linhaCsv({ po: "PO26-02-0002", paciente: "DANI TESTE" }),
        linhaCsv({ po: "PO26-09-0003", paciente: "DANI TESTE", ...EM_ABERTO, restantes: "DANI TESTE" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "unico_em_aberto", po: "PO26-09-0003", linhaPo: 4 });
    expect(r.fechamentosRestantes[0]!.candidatos.map((c) => c.po)).toEqual(["PO26-01-0001", "PO26-02-0002", "PO26-09-0003"]);
    expect(r.fechamentosRestantes[0]!.candidatosEmAberto.map((c) => c.po)).toEqual(["PO26-09-0003"]);
    expect(marcados(r)).toEqual(["PO26-09-0003"]);
  });

  it("(b) só conta como candidato quem tem FECHAMENTO falso E operação em andamento (um sem o outro não basta)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "ELI TESTE", operacao: "Em andamento", fechamento: "VERDADEIRO" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "ELI TESTE", operacao: "Operação Encerrada", fechamento: "FALSO" }),
        linhaCsv({ po: "PO26-01-0003", paciente: "ELI TESTE", ...EM_ABERTO, restantes: "ELI TESTE" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "unico_em_aberto", po: "PO26-01-0003" });
    expect(marcados(r)).toEqual(["PO26-01-0003"]);
  });

  it("(c) vários candidatos em aberto: AMBÍGUA, não marca nada e lista os candidatos", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-08-0422", paciente: "FABI TESTE", ...EM_ABERTO, banco: "Pendente", restantes: "FABI TESTE" }),
        linhaCsv({ po: "PO26-09-0440", paciente: "FABI TESTE", ...EM_ABERTO, banco: "XP" }),
      ),
    );
    const e = r.fechamentosRestantes[0]!;
    expect(e).toMatchObject({ linha: 2, desfecho: "ambigua", po: null, linhaPo: null });
    expect(e.candidatos.map((c) => c.po)).toEqual(["PO26-08-0422", "PO26-09-0440"]);
    expect(e.candidatosEmAberto.map((c) => c.po)).toEqual(["PO26-08-0422", "PO26-09-0440"]);
    expect(marcados(r)).toEqual([]);
  });

  it("(c) vários POs e NENHUM em aberto também é ambígua (nunca escolhe por conta própria)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "GIL TESTE", restantes: "GIL TESTE" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "GIL TESTE" }),
      ),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "ambigua", po: null });
    expect(r.fechamentosRestantes[0]!.candidatosEmAberto).toEqual([]);
    expect(marcados(r)).toEqual([]);
  });

  it("(d) texto sem nenhum PO correspondente: NÃO ENCONTRADA, não marca nada", () => {
    const r = parseDirCsv(
      csv(linhaCsv({ po: "PO26-01-0001", paciente: "HUGO TESTE", restantes: "NOME QUE NAO EXISTE" })),
    );
    expect(r.fechamentosRestantes[0]).toMatchObject({ desfecho: "nao_encontrada", po: null, linhaPo: null, candidatos: [] });
    expect(marcados(r)).toEqual([]);
  });

  it("(d) PO com erro (linha rejeitada) não é alvo: a entrada vira não encontrada", () => {
    const r = parseDirCsv(
      csv(linhaCsv({ po: "PO-ERRADO", paciente: "IRA TESTE", restantes: "IRA TESTE" })),
    );
    expect(r.linhas[0]!.registro).toBeNull();
    expect(r.fechamentosRestantes[0]?.desfecho).toBe("nao_encontrada");
  });

  it("a conta fecha: mapeadas + ambíguas + não encontradas = entradas lidas", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "AAA", restantes: "AAA" }), // a
        linhaCsv({ po: "PO26-01-0002", paciente: "BBB" }),
        linhaCsv({ po: "PO26-01-0003", paciente: "BBB", ...EM_ABERTO, restantes: "BBB" }), // b
        linhaCsv({ po: "PO26-01-0004", paciente: "CCC", ...EM_ABERTO, restantes: "CCC" }),
        linhaCsv({ po: "PO26-01-0005", paciente: "CCC", ...EM_ABERTO, restantes: "ZZZ" }), // c e d
      ),
    );
    const por = (d: string) => r.fechamentosRestantes.filter((e) => e.desfecho === d).length;
    expect(r.fechamentosRestantes).toHaveLength(4);
    expect([por("unico"), por("unico_em_aberto"), por("ambigua"), por("nao_encontrada")]).toEqual([1, 1, 1, 1]);
    expect(por("unico") + por("unico_em_aberto") + por("ambigua") + por("nao_encontrada")).toBe(r.fechamentosRestantes.length);
    expect(marcados(r).sort()).toEqual(["PO26-01-0001", "PO26-01-0003"]);
  });

  it("célula vazia ou só de traços não é entrada; sem a coluna, não há entradas", () => {
    const r = parseDirCsv(csv(linhaCsv({ restantes: "" }), linhaCsv({ po: "PO26-01-0002", restantes: "-----" })));
    expect(r.fechamentosRestantes).toEqual([]);
    expect(r.temColunaFechamentosRestantes).toBe(true);

    const semColuna = CABECALHO.replace(",FECHAMENTOS RESTANTES", "");
    const linha = linhaCsv({ paciente: "ANA TESTE" }).split(",").slice(0, -1).join(",");
    const r2 = parseDirCsv(`${semColuna}\n${linha}\n`);
    expect(r2.temColunaFechamentosRestantes).toBe(false);
    expect(r2.fechamentosRestantes).toEqual([]);
    expect(r2.colunasAusentes).toEqual([]);
    expect(marcados(r2)).toEqual([]);
  });

  it("duas entradas para o mesmo PO: marca uma vez só e avisa (sem o texto do paciente)", () => {
    const r = parseDirCsv(
      csv(
        linhaCsv({ po: "PO26-01-0001", paciente: "NOME SENSIVEL DE TESTE", restantes: "NOME SENSIVEL DE TESTE" }),
        linhaCsv({ po: "PO26-01-0002", paciente: "OUTRO", restantes: "NOME SENSIVEL DE TESTE" }),
      ),
    );
    expect(marcados(r)).toEqual(["PO26-01-0001"]);
    const avisos = r.linhas[0]!.avisos.filter((a) => a.codigo === "FECHAMENTO_RESTANTE_DUPLICADA");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.mensagem).not.toContain("NOME SENSIVEL");
  });

  it("PO que não está na lista fica com fechamentoRestante = false", () => {
    const r = parseDirCsv(csv(linhaCsv({ po: "PO26-01-0001", paciente: "ANA TESTE" })));
    expect(r.linhas[0]!.registro!.fechamentoRestante).toBe(false);
  });
});
