import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseDirCsv } from "../../shared/utils/dirParser";
// @ts-expect-error — módulo .mjs do script de dados (sem tipos); só usado por este teste e pelo gerador.
import { COLUNAS_DO_INSERT, COLUNAS_DO_UPDATE, COLUNAS_ESCRITAS_NO_CORTE, expandirListaDePos, literalSql, montarCorte, sqlInsert, sqlUpdate } from "../../scripts/migration/dirCorteSql.mjs";
import { CASCA, EM_ABERTO, csv, linhaCsv } from "./helpers/dirCsv";

// Gerador do SQL do corte da DIR (scripts/migration/gerar-sql-corte-dir.mjs). 100% SINTÉTICO: nenhum dado real, nenhum
// banco, e o SQL nunca é executado. Um UPDATE por PO existente, um INSERT por PO novo, só nas colunas do parser.

const RAIZ = process.cwd();
const lerFonte = (caminho: string): string => readFileSync(resolve(RAIZ, caminho), "utf-8");

// A lista pedida para o corte, como foi escrita.
const LISTA_CORTE = [
  "PO26-08-0398, 0405, 0424;",
  "PO26-09-0435, 0438, 0442, 0448, 0449, 0452, 0453, 0454, 0455, 0460, 0462, 0464;",
  "PO26-10-0470, 0480, 0481, 0484, 0489, 0490, 0491, 0492, 0494, 0495, 0496, 0497, 0498, 0500, 0501, 0502;",
  "PO26-10-0503 a 0520;",
  "PO26-11-0521 a 0525",
].join(" ");
const LISTA_NOVOS = "PO26-10-0503 a 0520, PO26-11-0521 a 0525";

describe("expandirListaDePos", () => {
  it("a lista do corte vira 54 POs, sem repetição, com 31 existentes e 23 novos", () => {
    const pos = expandirListaDePos(LISTA_CORTE);
    const novos = expandirListaDePos(LISTA_NOVOS);
    expect(pos).toHaveLength(54);
    expect(new Set(pos).size).toBe(54);
    expect(novos).toHaveLength(23);
    expect(novos.every((p: string) => pos.includes(p))).toBe(true);
    expect(pos.filter((p: string) => !novos.includes(p))).toHaveLength(31);
  });

  it("expande o prefixo, os intervalos e mantém a ordem", () => {
    expect(expandirListaDePos("PO26-08-0398, 0405, 0424")).toEqual(["PO26-08-0398", "PO26-08-0405", "PO26-08-0424"]);
    expect(expandirListaDePos("PO26-10-0503 a 0506")).toEqual(["PO26-10-0503", "PO26-10-0504", "PO26-10-0505", "PO26-10-0506"]);
    expect(expandirListaDePos("PO26-10-0503 a PO26-10-0505, PO26-11-0521")).toEqual(["PO26-10-0503", "PO26-10-0504", "PO26-10-0505", "PO26-11-0521"]);
    expect(expandirListaDePos("po26-10-0503")).toEqual(["PO26-10-0503"]);
    expect(expandirListaDePos("")).toEqual([]);
  });

  it("os intervalos do corte têm 18 POs em outubro (0503 a 0520) e 5 em novembro (0521 a 0525)", () => {
    const pos = expandirListaDePos(LISTA_CORTE);
    expect(pos.filter((p: string) => p.startsWith("PO26-10-05") && Number(p.slice(-4)) >= 503)).toHaveLength(18);
    expect(pos.filter((p: string) => p.startsWith("PO26-11-"))).toEqual(["PO26-11-0521", "PO26-11-0522", "PO26-11-0523", "PO26-11-0524", "PO26-11-0525"]);
  });

  it.each([
    ["número sem PO antes", "0405"],
    ["lixo", "PO26-10-0503, abc"],
    ["PO fora do padrão", "PO26-10-503"],
    ["repetido", "PO26-10-0503, PO26-10-0503"],
    ["repetido por intervalo", "PO26-10-0503 a 0505, 0504"],
    ["intervalo invertido", "PO26-10-0510 a 0505"],
    ["intervalo que cruza o mês", "PO26-10-0503 a PO26-11-0521"],
    ['"a" sem fim', "PO26-10-0503 a"],
    ['"a" sem começo', "a 0503"],
  ])("recusa: %s", (_nome, texto) => {
    expect(() => expandirListaDePos(texto)).toThrow();
  });
});

