import path from 'node:path'
import { fileURLToPath } from 'url'
import { faker } from '@faker-js/faker'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import task from 'tasuku'
import * as schema from '../server/database/schema'
import { getMediaFinder } from '@@/server/lib/media-finder'

const mediaFinder = await getMediaFinder()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:example@localhost:5432/postgres'
const NUM_MEDIA = Number(process.env.SEED_MEDIA ?? 500)

type InlineFile = NonNullable<schema.CacheMedia['files']>[number]
type InlineSource = NonNullable<schema.CacheMedia['sources']>[number]

type MediaValue = typeof schema.cacheMedia.$inferInsert

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`
}

function numberWithCommas(x: number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function progressStatus(done: number, total: number, startMs: number): string {
  const elapsed = Date.now() - startMs
  if (done === 0 || done >= total) return `${done} / ${total}`
  const eta = (elapsed / done) * (total - done)
  return `${Math.floor(done / total * 100)}% of ${numberWithCommas(total)} created with ~${formatDuration(eta)} remaining`
}

async function main() {
  const migrationClient = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
  const client = postgres(DATABASE_URL, { onnotice: () => {} })
  const db = drizzle(client, { schema })

  // Shared across tasks
  let sourceRecords: schema.Source[] = []
  let tagGroups: schema.Group[] = []
  let mediaValues: MediaValue[] = []

  const scriptStart = Date.now()

  try {
    await task('Run migrations', async () => {
      await migrate(drizzle(migrationClient), {
        migrationsFolder: path.join(__dirname, '../server/database/migrations'),
      })
      await migrationClient.end()
    })

    await task('Clear existing data', async () => {
      await db.execute(sql`
        TRUNCATE "group", source, cache_media, cache_media_file_update
        RESTART IDENTITY CASCADE
      `)
    })

    await task('Create sources', async () => {
      const sourceNames = mediaFinder.sources.map(s => s.id)
      sourceRecords = await db
        .insert(schema.source)
        .values(sourceNames.map(finderSourceId => ({ finderSourceId, updatedAt: new Date() })))
        .returning()
    })

    await task('Create groups', async () => {
      const [tagsGroup] = await db
        .insert(schema.group)
        .values({ name: 'tags', updatedAt: new Date() })
        .returning()
      if (!tagsGroup) throw Error('Failed to create tags group')
      const rawTagNames = Array.from({ length: 80 }, () => faker.science.chemicalElement().name)
      const tagNames = [...new Set(rawTagNames)].slice(0, 50)
      tagGroups = await db
        .insert(schema.group)
        .values(tagNames.map(name => ({ name, parentId: tagsGroup.id, updatedAt: new Date() })))
        .returning()
    })

    await task(`Create media`, async ({ setStatus, startTime }) => {
      startTime()
      mediaValues = await buildMediaValues(NUM_MEDIA, sourceRecords, tagGroups)
      let count = 0
      const start = Date.now()
      for (const batch of chunks(mediaValues, 100)) {
        await db.insert(schema.cacheMedia).values(batch)
        count += batch.length
        setStatus(progressStatus(count, NUM_MEDIA, start))
      }
      setStatus(`${NUM_MEDIA} created`)
    })
  }
  finally {
    await client.end()
  }

  console.log(`\nTotal time: ${formatDuration(Date.now() - scriptStart)}`)
}

async function buildMediaValues(
  count: number,
  sourceRecords: schema.Source[],
  tagGroups: schema.Group[],
): Promise<MediaValue[]> {
  const mediaValues: MediaValue[] = []
  let lastYield = Date.now()
  for (let i = 0; i < count; i++) {
    if (Date.now() - lastYield > 100) {
      await new Promise(resolve => setTimeout(resolve, 0)) // Yield to event loop to allow the console to be updated
      lastYield = Date.now()
    }
    mediaValues.push(buildSingleMedia(i, sourceRecords, tagGroups))
  }
  return mediaValues
}

function buildSingleMedia(index: number, sourceRecords: schema.Source[], tagGroups: schema.Group[]): MediaValue {
  const now = new Date()
  const kind = faker.helpers.weightedArrayElement([
    { weight: 6, value: 'video' as const },
    { weight: 3, value: 'image' as const },
    { weight: 1, value: 'video-and-image' as const },
  ])
  const hasVideo = kind !== 'image'
  const hasImage = kind !== 'video'
  const hasAudio = hasVideo && faker.datatype.boolean()
  const mediaSources = faker.helpers.arrayElements(sourceRecords, { min: 1, max: 2 })
  const mediaTags = faker.helpers.arrayElements(tagGroups, { min: 2, max: 8 })
  const creator = faker.internet.username()
  const finderMediaId = String(index)

  const views = faker.number.int({ min: 0, max: 5_000_000 })
  const likes = faker.number.int({ min: 0, max: 100_000 })
  const dislikes = faker.number.int({ min: 0, max: 10_000 })
  const duration = hasVideo ? faker.number.float({ min: 10, max: 7200, fractionDigits: 1 }) : null
  const width = hasVideo ? 1280 : hasImage ? faker.helpers.arrayElement([800, 1200, 1920]) : null
  const height = hasVideo ? 720 : hasImage ? faker.helpers.arrayElement([600, 900, 1080]) : null
  const fileSize = faker.number.int({ min: 50_000, max: 500_000_000 })
  const title = `${faker.commerce.productAdjective()} ${faker.commerce.product()}`
  const description = faker.lorem.paragraph()
  const uploadedAt = faker.date.past({ years: 3 })

  const files: InlineFile[] = []
  const finderSourceId = mediaSources[0]?.finderSourceId ?? 'unknown'

  if (hasVideo) {
    const vid = faker.helpers.arrayElement(sampleVideos)
    files.push({
      createdAt: now,
      updatedAt: now,
      finderSourceId,
      finderMediaId,
      type: 'main',
      url: vid.url,
      ext: '.mp4',
      mimeType: 'video/mp4',
      hasVideo: true,
      hasAudio,
      hasImage: false,
      width: vid.width,
      height: vid.height,
      fileSize,
      duration,
      urlExpires: null,
      urlRefreshDetails: null,
      urlUpdatedAt: now,
    })
  }

  if (hasImage) {
    files.push({
      createdAt: now,
      updatedAt: now,
      finderSourceId,
      finderMediaId,
      type: hasVideo ? 'thumbnail' : 'main',
      url: faker.image.url({ width: width ?? 800, height: height ?? 600 }),
      ext: '.jpg',
      mimeType: 'image/jpeg',
      hasVideo: false,
      hasAudio: false,
      hasImage: true,
      width,
      height,
      fileSize: faker.number.int({ min: 10_000, max: 5_000_000 }),
      duration: null,
      urlExpires: null,
      urlRefreshDetails: null,
      urlUpdatedAt: now,
    })
  }

  const sources: InlineSource[] = mediaSources.map((src) => {
    const total = likes + dislikes
    return {
      createdAt: now,
      updatedAt: now,
      finderSourceId: src.finderSourceId,
      finderMediaId,
      uploadedAt: uploadedAt,
      title,
      description,
      url: `https://www.${src.finderSourceId}.com/watch?v=${finderMediaId}`,
      creator,
      uploader: creator,
      views,
      likes,
      likesPercentage: total > 0 ? (likes / total) * 100 : null,
      dislikes,
    }
  })

  return {
    updatedAt: now,
    earliestUploadedAt: uploadedAt,
    title,
    description,
    creators: [creator],
    uploaders: [creator],
    finderSourceMediaIds: mediaSources.map(s => [s.finderSourceId, finderMediaId]),
    groupIds: mediaTags.map(g => [g.id, g.parentId!]),
    hasVideo,
    hasAudio,
    hasImage,
    views,
    likes,
    dislikes,
    duration,
    width,
    height,
    fileSize,
    files,
    sources,
  }
}

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

