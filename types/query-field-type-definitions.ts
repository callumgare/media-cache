import { z } from "zod";
import type { QueryFieldDataType } from "./query-field-definitions";

export const widgetIdSchema = z.enum([
  "dropdown",
  "multi-select-dropdown",
  "listbox",
  "number-range",
  "select-button",
]);

export type WidgetId = z.infer<typeof widgetIdSchema>;

export type QueryFieldTypeDefinition = {
  dataType: QueryFieldDataType;
  operators: { id: string; displayName: string }[];
  availableWidgets: WidgetId[];
  defaultWidget: WidgetId;
};

export const QUERY_FIELD_TYPE_DEFINITIONS: QueryFieldTypeDefinition[] = [
  {
    dataType: "text",
    operators: [{ id: "equals", displayName: "is" }],
    availableWidgets: ["dropdown"],
    defaultWidget: "dropdown",
  },
  {
    dataType: "list-of-ids",
    operators: [{ id: "includes all", displayName: "includes all" }],
    availableWidgets: ["multi-select-dropdown", "listbox"],
    defaultWidget: "listbox",
  },
  {
    dataType: "number-range",
    operators: [{ id: "is between", displayName: "is between" }],
    availableWidgets: ["number-range"],
    defaultWidget: "number-range",
  },
  {
    dataType: "list-of-values",
    operators: [{ id: "equals", displayName: "is" }],
    availableWidgets: ["multi-select-dropdown", "listbox"],
    defaultWidget: "multi-select-dropdown",
  },
  {
    dataType: "short-list-of-values",
    operators: [{ id: "equals", displayName: "is" }],
    availableWidgets: ["select-button", "multi-select-dropdown", "listbox"],
    defaultWidget: "select-button",
  },
];
