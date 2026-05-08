import type { GenericRequest } from "media-finder";

export type QueryListResponse = Array<{
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  schedule: number;
}>;

export type QueryDetailResponse = {
  id: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  requestOptions: GenericRequest;
  fetchCountLimit: number | null;
  schedule: number;
};
