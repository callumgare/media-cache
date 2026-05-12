export type TagFacetCount = {
  id: number;
  name: string;
  count: number;
  addedIfRemoved: number | null;
};
export type SourceFacetCount = {
  liaseSourceId: string;
  name: string | null;
  count: number;
};
export type TypeFacetCount = { value: string; count: number };
export type FacetCount = TagFacetCount | SourceFacetCount | TypeFacetCount;

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
