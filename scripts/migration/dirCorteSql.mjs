// Parte PURA do gerador do SQL do corte da DIR (sem disco, sem rede, sem banco, sem .env). Quem lê o CSV e grava o
// arquivo é scripts/migration/gerar-sql-corte-dir.mjs; os testes (tests/unit/dirCorteSql.spec.ts) usam este arquivo.
//
// O SQL é montado com EXATAMENTE o parser da carga (parseDirCsv) e o mapeador da escrita (colunasDeDir): nada é
// reinterpretado aqui. O que este arquivo faz é só (1) escolher os POs, (2) decidir INSERT ou UPDATE e (3) escrever o
// texto SQL — recusando qualquer coluna fora da lista fechada COLUNAS_ESCRITAS_NO_CORTE.
//
// O SQL gerado NUNCA é executado por este código. Ele traz dados pessoais (nome de paciente): quem o grava tem de
// colocá-lo em scratch/ (fora do git). Mensagens e comentários do SQL só citam PO e nº da linha da planilha.

import { colunasDeDir } from "../../server/utils/dirMappers.ts";

// Lista FECHADA das colunas que o corte pode escrever: as que o parser produz (mapeador colunasDeDir), na ordem em que
// o SQL as imprime. Fora dela o gerador recusa. Ficam de fora, de propósito, e nunca entram: id, created_at, updated_at
// (no UPDATE), fechamento_restante_em e fechamento_restante_por (a auditoria da marca) e a coluna que saiu da DIR.
export const COLUNAS_ESCRITAS_NO_CORTE = Object.freeze([
  "po",
  "paciente",
  "vendedor",
  "status",
  "responsavel",
  "receita",
  "medicamento",
  "temperatura",
  "fornecedor",
  "envio",
  "companhia_aerea",
  "awb",
  "despachante",
  "contrato_cambio",
  "observacao",
  "banco",
  "data_emissao",
  "data_cobranca_fornecedores",
  "data_entrega",
  "data_pagamento",
  "conferido",
  "exigencia",
  "operacao_encerrada",
  "dactes",
  "dsi_dir_duimp",
  "logger",
  "fechamento",
  "numerario",
  "protocolo_assinado",
  "swift",
  "termometro",
  "fechamento_restante",
]);

// O UPDATE acha a linha pelo PO (a chave); então o PO não entra no SET.
export const COLUNAS_DO_UPDATE = Object.freeze(COLUNAS_ESCRITAS_NO_CORTE.filter((c) => c !== "po"));

// O INSERT leva as colunas do parser + o id determinístico + created_at/updated_at (agora, na hora de rodar).
export const COLUNAS_DO_INSERT = Object.freeze(["id", ...COLUNAS_ESCRITAS_NO_CORTE, "created_at", "updated_at"]);

// colunasDeDir devolve estas duas quando fechamentoRestante é falso (as zera). O corte NÃO toca na auditoria da marca.
const COLUNAS_DE_AUDITORIA = ["fechamento_restante_em", "fechamento_restante_por"];

const PO_COMPLETO = /^PO\d{2}-\d{2}-\d{4}$/;

/**
 * Lista de POs a partir de texto livre. Aceita vírgula, ponto e vírgula e espaços como separador:
 *  - PO completo ("PO26-10-0471");
 *  - só o número de 4 dígitos ("0405"), que herda o prefixo (PO26-MM-) do último PO completo;
 *  - intervalo "PO26-10-0503 a 0520" (ou "... a PO26-10-0520"), do número anterior ao final, mesmo prefixo.
 * Repetido, fora do padrão ou intervalo invertido → erro (nada de adivinhar).
 */
