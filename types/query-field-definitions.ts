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

export const QUERY_FIELD_DEFINITIONS: QueryFieldDefinition[] = [
  { id: "source", displayName: "Source", dataType: "text" },
  { id: "tags", displayName: "Tags", dataType: "list-of-ids" },
  { id: "groups", displayName: "Groups", dataType: "list-of-ids" },
  { id: "duration", displayName: "Duration", dataType: "number-range" },
  { id: "type", displayName: "Type", dataType: "text" },
  {
    id: "favourited",
    displayName: "Favourited",
    dataType: "short-list-of-values",
  },
];
