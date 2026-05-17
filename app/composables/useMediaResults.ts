import { useMediaQuery } from "@@/stores/media-query";
import { useUiState } from "@@/stores/ui";
import type { APIMediaResponse } from "@@/types/api-media";
import { useMounted } from "@vueuse/core";
import type z from "zod";

export function useMediaResults() {
  const mediaQuery = useMediaQuery();
  const mediaQueryCondition = ref(mediaQuery.condition);
  mediaQuery.$subscribe(() => {
    mediaQueryCondition.value = mediaQuery.condition;
  });

  const uiState = useUiState();
  const { randomSeed } = storeToRefs(uiState);

  const isMounted = useMounted();

  const {
    data,
    fetchNextPage,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["media", mediaQueryCondition, randomSeed],
    queryFn: ({ pageParam }) =>
      $fetch<z.infer<typeof APIMediaResponse>>("/api/media", {
        query: { page: pageParam, seed: uiState.randomSeed },
        method: "POST",
        body: mediaQueryCondition.value,
      }),
    initialPageParam: 1,
    getNextPageParam: (page) => (page.media.length ? page.page + 1 : null),
    getPreviousPageParam: (page) => page.page - 1,
    // Don't fetch until after mount so the initial client state matches the
    // server-rendered HTML (both empty), preventing Vue hydration mismatches.
    enabled: isMounted,
  });

  const medias = computed(
    () => data.value?.pages.flatMap((page) => page.media) ?? [],
  );

  return {
    data,
    fetchNextPage,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    error,
    medias,
  };
}
