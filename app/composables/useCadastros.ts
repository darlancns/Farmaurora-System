import { useState } from "#app";
import { LISTAS_CADASTRO } from "#shared/constants/cadastros";
import type {
  CadastroPorLista,
  ImpactoRenomearConsultor,
  ListaCadastro,
  NovoPorLista,
  PatchPorLista,
  ResultadoContasConsultor,
} from "#shared/types/Cadastro";
import { ordenarCadastro } from "#shared/utils/cadastroNome";
import { apiFetch } from "../utils/apiFetch";

// Dados dos Cadastros (Configurações → Cadastros). A tela só consome este composable; as chamadas são
// GET/POST/PATCH em /api/cadastros/:lista — não existe exclusão (remover é desativar, um PATCH de `ativo`).
// Mesmo molde de useContas.ts: estado em useState, preenchido só a partir de onMounted() (client-only).

type EstadoCadastros = { [L in ListaCadastro]: CadastroPorLista[L][] };

const ROTULO_FALHA: Record<ListaCadastro, string> = {
  fornecedores: "Falha ao carregar os fornecedores.",
  despachantes: "Falha ao carregar os despachantes.",
  transportadoras: "Falha ao carregar as transportadoras.",
  "cias-aereas": "Falha ao carregar as cias aéreas.",
  consultores: "Falha ao carregar os consultores.",
  temperaturas: "Falha ao carregar as temperaturas.",
};

export function useCadastros() {
  const itens = useState<EstadoCadastros>("cadastros", () => ({
    fornecedores: [],
    despachantes: [],
    transportadoras: [],
    "cias-aereas": [],
    consultores: [],
    temperaturas: [],
  }));
  const loading = useState<boolean>("cadastros-loading", () => false);
  const error = useState<string | null>("cadastros-error", () => null);

  async function carregarLista<L extends ListaCadastro>(lista: L): Promise<void> {
    const recebidos = await apiFetch<CadastroPorLista[L][]>(`/api/cadastros/${lista}`, undefined, ROTULO_FALHA[lista]);
    itens.value = { ...itens.value, [lista]: ordenarCadastro(recebidos) };
  }

  /** Carrega UMA lista (ativos e inativos), sem mexer nas outras — ex.: a DIR só precisa dos consultores. */
  async function fetchLista(lista: ListaCadastro): Promise<void> {
    await carregarLista(lista);
  }

  /** Carrega todas as listas (ativos e inativos). */
  async function fetchCadastros(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all(LISTAS_CADASTRO.map((lista) => carregarLista(lista)));
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function criar<L extends ListaCadastro>(lista: L, dto: NovoPorLista[L]): Promise<CadastroPorLista[L]> {
    const criado = await apiFetch<CadastroPorLista[L]>(
      `/api/cadastros/${lista}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dto) },
      "Erro ao criar o item.",
    );
    itens.value = { ...itens.value, [lista]: ordenarCadastro([...itens.value[lista], criado]) };
    return criado;
  }

  async function alterar<L extends ListaCadastro>(
    lista: L,
    id: string,
    patch: PatchPorLista[L],
  ): Promise<CadastroPorLista[L]> {
    const atualizado = await apiFetch<CadastroPorLista[L]>(
      `/api/cadastros/${lista}/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
      "Erro ao atualizar o item.",
    );
    // A resposta de um renomear de consultor traz `renomeacao` além do item: ela vai para quem chamou, não para a lista.
    const { renomeacao: _renomeacao, ...item } = atualizado as typeof atualizado & { renomeacao?: unknown };
    itens.value = {
      ...itens.value,
      [lista]: ordenarCadastro(itens.value[lista].map((i) => (i.id === id ? (item as typeof atualizado) : i))),
    };
    return atualizado;
  }

  /** SÓ LEITURA: quantos registros o renomear do consultor vai atualizar (para a confirmação). */
  async function impactoDoConsultor(id: string): Promise<ImpactoRenomearConsultor> {
    return await apiFetch<ImpactoRenomearConsultor>(
      `/api/cadastros/consultores/${id}/impacto`,
      undefined,
      "Não foi possível conferir o que o renomear vai atualizar.",
    );
  }

  /** "Tentar de novo" das contas de login que ainda têm o nome antigo (idempotente). */
  async function renomearContasDoConsultor(id: string, nomeAntigo: string): Promise<ResultadoContasConsultor> {
    return await apiFetch<ResultadoContasConsultor>(
      `/api/cadastros/consultores/${id}/renomear-contas`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomeAntigo }) },
      "Não foi possível atualizar as contas de login.",
    );
  }

  return { itens, loading, error, fetchCadastros, fetchLista, criar, alterar, impactoDoConsultor, renomearContasDoConsultor };
}
