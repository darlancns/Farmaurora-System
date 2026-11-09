// Gera o SQL do CORTE da DIR a partir do CSV da planilha, usando EXATAMENTE o parser da carga (parseDirCsv).
// SÓ LÊ o CSV e GRAVA um arquivo SQL local em scratch/ (fora do git). NÃO abre conexão, NÃO lê o .env, NÃO executa o SQL
// em lugar nenhum: quem o roda é você, à mão, depois de revisar.
//
// Uso:
//   node scripts/migration/gerar-sql-corte-dir.mjs <csv> --pos "<lista>" --novos "<lista>" [--saida scratch/corte-dir.sql]
//   node scripts/migration/gerar-sql-corte-dir.mjs <csv> --pos-arquivo <arquivo.txt> --novos "<lista>"
//
//   --pos     todos os POs do corte. Aceita PO completo, só o número de 4 dígitos (herda o prefixo) e intervalo com "a":
//             "PO26-08-0398, 0405, 0424; PO26-10-0503 a 0520"
//   --novos   o subconjunto de --pos que NÃO existe no banco → INSERT (on conflict (id) do nothing, id dir_carga_<linha>).
//             Os demais POs viram UPDATE (só as colunas do parser; veja COLUNAS_DO_UPDATE em dirCorteSql.mjs).
//   --saida   caminho do SQL; só dentro de scratch/ (o arquivo tem nome de paciente e nunca vai para o git).
//
// O relatório impresso só cita PO e nº da linha da planilha — nunca nome de paciente.

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
if (!caminhoCsv) falha('informe o caminho do CSV (ex.: node scripts/migration/gerar-sql-corte-dir.mjs scratch/dir.csv --pos "…" --novos "…")');

const textoPos = opcao("pos") ?? (opcao("pos-arquivo") ? readFileSync(resolve(opcao("pos-arquivo")), "utf-8") : undefined);
if (!textoPos) falha("informe a lista de POs com --pos \"…\" ou --pos-arquivo <arquivo>");

const saida = resolve(opcao("saida") ?? join(SCRATCH, "corte-dir.sql"));
const relativo = relative(SCRATCH, saida);
if (relativo === "" || relativo.startsWith("..") || isAbsolute(relativo)) {
  falha(`a saída tem de ficar dentro de scratch/ (fora do git); recebi ${saida}`);
}

let pos;
let novos;
try {
  pos = expandirListaDePos(textoPos);
  novos = expandirListaDePos(opcao("novos") ?? "");
} catch (e) {
  falha(`lista de POs inválida: ${e.message}`);
}

const resultado = parseDirCsv(readFileSync(resolve(caminhoCsv), "utf-8"), { hoje: hojeBrasilia() });
if (resultado.colunasAusentes.length) falha(`colunas obrigatórias ausentes no CSV: ${resultado.colunasAusentes.join(", ")}`);

let corte;
try {
  corte = montarCorte({ resultado, pos, novos });
} catch (e) {
  falha(e.message);
}

mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, corte.sql, "utf-8");

const lista = (itens) => itens.map((i) => `${i.po} (linha ${i.linha})`).join(", ") || "nenhum";
console.log(`SQL gravado em ${saida} (não executado; tem dados pessoais — não vai para o git).`);
console.log(`POs no corte: ${pos.length}   INSERT: ${corte.inserts.length}   UPDATE: ${corte.updates.length}`);
console.log(`INSERT: ${lista(corte.inserts)}`);
console.log(`Colunas do UPDATE (${corte.colunasUpdate.length}): ${corte.colunasUpdate.join(", ")}`);
console.log(`Colunas do INSERT (${corte.colunasInsert.length}): ${corte.colunasInsert.join(", ")}`);
console.log(`POs em que fechamento_restante = true (a auditoria _em/_por NÃO é tocada): ${lista(corte.comFechamentoRestante)}`);