describe("literalSql", () => {
  it("texto, aspas, barra invertida, null e boolean", () => {
    expect(literalSql("Poros")).toBe("'Poros'");
    expect(literalSql("D'Amico")).toBe("'D''Amico'");
    expect(literalSql("a\\b")).toBe("E'a\\\\b'");
    expect(literalSql("it's a\\b")).toBe("E'it''s a\\\\b'");
    expect(literalSql(null)).toBe("null");
    expect(literalSql(undefined)).toBe("null");
    expect(literalSql(true)).toBe("true");
    expect(literalSql(false)).toBe("false");
  });
  it("recusa número e caractere nulo (nada vira SQL por acidente)", () => {
    expect(() => literalSql(1 as unknown as string)).toThrow();
    expect(() => literalSql("a\0b")).toThrow();
  });
  it("um texto com instrução SQL fica inerte dentro do literal", () => {
    const l = literalSql("x'; delete from public.dir; --");
    expect(l).toBe("'x''; delete from public.dir; --'");
  });
});

// ── CSV sintético com os 54 POs do corte ───────────────────────────────────────────────────────────
const POS = expandirListaDePos(LISTA_CORTE) as string[];
const NOVOS = expandirListaDePos(LISTA_NOVOS) as string[];

function csvDosPos(pos: string[], extra: (po: string, i: number) => Parameters<typeof linhaCsv>[0] = () => ({})) {
  return csv(CASCA, ...pos.map((po, i) => linhaCsv({ ...EM_ABERTO, po, paciente: `PACIENTE SINTETICO ${i + 1}`, ...extra(po, i) })));
}
const resultadoDos = (pos: string[], extra?: Parameters<typeof csvDosPos>[1]) => parseDirCsv(csvDosPos(pos, extra));

describe("montarCorte: contagens e estrutura", () => {
  const corte = montarCorte({ resultado: resultadoDos(POS), pos: POS, novos: NOVOS });

  it("31 UPDATE e 23 INSERT, uma instrução por PO", () => {
    expect(corte.updates).toHaveLength(31);
    expect(corte.inserts).toHaveLength(23);
    expect(corte.sql.match(/^update public\.dir set$/gm)).toHaveLength(31);
    expect(corte.sql.match(/^insert into public\.dir /gm)).toHaveLength(23);
    for (const po of POS) {
      const citacoes = corte.sql.match(new RegExp(`^-- ${po} \\(linha \\d+ da planilha\\): (UPDATE|INSERT)$`, "gm")) ?? [];
      expect(citacoes, po).toHaveLength(1);
    }
  });

  it("UPDATE para os existentes, INSERT para os novos (nunca o contrário)", () => {
    for (const po of POS) {
      const tipo = NOVOS.includes(po) ? "INSERT" : "UPDATE";
      expect(corte.sql, po).toMatch(new RegExp(`^-- ${po} \\(linha \\d+ da planilha\\): ${tipo}$`, "m"));
    }
  });

  it("tudo numa transação, com as travas de antes e de depois", () => {
    expect(corte.sql).toMatch(/^begin;$/m);
    expect(corte.sql).toMatch(/^commit;$/m);
    expect(corte.sql.indexOf("begin;")).toBeLessThan(corte.sql.indexOf("do $corte$"));
    expect(corte.sql.lastIndexOf("do $corte$")).toBeLessThan(corte.sql.indexOf("commit;"));
    expect(corte.sql.match(/^do \$corte\$$/gm)).toHaveLength(2);
    expect(corte.sql).toContain("PO(s) a inserir já existem no banco");
    expect(corte.sql).toContain("PO(s) a atualizar ausentes ou repetidos no banco");
    expect(corte.sql).toContain("depois do corte, PO(s) sem exatamente 1 linha no banco");
  });

  it("o INSERT usa o id determinístico da carga (dir_carga_<linha>), where not exists pelo PO e on conflict (id) do nothing", () => {
    for (const { po, linha } of corte.inserts) {
      const m = new RegExp(`^select 'dir_carga_${String(linha).padStart(4, "0")}', '${po}'`, "m").test(corte.sql);
      expect(m, po).toBe(true);
      expect(corte.sql, po).toContain(`where not exists (select 1 from public.dir where po = '${po}')`);
    }
    expect(corte.sql.match(/^where not exists \(select 1 from public\.dir where po = /gm)).toHaveLength(23);
    expect(corte.sql.match(/^on conflict \(id\) do nothing;$/gm)).toHaveLength(23);
  });

  it("o UPDATE acha a linha pelo PO (where po = '…')", () => {
    for (const { po } of corte.updates) expect(corte.sql, po).toContain(`where po = '${po}';`);
    expect(corte.sql.match(/^where po = /gm)).toHaveLength(31);
  });

  it("created_at só no INSERT, como now(); o UPDATE nunca mexe em created_at nem em updated_at", () => {
    expect(corte.sql.match(/now\(\)/g)).toHaveLength(23 * 2);
    for (const stmt of statementsDe(corte.sql, "update")) {
      expect(stmt).not.toMatch(/created_at|updated_at/);
    }
  });

  it("o relatório e o SQL não levam o nome do paciente em comentário (só PO e linha)", () => {
    const comentarios = corte.sql.split("\n").filter((l) => l.startsWith("--"));
    for (const c of comentarios) expect(c).not.toMatch(/PACIENTE SINTETICO/);
    expect(JSON.stringify([corte.inserts, corte.updates, corte.comFechamentoRestante])).not.toMatch(/PACIENTE/);
  });
});

function statementsDe(sql: string, tipo: "update" | "insert"): string[] {
  const inicio = tipo === "update" ? "update public\\.dir" : "insert into public\\.dir";
  return sql.split(/\n\n/).filter((b) => new RegExp(`^(-- .*\\n)?${inicio}`).test(b));
}

function colunasDoUpdate(stmt: string): string[] {
  return [...stmt.matchAll(/^ {2}([a-z_]+) = /gm)].map((m) => m[1]!);
}
function colunasDoInsert(stmt: string): string[] {
  const m = /insert into public\.dir \(([^)]*)\)/.exec(stmt);
  return m ? m[1]!.split(",").map((c) => c.trim()) : [];
}

