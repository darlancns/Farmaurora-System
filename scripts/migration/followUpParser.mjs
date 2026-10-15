// Parser one-time do texto exportado do Google Doc → registros de `follow_up`.
//
// PURO: sem rede, sem Supabase, sem escrita em disco. Só transforma texto em
// registros + relatório de decisões (puladas, observações, fallbacks). Usado por
// scripts/migration/dry-run-follow-up.mjs (e, depois da confirmação, pelo script
// de gravação). Não é importado por nenhuma rota/botão da aplicação.
//
// Regras: ver o briefing da migração. Princípios: nunca inventar valor (consultor,
// pasta, empresa, status, datas), nunca descartar linha em silêncio (o que não
// encaixa vai para `atualizacoes`), "ASD" nunca é gravado como valor.

import { toTitleCaseName } from "../../app/utils/formatters.ts";
import { formatOrdemLabel } from "../../app/utils/processoFormatters.ts";
import { CONSULTORES_PROCESSO } from "../../shared/constants/processos.ts";

// ── utilidades ───────────────────────────────────────────────────────────

/** minúsculas, sem acento, espaços colapsados — só para COMPARAR. */
export function norm(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ehAsd = (v) => /^asd\.?$/i.test(String(v).trim());

// ── seções (cabeçalho do bloco → consultor) ──────────────────────────────

const SECAO_CONSULTOR = {
  [norm("André")]: "André Vitório",
  [norm("Gabi Santana")]: "Gabriela Santana",
  [norm("Ga Megda")]: "Gabriela Megda",
  [norm("Mateus")]: "Mateus Morais",
  [norm("Paulo Braga")]: "Paulo Braga",
  [norm("Thiago Guedes")]: "Thiago Guedes",
  [norm("Vini")]: "Vinícius Alves",
};
const SECAO_GRUPO = norm("Paulinho - Bráulio - Bolívar");
const SECAO_ENTREGUES = norm("Entregues");

// ── status (tabela exata; o que sobra vira UMA pendência) ────────────────

const STATUS_TABELA = [
  // ordem importa: o mais específico primeiro ("liberado parcialmente" antes de "liberado")
  ["elaboracao dos fornecedores", "elaboracao_fornecedores"],
  ["aguardando para iniciar o processo", "aguardando_inicio"],
  ["em transito", "em_transito"],
  ["desembaraco", "desembaraco"],
  ["liberado parcialmente", "liberado_parcial"],
  ["liberada parcialmente", "liberado_parcial"],
  ["liberado", "liberado"],
  ["liberada", "liberado"],
];

function parseStatus(raw) {
  const valor = raw.trim();
  const n = norm(valor);

  // Decisões da Cris sobre textos fora da tabela:
  // - INDEFERIDO (e variações) → status "outro" com o texto literal em statusOutro, sem pendência.
  if (/^indeferido\b/.test(n)) return { status: "outro", statusOutro: valor, sobra: "", nota: `status "${valor}" → outro (statusOutro = texto literal)` };
  // - "aguardando embarque" → elaboracao_fornecedores.
  if (n === "aguardando embarque") return { status: "elaboracao_fornecedores", sobra: "", nota: `status "${valor}" → elaboracao_fornecedores (decisão da Cris)` };
  // - "liberado na ANVISA // Aguardando SEFAZ" → desembaraco; a pendência guarda o texto ORIGINAL COMPLETO.
  if (n.startsWith("liberado na anvisa")) return { status: "desembaraco", sobra: valor, nota: `status "${valor}" → desembaraco; pendência com o texto original completo (decisão da Cris)` };

  for (const [chave, status] of STATUS_TABELA) {
    if (!n.startsWith(chave)) continue;
    const proximo = n.charAt(chave.length);
    if (proximo && /[a-z0-9]/.test(proximo)) continue; // "liberadoX" não conta
    let sobra = valor.slice(chave.length);
    if (status === "desembaraco") sobra = sobra.replace(/^\s*\(\s*VCP\s*\)/i, "");
    sobra = sobra.replace(/^[\s\-–—:;,]+/, "").trim();
    return { status, sobra };
  }
  return { status: null, sobra: "" };
}

// ── fornecedor / despachante ─────────────────────────────────────────────

const FORNECEDOR_ENUM = {
  speciality: "Speciality - Índia",
  poros: "Poros - Turquia",
  pharyx: "Pharyx - China",
  beldimed: "Beldimed - Bélgica",
};
const PAIS_FORNECEDOR = new Set(["india", "turquia", "china", "belgica", "europa"]);

const DESPACHANTE_ENUM = {
  [norm("Andreza")]: "Andreza Faconi",
  [norm("Andreza Faconi")]: "Andreza Faconi",
  [norm("Bruno Lopes")]: "Bruno Lopes",
  [norm("Marcelo")]: "Marcelo Lima",
  [norm("Marcelo Lima")]: "Marcelo Lima",
  [norm("Marcelo Lopes")]: "Marcelo Lima",
};

const COMPANHIAS = { emirates: "Emirates", lufthansa: "Lufthansa", swiss: "Swiss", "turkish cargo": "Turkish Cargo" };

// ── rótulos conhecidos ───────────────────────────────────────────────────

const ROTULO_DATA = {
  "previsao de entrega": "previsaoEntrega",
  "suposta estimativa": "supostaEstimativa",
  "data de embarque": "dataEmbarque",
  "data da compra (envio da po)": "dataCompraPO",
  "data de envio da po": "dataCompraPO", // variante de grafia (2 entradas)
  "abertura da thread": "aberturaThread",
  "data de chegada no brasil": "dataChegadaBrasil",
  "registro radar pelo despachante": "registroRadar",
  "registro duimp pelo despachante": "registroDuimp",
  "registro da duimp pelo despachante": "registroDuimp",
  "registro lpco pelo despachante": "registroLpco",
  "registro da lpco pelo despachante": "registroLpco",
};

const QTD_FINAL = /^(\d+)\s+(caixas?|cxs?|ampolas?|frascos?|vials?|unidades?|seringas?)\.?$/i;

function parseMedicamento(valor) {
  const texto = valor.trim().replace(/\s+/g, " ");
  const partes = texto.split(/\s+-\s+/);
  if (partes.length >= 2 && QTD_FINAL.test(partes[partes.length - 1].trim())) {
    return { nome: partes.slice(0, -1).join(" - ").trim(), quantidade: partes[partes.length - 1].trim() };
  }
  return { nome: texto }; // sem separação segura: tudo em `nome`, sem inventar números
}

function parseValorBR(s) {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function dataDdMm(texto) {
  const m = texto.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}` : "";
}

/** Linha solta → {data, texto}. Data no início é removida do texto; senão a 1ª DD/MM achada vira `data`. */
function atualizacaoDeLinha(linha) {
  const t = linha.trim();
  const inicio = t.match(/^(?:Dia\s+)?(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\s*(?:[-–:]\s*)?(.*)$/i);
  if (inicio && inicio[2].trim()) {
    return { data: dataDdMm(inicio[1]), texto: inicio[2].trim() };
  }
  return { data: dataDdMm(t), texto: t };
}

// ── cabeçalho da entrada ─────────────────────────────────────────────────

const RE_PASTA = /\(\s*(\d{4})\s*-\s*(\d{1,4})\s*\)/;

function ehCabecalhoEntrada(t) {
  return RE_PASTA.test(t) && !t.includes(":");
}

function parseCabecalho(t) {
  const m = t.match(/^(?:(\d+)\s*\.\s*)?(.*?)\s*\(\s*(\d{4})\s*-\s*(\d{1,4})\s*\)\s*(.*)$/);
  if (!m) return null;
  let antes = m[2].trim().replace(/[\s\-–]+$/, "");
  let ordemNum = null;
  const mo = antes.match(/\s*-\s*Ordem\s*(\d+)\s*$/i);
  if (mo) {
    ordemNum = mo[1];
    antes = antes.slice(0, mo.index).trim();
  }
  const tokens = m[5]
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);
  let empresa = null;
  const pessoas = [];
  for (const tk of tokens) {
    if (/^(FARMAURORA|MAINZFARMA)$/i.test(tk)) empresa = tk.toUpperCase();
    else pessoas.push(tk);
  }
  return {
    paciente: toTitleCaseName(antes.replace(/\s+/g, " ")),
    ordem: ordemNum ? formatOrdemLabel(ordemNum) : undefined, // o app guarda o rótulo "Ordem K"
    pasta: `${m[3]} - ${m[4]}`,
    empresa,
    pessoas,
  };
}

// ── corpo da entrada ─────────────────────────────────────────────────────

function parseCorpo(linhas, rec, ctx) {
  const atualizacoes = rec.atualizacoes;
  const fallback = (linha, motivo) => {
    atualizacoes.push(atualizacaoDeLinha(linha));
    ctx.fallback.push({ linha, motivo });
  };
  const setCampo = (campo, valor, linha, alvo = rec) => {
    if (alvo[campo] !== undefined) return fallback(linha, `campo duplicado (${campo})`);
    alvo[campo] = valor;
  };

  for (const linha of linhas) {
    const t = linha.trim();
    if (!t) continue;

    // companhia aérea + AWB: "Emirates: 176-…" / "Emirates 176-…" / "Turkish Cargo: 235-…"
    const mCia = t.match(/^(emirates|lufthansa|swiss|turkish cargo)\s*:?\s*([\d][\d\- ]*\d)\s*$/i);
    if (mCia) {
      if (rec.companhiaAerea !== undefined) {
        fallback(t, "companhia aérea duplicada");
      } else {
        rec.companhiaAerea = COMPANHIAS[norm(mCia[1])];
        rec.numeroAwb = mCia[2].trim();
      }
      continue;
    }

    // courier: "Fedex: …" / "DHL: …" / "Fedex Formal: …" / "Fedex Courier: …"
    const mCou = t.match(/^(fedex|dhl)(\s+(?:formal|courier|simples))?\s*:\s*(.+)$/i);
    if (mCou) {
      ctx.courierEvidencia.push(t);
      if (mCou[2]) ctx.linhasQualificadas.push(t);
      setCampo("codigoRastreio", mCou[3].trim(), t);
      continue;
    }

    const idx = t.indexOf(":");
    const rotuloRaw = idx > 0 && idx <= 60 ? t.slice(0, idx) : null;
    const rotulo = rotuloRaw ? norm(rotuloRaw) : null;
    const valor = rotuloRaw ? t.slice(idx + 1).trim() : "";

    if (rotulo === "status") {
      if (ctx.statusRaw !== undefined) fallback(t, "status duplicado");
      else ctx.statusRaw = valor;
      continue;
    }

    if (rotulo === "medicamento" || /^medicamento \d+$/.test(rotulo ?? "")) {
      if (valor) rec.medicamentos.push(parseMedicamento(valor));
      else fallback(t, "medicamento vazio");
      continue;
    }

    if (rotulo && ROTULO_DATA[rotulo]) {
      const campo = ROTULO_DATA[rotulo];
      if (rotulo === "data de envio da po") ctx.notas.push('rótulo "Data de envio da PO" tratado como Data da compra (envio da PO)');
      if (ehAsd(valor) || !valor) continue; // ASD → ausente
      if (rec.datas[campo] !== undefined) fallback(t, `data duplicada (${campo})`);
      else rec.datas[campo] = valor;
      continue;
    }

    if (rotulo === "data da compra") {
      ctx.dataCompraSimples = { valor, linha: t };
      continue;
    }

    if (rotulo === "local da entrega") {
      if (!ehAsd(valor) && valor) setCampo("localEntrega", valor, t);
      continue;
    }

    if (rotulo === "responsavel") {
      if (valor) {
        setCampo("responsavelOperacional", valor, t);
        if (!["Bruno", "Rebeca"].includes(valor)) ctx.notas.push(`Responsável fora de Bruno/Rebeca: "${valor}"`);
      }
      continue;
    }

    if (rotulo === "numero do processo") {
      if (!ehAsd(valor) && valor) setCampo("numeroProcesso", valor, t);
      continue;
    }

    if (rotulo === "despachante") {
      if (ehAsd(valor) || !valor) continue;
      const [base, ...extra] = valor.split(/\s+-\s+/).map((x) => x.trim());
      const canon = DESPACHANTE_ENUM[norm(base)];
      if (canon) setCampo("despachante", canon, t);
      else {
        setCampo("despachante", base, t);
        ctx.notas.push(`Despachante fora do enum, mantido literal: "${base}"`);
      }
      if (extra.length) atualizacoes.push({ data: "", texto: extra.join(" - ") });
      continue;
    }

    if (rotulo === "fornecedor") {
      if (ehAsd(valor) || !valor) continue;
      const partes = valor.split(/\s+-\s+|\s+-$/).map((x) => x.trim()).filter(Boolean);
      const base = partes.shift() ?? "";
      if (partes.length && PAIS_FORNECEDOR.has(norm(partes[0]))) partes.shift(); // "Poros - Turquia" já escrito completo
      const canon = FORNECEDOR_ENUM[norm(base)];
      if (canon) setCampo("fornecedor", canon, t);
      else {
        setCampo("fornecedor", base, t);
        ctx.notas.push(`Fornecedor fora do enum, mantido literal: "${base}"`);
      }
      for (const p of partes) {
        if (/air\s*cargo/i.test(p)) {
          rec.modalEnvio = "Air Cargo";
        } else if (/courier|fedex|dhl/i.test(p)) {
          ctx.courierEvidencia.push(`Fornecedor: ${valor}`);

        } else {
          atualizacoes.push({ data: "", texto: p }); // observação (ex.: pagamento/venda a prazo)
        }
      }
      continue;
    }

    if (rotulo === "transportadora") {
      if (ehAsd(valor) || !valor) continue;
      const m = valor.match(
        /^(.*?)\s*-\s*Cota[cç][aã]o\s+([\w./\-]+)\s*-\s*R\$\s*([\d.]+(?:,\d{1,2})?)\s*(?:-\s*(.*))?$/i,
      );
      if (m && parseValorBR(m[3]) !== null) {
        const tn = { nome: m[1].trim(), cotacao: m[2].trim(), valor: parseValorBR(m[3]) };
        setCampo("transportadoraNacional", tn, t);
        const suf = (m[4] ?? "").trim();
        if (suf) {
          if (/^pagamento pendente$/i.test(suf)) rec.statusPagamento = "pendente";
          else if (/^pago$/i.test(suf)) rec.statusPagamento = "pago";
          else atualizacoes.push({ data: "", texto: suf });
        }
      } else if (/^[^\-:]+$/.test(valor)) {
        setCampo("transportadoraNacional", { nome: valor.trim() }, t); // só o nome
      } else {
        fallback(t, "transportadora fora do formato esperado");
      }
      continue;
    }

    if (rotulo === "pendente") {
      for (const p of valor.split(";").map((x) => x.trim()).filter(Boolean)) rec.pendencias.push(p);
      continue;
    }

    if (rotulo === "obs." || rotulo === "obs" || rotulo === "documentos de embarque") {
      atualizacoes.push({ data: "", texto: t });
      continue;
    }

    // qualquer outra coisa: nunca descartar — vai para atualizacoes
    fallback(t, "sem campo correspondente");
  }
}

// ── entrada completa ─────────────────────────────────────────────────────

function processarEntrada(e) {
  const motivos = [];
  const ctx = { notas: [], fallback: [], courierEvidencia: [], linhasQualificadas: [], statusRaw: undefined, dataCompraSimples: null };

  // Seção Entregues: formato enxuto, sem pasta → não há como gravar sem inventar `pasta`.
  if (e.secao.kind === "entregues") {
    const nome = e.cabecalho.replace(/^\d+\s*\.\s*/, "").split(" - ")[0].trim();
    motivos.push("seção Entregues sem pasta (`pasta` é obrigatória; não será inventada) — cadastrar manualmente");
    return { ...e, paciente: toTitleCaseName(nome), pasta: null, record: null, motivos, notas: ctx.notas, fallback: [], courier: false };
  }

  const cab = parseCabecalho(e.cabecalho);
  if (!cab) {
    return { ...e, paciente: e.cabecalho, pasta: null, record: null, motivos: ["cabeçalho não reconhecido"], notas: [], fallback: [], courier: false };
  }

  // consultor
  let consultor = null;
  if (e.secao.kind === "consultor") {
    consultor = e.secao.consultor;
    if (cab.pessoas.length) ctx.notas.push(`rótulo de pessoa inesperado no cabeçalho: ${cab.pessoas.join(" / ")}`);
  } else if (e.secao.kind === "grupo") {
    if (cab.pessoas.length === 0) motivos.push("entrada do grupo SEM rótulo de consultor");
    else if (cab.pessoas.length > 1) motivos.push(`rótulos de consultor ambíguos: ${cab.pessoas.join(" / ")}`);
    else {
      const achado = CONSULTORES_PROCESSO.find((c) => norm(c) === norm(cab.pessoas[0]));
      if (achado) consultor = achado;
      else motivos.push(`rótulo "${cab.pessoas[0]}" não corresponde a nenhum consultor cadastrado`);
    }
  }

  if (!cab.empresa) motivos.push("sem empresa (FARMAURORA/MAINZFARMA) no cabeçalho");

  const rec = {
    paciente: cab.paciente,
    pasta: cab.pasta,
    empresa: cab.empresa ?? undefined,
    consultor: consultor ?? undefined,
    medicamentos: [],
    datas: {},
    pendencias: [],
    atualizacoes: [],
  };
  if (cab.ordem) rec.ordem = cab.ordem;

  parseCorpo(e.corpo, rec, ctx);

  // status
  if (ctx.statusRaw === undefined) {
    motivos.push("sem linha de Status");
  } else {
    const { status, sobra, statusOutro, nota } = parseStatus(ctx.statusRaw);
    if (!status) motivos.push(`status não reconhecido: "${ctx.statusRaw}"`);
    else {
      rec.status = status;
      if (statusOutro) rec.statusOutro = statusOutro;
      if (sobra) rec.pendencias.unshift(sobra);
      if (nota) ctx.notas.push(nota);
      else if (sobra) ctx.notas.push(`status "${ctx.statusRaw}" → ${status} + pendência "${sobra}"`);
    }
  }

  // "Data da compra" solta: só entra em dataCompraPO se ela estiver vazia; senão vai para atualizações
  if (ctx.dataCompraSimples) {
    const { valor, linha } = ctx.dataCompraSimples;
    if (rec.datas.dataCompraPO === undefined && valor && !ehAsd(valor)) rec.datas.dataCompraPO = valor;
    else {
      rec.atualizacoes.push(atualizacaoDeLinha(linha));
      ctx.notas.push(`"${linha}" conflita com Data de envio da PO — foi para atualizações`);
    }
  }

  // modal: Air Cargo só quando o fornecedor diz. Courier: só vira "Courier Formal" quando o
  // texto diz "Formal" (decisão da Cris); os demais couriers ficam SEM modal.
  // Fornecedor "Air Cargo" + rastreio courier = conflito: modal vazio + atualização p/ classificar.
  const courier = ctx.courierEvidencia.length > 0;
  const citaFormal = ctx.courierEvidencia.some((x) => /formal/i.test(x));
  if (courier && rec.modalEnvio === "Air Cargo") {
    delete rec.modalEnvio;
    const rastreio = ctx.linhasQualificadas[0] ?? ctx.courierEvidencia[ctx.courierEvidencia.length - 1];
    rec.atualizacoes.push({
      data: "",
      texto: `Classificar o modal de envio: o doc informa fornecedor "Air Cargo" e rastreio "${rastreio.split(":")[0].trim()}" (${rastreio.split(":").slice(1).join(":").trim()}).`,
    });
    ctx.notas.push("CONFLITO: fornecedor diz Air Cargo, mas há rastreio courier → modalEnvio VAZIO + atualização para classificar");
  } else if (courier && citaFormal) {
    rec.modalEnvio = "Courier Formal";
    ctx.notas.push('texto cita "Formal" → modalEnvio = Courier Formal (decisão da Cris)');
  } else if (courier) {
    for (const l of ctx.linhasQualificadas) rec.atualizacoes.push({ data: "", texto: l });
  }

  // limpa chaves vazias
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];

  return {
    ...e,
    paciente: rec.paciente,
    pasta: rec.pasta,
    record: motivos.length ? null : rec,
    recordParcial: rec,
    motivos,
    notas: ctx.notas,
    fallback: ctx.fallback,
    courier,
    courierEvidencia: ctx.courierEvidencia,
  };
}

// ── API ──────────────────────────────────────────────────────────────────

export function parseFollowUpSource(texto) {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const secoes = [];
  const entradas = [];
  const erros = [];

  let secao = null;
  let esperandoCabecalho = true;
  let atual = null;

  linhas.forEach((bruta, i) => {
    const no = i + 1;
    const t = bruta.trim();
    if (/^_{10,}$/.test(t)) {
      esperandoCabecalho = true;
      secao = null;
      atual = null;
      return;
    }
    if (!t) return;

    if (esperandoCabecalho) {
      const comecaEntrada = secao?.kind === "entregues" ? /^\d+\s*\./.test(t) : ehCabecalhoEntrada(t);
      if (!comecaEntrada) {
        if (!secao) {
          const n = norm(t);
          if (SECAO_CONSULTOR[n]) secao = { kind: "consultor", consultor: SECAO_CONSULTOR[n], titulo: t, linha: no };
          else if (n === SECAO_GRUPO) secao = { kind: "grupo", titulo: t, linha: no, extras: [] };
          else if (n === SECAO_ENTREGUES) secao = { kind: "entregues", titulo: t, linha: no };
          else {
            erros.push(`linha ${no}: cabeçalho de seção não reconhecido: "${t}"`);
            secao = { kind: "desconhecida", titulo: t, linha: no };
          }
          secoes.push(secao);
        } else if (secao.kind === "grupo") {
          secao.extras.push(t); // 2ª linha do cabeçalho do grupo (Rodrigão - Alessandra - …)
        } else {
          erros.push(`linha ${no}: linha inesperada no cabeçalho da seção "${secao.titulo}": "${t}"`);
        }
        return;
      }
      if (!secao) {
        erros.push(`linha ${no}: entrada antes de qualquer cabeçalho de seção: "${t}"`);
        return;
      }
      esperandoCabecalho = false;
    }

    const novaEntrada = secao.kind === "entregues" ? /^\d+\s*\./.test(t) : ehCabecalhoEntrada(t);
    if (novaEntrada) {
      atual = { secao, linha: no, cabecalho: t, corpo: [] };
      entradas.push(atual);
    } else if (atual) {
      atual.corpo.push(bruta);
    } else {
      erros.push(`linha ${no}: linha solta fora de uma entrada: "${t}"`);
    }
  });

  return { secoes, erros, entradas: entradas.map(processarEntrada) };
}