const sampleVideos = [
  // W3C sample videos (stable since 2010)
  { width: 854, height: 480, url: 'https://media.w3.org/2010/05/sintel/trailer.mp4' },
  { width: 853, height: 480, url: 'https://media.w3.org/2010/05/bunny/movie.mp4' },
  { width: 853, height: 480, url: 'https://media.w3.org/2010/05/bunny/trailer.mp4' },
  { width: 320, height: 240, url: 'https://media.w3.org/2010/05/video/movie_300.mp4' },
  // W3Schools sample videos
  { width: 320, height: 176, url: 'https://www.w3schools.com/html/mov_bbb.mp4' },
  { width: 320, height: 240, url: 'https://www.w3schools.com/html/movie.mp4' },
  // Amazon S3
  { width: 640, height: 360, url: 'https://s3.amazonaws.com/codecademy-content/courses/React/react_video-fast.mp4' },
  { width: 960, height: 540, url: 'https://s3.amazonaws.com/codecademy-content/courses/React/react_video-slow.mp4' },
  // VideoLAN (VLC) test streams
  { width: 320, height: 176, url: 'https://streams.videolan.org/streams/mp4/Mr_MrsSmith-h264_aac.mp4' },
  // MDN / Mozilla CC0 videos
  { width: 960, height: 540, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
  { width: 640, height: 480, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4' },
]

const intervalId = setInterval(() => {}, 1000)
main()
  .then(() => {
    clearInterval(intervalId)
    process.exit(0)
  })
  .catch((e) => {
    console.error('\n', e)
    clearInterval(intervalId)
    process.exit(1)
  })