export function expandirListaDePos(texto) {
  const tokens = String(texto ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const pos = [];
  let prefixo = null; // "PO26-10-"
  let ultimo = null; // último PO resolvido

  const resolver = (token) => {
    if (PO_COMPLETO.test(token.toUpperCase())) {
      const po = token.toUpperCase();
      prefixo = po.slice(0, 8);
      return po;
    }
    if (/^\d{4}$/.test(token)) {
      if (!prefixo) throw new Error(`número "${token}" sem PO completo antes dele (para herdar o prefixo)`);
      return `${prefixo}${token}`;
    }
    throw new Error(`"${token}" não é um PO (PO26-MM-NNNN), um número de 4 dígitos nem "a"`);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^a$/i.test(token)) {
      const fim = tokens[++i];
      if (ultimo === null || fim === undefined) throw new Error('"a" precisa de um PO antes e um depois (ex.: "PO26-10-0503 a 0520")');
      const poFim = resolver(fim);
      if (poFim.slice(0, 8) !== ultimo.slice(0, 8)) throw new Error(`intervalo ${ultimo} a ${poFim} cruza de mês`);
      const de = Number(ultimo.slice(-4));
      const ate = Number(poFim.slice(-4));
      if (ate <= de) throw new Error(`intervalo ${ultimo} a ${poFim} está invertido ou vazio`);
      for (let n = de + 1; n <= ate; n++) pos.push(`${ultimo.slice(0, 8)}${String(n).padStart(4, "0")}`);
      ultimo = poFim;
      continue;
    }
    const po = resolver(token);
    pos.push(po);
    ultimo = po;
  }

  const vistos = new Set();
  for (const po of pos) {
    if (vistos.has(po)) throw new Error(`PO repetido na lista: ${po}`);
    vistos.add(po);
  }
  return pos;
}

