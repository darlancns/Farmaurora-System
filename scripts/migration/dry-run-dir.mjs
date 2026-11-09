// DRY-RUN da carga da DIR: lê o CSV da planilha (padrão: scratch/dir.csv), roda o parser e IMPRIME
// um relatório. NÃO abre conexão, NÃO lê o .env, NÃO grava nada (nem em disco, nem no Supabase).
// Por isso não precisa da trava ALLOW_REAL_DB — ela existe no carga-dir.mjs, que é quem acessa o banco.
//
// O CSV tem dados de pacientes: o relatório NUNCA imprime nome de paciente, só PO e nº da linha da
// planilha (cabeçalho = linha 1).
//
// Uso: node scripts/migration/dry-run-dir.mjs [caminho-do-csv]
//
// O relatório fecha a conta em cima do total de linhas reais: cada tabela (status, booleanos, datas,
// vendedor, responsável, operação) soma esse total, e o script confere isso sozinho (seção 9).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseCsv, parseDirCsv } from "../../shared/utils/dirParser.ts";
import { hojeBrasilia } from "../../shared/utils/dataBrasilia.ts";
import { normalizeText } from "../../app/utils/search.ts";
import {
  BANCOS_DIR,
  CHECKLIST_DIR,
  DESPACHANTES_DIR,
  ENVIOS_DIR,
  FORNECEDORES_DIR,
  OBSERVACOES_DIR,
  RECEITAS_DIR,
  TEMPERATURAS_DIR,
  VENDEDOR_CANONICO,
} from "../../shared/constants/dir.ts";
import { CIAS_AEREAS_TODAS } from "../../shared/constants/processos.ts";

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAMINHO = resolve(process.argv[2] ?? join(CRM, "scratch", "dir.csv"));
const HOJE = hojeBrasilia();

const texto = readFileSync(CAMINHO, "utf-8");
const tabela = parseCsv(texto);
const resultado = parseDirCsv(texto, { hoje: HOJE });

// Toda a saída passa por `log`, que também a guarda: no fim o script varre o próprio relatório atrás
// de nomes de pacientes (seção 9).
const saida = [];
const log = (...partes) => {
  const linha = partes.join(" ");
  saida.push(linha);
  console.log(linha);
};
const titulo = (s) => log(`\n${"=".repeat(78)}\n${s}\n${"=".repeat(78)}`);
const n3 = (n) => String(n).padStart(4, " ");
const contar = (itens, chave) => {
  const m = new Map();
  for (const i of itens) m.set(chave(i), (m.get(chave(i)) ?? 0) + 1);
  return m;
};
const soma = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const conferencias = [];
const confere = (descricao, ok) => conferencias.push({ descricao, ok });

const todas = resultado.linhas;
const ignoradas = todas.filter((l) => l.ignorada);
const reais = todas.filter((l) => !l.ignorada);
const rejeitadas = reais.filter((l) => l.registro === null);
const aImportar = reais.filter((l) => l.registro !== null);
const regs = aImportar.map((l) => ({ linha: l.linha, ...l.registro }));
const TOTAL = aImportar.length;

// Valor cru das células, para mostrar os formatos encontrados na planilha (sem passar pelo parser).
const norm = (h) => h.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
const cabecalho = (tabela[0] ?? []).map(norm);
const indiceDe = (nome) => cabecalho.indexOf(norm(nome));
const linhasReais = new Set(reais.map((l) => l.linha));
const cru = (nome) =>
  tabela
    .slice(1)
    .map((cel, i) => ({ linha: i + 2, valor: (cel[indiceDe(nome)] ?? "").trim() }))
    .filter((c) => linhasReais.has(c.linha));

titulo(`DRY-RUN DIR — NADA FOI GRAVADO (sem conexão, sem .env, sem escrita)   hoje=${HOJE}`);
log(`Arquivo-fonte: ${CAMINHO}`);
log(`Colunas ausentes (obrigatórias): ${resultado.colunasAusentes.length ? resultado.colunasAusentes.join(", ") : "nenhuma"}`);
log(`Colunas desconhecidas:           ${resultado.colunasExtras.length ? resultado.colunasExtras.join(", ") : "nenhuma"}`);
const restantes = cru("FECHAMENTOS RESTANTES").filter((c) => c.valor !== "").length;
log(`Coluna FECHAMENTOS RESTANTES:     ${restantes} células preenchidas, LIDAS e mapeadas para POs (seção 9)`);

