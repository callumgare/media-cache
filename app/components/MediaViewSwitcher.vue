<template>
  <div data-testid="media-view-switcher" :data-mounted="isMounted">
    <SelectButton
      :model-value="currentView"
      :options="viewOptions"
      option-value="value"
      option-label="value"
      @update:model-value="navigate"
    >
      <template #option="{ option }">
        <i :class="option.icon" />
      </template>
    </SelectButton>
  </div>
</template>

<script setup lang="ts">
import "primeicons/primeicons.css";
import { useUiState } from "@@/stores/ui";

const router = useRouter();
const route = useRoute();
const uiState = useUiState();

const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

const currentView = computed(() =>
  route.path.startsWith("/media/feed") ? "feed" : "grid",
);

watch(
  currentView,
  (view) => {
    uiState.lastMediaView = view;
  },
  { immediate: true },
);

const viewOptions = [
  { value: "grid", icon: "pi pi-th-large" },
  { value: "feed", icon: "pi pi-mobile" },
];

async function navigate(value: string | null) {
  if (!value) return;
  await router.push(`/media/${value}`);
}
</script>
