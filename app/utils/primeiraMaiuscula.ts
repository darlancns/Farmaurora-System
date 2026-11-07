// Regra global: todo campo de texto do projeto começa com letra MAIÚSCULA. Só a PRIMEIRA letra do texto é
// alterada; o resto do que a pessoa digita nunca é tocado. Textos já salvos não são corrigidos: a regra
// age só sobre o que é digitado (evento "input").
//
// Como funciona: UM listener global de "input" na fase de CAPTURA em `document`. A captura em `document`
// roda ANTES dos listeners do próprio elemento, então, quando o `v-model` (ou um `@input`) lê
// `event.target.value`, o valor já está corrigido — sem tocar em cada campo. Instalado pelo plugin
// app/plugins/primeira-maiuscula.client.ts.

/**
 * Capitaliza a primeira letra do texto, ignorando espaços iniciais. Se o primeiro caractere que não é
 * espaço NÃO é uma letra com maiúscula (dígito, símbolo, letra sem caixa) ou já é maiúsculo, devolve o
 * texto igual. Não mexe no resto.
 */
export function capitalizarPrimeiraLetra(texto: string): string {
  const indice = texto.search(/\S/);
  if (indice < 0) return texto;

  const primeiro = texto.charAt(indice);
  const maiuscula = primeiro.toLocaleUpperCase("pt-BR");
  // Mesmo tamanho: letras como "ß" (→ "SS") deslocariam o cursor, então ficam como estão.
  if (maiuscula === primeiro || maiuscula.length !== primeiro.length) return texto;

  return texto.slice(0, indice) + maiuscula + texto.slice(indice + 1);
}

// Só `<textarea>` e `<input>` de texto livre recebem a regra. Lista de INCLUSÃO de propósito: qualquer
// tipo fora dela (password, email, number, date, time, datetime-local, month, week, tel, url, hidden,
// checkbox, radio, file, range, color, button...) fica de fora, inclusive tipos que venham a existir.
const TIPOS_DE_TEXTO = new Set(["text", "search"]);

const INPUTMODES_EXCLUIDOS = new Set(["decimal", "numeric", "tel", "email", "url"]);

const AUTOCOMPLETES_EXCLUIDOS = new Set([
  "username",
  "email",
  "current-password",
  "new-password",
  "one-time-code",
]);

// Atributo que desliga a regra no elemento ou em qualquer ancestral (códigos, chaves, senhas digitadas
// em campo type="text", datas em texto com máscara etc.). Basta o atributo estar presente.
export const ATRIBUTO_SEM_MAIUSCULA = "data-sem-maiuscula";

export type CampoDeTexto = HTMLInputElement | HTMLTextAreaElement;

function ehCampoDeTexto(alvo: EventTarget | null): alvo is CampoDeTexto {
  const el = alvo as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && TIPOS_DE_TEXTO.has((el as HTMLInputElement).type);
}

/** O campo participa da regra? (tipo, inputmode, autocomplete, readonly/disabled e data-sem-maiuscula). */
export function campoRecebePrimeiraMaiuscula(alvo: EventTarget | null): alvo is CampoDeTexto {
  if (!ehCampoDeTexto(alvo)) return false;
  if (alvo.readOnly || alvo.disabled) return false;
  if (alvo.closest(`[${ATRIBUTO_SEM_MAIUSCULA}]`)) return false;

  const inputmode = alvo.getAttribute("inputmode")?.trim().toLowerCase();
  if (inputmode && INPUTMODES_EXCLUIDOS.has(inputmode)) return false;

  const autocomplete = alvo.getAttribute("autocomplete");
  if (autocomplete) {
    for (const token of autocomplete.toLowerCase().split(/\s+/)) {
      if (AUTOCOMPLETES_EXCLUIDOS.has(token)) return false;
    }
  }
  return true;
}

// Troca o valor preservando cursor e seleção (o texto tem o mesmo tamanho, então os índices valem).
function trocarValor(campo: CampoDeTexto, novo: string): void {
  const inicio = campo.selectionStart;
  const fim = campo.selectionEnd;
  const direcao = campo.selectionDirection;
  campo.value = novo;
  if (inicio === null || fim === null) return;
  try {
    campo.setSelectionRange(inicio, fim, direcao ?? undefined);
  } catch {
    // tipos sem seleção: nada a restaurar
  }
}

/** Aplica a regra ao campo. Devolve true se o valor mudou. */
export function aplicarPrimeiraMaiuscula(campo: CampoDeTexto): boolean {
  const novo = capitalizarPrimeiraLetra(campo.value);
  if (novo === campo.value) return false; // sem mudança: nada a escrever (evita loops)
  trocarValor(campo, novo);
  return true;
}

export interface OpcoesPrimeiraMaiuscula {
  // Devolve true para NÃO agir agora (ex.: telas que ficam fora da regra). Avaliado a cada evento.
  ignorar?: () => boolean;
}

/**
 * Instala o listener global de "input" (captura) em `doc`. Devolve a função que o remove.
 *
 * Composição de texto (IME, teclas mortas como ´+a): não altera DURANTE a composição (`isComposing`, a
 * flag `composing` do v-model do Vue ou compositionstart/end). Ao terminar, aplica a regra no valor final e
 * avisa os ouvintes com um "input" — o Vue já faz isso para o v-model, mas um `@input` solto não.
 */
export function instalarPrimeiraMaiuscula(doc: Document, opcoes: OpcoesPrimeiraMaiuscula = {}): () => void {
  const emComposicao = new WeakSet<EventTarget>();
  const view = doc.defaultView;

  function bloqueado(): boolean {
    return opcoes.ignorar?.() === true;
  }

  function aoDigitar(evento: Event): void {
    const alvo = evento.target;
    if (bloqueado() || !campoRecebePrimeiraMaiuscula(alvo)) return;
    if ((evento as InputEvent).isComposing || emComposicao.has(alvo)) return;
    if ((alvo as CampoDeTexto & { composing?: boolean }).composing) return;
    aplicarPrimeiraMaiuscula(alvo);
  }

  function aoIniciarComposicao(evento: Event): void {
    if (evento.target) emComposicao.add(evento.target);
  }

  function aoFinalizarComposicao(evento: Event): void {
    const alvo = evento.target;
    if (!alvo) return;
    emComposicao.delete(alvo);
    // Depois dos ouvintes do próprio campo (o v-model do Vue reenvia o "input" aqui dentro): se ainda
    // falta capitalizar, corrige e avisa quem escuta.
    setTimeout(() => {
      if (bloqueado() || !campoRecebePrimeiraMaiuscula(alvo)) return;
      if (aplicarPrimeiraMaiuscula(alvo) && view) alvo.dispatchEvent(new view.Event("input", { bubbles: true }));
    }, 0);
  }

  doc.addEventListener("input", aoDigitar, true);
  doc.addEventListener("compositionstart", aoIniciarComposicao, true);
  doc.addEventListener("compositionend", aoFinalizarComposicao, true);

  return () => {
    doc.removeEventListener("input", aoDigitar, true);
    doc.removeEventListener("compositionstart", aoIniciarComposicao, true);
    doc.removeEventListener("compositionend", aoFinalizarComposicao, true);
  };
}

/**
 * A tela fica FORA da regra? Hoje só a DIR (trabalho ainda sem commit).
 * TODO: remover (e o `ignorar` do plugin) depois que a DIR for commitada.
 */
export function rotaForaDaRegra(pathname: string): boolean {
  return pathname === "/dir" || pathname.startsWith("/dir/");
}
