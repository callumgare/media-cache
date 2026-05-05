-- Custom SQL migration file, put your code below! --

-- BM25 index on cache_media for fast columnar facet aggregations via pdb.agg.
-- Indexes finder_source_ids and group_ids with the literal tokenizer so that
-- each array element is stored individually in the columnar index, enabling
-- sub-20ms terms aggregations instead of full-table sequential scans (~2s).
CREATE INDEX cache_media_bm25_facets ON cache_media
  USING bm25 (id, (finder_source_ids::pdb.literal), (group_ids::pdb.literal))
  WITH (key_field = 'id');
