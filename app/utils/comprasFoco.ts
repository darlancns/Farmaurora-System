import type { AbaCompras } from "./comprasAbas";
import { CAMPO_ALTERNATIVO } from "./comprasCampos";

// Rolar até um campo do formulário e levar o foco a ele, com um destaque curto. O campo é achado pelo atributo estável data-campo.
//
//  - A rolagem centraliza o campo (scrollIntoView block "center"): rola a COLUNA do formulário (a que tem rolagem própria), nunca a janela
//    inteira no desktop (a página não rola por inteiro). `prefers-reduced-motion`: sem rolagem suave.
//  - O foco vai ao campo (ou ao 1º controle habilitado dentro dele: o select, o rádio, o botão), sem pular a tela (preventScroll: a rolagem
//    já foi feita).
//  - Destaque: o atributo data-destaque fica ~1,5 s (o contorno primário está em main.css); reduced-motion não anima.

export const DURACAO_DESTAQUE_MS = 1500;

const FOCAVEL = "input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [role=radio]:not([disabled]), [tabindex]:not([tabindex='-1']):not([disabled])";
const CAMPO_VALIDO = /^[a-z0-9-]+$/;

function movimentoReduzido(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const temporizadores = new WeakMap<Element, ReturnType<typeof setTimeout>>();

export function destacar(el: HTMLElement): void {
  const anterior = temporizadores.get(el);
  if (anterior !== undefined) clearTimeout(anterior);
  el.setAttribute("data-destaque", "");
  temporizadores.set(
    el,
    setTimeout(() => {
      el.removeAttribute("data-destaque");
      temporizadores.delete(el);
    }, DURACAO_DESTAQUE_MS),
  );
}

export function acharCampo(campo: string, doc: Document = document): HTMLElement | null {
  if (!CAMPO_VALIDO.test(campo)) return null;
  return doc.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
}

/** O que recebe o foco: o próprio elemento, se é focável e está habilitado; senão o 1º controle habilitado dentro dele. */
export function focavelDe(alvo: HTMLElement): HTMLElement | null {
  if (alvo.matches(FOCAVEL)) return alvo;
  return alvo.querySelector<HTMLElement>(FOCAVEL);
}

/**
 * Rola até o campo, foca e destaca. Devolve o campo achado (ou null se não existe). Campo sem controle habilitado (a conta só lê, ou o
 * campo está desabilitado) é rolado e destacado, sem foco; se existir um campo alternativo habilitado, o foco vai para ele.
 */
export function rolarEFocar(campo: string, doc: Document = document): HTMLElement | null {
  let alvo = acharCampo(campo, doc);
  // Campo de uma ordem que não está na tela (ex.: o "+ Adicionar medicamento" some para quem só lê): cai no cartão da ordem.
  if (!alvo) {
    const ordem = /^(ordem-\d+)-/.exec(campo);
    if (ordem?.[1]) alvo = acharCampo(ordem[1], doc);
  }
  if (!alvo) return null;

  let focavel = focavelDe(alvo);
  if (!focavel && CAMPO_ALTERNATIVO[campo]) {
    const alternativo = acharCampo(CAMPO_ALTERNATIVO[campo]!, doc);
    if (alternativo) {
      alvo = alternativo;
      focavel = focavelDe(alternativo);
    }
  }

  alvo.scrollIntoView?.({ block: "center", behavior: movimentoReduzido() ? "auto" : "smooth" });
  focavel?.focus({ preventScroll: true });
  destacar(alvo);
  return alvo;
}

/** Espera o navegador desenhar (um quadro): depois de trocar de aba no celular, o painel acabou de aparecer e ainda não tem layout. */
export function esperarQuadro(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export interface DepsIrParaCampo {
  /** Estamos em lg+ (as três colunas juntas)? Abaixo de lg o formulário só aparece na aba "Formulário". */
  telaLarga: () => boolean;
  abaAtual: () => AbaCompras;
  irParaAba: (aba: AbaCompras) => void;
  /** Espera o painel da nova aba existir e ter layout (o padrão espera o DOM e um quadro). */
  aguardar?: () => Promise<void>;
}

/**
 * O clique num item do checklist: no celular (abaixo de lg) troca para a aba Formulário ANTES de rolar (o painel estava escondido);
 * em tela larga não troca nada. Depois rola até o campo, foca e destaca (rolarEFocar).
 */
export async function irParaCampoComAba(campo: string, deps: DepsIrParaCampo, doc: Document = document): Promise<HTMLElement | null> {
  if (!deps.telaLarga() && deps.abaAtual() !== "formulario") {
    deps.irParaAba("formulario");
    await (deps.aguardar ?? esperarQuadro)();
  }
  return rolarEFocar(campo, doc);
}