// Lista escrita à mão aqui (independente do módulo): é o contrato do que o corte pode escrever.
const COLUNAS_ESPERADAS = [
  "po", "paciente", "vendedor", "status", "responsavel", "receita", "medicamento", "temperatura", "fornecedor", "envio",
  "companhia_aerea", "awb", "despachante", "contrato_cambio", "observacao", "banco", "data_emissao",
  "data_cobranca_fornecedores", "data_entrega", "data_pagamento", "conferido", "exigencia", "operacao_encerrada", "dactes",
  "dsi_dir_duimp", "logger", "fechamento", "numerario", "protocolo_assinado", "swift", "termometro", "fechamento_restante",
];
const PROIBIDAS_NO_UPDATE = ["id", "po", "created_at", "updated_at", "fechamento_restante_em", "fechamento_restante_por", "origem"];

describe("o corte não escreve fora das colunas do parser", () => {
  const corte = montarCorte({ resultado: resultadoDos(POS), pos: POS, novos: NOVOS });

  it("a lista fechada é exatamente a combinada (32 colunas; 30 no UPDATE, sem po e sem fechamento_restante)", () => {
    expect([...COLUNAS_ESCRITAS_NO_CORTE]).toEqual(COLUNAS_ESPERADAS);
    expect(COLUNAS_ESCRITAS_NO_CORTE).toHaveLength(32);
    expect([...COLUNAS_DO_UPDATE]).toEqual(COLUNAS_ESPERADAS.filter((c) => c !== "po" && c !== "fechamento_restante"));
    expect(COLUNAS_DO_UPDATE).toHaveLength(30);
    expect([...COLUNAS_DO_INSERT]).toEqual(["id", ...COLUNAS_ESPERADAS, "created_at", "updated_at"]);
  });

  it("cada UPDATE grava exatamente as 30 colunas do parser e nenhuma proibida (fechamento_restante ausente)", () => {
    const updates = statementsDe(corte.sql, "update");
    expect(updates).toHaveLength(31);
    for (const stmt of updates) {
      const colunas = colunasDoUpdate(stmt);
      expect(colunas).toEqual(COLUNAS_ESPERADAS.filter((c) => c !== "po" && c !== "fechamento_restante"));
      for (const proibida of PROIBIDAS_NO_UPDATE) expect(colunas).not.toContain(proibida);
      expect(stmt).not.toMatch(/fechamento_restante/);
    }
  });

  it("fechamento_restante: nenhum UPDATE o escreve, nem quando a planilha marca o PO; o INSERT o escreve", () => {
    // Marca a lista da planilha: as entradas de texto igual ao PACIENTE marcam o PO (os 5 primeiros são UPDATE; os 3 últimos, INSERT).
    const marcar = (i: number) => (i < 5 || i >= POS.length - 3 ? { restantes: `PACIENTE SINTETICO ${i + 1}` } : {});
    const c = montarCorte({ resultado: resultadoDos(POS, (_po, i) => marcar(i)), pos: POS, novos: NOVOS });
    for (const stmt of statementsDe(c.sql, "update")) expect(stmt).not.toMatch(/fechamento_restante/);
    const inserts = statementsDe(c.sql, "insert");
    expect(inserts).toHaveLength(23);
    for (const stmt of inserts) expect(colunasDoInsert(stmt)).toContain("fechamento_restante");
    expect(c.sql.match(/, true, now\(\), now\(\)$/gm)).toHaveLength(3); // os 3 INSERT de POs marcados
    expect(c.sql.match(/, false, now\(\), now\(\)$/gm)).toHaveLength(20);
    expect(c.comFechamentoRestante).toHaveLength(3);
  });

  it("cada INSERT grava só as colunas do parser + id, created_at e updated_at; nada da auditoria nem da coluna removida", () => {
    const inserts = statementsDe(corte.sql, "insert");
    expect(inserts).toHaveLength(23);
    for (const stmt of inserts) {
      const colunas = colunasDoInsert(stmt);
      expect(colunas).toEqual(["id", ...COLUNAS_ESPERADAS, "created_at", "updated_at"]);
      for (const proibida of ["fechamento_restante_em", "fechamento_restante_por", "origem"]) expect(colunas).not.toContain(proibida);
    }
  });

  it("a auditoria da marca (fechamento_restante_em/_por) não aparece em lugar nenhum do SQL, com fechamento restante falso ou verdadeiro", () => {
    // Na lista da planilha, a entrada de texto igual ao PACIENTE de um PO marca esse PO (fechamento_restante = true).
    const comMarcados = resultadoDos(POS, (_po, i) => ({ restantes: i < 5 ? `PACIENTE SINTETICO ${i + 1}` : "" }));
    const semComentarios = (sql: string) => sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
    for (const r of [resultadoDos(POS), comMarcados]) {
      const c = montarCorte({ resultado: r, pos: POS, novos: NOVOS });
      expect(semComentarios(c.sql)).not.toMatch(/fechamento_restante_em|fechamento_restante_por/);
      expect(c.sql).not.toMatch(/origem/i);
    }
    // Os 5 primeiros POs marcados são UPDATE, que não escreve fechamento_restante: nenhum INSERT o grava como verdadeiro aqui.
    const c = montarCorte({ resultado: comMarcados, pos: POS, novos: NOVOS });
    expect(c.comFechamentoRestante).toEqual([]);
    expect(c.sql.match(/, true, now\(\), now\(\)$/gm)).toBeNull();
  });

  it("o SQL só tem os comandos do corte: begin, do, update, insert, commit (nada de delete, drop, truncate, alter, create)", () => {
    const semComentarios = corte.sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
    expect(semComentarios).not.toMatch(/\b(delete|drop|truncate|alter|create|grant|revoke|copy)\b/i);
    const comandos = [...semComentarios.matchAll(/^(begin|commit|do|update|insert)\b/gm)].map((m) => m[1]);
    expect(new Set(comandos)).toEqual(new Set(["begin", "commit", "do", "update", "insert"]));
    // só a tabela public.dir é tocada
    const tabelas = new Set([...semComentarios.matchAll(/\b(?:update|into|from) (public\.[a-z_]+)/g)].map((m) => m[1]));
    expect([...tabelas]).toEqual(["public.dir"]);
  });

  it("se o mapeador deixar de produzir uma coluna da lista, o gerador recusa em vez de gerar SQL incompleto (trava)", () => {
    const reg = resultadoDos(POS.slice(0, 1)).linhas.find((l) => !l.ignorada)!.registro!;
    expect(() => sqlUpdate({ ...reg })).not.toThrow();
    const semCia = { ...reg } as Record<string, unknown>;
    delete semCia.companhiaAerea;
    expect(() => sqlUpdate(semCia as never)).toThrow(/não produziu/);
    expect(() => sqlInsert(semCia as never, 5)).toThrow(/não produziu/);
  });

  it("valores do parser entram corretamente no SQL (cia, AWB, booleanos, datas, nulos, aspas)", () => {
    const r = resultadoDos(["PO26-10-0470"], () => ({ awb: "Lufthansa: 020-01045494", medicamento: "D'AMICO 10MG", receita: "" }));
    const reg = r.linhas.find((l) => !l.ignorada)!.registro!;
    const sql = sqlUpdate(reg);
    expect(sql).toContain("companhia_aerea = 'Lufthansa'");
    expect(sql).toContain("awb = '020-01045494'");
    expect(sql).toContain("medicamento = 'D''AMICO 10MG'");
    expect(sql).toContain("receita = null");
    expect(sql).toContain("data_emissao = '2026-01-05'");
    expect(sql).toContain("conferido = true");
    expect(sql).toContain("status = 'on_going'");
    const ins = sqlInsert(reg, 7);
    expect(ins).toContain("'dir_carga_0007', 'PO26-10-0470'");
  });
});

