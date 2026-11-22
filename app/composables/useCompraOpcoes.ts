import { computed, ref, type ComputedRef, type Ref } from "vue";
import { useState } from "#app";
import type { DespachanteCadastroResumo, OpcoesCompra } from "#shared/types/compra";
import { opcoesParaFormulario, type OpcoesFormulario } from "../utils/comprasOpcoes";
import { chaveCadastro } from "#shared/utils/cadastroNome";
import { apiFetch } from "../utils/apiFetch";

// As opções do formulário (GET /api/compras/opcoes): consultores, despachantes, fornecedores, temperaturas e a 1ª página dos
// medicamentos (que são paginados). Lidas UMA vez por sessão da página e guardadas em memória; a falha vira a faixa "Não foi possível
// carregar as opções. Tentar de novo". Nenhum campo é chave PIX (o servidor nem devolve). A cia aérea NÃO vem daqui: depende do envio
// (modal) e vem das constantes do Follow-Up (`ciasDoEnvio` em app/utils/comprasOpcoes.ts).

export interface ApiOpcoesCompra {
  obter: () => Promise<OpcoesCompra>;
}

const apiPadrao: ApiOpcoesCompra = {
  obter: () => apiFetch<OpcoesCompra>("/api/compras/opcoes", undefined, "Não foi possível carregar as opções."),
};

export interface CompraOpcoes {
  opcoes: Ref<OpcoesCompra | null>;
  carregando: Ref<boolean>;
  erro: Ref<string | null>;
  /** Os consultores ativos (para o Consultor); vazio enquanto não carrega. */
  consultores: ComputedRef<Array<{ nome: string }>>;
  despachantes: ComputedRef<OpcoesCompra["despachantes"]>;
  /** Tudo o que as linhas do formulário leem dos Cadastros (vazio enquanto não carrega). */
  paraFormulario: ComputedRef<OpcoesFormulario>;
  /** Lê as opções se ainda não leu (uma vez por sessão); `forcar` relê (o botão "Tentar de novo"). */
  carregar: (forcar?: boolean) => Promise<void>;
  /** Os dados do despachante da compra (telefone, e-mail e contato), se ele está na lista; senão null. Só esses campos. */
  despachantePeloNome: (nome: string) => DespachanteCadastroResumo | null;
}

export function useCompraOpcoes(config: { api?: ApiOpcoesCompra; chave?: string } = {}): CompraOpcoes {
  const api = config.api ?? apiPadrao;
  const chave = config.chave ?? "compras-opcoes";
  const opcoes = useState<OpcoesCompra | null>(chave, () => null);
  const carregando = ref(false);
  const erro = ref<string | null>(null);

  async function carregar(forcar = false): Promise<void> {
    if (carregando.value) return;
    if (opcoes.value !== null && !forcar) return;
    carregando.value = true;
    erro.value = null;
    try {
      opcoes.value = await api.obter();
    } catch (e) {
      erro.value = e instanceof Error ? e.message : "Não foi possível carregar as opções.";
    } finally {
      carregando.value = false;
    }
  }

  function despachantePeloNome(nome: string): DespachanteCadastroResumo | null {
    const chaveDoNome = chaveCadastro(nome);
    if (chaveDoNome === "") return null;
    const achado = opcoes.value?.despachantes.find((d) => chaveCadastro(d.nome) === chaveDoNome);
    // Campo a campo: o que mais vier no objeto (nunca vem PIX, mas a cópia não depende disso) não passa.
    return achado ? { nome: achado.nome, telefone: achado.telefone, email: achado.email, contatoNome: achado.contatoNome } : null;
  }

  return {
    opcoes,
    carregando,
    erro,
    consultores: computed(() => opcoes.value?.consultores ?? []),
    despachantes: computed(() => opcoes.value?.despachantes ?? []),
    paraFormulario: computed<OpcoesFormulario>(() => opcoesParaFormulario(opcoes.value)),
    carregar,
    despachantePeloNome,
  };
}
