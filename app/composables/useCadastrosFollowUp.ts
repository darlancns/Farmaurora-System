import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { CadastrosFollowUp, FornecedorLido } from "#shared/types/Cadastro";
import type { ItemCadastroPagamento } from "#shared/types/Pagamento";
import { fornecedoresLidos, itensLidos } from "#shared/utils/cadastroLeitura";
import { apiFetch } from "../utils/apiFetch";
import { getErrorMessage } from "../utils/errorMessages";

// Fornecedores, despachantes e transportadoras que o FOLLOW-UP lê dos Cadastros (Configurações → Cadastros): selects do formulário e prazo do
// alerta do sino. Lê GET /api/cadastros/:lista, aberto a TODOS os cargos (inclusive consultor, que não lê Pagamentos): ativos E inativos,
// ativos primeiro. Só leitura: o Follow-Up nunca altera Cadastros.
//
// Guarda só o que as telas usam (shared/utils/cadastroLeitura.ts): nome, ativo, país e o prazo do fornecedor. A chave PIX, que a API manda a
// quem lê Pagamentos, é descartada aqui e nunca fica no estado. O estado é independente do `useCadastros` (a aba de Cadastros, com PIX e CRUD).
//
// Carrega só no navegador (a partir de onMounted), como as outras listas. Uma lista que falha não derruba as outras nem apaga o que já veio;
// quem chama recebe a mensagem (ou null) e NUNCA uma exceção. Chamadas simultâneas (formulário e sino) dividem a mesma requisição.

interface Estado extends CadastrosFollowUp {
  /** Cada lista tem a sua bandeira: a lista que ainda não veio (ou falhou) não pode ser confundida com uma lista vazia. */
  fornecedoresCarregados: boolean;
  despachantesCarregados: boolean;
  transportadorasCarregadas: boolean;
}

export interface UseCadastrosFollowUp {
  /** Todos os fornecedores (ativos primeiro), com país e prazo do alerta. Vazia até carregar. */
  fornecedores: ComputedRef<FornecedorLido[]>;
  despachantes: ComputedRef<ItemCadastroPagamento[]>;
  transportadoras: ComputedRef<ItemCadastroPagamento[]>;
  /** A lista de fornecedores JÁ veio do servidor? (o sino só confia nela depois disso; antes usa a tabela antiga) */
  fornecedoresCarregados: ComputedRef<boolean>;
  despachantesCarregados: ComputedRef<boolean>;
  transportadorasCarregadas: ComputedRef<boolean>;
  /**
   * Carrega as listas que ainda não vieram (ou todas, com `forcar`). Devolve a mensagem da PRIMEIRA falha ou null; nunca lança.
   * Quem já tem tudo carregado não faz requisição.
   */
  carregar: (opcoes?: { forcar?: boolean }) => Promise<string | null>;
}

const ESTADO_INICIAL = (): Estado => ({
  fornecedores: [],
  despachantes: [],
  transportadoras: [],
  fornecedoresCarregados: false,
  despachantesCarregados: false,
  transportadorasCarregadas: false,
});

const url = (lista: "fornecedores" | "despachantes" | "transportadoras"): string => `/api/cadastros/${lista}`;

// Uma carga por vez no app inteiro (o formulário e o sino pedem juntos ao abrir a tela).
let emAndamento: Promise<string | null> | null = null;

export function useCadastrosFollowUp(): UseCadastrosFollowUp {
  const estado = useState<Estado>("cadastros-followup", ESTADO_INICIAL);

  async function carregarAgora(forcar: boolean): Promise<string | null> {
    const precisa = {
      fornecedores: forcar || !estado.value.fornecedoresCarregados,
      despachantes: forcar || !estado.value.despachantesCarregados,
      transportadoras: forcar || !estado.value.transportadorasCarregadas,
    };
    if (!precisa.fornecedores && !precisa.despachantes && !precisa.transportadoras) return null;

    let primeiraFalha: string | null = null;
    const falhou = (e: unknown): void => {
      primeiraFalha ??= getErrorMessage(e, "Não foi possível carregar os cadastros.");
    };

    await Promise.all([
      precisa.fornecedores
        ? apiFetch<unknown>(url("fornecedores"), undefined, "Não foi possível carregar os fornecedores.").then(
            (r) => {
              estado.value = { ...estado.value, fornecedores: fornecedoresLidos(r), fornecedoresCarregados: true };
            },
            falhou,
          )
        : null,
      precisa.despachantes
        ? apiFetch<unknown>(url("despachantes"), undefined, "Não foi possível carregar os despachantes.").then(
            (r) => {
              estado.value = { ...estado.value, despachantes: itensLidos(r), despachantesCarregados: true };
            },
            falhou,
          )
        : null,
      precisa.transportadoras
        ? apiFetch<unknown>(url("transportadoras"), undefined, "Não foi possível carregar as transportadoras.").then(
            (r) => {
              estado.value = { ...estado.value, transportadoras: itensLidos(r), transportadorasCarregadas: true };
            },
            falhou,
          )
        : null,
    ]);
    return primeiraFalha;
  }

  function carregar(opcoes: { forcar?: boolean } = {}): Promise<string | null> {
    if (emAndamento) return emAndamento;
    const execucao = carregarAgora(opcoes.forcar === true).finally(() => {
      emAndamento = null;
    });
    emAndamento = execucao;
    return execucao;
  }

  return {
    fornecedores: computed(() => estado.value.fornecedores),
    despachantes: computed(() => estado.value.despachantes),
    transportadoras: computed(() => estado.value.transportadoras),
    fornecedoresCarregados: computed(() => estado.value.fornecedoresCarregados),
    despachantesCarregados: computed(() => estado.value.despachantesCarregados),
    transportadorasCarregadas: computed(() => estado.value.transportadorasCarregadas),
    carregar,
  };
}
