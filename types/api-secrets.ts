export type QuerySecretListItem = {
  id: number;
  label: string;
  liaseSourceId: string;
  secretFieldName: string;
  secretFieldType: string;
  createdAt: Date;
  updatedAt: Date;
};

export type QuerySecretListResponse = QuerySecretListItem[];

export type QuerySecretDetailResponse = {
  id: number;
  label: string;
  liaseSourceId: string;
  secretFieldName: string;
  secretFieldType: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
};

export type QuerySecretCreateBody = {
  label: string;
  liaseSourceId: string;
  secretFieldName: string;
  secretFieldType: string;
  value: string;
};

export type QuerySecretUpdateBody = Partial<
  Pick<QuerySecretCreateBody, "label" | "value">
>;
