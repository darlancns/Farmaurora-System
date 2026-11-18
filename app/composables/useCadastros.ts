import { useState } from "#app";
import { LISTAS_CADASTRO } from "#shared/constants/cadastros";
import type { CadastroPorLista, ListaCadastro, NovoPorLista, PatchPorLista } from "#shared/types/Cadastro";
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
};

export function useCadastros() {
  const itens = useState<EstadoCadastros>("cadastros", () => ({ fornecedores: [], despachantes: [], transportadoras: [], "cias-aereas": [] }));
  const loading = useState<boolean>("cadastros-loading", () => false);
  const error = useState<string | null>("cadastros-error", () => null);

  async function carregarLista<L extends ListaCadastro>(lista: L): Promise<void> {
    const recebidos = await apiFetch<CadastroPorLista[L][]>(`/api/cadastros/${lista}`, undefined, ROTULO_FALHA[lista]);
    itens.value = { ...itens.value, [lista]: ordenarCadastro(recebidos) };
  }

  /** Carrega as quatro listas (ativos e inativos). */
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
    itens.value = {
      ...itens.value,
      [lista]: ordenarCadastro(itens.value[lista].map((i) => (i.id === id ? atualizado : i))),
    };
    return atualizado;
  }

  return { itens, loading, error, fetchCadastros, criar, alterar };
}
