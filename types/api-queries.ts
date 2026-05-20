import type { QueryVariation } from "@@/server/database/schema";
import type { GenericRequest } from "@liase/core";

export type QueryListResponse = Array<{
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  fetchCountLimitPerVariation: boolean;
  schedule: number;
  queryVariations: QueryVariation[] | null;
  secretMappings: Record<string, number> | null;
}>;

export type QueryDetailResponse = {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  fetchCountLimitPerVariation: boolean;
  schedule: number;
  queryVariations: QueryVariation[] | null;
  secretMappings: Record<string, number> | null;
};
