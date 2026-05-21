<template></template>
<script setup lang="ts">
import { useUiState } from "@@/stores/ui";

const uiState = useUiState();
await navigateTo(`/media/${uiState.lastMediaView}`, { redirectCode: 301 });
</script>