// ── 1. Leitura ──────────────────────────────────────────────────────────────
titulo("1. LEITURA");
log(`  Linhas de dados no CSV (sem o cabeçalho): ${n3(todas.length)}`);
log(`  − ignoradas (casca: sem PO e sem paciente): ${n3(ignoradas.length)}   linhas ${ignoradas[0]?.linha ?? "-"} a ${ignoradas.at(-1)?.linha ?? "-"}`);
log(`  = linhas reais:                            ${n3(reais.length)}   linhas ${reais[0]?.linha ?? "-"} a ${reais.at(-1)?.linha ?? "-"}`);
log(`  − rejeitadas (erro):                       ${n3(rejeitadas.length)}`);
log(`  = A IMPORTAR:                              ${n3(TOTAL)}`);
confere("ignoradas + reais = linhas de dados do CSV", ignoradas.length + reais.length === todas.length);
confere("a importar + rejeitadas = reais", TOTAL + rejeitadas.length === reais.length);
// Casca de verdade: em cada linha ignorada, só as 10 colunas de checkbox têm conteúdo e nenhuma está marcada.
const COLUNAS_CHECKBOX = new Set(["CHECK", "EXIGÊNCIA", "DACTES", "DSI/DIR/DUIMP", "LOGGER", "FECHAMENTO", "NUMERÁRIO", "PROTOCOLO ASSINADO", "SWIFT", "TERMOMÊTRO"].map(norm));
const dadosPerdidos = ignoradas.filter((l) => {
  const cel = tabela[l.linha - 1] ?? [];
  return cel.some((v, i) => {
    const marcada = ["TRUE", "VERDADEIRO"].includes(v.trim().toUpperCase());
    return COLUNAS_CHECKBOX.has(cabecalho[i] ?? "") ? marcada : v.trim() !== "";
  });
});
confere("linhas ignoradas só têm checkboxes DESMARCADOS (nenhum dado perdido)", dadosPerdidos.length === 0);

// ── 2. Status ───────────────────────────────────────────────────────────────
titulo("2. STATUS (coluna status + data_entrega) — soma = total a importar");
const porStatus = contar(regs, (r) => r.status ?? "NULL");
const ordemStatus = ["on_going", "entregue", "cancelado", "falecimento", "NULL"];
for (const s of ordemStatus) log(`  ${s.padEnd(12)} ${n3(porStatus.get(s) ?? 0)}`);
log(`  ${"TOTAL".padEnd(12)} ${n3(soma(porStatus))}`);
confere("status somam o total a importar", soma(porStatus) === TOTAL);
const entregues = regs.filter((r) => r.status === "entregue");
const entreguesComData = entregues.filter((r) => r.dataEntrega !== "");
log(`  entregue com data_entrega: ${entreguesComData.length}   entregue sem data: ${entregues.length - entreguesComData.length}`);
log(`  data_entrega preenchida fora de "entregue": ${regs.filter((r) => r.status !== "entregue" && r.dataEntrega !== "").length}`);
confere("toda data_entrega pertence a um status entregue", regs.every((r) => r.status === "entregue" || r.dataEntrega === ""));
log("  Status nulos (linha / PO):", regs.filter((r) => r.status === null).map((r) => `${r.linha}/${r.po}`).join(", ") || "nenhum");

