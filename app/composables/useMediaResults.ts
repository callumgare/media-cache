import { useMediaQuery } from "@@/stores/media-query";
import { useUiState } from "@@/stores/ui";
import type { APIMediaResponse } from "@@/types/api-media";
import { useMounted } from "@vueuse/core";
import { type MaybeRef, isRef } from "vue";
import type z from "zod";

interface UseMediaResultsOptions {
  condition?: unknown;
  sort?: { field: string; direction?: string };
  seed?: MaybeRef<number>;
  queryKeyPrefix?: string;
}

export function useMediaResults(options?: UseMediaResultsOptions) {
  const mediaQuery = useMediaQuery();
  const mediaQueryCondition = ref(options?.condition ?? mediaQuery.condition);

  if (!options?.condition) {
    mediaQuery.$subscribe(() => {
      mediaQueryCondition.value = mediaQuery.condition;
    });
  }

  const uiState = useUiState();
  const sort = ref(options?.sort ?? mediaQuery.sort);
  const randomSeed = isRef(options?.seed)
    ? options.seed
    : ref(options?.seed ?? mediaQuery.randomSeed);

  if (!options?.sort) {
    const { sort: storeSort, randomSeed: storeRandomSeed } =
      storeToRefs(mediaQuery);
    watch(storeSort, (val) => {
      sort.value = val;
    });
    watch(storeRandomSeed, (val) => {
      randomSeed.value = val;
    });
  }

  const isMounted = useMounted();

  const {
    data,
    fetchNextPage,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: [
      options?.queryKeyPrefix ?? "media",
      mediaQueryCondition,
      sort,
      randomSeed,
    ],
    queryFn: ({ pageParam }) => {
      const { $superFetch } = useNuxtApp();
      return $superFetch<z.infer<typeof APIMediaResponse>>("/api/media", {
        query: { page: pageParam },
        method: "POST",
        body: {
          condition: mediaQueryCondition.value,
          sort: sort.value,
          ...(sort.value.field === "random" ? { seed: randomSeed.value } : {}),
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
