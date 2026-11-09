// Gera o SQL do CORTE da DIR a partir do CSV da planilha, usando EXATAMENTE o parser da carga (parseDirCsv).
// SÓ LÊ o CSV e GRAVA um arquivo SQL local em scratch/ (fora do git). NÃO abre conexão, NÃO lê o .env, NÃO executa o SQL
// em lugar nenhum: quem o roda é você, à mão, depois de revisar.
//
// Uso:
//   node scripts/migration/gerar-sql-corte-dir.mjs <csv> [--pos "<lista>"] [--novos "<lista>"] [--ignorar "<lista>"] [--saida scratch/corte-dir.sql]
//   node scripts/migration/gerar-sql-corte-dir.mjs <csv> --pos-arquivo <arquivo.txt>
//
//   (sem opções)  todo PO do CSV ganha um UPDATE (where po = …) e um INSERT protegido por `where not exists (… po = …)` e por
//                 `on conflict (id) do nothing`. Os UPDATE vêm todos ANTES dos INSERT: o UPDATE só acha o PO que já existe e o
//                 INSERT só cria o que falta, então nenhum PO é atualizado e inserido ao mesmo tempo nem duplicado.
//   --pos         só estes POs (em vez de todos do CSV). Aceita PO completo, só o número de 4 dígitos (herda o prefixo) e
//                 intervalo com "a": "PO26-08-0398, 0405, 0424; PO26-10-0503 a 0520"
//   --novos       POs que NÃO existem no banco: só estes viram INSERT (com a trava antes/depois) e deixam de ter UPDATE.
//   --ignorar     POs que não geram UPDATE nem INSERT (ex.: PO que existe duas vezes no banco, que o `where po =` pegaria
//                 em dobro). O resumo diz quais foram ignorados.
//   --saida       caminho do SQL; só dentro de scratch/ (o arquivo tem nome de paciente e nunca vai para o git).
//
// O UPDATE grava 30 colunas (veja COLUNAS_DO_UPDATE em dirCorteSql.mjs; fechamento_restante NÃO está entre elas). O INSERT
// grava as 32 do parser + id, created_at e updated_at.
// O resumo impresso só cita PO e nº da linha da planilha — nunca nome de paciente.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDirCsv } from "../../shared/utils/dirParser.ts";
import { hojeBrasilia } from "../../shared/utils/dataBrasilia.ts";
import { expandirListaDePos, montarCorte } from "./dirCorteSql.mjs";

const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRATCH = join(CRM, "scratch");

function falha(msg) {
  console.error(`\nABORTADO: ${msg}\nNenhum arquivo foi gravado.`);
  process.exit(1);
}

function opcao(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return undefined;
  const valor = process.argv[i + 1];
  if (valor === undefined || valor.startsWith("--")) falha(`--${nome} precisa de um valor`);
  return valor;
}

const argsPosicionais = process.argv.slice(2).filter((a, i, todos) => !a.startsWith("--") && !(todos[i - 1] ?? "").startsWith("--"));
const caminhoCsv = argsPosicionais[0];
if (!caminhoCsv) falha('informe o caminho do CSV (ex.: node scripts/migration/gerar-sql-corte-dir.mjs scratch/dir.csv --ignorar "PO26-03-0109")');

const arquivoPos = opcao("pos-arquivo");
const textoPos = opcao("pos") ?? (arquivoPos ? readFileSync(resolve(arquivoPos), "utf-8") : undefined);
const textoNovos = opcao("novos");
const textoIgnorar = opcao("ignorar");

const saida = resolve(opcao("saida") ?? join(SCRATCH, "corte-dir.sql"));
const relativo = relative(SCRATCH, saida);
if (relativo === "" || relativo.startsWith("..") || isAbsolute(relativo)) {
  falha(`a saída tem de ficar dentro de scratch/ (fora do git); recebi ${saida}`);
}

let pos = null;
let novos = null;
let ignorar = [];
try {
  if (textoPos !== undefined) pos = expandirListaDePos(textoPos);
  if (textoNovos !== undefined) novos = expandirListaDePos(textoNovos);
  if (textoIgnorar !== undefined) ignorar = expandirListaDePos(textoIgnorar);
} catch (e) {
  falha(`lista de POs inválida: ${e.message}`);
}

