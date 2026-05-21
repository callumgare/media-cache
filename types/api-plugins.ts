export type PluginInfo = {
  name: string;
  listedVersion: string;
  installedVersion: string | null;
  latestVersion: string | null;
};

export type PluginListResponse = PluginInfo[];

export type PluginInstallBody = {
  name: string;
  version?: string;
};

export type PluginRemoveBody = {
  name: string;
};

export type PluginUpdateBody = {
  name: string;
};

export type PluginNpmMessage =
  | { type: "output"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };
