export const TABLE_COLUMNS = [
  { key: "name", label: "Company / Dept", className: "justify-start" },
  { key: "segment", label: "Classification & Stage", className: "justify-start" },
  { key: "owner", label: "Creative Lead", className: "justify-start" },
  {
    key: "openDeals",
    label: "Active Campaigns",
    className: "justify-end tabular-nums",
  },
  {
    key: "pipelineValue",
    label: "Production Budget",
    className: "justify-end tabular-nums",
  },
  {
    key: "winProbability",
    label: "Completion Progress",
    className: "justify-end tabular-nums",
  },
  { key: "trend", label: "Activity Trend", className: "justify-center" },
  {
    key: "lastInteraction",
    label: "Last Request",
    className: "justify-start",
  },
  { key: "action", label: "Action", className: "justify-center" },
] as const;

export type TableColumnKey = (typeof TABLE_COLUMNS)[number]["key"];

export const TABLE_GRID_CLASS =
  "grid min-w-max grid-cols-[repeat(9,max-content)] justify-between";

export const TABLE_ROW_CLASS = "col-span-full grid grid-cols-subgrid";

export const TABLE_CELL_CLASS = "flex items-center";

export function columnClass(key: TableColumnKey) {
  return TABLE_COLUMNS.find((column) => column.key === key)?.className ?? "";
}
