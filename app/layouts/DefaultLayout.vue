<script setup lang="ts">
import ToastNotice from "../components/ToastNotice.vue";
import SidebarNav from "../components/SidebarNav.vue";
import BottomNav from "../components/BottomNav.vue";
</script>

<template>
  <div id="default-layout" class="flex h-screen bg-paper">
    <SidebarNav />
    <!--
      overflow-x-hidden: antes deste elemento só tinha overflow-y-auto, e por
      uma regra do próprio CSS (quando um eixo é "auto"/"scroll" e o outro fica
      "visible", o "visible" vira "auto" também) isso fazia o navegador abrir,
      silenciosamente, um scroll horizontal aqui dentro sem nenhum indício
      visual — conteúdo que não cabia (sidebar fixa + telas que não colapsam em
      mobile/tablet) ficava só "escondido atrás do scroll", não cortado.
      Com overflow-x-hidden explícito, esse scroll não existe mais e o mesmo
      conteúdo passa a aparecer visualmente cortado/quebrado — isso é esperado
      aqui: cada página que ainda não colapsa pra mobile é corrigida nas
      próximas rodadas, não nesta.
    -->
    <main id="app-main-content" class="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pt-3.5 pb-10">
      <slot />
    </main>
    <ToastNotice />
    <BottomNav />
  </div>
</template>
