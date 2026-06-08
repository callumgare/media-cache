export type QueryFieldDataType =
  | "text"
  | "list-of-ids"
  | "number-range"
  | "list-of-values"
  | "short-list-of-values";

export type QueryFieldDefinition = {
  id: string;
  displayName: string;
  dataType: QueryFieldDataType;
};

export const QUERY_FIELD_DEFINITIONS = [
  { id: "source", displayName: "Source", dataType: "text" },
  { id: "tags", displayName: "Tags", dataType: "list-of-ids" },
  { id: "groups", displayName: "Groups", dataType: "list-of-ids" },
  { id: "duration", displayName: "Duration", dataType: "number-range" },
  { id: "width", displayName: "Width", dataType: "number-range" },
  { id: "height", displayName: "Height", dataType: "number-range" },
  {
    id: "aspectRatio",
    displayName: "Aspect Ratio",
    dataType: "short-list-of-values",
  },
  { id: "type", displayName: "Type", dataType: "text" },
  {
    id: "favourited",
    displayName: "Favourited",
    dataType: "short-list-of-values",
  },
] as const satisfies QueryFieldDefinition[];