describe("montarCorte: o que aborta (nada é gerado)", () => {
  it("PO que não está na planilha", () => {
    expect(() => montarCorte({ resultado: resultadoDos(POS.slice(0, 3)), pos: POS.slice(0, 4), novos: [] })).toThrow(/não estão na planilha/);
  });
  it("PO em mais de uma linha da planilha", () => {
    const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, po: "PO26-10-0470" }), linhaCsv({ ...EM_ABERTO, po: "PO26-10-0470" })));
    expect(() => montarCorte({ resultado: r, pos: ["PO26-10-0470"], novos: [] })).toThrow(/mais de uma linha/);
  });
  it("PO cuja linha tem erro no parser (sem registro) conta como ausente", () => {
    const r = parseDirCsv(csv(CASCA, linhaCsv({ ...EM_ABERTO, po: "PO26-10-0470", status: "ESTATUS INVENTADO" })));
    expect(() => montarCorte({ resultado: r, pos: ["PO26-10-0470"], novos: [] })).toThrow(/não estão na planilha/);
  });
  it("--novos fora da lista do corte", () => {
    expect(() => montarCorte({ resultado: resultadoDos(POS.slice(0, 2)), pos: POS.slice(0, 1), novos: [POS[1]!] })).toThrow(/não estão na lista/);
  });
  it("sem nenhum INSERT (ou nenhum UPDATE) a trava correspondente não aparece", () => {
    const soUpdate = montarCorte({ resultado: resultadoDos(POS.slice(0, 2)), pos: POS.slice(0, 2), novos: [] }).sql;
    expect(soUpdate).not.toContain("a inserir já existem");
    expect(soUpdate).toContain("a atualizar ausentes");
    const soInsert = montarCorte({ resultado: resultadoDos(POS.slice(0, 2)), pos: POS.slice(0, 2), novos: POS.slice(0, 2) }).sql;
    expect(soInsert).toContain("a inserir já existem");
    expect(soInsert).not.toContain("a atualizar ausentes");
  });
  it("informa quais INSERT gravam fechamento_restante = true (marca da lista da planilha), só com PO e linha", () => {
    const tres = POS.slice(0, 3);
    const sem = montarCorte({ resultado: resultadoDos(tres), pos: tres, novos: [tres[1]!] });
    expect(sem.comFechamentoRestante).toEqual([]); // sem a lista preenchida, ninguém é marcado
    const r = resultadoDos(tres, (_po, i) => ({ restantes: i === 1 ? "PACIENTE SINTETICO 2" : "" }));
    const com = montarCorte({ resultado: r, pos: tres, novos: [tres[1]!] });
    expect(com.comFechamentoRestante).toEqual([{ po: tres[1], linha: 4 }]);
  });
});

