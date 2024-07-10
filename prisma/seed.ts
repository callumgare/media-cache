import type { Group, Media, Prisma, GroupEntry } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

const intervalId = setInterval(() => process.stdout.write('▰'), 1000)

async function main() {
  const tagGroupEntries: Array<GroupEntry> = []

  const { groupEntry: rootGroupEntry } = await createGroup(null)

  const { groupEntry: tagParentGroupEntry } = await createGroup(rootGroupEntry, { name: 'tags' })

  process.stdout.write('\nGenerating mock tags... ')
  const numOfTagsToGenerate = 100
  for (let i = 0; i < numOfTagsToGenerate; i++) {
    const { groupEntry: tagGroupEntry } = await createGroup(tagParentGroupEntry, { name: faker.science.chemicalElement().name })
    tagGroupEntries.push(tagGroupEntry)
  }

  const numOfMediaToGenerate = 3000
  const mediaDetails = []
  process.stdout.write('\nGenerating mock media details... ')
  for (let i = 0; i < numOfMediaToGenerate; i++) {
    mediaDetails.push(generateMockMediaDetails())
  }

  process.stdout.write('\nSaving mock media to db... ')
  await prisma.media.createMany({
    data: mediaDetails,
  })

  process.stdout.write('\nGetting created media ids... ')
  const media = await prisma.media.findMany({ select: { id: true } })

  process.stdout.write('\nGenerating mock files for media... ')
  const mediaFileDetails: Prisma.FileCreateManyInput[] = []
  for (const mediaId of media.map(media => media.id)) {
    const fileTypeToInclude = faker.helpers.arrayElement(['video', 'image', 'both'] as const)
    if (fileTypeToInclude === 'both') {
      const videoFile = generateMockMediaFileDetails(mediaId, 'video')
      const imageFile = generateMockMediaFileDetails(mediaId, 'image', { width: videoFile.width, height: videoFile.height })
      mediaFileDetails.push(videoFile, imageFile)
    }
    else {
      mediaFileDetails.push(generateMockMediaFileDetails(mediaId, fileTypeToInclude))
    }
  }

  process.stdout.write('\nSaving mock files for media to db... ')
  await prisma.file.createMany({
    data: mediaFileDetails,
  })

  process.stdout.write('\nGenerating mock tag group entries for media... ')
  const mediaTagGroupEntries = []
  for (const mediaId of media.map(media => media.id)) {
    const mediaTags = faker.helpers.arrayElements(tagGroupEntries, { min: 2, max: 10 })
    for (const mediaTag of mediaTags) {
      mediaTagGroupEntries.push(
        generateMockMediaGroupEntryDetails(mediaId, mediaTag),
      )
    }
  }

  process.stdout.write('\nSaving mock tag group entries for media to db... ')
  await prisma.groupEntry.createMany({
    data: mediaTagGroupEntries,
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
    clearInterval(intervalId)
    process.stdout.write('\n')
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.stdout.write('\n')
    process.exit(1)
  })

function generateMockMediaDetails(): Prisma.MediaCreateInput {
  return {
    title: faker.commerce.productAdjective() + ' ' + faker.commerce.product(),
    description: faker.lorem.text(),
    draft: false,
  }
}

function generateMockMediaFileDetails(
  mediaId: number,
  fileKind: 'video' | 'image',
  props: Partial<Prisma.FileCreateManyInput> = {},
): Prisma.FileCreateManyInput {
  const shared = {
    mediaId,
    finderSourceId: 'example',
    finderMediaId: String(mediaId),
    type: fileKind === 'video' ? 'main' : 'thumbnail',
    fileSize: faker.number.int({ min: 10, max: 1000000 }),
    width: faker.number.int({ min: 10, max: 1000000 }),
    height: faker.number.int({ min: 10, max: 1000000 }),
  }

  if (fileKind === 'image') {
    return {
      ...shared,
      url: faker.image.urlLoremFlickr({
        category: 'cats',
        height: props.height ?? faker.number.int({ min: 200, max: 600 }),
        width: props.width ?? faker.number.int({ min: 50, max: 600 }),
      }),
      ext: '.png',
      mimeType: 'image/png',
      hasVideo: false,
      hasAudio: false,
      hasImage: true,
      ...props,
    }
  }
  else if (fileKind === 'video') {
    return {
      ...shared,
      ...faker.helpers.arrayElement(testVideos),
      ext: '.mp4',
      mimeType: 'video/mp4',
      hasVideo: true,
      hasAudio: false,
      hasImage: false,
      ...props,
    }
  }
  else {
    throw Error(`Unrecognised file kind "${fileKind}"`)
  }
}

function generateMockMediaGroupEntryDetails(mediaId: number, parentGroupEntry: GroupEntry): Prisma.GroupEntryCreateManyInput {
  return {
    parentId: parentGroupEntry.id,
    mediaId: mediaId,
    groupName: null,
  }
}

async function createGroup(
  parentGroupEntry: GroupEntry | null,
  fields?: Partial<Group>,
) {
  const group = await prisma.group.create({
    data: {
      name: parentGroupEntry ? faker.word.words({ count: { min: 3, max: 5 } }) : null,
      ...fields,
    },
  })
  const groupEntry = await createGroupEntry(parentGroupEntry, { group })
  return { group, groupEntry }
}

async function createGroupEntry(
  parentGroupEntry: GroupEntry | null,
  item: { group: Group } | { media: Media },
): Promise<GroupEntry> {
  let itemTypeSpecificFields
  if ('media' in item) {
    itemTypeSpecificFields = {
      mediaId: item.media.id,
      groupName: null,
    }
  }
  if ('group' in item) {
    itemTypeSpecificFields = {
      groupId: item.group.id,
      groupName: item.group.name,
    }
  }
  return await prisma.groupEntry.create({
    data: {
      parentId: parentGroupEntry?.id,
      ...itemTypeSpecificFields,
    },
  })
}

const testVideos = [
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  },
  {
    height: 546,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
  {
    height: 270,
    width: 480,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  },
  {
    height: 534,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
  {
    height: 270,
    width: 480,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
  },
  {
    height: 720,
    width: 1280,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  },
  {
    height: 270,
    width: 480,
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
  },
]
