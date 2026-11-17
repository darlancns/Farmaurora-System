import { inject, provide, type InjectionKey } from "vue";

/**
 * Bloqueio do SALVAR enquanto algum campo de data (AppDatePicker com ano automático) está com erro ("Data
 * inexistente", "Data incompleta"...). O formulário cria o registro (useProverBloqueioDatas) e cada campo de data
 * dentro dele se registra sozinho (useBloqueioDatas, no AppDatePicker). No envio, `liberado()`:
 *  - nenhum campo com erro: true (segue o envio);
 *  - algum com erro: false — cada campo com erro mostra "Corrija ou limpe a data" e o foco vai ao PRIMEIRO na
 *    ordem da tela. Corrigir ou limpar o campo tira o erro na hora, e o próximo envio passa.
 * Fora de um formulário com registro (ex.: o aviso "chegou?" do sino), o campo simplesmente não se registra.
 */

export interface CampoDataBloqueavel {
  temErro: () => boolean;
  avisarBloqueio: () => void;
  focar: () => void;
  /** Elemento do campo na tela (para achar o primeiro na ordem do DOM). */
  elemento: () => Element | null;
}

export interface BloqueioDatas {
  /** Registra um campo; devolve a função que o remove (chamar ao desmontar). */
  registrar: (campo: CampoDataBloqueavel) => () => void;
  /** true = pode salvar. false = há campo de data com erro (já avisado e com o primeiro focado). */
  liberado: () => boolean;
}

const CHAVE_BLOQUEIO_DATAS: InjectionKey<BloqueioDatas> = Symbol("bloqueioDatas");

// Ordem da tela: `a` vem antes de `b` no documento? Sem elemento, fica no fim (mantém a ordem de registro).
function ordemNoDocumento(a: CampoDataBloqueavel, b: CampoDataBloqueavel): number {
  const ea = a.elemento();
  const eb = b.elemento();
  if (!ea || !eb || ea === eb) return ea ? -1 : eb ? 1 : 0;
  return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** Registro puro (sem provide), para testar e para quem prover. */
export function criarBloqueioDatas(): BloqueioDatas {
  const campos = new Set<CampoDataBloqueavel>();
  return {
    registrar(campo) {
      campos.add(campo);
      return () => {
        campos.delete(campo);
      };
    },
    liberado() {
      const comErro = [...campos].filter((c) => c.temErro()).sort(ordemNoDocumento);
      if (comErro.length === 0) return true;
      for (const c of comErro) c.avisarBloqueio();
      comErro[0]!.focar();
      return false;
    },
  };
}

/** No formulário: cria o registro e o oferece aos campos de data descendentes. */
export function useProverBloqueioDatas(): BloqueioDatas {
  const bloqueio = criarBloqueioDatas();
  provide(CHAVE_BLOQUEIO_DATAS, bloqueio);
  return bloqueio;
}

/** No campo de data: o registro do formulário em volta, ou null fora de um formulário com bloqueio. */
export function useBloqueioDatas(): BloqueioDatas | null {
  return inject(CHAVE_BLOQUEIO_DATAS, null);
}
