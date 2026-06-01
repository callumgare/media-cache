export type TagFacetCount = {
  id: number;
  name: string;
  count: number;
  countAddedIfRemoved: number | null;
};
export type SourceFacetCount = {
  liaseSourceId: string;
  name: string | null;
  count: number;
};
export type TypeFacetCount = {
  value: string;
  count: number;
  countAddedIfRemoved: number | null;
};
export type DurationFacetCount = {
  minCountAddedIfRemoved: number | null;
  maxCountAddedIfRemoved: number | null;
};
export type FavouritedFacetCount = {
  value: "yes" | "no";
  count: number;
  countAddedIfRemoved: number | null;
};
export type FacetCount =
  | TagFacetCount
  | SourceFacetCount
  | TypeFacetCount
  | FavouritedFacetCount
  | DurationFacetCount;

export type FacetFieldResult = {
  id: number;
  type: "field";
  field: string;
  counts: FacetCount[];
};

export type FacetGroupResult = {
  id: number;
  type: "group";
  conditions: FacetResult[];
};

export type FacetResult = FacetFieldResult | FacetGroupResult;
export type APIMediaFacetsResponse = FacetResult;