// ── Escopo padrão (sem --pos / sem --novos) e --ignorar ───────────────────────────────────────────
describe("montarCorte: sem --pos, sem --novos e --ignorar", () => {
  const ocorrencias = (sql: string, tipo: "update" | "insert", po: string) =>
    statementsDe(sql, tipo).filter((s) => s.includes(`-- ${po} (linha`)).length;
  const pos10 = POS.slice(0, 10);

  it("sem --pos: todo PO do CSV vira UPDATE (where po = …); sem --novos: todo PO também ganha INSERT com where not exists", () => {
    const c = montarCorte({ resultado: resultadoDos(pos10) });
    expect(c.updates.map((u: { po: string }) => u.po)).toEqual(pos10);
    expect(c.inserts.map((u: { po: string }) => u.po)).toEqual(pos10);
    for (const po of pos10) {
      expect(c.sql, po).toContain(`where po = '${po}';`);
      expect(c.sql, po).toContain(`where not exists (select 1 from public.dir where po = '${po}')`);
    }
    expect(c.sql.match(/^on conflict \(id\) do nothing;$/gm)).toHaveLength(10); // segunda proteção continua
  });

  it("nenhum PO sai duplicado: um UPDATE e um INSERT por PO, e todos os UPDATE vêm antes de qualquer INSERT", () => {
    const c = montarCorte({ resultado: resultadoDos(pos10) });
    for (const po of pos10) {
      expect(ocorrencias(c.sql, "update", po), po).toBe(1);
      expect(ocorrencias(c.sql, "insert", po), po).toBe(1);
    }
    expect(statementsDe(c.sql, "update")).toHaveLength(10);
    expect(statementsDe(c.sql, "insert")).toHaveLength(10);
    expect(c.sql.lastIndexOf("update public.dir set")).toBeLessThan(c.sql.indexOf("insert into public.dir"));
    expect(c.sql).toContain("todos os UPDATE vêm antes dos INSERT");
  });

  it("com --pos e sem --novos: só aquela lista, cada PO com UPDATE e INSERT protegido", () => {
    const c = montarCorte({ resultado: resultadoDos(pos10), pos: pos10.slice(0, 3) });
    expect(c.updates).toHaveLength(3);
    expect(c.inserts).toHaveLength(3);
  });

  it("com --novos e sem --pos: os novos só viram INSERT; os demais POs do CSV só viram UPDATE", () => {
    const novos = pos10.slice(7);
    const c = montarCorte({ resultado: resultadoDos(pos10), novos });
    expect(c.inserts.map((u: { po: string }) => u.po)).toEqual(novos);
    expect(c.updates.map((u: { po: string }) => u.po)).toEqual(pos10.slice(0, 7));
    for (const po of pos10) expect(ocorrencias(c.sql, "update", po) + ocorrencias(c.sql, "insert", po), po).toBe(1);
  });

  it("travas no modo padrão: aborta se um PO existir mais de uma vez no banco, mas não exige que ele exista (o INSERT cria)", () => {
    const sql = montarCorte({ resultado: resultadoDos(pos10) }).sql;
    expect(sql).toContain("PO(s) a atualizar repetidos no banco");
    expect(sql).not.toContain("a atualizar ausentes");
    expect(sql).not.toContain("a inserir já existem");
    expect(sql).toContain("depois do corte, PO(s) sem exatamente 1 linha no banco");
    expect(sql.match(/^do \$corte\$$/gm)).toHaveLength(2);
  });

  it("--ignorar: o PO não gera UPDATE nem INSERT, nem trava, e sai na lista de ignorados", () => {
    const ignorado = pos10[3]!;
    const c = montarCorte({ resultado: resultadoDos(pos10), ignorar: [ignorado] });
    expect(c.ignorados).toEqual([ignorado]);
    expect(c.updates).toHaveLength(9);
    expect(c.inserts).toHaveLength(9);
    expect(c.sql).not.toContain(ignorado); // nem comentário, nem where, nem array das travas
    for (const po of pos10.filter((p) => p !== ignorado)) expect(c.sql, po).toContain(po);
  });

  it("--ignorar também tira o PO de --pos e de --novos explícitos (sem erro)", () => {
    const [a, b, c3] = pos10 as [string, string, string];
    const c = montarCorte({ resultado: resultadoDos(pos10), pos: [a, b, c3], novos: [c3, b], ignorar: [b] });
    expect(c.updates.map((u: { po: string }) => u.po)).toEqual([a]);
    expect(c.inserts.map((u: { po: string }) => u.po)).toEqual([c3]);
    expect(c.sql).not.toContain(b);
  });

  it("PO repetido na planilha aborta e manda usar --ignorar; ignorado, a duplicata não atrapalha", () => {
    const r = parseDirCsv(
      csv(
        CASCA,
        linhaCsv({ ...EM_ABERTO, po: "PO26-03-0109", paciente: "PACIENTE SINTETICO A" }),
        linhaCsv({ ...EM_ABERTO, po: "PO26-03-0109", paciente: "PACIENTE SINTETICO B" }),
        linhaCsv({ ...EM_ABERTO, po: "PO26-03-0110", paciente: "PACIENTE SINTETICO C" }),
      ),
    );
    expect(() => montarCorte({ resultado: r })).toThrow(/PO26-03-0109 \(linhas 3, 4\).*--ignorar|--ignorar.*PO26-03-0109/s);
    const c = montarCorte({ resultado: r, ignorar: ["PO26-03-0109"] });
    expect(c.updates.map((u: { po: string }) => u.po)).toEqual(["PO26-03-0110"]);
    expect(c.inserts.map((u: { po: string }) => u.po)).toEqual(["PO26-03-0110"]);
    expect(c.sql).not.toContain("PO26-03-0109");
  });

  it("com o CSV inteiro, linha com erro no parser aborta (o PO dela não seria gerado em silêncio)", () => {
    const r = parseDirCsv(
      csv(CASCA, linhaCsv({ ...EM_ABERTO, po: "PO26-10-0470" }), linhaCsv({ ...EM_ABERTO, po: "PO26-10-0471", status: "ESTATUS INVENTADO" })),
    );
    expect(() => montarCorte({ resultado: r })).toThrow(/linhas da planilha com erro no parser.*4/);
    // com lista explícita, a linha com erro só importa se for de um PO pedido
    expect(montarCorte({ resultado: r, pos: ["PO26-10-0470"] }).updates).toHaveLength(1);
  });
});

