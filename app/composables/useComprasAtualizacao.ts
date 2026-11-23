// Mantém a lista de compras em dia: relê quando a aba volta a ficar à vista (foco ou visibilidade) e a cada 60 segundos enquanto ela está visível. Quem
// relê é `atualizar` (useComprasMes.atualizar), que só mexe na LISTA: a compra aberta, o que está sendo digitado e o autosave não são tocados. Aba
// escondida não consulta nada. Dois avisos seguidos (foco + visibilidade chegam juntos) viram uma leitura só (`intervaloMinimoMs`).

export const INTERVALO_DE_ATUALIZACAO_MS = 60_000;
const INTERVALO_MINIMO_MS = 2_000;

export interface OpcoesAtualizacao {
  /** Relê a lista, em silêncio. */
  atualizar: () => void | Promise<void>;
  intervaloMs?: number;
  intervaloMinimoMs?: number;
  /** Relógio (testes). */
  agora?: () => number;
  /** O documento e a janela (testes). */
  doc?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  janela?: Pick<Window, "addEventListener" | "removeEventListener">;
}

export interface ControleDaAtualizacao {
  iniciar: () => void;
  parar: () => void;
}

export function useComprasAtualizacao(opcoes: OpcoesAtualizacao): ControleDaAtualizacao {
  const intervalo = opcoes.intervaloMs ?? INTERVALO_DE_ATUALIZACAO_MS;
  const minimo = opcoes.intervaloMinimoMs ?? INTERVALO_MINIMO_MS;
  const agora = opcoes.agora ?? (() => Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  let ultima = Number.NEGATIVE_INFINITY;
  let ativo = false;

  const doc = (): NonNullable<OpcoesAtualizacao["doc"]> | null => opcoes.doc ?? (typeof document !== "undefined" ? document : null);
  const janela = (): NonNullable<OpcoesAtualizacao["janela"]> | null => opcoes.janela ?? (typeof window !== "undefined" ? window : null);
  const visivel = (): boolean => doc()?.visibilityState !== "hidden";

  function disparar(): void {
    if (!visivel()) return;
    const t = agora();
    if (t - ultima < minimo) return;
    ultima = t;
    void Promise.resolve(opcoes.atualizar()).catch(() => undefined);
  }

  const aoMudarVisibilidade = (): void => disparar();
  const aoFocar = (): void => disparar();

  function iniciar(): void {
    if (ativo) return;
    ativo = true;
    ultima = agora(); // a lista acabou de ser lida (a página carrega antes): a próxima leitura é a de daqui a 60 s, ou a da volta do foco
    doc()?.addEventListener("visibilitychange", aoMudarVisibilidade);
    janela()?.addEventListener("focus", aoFocar);
    timer = setInterval(() => {
      if (visivel()) {
        ultima = agora();
        void Promise.resolve(opcoes.atualizar()).catch(() => undefined);
      }
    }, intervalo);
  }

  function parar(): void {
    if (!ativo) return;
    ativo = false;
    doc()?.removeEventListener("visibilitychange", aoMudarVisibilidade);
    janela()?.removeEventListener("focus", aoFocar);
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  return { iniciar, parar };
}