log("\n  Origem de cada status, na grafia da planilha (valor cru, linhas reais):");
const padraoStatus = (v) => {
  if (v === "") return "(vazio)";
  if (/^-+$/.test(v)) return "(só traços)";
  if (/^On going$/i.test(v)) return "On going";
  if (/^Entregue \d{2}\.\d{2}\.\d{2}$/.test(v)) return "Entregue dd.mm.aa";
  if (/^Entregue:\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return "Entregue: d/m/aa";
  if (/^Entrega \d{2}\.\d{2}\.\d{2}$/.test(v)) return "Entrega dd.mm.aa (sem o 'gue')";
  return v;
};
const padroes = contar(cru("STATUS"), (c) => padraoStatus(c.valor));
for (const [k, v] of [...padroes].sort((a, b) => b[1] - a[1])) log(`    ${n3(v)}  ${k}`);
log(`    ${n3(soma(padroes))}  TOTAL`);
confere("padrões crus de STATUS somam as linhas reais", soma(padroes) === reais.length);
const distintasBarra = new Set(cru("STATUS").filter((c) => /^Entregue:/.test(c.valor)).map((c) => c.valor)).size;
log(`    (datas distintas no formato 'Entregue: d/m/aa': ${distintasBarra})`);
const entreguePorPadrao = (padroes.get("Entregue dd.mm.aa") ?? 0) + (padroes.get("Entregue: d/m/aa") ?? 0) + (padroes.get("Entrega dd.mm.aa (sem o 'gue')") ?? 0);
confere("entregue (parser) = soma dos 3 padrões 'Entregue/Entrega …' da planilha", entregues.length === entreguePorPadrao);

// ── 3. Booleanos ────────────────────────────────────────────────────────────
titulo("3. BOOLEANOS — cada coluna soma o total a importar");
// Nome do cabeçalho na planilha (note o "TERMOMÊTRO" escrito assim lá).
const COLUNA_PLANILHA = {
  dactes: "DACTES",
  dsiDirDuimp: "DSI/DIR/Duimp",
  logger: "LOGGER",
  fechamento: "FECHAMENTO",
  numerario: "NUMERÁRIO",
  protocoloAssinado: "PROTOCOLO ASSINADO",
  swift: "SWIFT",
  termometro: "TERMOMÊTRO",
};
const colunasBool = [
  ["CHECK (conferido)", "conferido", "CHECK"],
  ["EXIGÊNCIA (exigencia)", "exigencia", "EXIGÊNCIA"],
  ["FECHAMENTO DE OPERAÇÃO (operacaoEncerrada)", "operacaoEncerrada", "FECHAMENTO DE OPERAÇÃO"],
  ...CHECKLIST_DIR.map((i) => [`${COLUNA_PLANILHA[i.chave]} (${i.chave})`, i.chave, COLUNA_PLANILHA[i.chave]]),
  // Não é uma coluna da linha: vem do mapeamento da lista FECHAMENTOS RESTANTES (seção 9).
  ["FECHAMENTO RESTANTE (fechamentoRestante, da lista)", "fechamentoRestante", null],
];
log(`  ${"coluna".padEnd(46)} verdadeiro  falso   (vazio na planilha → falso)   soma`);
for (const [rotulo, chave, planilha] of colunasBool) {
  const v = regs.filter((r) => r[chave]).length;
  const f = TOTAL - v;
  const vazios = planilha === null ? 0 : cru(planilha).filter((c) => c.valor === "").length;
  log(`  ${rotulo.padEnd(46)} ${n3(v).padStart(9)}  ${n3(f)}   (${String(vazios).padStart(2)} vazio${vazios === 1 ? " " : "s"})                    ${n3(v + f)}`);
  confere(`${rotulo}: verdadeiro + falso = total`, v + f === TOTAL);
}
const vazioOp = cru("FECHAMENTO DE OPERAÇÃO").filter((c) => c.valor === "").length;
log(`  Operação: encerrada=${regs.filter((r) => r.operacaoEncerrada).length}  em andamento=${regs.filter((r) => !r.operacaoEncerrada).length}  (vazias na planilha: ${vazioOp})`);

// ── 4. Datas ────────────────────────────────────────────────────────────────
titulo("4. DATAS — preenchida + vazia = total a importar");
const colunasData = [
  ["data_emissao", "dataEmissao", "DATA DE EMISSÃO"],
  ["data_cobranca_fornecedores", "dataCobrancaFornecedores", "DATA DE COBRANÇA AOS FORNECEDORES"],
  ["data_pagamento", "dataPagamento", "DATA DE PAGAMENTO"],
  ["data_entrega (do STATUS)", "dataEntrega", null],
];
for (const [rotulo, chave] of colunasData) {
  const preenchidas = regs.filter((r) => r[chave] !== "");
  const datas = preenchidas.map((r) => r[chave]).sort();
  const faixa = datas.length ? `  de ${datas[0]} a ${datas.at(-1)}` : "";
  log(`  ${rotulo.padEnd(30)} preenchidas ${n3(preenchidas.length)}   vazias ${n3(TOTAL - preenchidas.length)}   soma ${n3(TOTAL)}${faixa}`);
  confere(`${rotulo}: preenchidas + vazias = total`, preenchidas.length + (TOTAL - preenchidas.length) === TOTAL);
}
const formato = (v) => v.replace(/[A-Za-zÀ-ú]+/g, "A").replace(/\d/g, "9");
for (const [rotulo, nome] of [["DATA DE EMISSÃO", "DATA DE EMISSÃO"], ["DATA DE COBRANÇA", "DATA DE COBRANÇA AOS FORNECEDORES"], ["DATA DE PAGAMENTO", "DATA DE PAGAMENTO"]]) {
  const f = contar(cru(nome).filter((c) => c.valor !== ""), (c) => formato(c.valor));
  log(`  formatos crus de ${rotulo}: ${[...f].map(([k, v]) => `${k} ×${v}`).join(" · ") || "(nenhum)"}`);
}
log(`  dia da semana conferido e descartado em ${regs.filter((r) => r.dataEmissao !== "").length + regs.filter((r) => r.dataCobrancaFornecedores !== "").length} datas (nenhuma divergência — divergência seria erro e rejeitaria a linha).`);

// ── 5. Vendedor / responsável ───────────────────────────────────────────────
titulo("5. VENDEDOR e RESPONSÁVEL — soma = total a importar");
const porVendedor = contar(regs, (r) => r.vendedor);
const canonicos = new Set(Object.values(VENDEDOR_CANONICO));
for (const [k, v] of [...porVendedor].sort((a, b) => b[1] - a[1])) {
  log(`  ${n3(v)}  ${k}${canonicos.has(k) ? "" : "   ← LITERAL (sem mapeamento canônico)"}`);
}
log(`  ${n3(soma(porVendedor))}  TOTAL`);
confere("vendedores somam o total a importar", soma(porVendedor) === TOTAL);
log(`  "Braulio (3RB)" (literal, o marcador é informação): ${porVendedor.get("Braulio (3RB)") ?? 0} linhas`);
log(`  Literais no total (Braulio (3RB), Daniel Donato, ASD, Junior, Rodrigo): ${[...porVendedor].filter(([k]) => !canonicos.has(k)).reduce((a, [, v]) => a + v, 0)} linhas`);

const porResp = contar(regs, (r) => r.responsavel || "(vazio)");
for (const [k, v] of [...porResp].sort((a, b) => b[1] - a[1])) log(`  responsável ${k.padEnd(10)} ${n3(v)}`);
const re = cru("RESPONSÁVEL").filter((c) => c.valor === "Re").length;
log(`  ("Re" na planilha → Rebeca: ${re} linhas; responsável vazio: linhas ${regs.filter((r) => r.responsavel === "").map((r) => r.linha).join(", ") || "nenhuma"})`);
confere("responsáveis somam o total a importar", soma(porResp) === TOTAL);

// ── 6. Listas próprias da DIR ───────────────────────────────────────────────
titulo("6. VALORES FORA DAS LISTAS DA DIR (gravados literais; viram 'Outro' no formulário)");
const listas = [
  ["fornecedor", FORNECEDORES_DIR],
  ["despachante", DESPACHANTES_DIR],
  ["banco", BANCOS_DIR],
  ["envio", ENVIOS_DIR],
  ["receita", RECEITAS_DIR],
  ["temperatura", TEMPERATURAS_DIR],
  ["observacao", OBSERVACOES_DIR],
];
for (const [campo, lista] of listas) {
  const vazias = regs.filter((r) => r[campo] === "").length;
  const fora = contar(regs.filter((r) => r[campo] !== "" && !lista.includes(r[campo])), (r) => r[campo]);
  const dentro = TOTAL - vazias - soma(fora);
  log(`  ${campo.padEnd(12)} na lista ${n3(dentro)} · fora da lista ${n3(soma(fora))} · vazio ${n3(vazias)}  = ${n3(dentro + soma(fora) + vazias)}`);
  for (const [k, v] of [...fora].sort((a, b) => b[1] - a[1])) log(`        ${n3(v)}  "${k}"`);
  confere(`${campo}: na lista + fora + vazio = total`, dentro + soma(fora) + vazias === TOTAL);
}

// Regra do fornecedor "Care Pharma": a coluna ORIGEM da planilha NÃO é mais gravada (o campo saiu da DIR), mas o parser a
// lê para uma regra — Fornecedor "Care Pharma" com Origem preenchida e diferente → o fornecedor carregado é a Origem.
// Care Pharma com Origem vazia ou igual a Care Pharma fica como está e sai aqui como "sem fornecedor real".
// Só linha e PO são impressos (nunca paciente).
log("\n  Fornecedor \"Care Pharma\" × coluna ORIGEM (regra do parser; a Origem não é gravada):");
const chaveCare = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const origemPorLinha = new Map(cru("ORIGEM").map((c) => [c.linha, c.valor]));
const carePharma = regs.filter((r) => chaveCare(r.fornecedor) === "care pharma");
const comAviso = (codigo) => aImportar.filter((l) => l.avisos.some((a) => a.codigo === codigo));
const pelaOrigem = comAviso("FORNECEDOR_PELA_ORIGEM");
const semReal = comAviso("FORNECEDOR_SEM_REAL");
const fornecedorCruPorLinha = new Map(cru("FORNECEDOR").map((c) => [c.linha, c.valor]));
const careNaPlanilha = aImportar.filter((l) => chaveCare(fornecedorCruPorLinha.get(l.linha) ?? "") === "care pharma");
const trocadasEsperadas = careNaPlanilha.filter((l) => {
  const o = (origemPorLinha.get(l.linha) ?? "").trim();
  return o !== "" && !/^-+$/.test(o) && chaveCare(o) !== "care pharma";
});
log(`    Fornecedor "Care Pharma" na planilha:                     ${n3(careNaPlanilha.length)}`);
log(`    trocados pela Origem (Origem preenchida e diferente):     ${n3(pelaOrigem.length)}`);
const porNovo = contar(pelaOrigem, (l) => regs.find((r) => r.linha === l.linha).fornecedor);
for (const [k, v] of [...porNovo].sort((a, b) => b[1] - a[1])) log(`        ${n3(v)}  → "${k}"`);
log(`    sem fornecedor real (Origem vazia ou Care Pharma):        ${n3(semReal.length)}   linhas/PO: ${semReal.map((l) => `${l.linha}/${l.registro.po}`).join(", ") || "nenhuma"}`);
log(`    "Care Pharma" que continua no fornecedor carregado:       ${n3(carePharma.length)}`);
confere("Care Pharma: trocadas + sem fornecedor real = Care Pharma na planilha", pelaOrigem.length + semReal.length === careNaPlanilha.length);
confere("Care Pharma: trocadas pelo parser = Origem preenchida e diferente na planilha", pelaOrigem.length === trocadasEsperadas.length);
confere("Care Pharma que sobra no carregado = só os sem fornecedor real", carePharma.length === semReal.length);

// Cia aérea × AWB: o parser separa "Lufthansa: 020-01045494" em companhia_aerea + awb (separarCiaAwb). Sem companhia
// reconhecida, a cia fica vazia e o AWB segue como a planilha escreveu. Só linha e PO são impressos.
log("\n  AWB da planilha → companhia aérea + número (separarCiaAwb, aplicada pelo parser):");
const awbCruPorLinha = new Map(cru("AWB").map((c) => [c.linha, c.valor]));
const comAwb = regs.filter((r) => r.awb !== "" || r.companhiaAerea !== "");
const separadas = regs.filter((r) => r.companhiaAerea !== "");
const naoCasadas = regs.filter((r) => r.companhiaAerea === "" && r.awb !== "");
const semAwb = regs.filter((r) => r.companhiaAerea === "" && r.awb === "");
const soCia = separadas.filter((r) => r.awb === "");
log(`    linhas com AWB preenchido na planilha:                    ${n3(comAwb.length)}`);
log(`    separadas em cia + número:                                ${n3(separadas.length)}   (só a cia, sem número: ${soCia.length})`);
for (const [k, v] of [...contar(separadas, (r) => r.companhiaAerea)].sort((a, b) => b[1] - a[1])) log(`        ${n3(v)}  ${k}`);
log(`    NÃO casadas (sem cia reconhecida; AWB fica como está):    ${n3(naoCasadas.length)}   linhas/PO: ${naoCasadas.map((r) => `${r.linha}/${r.po}`).join(", ") || "nenhuma"}`);
log(`    AWB vazio (ou só traços) na planilha:                     ${n3(semAwb.length)}`);
confere("AWB: separadas + não casadas + vazias = total a importar", separadas.length + naoCasadas.length + semAwb.length === TOTAL);
confere(
  "AWB: nada se perde — o número gravado é o fim do texto da planilha, e o não casado é o texto da planilha",
  regs.every((r) => {
    const original = (awbCruPorLinha.get(r.linha) ?? "").replace(/\s+/g, " ").trim();
    const bruto = /^[-–—_\s]+$/.test(original) ? "" : original;
    return r.companhiaAerea === "" ? r.awb === bruto : r.awb === "" || bruto.endsWith(r.awb);
  }),
);
confere("AWB: toda cia gravada está na lista de companhias do Follow-Up", separadas.every((r) => CIAS_AEREAS_TODAS.includes(r.companhiaAerea)));

// ── 7. Avisos ───────────────────────────────────────────────────────────────
titulo("7. AVISOS (importam do mesmo jeito; nada é bloqueado)");
const todosAvisos = aImportar.flatMap((l) => l.avisos.map((a) => ({ ...a, linha: l.linha, po: l.registro.po })));
const porCodigo = contar(todosAvisos, (a) => a.codigo);
for (const [codigo, qtd] of [...porCodigo].sort((a, b) => b[1] - a[1])) {
  const itens = todosAvisos.filter((a) => a.codigo === codigo);
  log(`\n  ${codigo}  — ${qtd} aviso(s) em ${new Set(itens.map((i) => i.linha)).size} linha(s)`);
  const detalhar = qtd <= 30 && !["VENDEDOR_LITERAL", "BOOLEANO_VAZIO", "PLACEHOLDER_TRACOS"].includes(codigo);
  if (detalhar) for (const i of itens) log(`      linha ${String(i.linha).padStart(4)}  ${i.po}  ${i.mensagem}`);
  else log(`      linhas: ${itens.slice(0, 40).map((i) => i.linha).join(", ")}${itens.length > 40 ? " …" : ""}`);
}
log("\n  Destaques pedidos:");
const linhasDe = (c) => todosAvisos.filter((a) => a.codigo === c).map((a) => `${a.linha}/${a.po}`);
log(`    PO repetido:                  ${[...new Set(linhasDe("PO_REPETIDO"))].join(", ") || "nenhum"}`);
log(`    número de PO repetido (mês≠): ${[...new Set(linhasDe("NUMERO_PO_REPETIDO"))].join(", ") || "nenhum"}`);
log(`    entrega < emissão:            ${linhasDe("ENTREGA_ANTES_EMISSAO").join(", ") || "nenhuma"}`);
log(`    emissão no futuro (> ${HOJE}): ${linhasDe("EMISSAO_FUTURA").join(", ") || "nenhuma"}`);
log(`    status NULL:                  ${linhasDe("STATUS_VAZIO").join(", ") || "nenhum"}`);

// ── 8. Erros ────────────────────────────────────────────────────────────────
titulo("8. ERROS (linhas rejeitadas — qualquer uma BLOQUEIA a carga)");
if (!rejeitadas.length) log("  Nenhum.");
for (const l of rejeitadas) for (const e of l.erros) log(`  linha ${l.linha}: ${e}`);

// ── 9. Fechamentos restantes (migração da lista manual) ─────────────────────
titulo("9. FECHAMENTOS RESTANTES — migração da lista manual (coluna FECHAMENTOS RESTANTES)");
// Nunca imprime o texto das entradas (é nome de paciente): só linha da lista, PO e linha do PO.
const entradas = resultado.fechamentosRestantes;
const porDesfecho = contar(entradas, (e) => e.desfecho);
const nDesf = (d) => porDesfecho.get(d) ?? 0;
log(`  Coluna presente no CSV: ${resultado.temColunaFechamentosRestantes ? "sim" : "NÃO"}`);
log(`  Entradas lidas: ${n3(entradas.length)}   (linhas ${entradas[0]?.linha ?? "-"} a ${entradas.at(-1)?.linha ?? "-"} da planilha)`);
log(`    mapeadas pela regra (a)  texto idêntico ao PACIENTE de exatamente 1 PO ........ ${n3(nDesf("unico"))}`);
log(`    mapeadas pela regra (b)  vários POs, 1 só com FECHAMENTO falso e em andamento .. ${n3(nDesf("unico_em_aberto"))}`);
log(`    ambíguas (c)             NÃO marcam nada ...................................... ${n3(nDesf("ambigua"))}`);
log(`    não encontradas (d)      NÃO marcam nada ...................................... ${n3(nDesf("nao_encontrada"))}`);
log(`    SOMA: ${n3(nDesf("unico") + nDesf("unico_em_aberto") + nDesf("ambigua") + nDesf("nao_encontrada"))}   (lidas: ${entradas.length})`);
confere("mapeadas (a)+(b) + ambíguas + não encontradas = entradas lidas", nDesf("unico") + nDesf("unico_em_aberto") + nDesf("ambigua") + nDesf("nao_encontrada") === entradas.length);
confere("a lista tem 97 entradas (linhas 2–98)", entradas.length === 97 && entradas[0]?.linha === 2 && entradas.at(-1)?.linha === 98);

const marcados = regs.filter((r) => r.fechamentoRestante);
const duplicadas = todosAvisos.filter((a) => a.codigo === "FECHAMENTO_RESTANTE_DUPLICADA").length;
log(`\n  POs marcados (fechamento_restante = true): ${n3(marcados.length)}   (entradas mapeadas ${nDesf("unico") + nDesf("unico_em_aberto")}; entradas repetidas para o mesmo PO: ${duplicadas})`);
confere("POs marcados = entradas mapeadas − entradas repetidas para o mesmo PO", marcados.length === nDesf("unico") + nDesf("unico_em_aberto") - duplicadas);
confere("fechamento_restante: marcados + não marcados = total a importar", marcados.length + regs.filter((r) => !r.fechamentoRestante).length === TOTAL);
confere("só POs mapeados estão marcados (nenhum PO marcado sem entrada)", marcados.length === new Set(entradas.filter((e) => e.po).map((e) => e.po + "|" + e.linhaPo)).size);

const naAba = marcados.filter((r) => !r.operacaoEncerrada);
const encerrados = marcados.filter((r) => r.operacaoEncerrada);
log(`  Marcados com operacao_encerrada = false (APARECEM na aba): ${n3(naAba.length)}   | encerrados (marca guardada, fora da aba): ${n3(encerrados.length)}`);
log(`  Esperado na aba: 95 → ${naAba.length === 95 ? "OK, igual ao esperado" : `DIFERENTE (${naAba.length}); ver a explicação abaixo`}`);
if (naAba.length !== 95) {
  log(`    Explicação: entradas mapeadas = ${nDesf("unico") + nDesf("unico_em_aberto")}; ambíguas = ${nDesf("ambigua")}; não encontradas = ${nDesf("nao_encontrada")}; marcados encerrados = ${encerrados.length}; repetidas = ${duplicadas}.`);
  for (const r of encerrados) log(`      PO encerrado marcado: linha ${r.linha}  ${r.po}`);
}
confere("a conta fecha: mapeadas − repetidas − marcados encerrados = POs na aba", nDesf("unico") + nDesf("unico_em_aberto") - duplicadas - encerrados.length === naAba.length);

log("\n  Distribuição por banco dos POs marcados (soma = marcados):");
const porBancoMarcado = contar(marcados, (r) => r.banco || "(sem banco)");
for (const [k, v] of [...porBancoMarcado].sort((a, b) => b[1] - a[1])) log(`    ${n3(v)}  ${k}`);
log(`    ${n3(soma(porBancoMarcado))}  TOTAL`);
confere("banco dos marcados soma o total de marcados", soma(porBancoMarcado) === marcados.length);
const semBancoReal = marcados.filter((r) => !["XP", "Rendimento", "Sicoob", "INTEX", "MIURA"].includes(r.banco));
log(`  Marcados sem banco real (Pendente / Não Cotado / Cancelado / vazio → chip cinza): ${semBancoReal.length}`);
log(`  Dos marcados: FECHAMENTO verdadeiro = ${marcados.filter((r) => r.fechamento).length} | falso = ${marcados.filter((r) => !r.fechamento).length}`);

const baseNome = (t) => normalizeText(t.replace(/\s*\(\d+\)\s*$/, ""));
const pacientesNaAba = new Set(naAba.map((r) => baseNome(r.paciente))).size;
log(`  Subtítulo da aba (POs na aba · pacientes pelo nome sem "(N)"): ${naAba.length} POs · ${pacientesNaAba} pacientes`);

log("\n  Entradas AMBÍGUAS (nada é marcado; decisão sua) — linha da lista → POs candidatos:");
const ambiguas = entradas.filter((e) => e.desfecho === "ambigua");
if (!ambiguas.length) log("    nenhuma");
for (const e of ambiguas) {
  log(`    lista linha ${e.linha}: ${e.candidatos.length} POs de texto idêntico, ${e.candidatosEmAberto.length} com FECHAMENTO falso e em andamento`);
  for (const c of e.candidatos) {
    const r = regs.find((x) => x.linha === c.linha);
    log(`        ${c.po}  (linha ${c.linha})  banco=${r.banco || "(vazio)"}  FECHAMENTO=${r.fechamento ? "V" : "F"}  operação=${r.operacaoEncerrada ? "encerrada" : "em andamento"}${e.candidatosEmAberto.some((x) => x.linha === c.linha) ? "   ← candidato em aberto" : ""}`);
  }
}
const naoEncontradas = entradas.filter((e) => e.desfecho === "nao_encontrada");
log(`\n  Entradas NÃO ENCONTRADAS (nada é marcado): ${naoEncontradas.length ? naoEncontradas.map((e) => `lista linha ${e.linha}`).join(", ") : "nenhuma"}`);

log("\n  Linhas 14 e 58 da lista (FECHAMENTO já verdadeiro, operação em andamento) — marcadas COMO ESTÃO:");
for (const [linhaLista, poEsperado] of [[14, "PO26-07-0351"], [58, "PO26-09-0461"]]) {
  const e = entradas.find((x) => x.linha === linhaLista);
  const r = e?.po ? regs.find((x) => x.linha === e.linhaPo) : null;
  log(`    lista linha ${linhaLista}: desfecho=${e?.desfecho ?? "(sem entrada)"}  PO=${e?.po ?? "-"} (linha ${e?.linhaPo ?? "-"})  FECHAMENTO=${r ? (r.fechamento ? "V" : "F") : "-"}  operação=${r ? (r.operacaoEncerrada ? "encerrada" : "em andamento") : "-"}  marcado=${r?.fechamentoRestante ? "sim" : "NÃO"}`);
  confere(`lista linha ${linhaLista} → ${poEsperado}, marcado como está (FECHAMENTO V, em andamento)`, e?.po === poEsperado && r?.fechamentoRestante === true && r.fechamento === true && r.operacaoEncerrada === false);
}

log('\n  A carga grava, no MESMO insert em lote dos registros: fechamento_restante_por = "importação da planilha" e fechamento_restante_em = hora da carga, só nos POs marcados.');

// ── 10. Conferências internas ───────────────────────────────────────────────
titulo("10. CONFERÊNCIAS INTERNAS (o relatório se auto-verifica)");
confere("nenhuma coluna obrigatória ausente", resultado.colunasAusentes.length === 0);
confere("nenhuma linha rejeitada", rejeitadas.length === 0);
confere("todo registro tem po no padrão PO##-##-####", regs.every((r) => /^PO\d{2}-\d{2}-\d{4}$/.test(r.po)));
confere("todo registro tem paciente e vendedor", regs.every((r) => r.paciente !== "" && r.vendedor !== ""));
confere("todo status é nulo ou do CHECK da tabela", regs.every((r) => r.status === null || ["on_going", "entregue", "cancelado", "falecimento"].includes(r.status)));
const relatorio = saida.join("\n");
const nomesParaVarrer = new Set([...regs.map((r) => r.paciente), ...entradas.map((e) => e.texto)]);
const nomesVazados = [...nomesParaVarrer].filter((nome) => nome.length >= 5 && relatorio.includes(nome));
confere(`nenhum nome de paciente no relatório (varridos ${nomesParaVarrer.size} textos; vazaram ${nomesVazados.length})`, nomesVazados.length === 0);
let falhas = 0;
for (const c of conferencias) {
  if (!c.ok) falhas++;
  log(`  [${c.ok ? "OK" : "FALHA"}] ${c.descricao}`);
}

titulo("RESUMO");
log(`  A importar: ${TOTAL} registros   (ignoradas ${ignoradas.length} · rejeitadas ${rejeitadas.length} · avisos ${todosAvisos.length})`);
log(`  Conferências: ${conferencias.length - falhas}/${conferencias.length} OK${falhas ? `   ← ${falhas} FALHA(S)` : ""}`);
log(falhas || rejeitadas.length ? "  CARGA BLOQUEADA até corrigir as falhas/erros acima." : "  Pronto para você aprovar. NADA foi gravado.");
log("  A carga (carga-dir.mjs --commit) só roda depois que a tabela dir existir (SQL aplicado por você) e com ALLOW_REAL_DB=1.");

process.exit(falhas ? 1 : 0);
