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
  const { sort, randomSeed } = storeToRefs(mediaQuery);

  const isMounted = useMounted();

  const {
    data,
    fetchNextPage,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["media", mediaQueryCondition, sort, randomSeed],
    queryFn: ({ pageParam }) => {
      const { $superFetch } = useNuxtApp();
      return $superFetch<z.infer<typeof APIMediaResponse>>("/api/media", {
        query: { page: pageParam },
        method: "POST",
        body: {
          condition: mediaQueryCondition.value,
          sort: mediaQuery.sort,
          ...(mediaQuery.sort.field === "random"
            ? { seed: mediaQuery.randomSeed }
            : {}),
        },
      });
    },
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
    uiState,
  };
}