const arquivoCsv = resolve(caminhoCsv);
const resultado = parseDirCsv(readFileSync(arquivoCsv, "utf-8"), { hoje: hojeBrasilia() });
if (resultado.colunasAusentes.length) falha(`colunas obrigatórias ausentes no CSV: ${resultado.colunasAusentes.join(", ")}`);

let corte;
try {
  corte = montarCorte({ resultado, pos, novos, ignorar });
} catch (e) {
  falha(e.message);
}

mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, corte.sql, "utf-8");

const lista = (itens) => itens.map((i) => `${i.po} (linha ${i.linha})`).join(", ") || "nenhum";
const linhasDeDados = resultado.linhas.length;
const linhasReais = resultado.linhas.filter((l) => !l.ignorada).length;
const poNoCsv = new Set(resultado.linhas.map((l) => l.registro?.po).filter(Boolean));
const ignoradosNoCsv = corte.ignorados.filter((p) => poNoCsv.has(p));
const ignoradosForaDoCsv = corte.ignorados.filter((p) => !poNoCsv.has(p));

console.log("RESUMO DO CORTE (sem dados de pacientes)");
console.log(`  Arquivo lido:      ${arquivoCsv}`);
console.log(`  Linhas de dados:   ${linhasDeDados} (com PO ou paciente: ${linhasReais}; linhas-casca ignoradas pelo parser: ${linhasDeDados - linhasReais})`);
console.log(`  Escopo:            ${pos === null ? "todos os POs do CSV" : `${pos.length} PO(s) de --pos`}${novos === null ? "" : `; --novos com ${novos.length} PO(s)`}`);
console.log(`  UPDATE:            ${corte.updates.length}   (${corte.colunasUpdate.length} colunas; sem fechamento_restante)`);
console.log(`  INSERT:            ${corte.inserts.length}   (${corte.colunasInsert.length} colunas; protegido por where not exists + on conflict (id) do nothing)`);
console.log(`  Ignorados:         ${corte.ignorados.length}${corte.ignorados.length ? `  → ${corte.ignorados.join(", ")}` : ""}`);
if (ignoradosForaDoCsv.length) console.log(`    (não estão no CSV: ${ignoradosForaDoCsv.join(", ")}; ${ignoradosNoCsv.length} estão e deixaram de gerar comando)`);
if (novos !== null) console.log(`  INSERT explícitos: ${lista(corte.inserts)}`);
console.log(`  POs com fechamento_restante = true gravado pelo INSERT: ${corte.comFechamentoRestante.length}`);

// Envio da planilha → opções do Follow-Up (o parser converte). A cia vem do AWB e NÃO é sobrescrita pelo envio; quando os dois
// se contradizem (ex.: FEDEX FORMAL com Lufthansa, Air Cargo com FedEx/DHL) só há aviso. Só PO e linha, nunca paciente.
const linhasComAviso = (codigo) =>
  resultado.linhas.filter((l) => !l.ignorada && l.registro && l.avisos.some((a) => a.codigo === codigo));
const contradizem = linhasComAviso("ENVIO_CIA_CONTRADIZ");
const desconhecidos = linhasComAviso("ENVIO_DESCONHECIDO");
const rotuloLinhas = (ls) => ls.map((l) => `${l.registro.po} (linha ${l.linha})`).join(", ");
console.log(`  Envio × cia aérea (aviso ENVIO_CIA_CONTRADIZ): ${contradizem.length} PO(s)${contradizem.length ? `  → ${rotuloLinhas(contradizem)}` : ""}`);
console.log(`  Envio sem equivalente no Follow-Up (aviso ENVIO_DESCONHECIDO): ${desconhecidos.length} PO(s)${desconhecidos.length ? `  → ${rotuloLinhas(desconhecidos)}` : ""}`);
console.log(`  SQL gravado em:    ${saida}   (não executado; tem dados pessoais — não vai para o git)`);