// ── O script de linha de comando (gera arquivo só em scratch/, nunca fala com banco) ───────────────────

describe("gerar-sql-corte-dir.mjs", () => {
  const SCRIPT = resolve(RAIZ, "scripts/migration/gerar-sql-corte-dir.mjs");
  const pasta = mkdtempSync(join(tmpdir(), "corte-dir-teste-"));
  const csvTeste = join(pasta, "dir.csv");
  const saidaScratch = join(RAIZ, "scratch", `__teste-corte-${process.pid}.sql`);
  writeFileSync(csvTeste, csvDosPos(["PO26-10-0470", "PO26-10-0503", "PO26-10-0504"]), "utf-8");

  afterAll(() => {
    rmSync(pasta, { recursive: true, force: true });
    rmSync(saidaScratch, { force: true });
  });

  const rodar = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, csvTeste, ...args], { encoding: "utf-8", cwd: pasta });

  it("lê o CSV, grava o SQL em scratch/ e imprime só PO e linha (sem nome de paciente)", () => {
    mkdirSync(join(RAIZ, "scratch"), { recursive: true });
    const r = rodar("--pos", "PO26-10-0470, PO26-10-0503, 0504", "--novos", "PO26-10-0503 a 0504", "--saida", saidaScratch);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/UPDATE:\s+1\b/);
    expect(r.stdout).toMatch(/INSERT:\s+2\b/);
    expect(r.stdout).not.toMatch(/PACIENTE SINTETICO/);
    const sql = readFileSync(saidaScratch, "utf-8");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.match(/^update public\.dir set$/gm)).toHaveLength(1);
    expect(sql.match(/^insert into public\.dir /gm)).toHaveLength(2);
  });

  it("sem --pos e sem --novos: UPDATE e INSERT protegido para cada PO do CSV; o resumo traz arquivo, linhas, contagens e ignorados", () => {
    const r = rodar("--saida", saidaScratch);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("RESUMO DO CORTE");
    expect(r.stdout).toContain(`Arquivo lido:      ${csvTeste}`);
    expect(r.stdout).toMatch(/Linhas de dados:\s+4 \(com PO ou paciente: 3;/); // 1 casca + 3 POs
    expect(r.stdout).toMatch(/UPDATE:\s+3\b/);
    expect(r.stdout).toMatch(/INSERT:\s+3\b/);
    expect(r.stdout).toMatch(/Ignorados:\s+0\b/);
    expect(r.stdout).not.toMatch(/PACIENTE SINTETICO/);
    const sql = readFileSync(saidaScratch, "utf-8");
    expect(sql.match(/^update public\.dir set$/gm)).toHaveLength(3);
    expect(sql.match(/^where not exists \(select 1 from public\.dir where po = /gm)).toHaveLength(3);
  });

  it("--ignorar: o PO sai dos dois comandos e o resumo diz quais foram ignorados (inclusive um que não está no CSV)", () => {
    const r = rodar("--ignorar", "PO26-10-0503, PO26-10-0999", "--saida", saidaScratch);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/UPDATE:\s+2\b/);
    expect(r.stdout).toMatch(/INSERT:\s+2\b/);
    expect(r.stdout).toMatch(/Ignorados:\s+2\s+→ PO26-10-0503, PO26-10-0999/);
    expect(r.stdout).toContain("não estão no CSV: PO26-10-0999");
    const sql = readFileSync(saidaScratch, "utf-8");
    expect(sql).not.toContain("PO26-10-0503");
    expect(sql).not.toContain("PO26-10-0999");
    expect(sql).toContain("PO26-10-0470");
    expect(sql).toContain("PO26-10-0504");
  });

  it("recusa gravar fora de scratch/ (o arquivo tem nome de paciente)", () => {
    const fora = join(pasta, "corte.sql");
    const r = rodar("--pos", "PO26-10-0470", "--saida", fora);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/dentro de scratch/);
    expect(existsSync(fora)).toBe(false);
  });

  it("PO que não está na planilha: aborta e não grava nada", () => {
    rmSync(saidaScratch, { force: true });
    const r = rodar("--pos", "PO26-10-0470, PO26-10-0999", "--saida", saidaScratch);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PO26-10-0999/);
    expect(existsSync(saidaScratch)).toBe(false);
  });

  it("lista inválida em --pos, --novos ou --ignorar aborta; sem CSV aborta", () => {
    rmSync(saidaScratch, { force: true });
    expect(rodar("--pos", "0470", "--saida", saidaScratch).status).toBe(1);
    expect(rodar("--novos", "abc", "--saida", saidaScratch).status).toBe(1);
    expect(rodar("--ignorar", "0470", "--saida", saidaScratch).status).toBe(1);
    expect(spawnSync(process.execPath, [SCRIPT, "--saida", saidaScratch], { encoding: "utf-8", cwd: pasta }).status).toBe(1);
    expect(existsSync(saidaScratch)).toBe(false);
  });
});

describe("trava de código: o gerador não fala com o banco, não lê o .env e não cita a coluna removida", () => {
  for (const arquivo of ["scripts/migration/gerar-sql-corte-dir.mjs", "scripts/migration/dirCorteSql.mjs"]) {
    it(arquivo, () => {
      const fonte = lerFonte(arquivo);
      const codigo = fonte.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"); // os comentários explicam "não lê o .env"
      expect(codigo).not.toMatch(/createClient|supabase-js|\.env\b|fetch\(|NUXT_SUPABASE|SERVICE_ROLE|ALLOW_REAL_DB|process\.env/);
      expect(codigo).not.toMatch(/\bexec(Sync)?\(|spawn|child_process/);
      expect(fonte).not.toMatch(/origem/i);
    });
  }

  it("só grava em scratch/, que está no .gitignore", () => {
    expect(lerFonte("scripts/migration/gerar-sql-corte-dir.mjs")).toContain("scratch");
    expect(lerFonte(".gitignore")).toMatch(/^scratch\/$/m);
  });
});