/** Literal SQL: null, boolean ou texto entre aspas simples (aspas dobradas; barra invertida vira E'…'). Nunca número. */
export function literalSql(valor) {
  if (valor === null || valor === undefined) return "null";
  if (typeof valor === "boolean") return valor ? "true" : "false";
  if (typeof valor !== "string") throw new Error(`valor SQL inesperado (${typeof valor})`);
  if (valor.includes("\0")) throw new Error("texto com caractere nulo");
  const aspas = valor.replace(/'/g, "''");
  return valor.includes("\\") ? `E'${aspas.replace(/\\/g, "\\\\")}'` : `'${aspas}'`;
}

const arrayDePos = (pos) => `array[${pos.map(literalSql).join(", ")}]::text[]`;

// Colunas do parser para um registro: exatamente as de COLUNAS_ESCRITAS_NO_CORTE, sem a auditoria da marca. Qualquer
// diferença (coluna nova no mapeador, coluna faltando) interrompe o gerador, em vez de escrever fora da lista.
function colunasDoRegistro(registro) {
  const col = { ...colunasDeDir(registro) };
  for (const c of COLUNAS_DE_AUDITORIA) delete col[c];
  const fora = Object.keys(col).filter((c) => !COLUNAS_ESCRITAS_NO_CORTE.includes(c));
  if (fora.length) throw new Error(`o mapeador produziu coluna(s) fora da lista do corte: ${fora.join(", ")}`);
  const faltando = COLUNAS_ESCRITAS_NO_CORTE.filter((c) => !(c in col));
  if (faltando.length) throw new Error(`o mapeador não produziu coluna(s) da lista do corte: ${faltando.join(", ")}`);
  return col;
}

export function sqlUpdate(registro) {
  const col = colunasDoRegistro(registro);
  const set = COLUNAS_DO_UPDATE.map((c) => `${c} = ${literalSql(col[c])}`).join(",\n  ");
  return `update public.dir set\n  ${set}\nwhere po = ${literalSql(registro.po)};`;
}

/** `linha` = linha da planilha (id determinístico da carga: dir_carga_<linha com 4 dígitos>). */
export function sqlInsert(registro, linha) {
  const col = colunasDoRegistro(registro);
  const id = `dir_carga_${String(linha).padStart(4, "0")}`;
  const valores = COLUNAS_DO_INSERT.map((c) => {
    if (c === "id") return literalSql(id);
    if (c === "created_at" || c === "updated_at") return "now()";
    return literalSql(col[c]);
  });
  return `insert into public.dir (${COLUNAS_DO_INSERT.join(", ")})\nvalues (${valores.join(", ")})\non conflict (id) do nothing;`;
}

// Trava de segurança do banco, dentro da transação: aborta (rollback) se o estado real não for o que o corte supõe.
function guardaAntes(novos, atualizar) {
  const blocos = [];
  if (novos.length) {
    blocos.push(`  select string_agg(v.po, ', ' order by v.po) into ja_existem
    from unnest(${arrayDePos(novos)}) as v(po)
    where exists (select 1 from public.dir d where d.po = v.po);
  if ja_existem is not null then
    raise exception 'corte abortado: PO(s) a inserir já existem no banco: %', ja_existem;
  end if;`);
  }
  if (atualizar.length) {
    blocos.push(`  select string_agg(v.po, ', ' order by v.po) into faltam
    from unnest(${arrayDePos(atualizar)}) as v(po)
    where (select count(*) from public.dir d where d.po = v.po) <> 1;
  if faltam is not null then
    raise exception 'corte abortado: PO(s) a atualizar ausentes ou repetidos no banco: %', faltam;
  end if;`);
  }
  return `do $corte$
declare
  ja_existem text;
  faltam text;
begin
${blocos.join("\n")}
end
$corte$;`;
}

function guardaDepois(todos) {
  return `do $corte$
declare
  problemas text;
begin
  select string_agg(v.po, ', ' order by v.po) into problemas
    from unnest(${arrayDePos(todos)}) as v(po)
    where (select count(*) from public.dir d where d.po = v.po) <> 1;
  if problemas is not null then
    raise exception 'corte abortado: depois do corte, PO(s) sem exatamente 1 linha no banco: %', problemas;
  end if;
end
$corte$;`;
}

/**
 * Monta o SQL do corte.
 *  - `resultado`: o que parseDirCsv devolveu para o CSV inteiro;
 *  - `pos`: POs do corte (todos); `novos`: subconjunto de `pos` que NÃO existe no banco (INSERT). O resto é UPDATE.
 * Aborta (lança) se algum PO não estiver na planilha, estiver em mais de uma linha, ou tiver erro no parser.
 */
export function montarCorte({ resultado, pos, novos = [] }) {
  const desconhecidosNovos = novos.filter((p) => !pos.includes(p));
  if (desconhecidosNovos.length) throw new Error(`POs "novos" que não estão na lista do corte: ${desconhecidosNovos.join(", ")}`);

  const reais = resultado.linhas.filter((l) => !l.ignorada);
  const ausentes = [];
  const repetidos = [];
  const itens = [];
  for (const po of pos) {
    // Só linhas sem erro têm registro; uma linha com erro no parser deixa o PO "ausente" (o dry-run mostra o erro).
    const linhas = reais.filter((l) => l.registro?.po === po);
    if (linhas.length === 0) {
      ausentes.push(po);
      continue;
    }
    if (linhas.length > 1) {
      repetidos.push(`${po} (linhas ${linhas.map((l) => l.linha).join(", ")})`);
      continue;
    }
    itens.push({ po, linha: linhas[0].linha, registro: linhas[0].registro });
  }
  const problemas = [];
  if (ausentes.length) problemas.push(`POs que não estão na planilha (ou estão com erro no parser): ${ausentes.join(", ")}`);
  if (repetidos.length) problemas.push(`POs em mais de uma linha da planilha: ${repetidos.join("; ")}`);
  if (problemas.length) throw new Error(problemas.join("\n"));

  const inserts = itens.filter((i) => novos.includes(i.po));
  const updates = itens.filter((i) => !novos.includes(i.po));

  const partes = [];
  partes.push(
    [
      "-- Corte da DIR. GERADO por scripts/migration/gerar-sql-corte-dir.mjs com o parser da carga; não editar à mão.",
      "-- NÃO foi executado em lugar nenhum. Tem dados pessoais (nomes de pacientes): fica em scratch/, fora do git.",
      `-- ${inserts.length} INSERT (PO novo) e ${updates.length} UPDATE (PO existente). Tudo numa transação: se uma trava falhar, nada muda.`,
      "-- O UPDATE grava só as colunas do parser (sem po, id, created_at, updated_at e sem fechamento_restante_em/_por).",
    ].join("\n"),
  );
  partes.push("begin;");
  partes.push(guardaAntes(inserts.map((i) => i.po), updates.map((i) => i.po)));
  for (const i of updates) partes.push(`-- ${i.po} (linha ${i.linha} da planilha): UPDATE\n${sqlUpdate(i.registro)}`);
  for (const i of inserts) partes.push(`-- ${i.po} (linha ${i.linha} da planilha): INSERT\n${sqlInsert(i.registro, i.linha)}`);
  partes.push(guardaDepois(itens.map((i) => i.po)));
  partes.push("commit;");

  return {
    sql: `${partes.join("\n\n")}\n`,
    inserts: inserts.map(({ po, linha }) => ({ po, linha })),
    updates: updates.map(({ po, linha }) => ({ po, linha })),
    colunasUpdate: [...COLUNAS_DO_UPDATE],
    colunasInsert: [...COLUNAS_DO_INSERT],
    // POs cujo fechamento_restante o SQL grava como verdadeiro (a auditoria _em/_por NÃO é tocada).
    comFechamentoRestante: itens.filter((i) => i.registro.fechamentoRestante).map(({ po, linha }) => ({ po, linha })),
  };
}
