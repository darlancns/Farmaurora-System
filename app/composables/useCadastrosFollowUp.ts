import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { FornecedorLido, MedicamentoLido } from "#shared/types/Cadastro";
import type { ItemCadastroPagamento } from "#shared/types/Pagamento";
import { fornecedoresLidos, itensLidos, medicamentosLidos } from "#shared/utils/cadastroLeitura";
import { apiFetch } from "../utils/apiFetch";
import { getErrorMessage } from "../utils/errorMessages";

// Fornecedores, despachantes, transportadoras e medicamentos que o FOLLOW-UP lê dos Cadastros (Configurações → Cadastros): selects do formulário,
// sugestão do nome do medicamento e prazo do alerta do sino. Lê GET /api/cadastros/:lista, aberto a TODOS os cargos (inclusive consultor, que não
// lê Pagamentos nem Compras): ativos E inativos, ativos primeiro. Só leitura: o Follow-Up nunca altera Cadastros.
//
// Guarda só o que as telas usam (shared/utils/cadastroLeitura.ts): nome, ativo, país e o prazo do fornecedor. A chave PIX, que a API manda a
// quem lê Pagamentos, é descartada aqui e nunca fica no estado; do medicamento fica só o nome. O estado é independente do `useCadastros` (a aba
// de Cadastros, com PIX e CRUD).
//
// Carrega só no navegador (a partir de onMounted), como as outras listas. Uma lista que falha não derruba as outras nem apaga o que já veio;
// quem chama recebe a mensagem (ou null) e NUNCA uma exceção. As chamadas entram numa FILA: duas telas que pedem juntas (o formulário e o sino)
// não repetem requisição, e quem pede só uma parte (o sino, só os fornecedores) não impede quem pede o resto.

export type ListaFollowUp = "fornecedores" | "despachantes" | "transportadoras" | "medicamentos";

const TODAS_AS_LISTAS: readonly ListaFollowUp[] = ["fornecedores", "despachantes", "transportadoras", "medicamentos"];

interface Estado {
  fornecedores: FornecedorLido[];
  despachantes: ItemCadastroPagamento[];
  transportadoras: ItemCadastroPagamento[];
  medicamentos: MedicamentoLido[];
  /** Cada lista tem a sua bandeira: a lista que ainda não veio (ou falhou) não pode ser confundida com uma lista vazia. */
  fornecedoresCarregados: boolean;
  despachantesCarregados: boolean;
  transportadorasCarregadas: boolean;
  medicamentosCarregados: boolean;
}

export interface UseCadastrosFollowUp {
  /** Todos os fornecedores (ativos primeiro), com país e prazo do alerta. Vazia até carregar. */
  fornecedores: ComputedRef<FornecedorLido[]>;
  despachantes: ComputedRef<ItemCadastroPagamento[]>;
  transportadoras: ComputedRef<ItemCadastroPagamento[]>;
  /** Os medicamentos (só nome e ativo), para a sugestão do nome no formulário. */
  medicamentos: ComputedRef<MedicamentoLido[]>;
  /** A lista de fornecedores JÁ veio do servidor? (o sino só confia nela depois disso; antes usa a tabela antiga) */
  fornecedoresCarregados: ComputedRef<boolean>;
  despachantesCarregados: ComputedRef<boolean>;
  transportadorasCarregadas: ComputedRef<boolean>;
  medicamentosCarregados: ComputedRef<boolean>;
  /**
   * Carrega as listas pedidas (`listas`; padrão: todas) que ainda não vieram, ou todas as pedidas com `forcar`. Devolve a mensagem da PRIMEIRA
   * falha ou null; nunca lança. Quem já tem tudo o que pediu não faz requisição.
   */
  carregar: (opcoes?: { forcar?: boolean; listas?: readonly ListaFollowUp[] }) => Promise<string | null>;
}

const ESTADO_INICIAL = (): Estado => ({
  fornecedores: [],
  despachantes: [],
  transportadoras: [],
  medicamentos: [],
  fornecedoresCarregados: false,
  despachantesCarregados: false,
  transportadorasCarregadas: false,
  medicamentosCarregados: false,
});

const BANDEIRA: Record<ListaFollowUp, keyof Estado> = {
  fornecedores: "fornecedoresCarregados",
  despachantes: "despachantesCarregados",
  transportadoras: "transportadorasCarregadas",
  medicamentos: "medicamentosCarregados",
};

const FALHA: Record<ListaFollowUp, string> = {
  fornecedores: "Não foi possível carregar os fornecedores.",
  despachantes: "Não foi possível carregar os despachantes.",
  transportadoras: "Não foi possível carregar as transportadoras.",
  medicamentos: "Não foi possível carregar os medicamentos.",
};

function lerLista(lista: ListaFollowUp, resposta: unknown): FornecedorLido[] | ItemCadastroPagamento[] | MedicamentoLido[] {
  if (lista === "fornecedores") return fornecedoresLidos(resposta);
  if (lista === "medicamentos") return medicamentosLidos(resposta);
  return itensLidos(resposta);
}

// Uma carga por vez no app inteiro: cada chamada espera a anterior terminar e então carrega só o que ainda falta.
let fila: Promise<unknown> = Promise.resolve();

export function useCadastrosFollowUp(): UseCadastrosFollowUp {
  const estado = useState<Estado>("cadastros-followup", ESTADO_INICIAL);

  async function carregarAgora(forcar: boolean, listas: readonly ListaFollowUp[]): Promise<string | null> {
    const faltam = listas.filter((l) => forcar || estado.value[BANDEIRA[l]] !== true);
    if (faltam.length === 0) return null;

    let primeiraFalha: string | null = null;
    await Promise.all(
      faltam.map((lista) =>
        apiFetch<unknown>(`/api/cadastros/${lista}`, undefined, FALHA[lista]).then(
          (resposta) => {
            estado.value = { ...estado.value, [lista]: lerLista(lista, resposta), [BANDEIRA[lista]]: true };
          },
          (e: unknown) => {
            primeiraFalha ??= getErrorMessage(e, "Não foi possível carregar os cadastros.");
          },
        ),
      ),
    );
    return primeiraFalha;
  }

  function carregar(opcoes: { forcar?: boolean; listas?: readonly ListaFollowUp[] } = {}): Promise<string | null> {
    const execucao = fila.then(() => carregarAgora(opcoes.forcar === true, opcoes.listas ?? TODAS_AS_LISTAS));
    fila = execucao;
    return execucao;
  }

  return {
    fornecedores: computed(() => estado.value.fornecedores),
    despachantes: computed(() => estado.value.despachantes),
    transportadoras: computed(() => estado.value.transportadoras),
    medicamentos: computed(() => estado.value.medicamentos),
    fornecedoresCarregados: computed(() => estado.value.fornecedoresCarregados),
    despachantesCarregados: computed(() => estado.value.despachantesCarregados),
    transportadorasCarregadas: computed(() => estado.value.transportadorasCarregadas),
    medicamentosCarregados: computed(() => estado.value.medicamentosCarregados),
    carregar,
  };
}
