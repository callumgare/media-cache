# Media Cache

Media Cache is a personal media aggregation and browsing app. It pulls media (images and videos) from external sources via the [Media Finder](https://github.com/callumgare/media-finder) library, stores the metadata and file references in a local database, and serves them through a unified browsing interface with filtering and full-screen viewing.

## Stack

- **Nuxt 3** — full-stack Vue framework (frontend + API routes)
- **ParadeDB** — PostgreSQL variant (used as standard Postgres; BM25 search available but not yet used)
- **Drizzle ORM** — type-safe queries and migrations
- **PrimeVue 4** — UI components
- **PhotoSwipe 5** — full-screen media gallery
- **hls.js** — HLS video playback in browser
- **FFmpeg** (via fluent-ffmpeg) — video poster/thumbnail generation

## How It Works

Stored Media Finder queries are periodically run and the results are used to created cached media entries. These entries can been be browsed by the user via the web ui.

### 1. Defining Queries

An admin creates a **finder query** via the UI (`/admin/queries`). A query specifies:
- Which **source** to pull from (e.g. Giphy, a custom plugin)
- Which **handler** to use (e.g. trending, search)
- Handler-specific parameters (search terms, count limits, etc.)

Queries are serialized and stored in the `finder_query` table.

### 2. Running a Query

A stored query can then be run which first creates a new entry in `finder_query_execution` which includes details about the run itself.

Then the query is executed by media-finder which returns a bunch of results. An entry for each each result is stored in `finder_query_media` with a hash of the raw JSON content rather than the content itself. This JSON content is instead stored in `finder_query_media_content` with it's content hash so that so that identical results from multiple runs aren't duplicated.

Next the entries in `finder_query_media` from the last run of the saved query (if there was a previous run) is compared against to see which media have been added, updated or removed since last run.

For every media that has changed (added, updated or removed) we need to create/update a `cache_media`. To do this a list of source/media id pairs for all changed media is compiled. A cache_media entry can be be made up from finder media results which can potentially exist in multiple different sources. For each source/media id pair of the changed finder media we look for an existing `cache_media` record. If a record exists and that has other source/media id pairs in it we add that to the list.

Then for each source/media pair we fetch all saved finder results records. Any source/media id pairs that have no saved finder results are considered deleted. For these we check to see if there's an existing `cached_media` record. If there is one and every source/media id pair for it is to be delete then we delete the cached media entry and add to `deleted_cache_media` (if there is a cached media entry but it has some source/media id pairs in it that aren't being deleted we can leave it for now since those pairs will have been added to the update list).

For source/media id pairs that do have saved finder results we merge all matching results into one results media per source/media id pair. These are then used to update or create cached media. If updating then we make sure to check if that existing cached media is made up of finder media from multiple sources. When updating or creating cached media root property values are generally aggregated (`title` is the first truthy title, `views` is the sum of view from all sources, `earliestUploadedAt` is the oldest uploadedAt value in the sources) where as each entry in the sources array will have the exact values from the merged finder results media. All the unique tags find in the sources are put into a list and then a `group` entry for them is created under a root `tags` entry if it doesn't already exist. The id's for these groups are then used for the `groupIds` field in the cache media entry.

Finally records in `finder_query_media` from any previous runs of that finder query are deleted and the `finder_query_execution` is updated.

### 3. Browsing Media

The main page (`/`) shows a filterable, paginated grid of cached media.

**Filtering** is handled by a `QueryGroupCondition` — a nested AND/OR tree of field conditions (source, tags, media type). The sidebar renders this tree and lets the user modify it.

**Faceted counts** (`POST /api/media-facets`) are computed per condition node. For `equals` conditions the count shows how many results each option would produce if selected. For `includes all` (tags), unselected options show how many currently-matching items also have that tag; selected options show how many items would be added back if removed.

**Media fetching** (`POST /api/media`) converts the condition tree to a SQL `WHERE` clause and returns a paginated, deterministically shuffled result (using `hashint4` seeding so page order is stable within a session).

### 4. Serving Files

Files aren't stored locally — only their URLs are cached. File requests go through a proxy route (`/file/[mediaId]/[fileType]/[...path]`) that:

1. Looks up the file URL from `cache_media.files`.
2. If the URL has expired, re-runs the original finder query to refresh it and updates the database.
3. Proxies the request to the upstream URL.
4. For HLS playlists (`.m3u8`), rewrites relative segment paths to absolute so the browser can load them through the proxy.

Video posters are generated on demand (`/file/poster/[mediaId]/[fileType]/[maxHeight]`) by extracting the first frame with FFmpeg. Results are cached in `/tmp/` and concurrent requests for the same poster are deduplicated in memory.

## Database Tables

| Table | Purpose |
|---|---|
| `cache_media` | Aggregated media record — metadata, files, sources (all JSONB), tag IDs |
| `cache_media_group` | Join table linking `cache_media` to `group` |
| `group` | Hierarchical tags; individual tags are children of a root `"tags"` group |
| `source` | Known media sources by their `finder_source_id` string |
| `finder_query` | Saved query definitions |
| `finder_query_execution` | Execution records with stats (found/new/updated/etc.) |
| `finder_query_media` | Links an execution to a piece of media via content hash |
| `finder_query_media_content` | Raw serialized media JSON, deduplicated by content hash |
| `cache_media_file_update` | History of file URL refreshes |

## Key Columns on `cache_media`

- `finder_source_media_ids` — `text[][]` — array of `[sourceId, mediaId]` pairs; a single media item can be found via multiple sources
- `files` — `jsonb[]` — one entry per file type (thumbnail, main, full, etc.) with URL, dimensions, expiry
- `sources` — `jsonb[]` — one entry per source with title, views, likes, creator, etc.
- `tag_ids` — `int[]` — IDs of the `group` rows for this media's tags
- `has_video`, `has_audio`, `has_image`, `duration`, `file_size`, `width`, `height` — indexed scalar properties for fast filtering

## Media Finder Plugins

The `media-finder` library abstracts external sources behind a plugin interface. Plugins are loaded at startup from the `MEDIA_FINDER_PLUGINS` environment variable (comma-separated file paths). Each plugin declares its available handlers and their parameter schemas (Zod), which the admin query form renders dynamically.

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `MEDIA_FINDER_PLUGINS` | Comma-separated paths to Media Finder plugin files |
| `GIPHY_API_KEY` | API key used when refreshing expired Giphy URLs |
| `QUERY_LOGGING` | Set to `true` to enable Drizzle SQL query logging |
