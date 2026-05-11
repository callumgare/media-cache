import type { QueryVariation } from "@@/server/database/schema";
import type { GenericRequest } from "media-finder";

export type QueryListResponse = Array<{
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  schedule: number;
  queryVariations: QueryVariation[] | null;
}>;

export type QueryDetailResponse = {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  schedule: number;
  queryVariations: QueryVariation[] | null;
};
