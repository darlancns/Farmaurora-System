import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import { TEMPERATURAS_DIR } from "#shared/constants/dir";
import type { DirOpcoes } from "#shared/types/dir";
import { apiFetch } from "../utils/apiFetch";

// As opções da DIR que vêm dos Cadastros (GET /api/dir/opcoes): hoje só as temperaturas ativas. O estado fica em memória (useState) e a
// leitura acontece uma vez por sessão da página. Se a leitura falhar, o formulário usa as 3 constantes de antes (TEMPERATURAS_DIR): a
// DIR nunca fica sem a lista, e valor fora da lista continua abrindo como "Outro".

export interface UseDirOpcoes {
  /** As temperaturas do select: as do Cadastro (ativas) quando carregaram, senão as 3 constantes. */
  temperaturas: ComputedRef<readonly string[]>;
  /** Lê as opções se ainda não leu; nunca lança (falha = continua no fallback). Devolve true se vieram do servidor. */
  carregarOpcoes: () => Promise<boolean>;
}

export function useDirOpcoes(): UseDirOpcoes {
  const opcoes = useState<DirOpcoes | null>("dir-opcoes", () => null);
  const temperaturas = computed<readonly string[]>(() => {
    const lista = opcoes.value?.temperaturas;
    return lista && lista.length > 0 ? lista : TEMPERATURAS_DIR;
  });

  async function carregarOpcoes(): Promise<boolean> {
    if (opcoes.value) return true;
    try {
      opcoes.value = await apiFetch<DirOpcoes>("/api/dir/opcoes", undefined, "Não foi possível carregar as opções da DIR.");
      return true;
    } catch {
      return false;
    }
  }

  return { temperaturas, carregarOpcoes };
}
