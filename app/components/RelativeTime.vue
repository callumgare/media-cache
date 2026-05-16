<template>{{ text }}</template>

<script setup lang="ts">
import { useNow } from "@vueuse/core";

const props = defineProps<{
  date: Date;
}>();

const now = useNow({ interval: 1000 });

const text = computed(() => {
  const ms = Math.max(0, now.value.getTime() - props.date.getTime());
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years} year${years === 1 ? "" : "s"} ago`;
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"} ago`;
  if (weeks >= 1) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "about a minute ago";
});
</script>
