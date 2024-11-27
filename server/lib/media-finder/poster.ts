import fs from 'node:fs/promises'
import FfmpegCommand from 'fluent-ffmpeg'

const transcodesInProgress: { [key: string]: Promise<string> } = {}

export async function getPosterOfFile(fileUrl: URL, fileId: number, maxHeight: number = 0): Promise<string> {
  const key = `${fileId}-${maxHeight}`
  const filePath = `/tmp/${key}.jpg`
  try {
    await fs.access(filePath)
    return filePath
  }
  catch (error) {
    // It's okay if poster file doesn't exist, it just means it's not been create yet
  }
  if (key in transcodesInProgress) {
    return transcodesInProgress[key]
  }
  transcodesInProgress[key] = new Promise((resolve, reject) => {
    let ffCommand = new FfmpegCommand()
    ffCommand = ffCommand
      .on('start', function (command) {
        console.log('Running ffmpeg command:', command)
      })
      .on('end', function (stdout, stderr) {
        if (stderr) console.log(stderr)
        if (stdout) console.log(stdout)
        console.log('Transcoding succeeded !')
        resolve(filePath)
      })
      .on('error', function (err, stdout, stderr) {
        console.log('Cannot process video: ' + err.message)
        if (stderr) console.log(stderr)
        if (stdout) console.log(stdout)
        reject()
      })
      .input(fileUrl.href)
      .frames(1)
      .format('image2')
    if (maxHeight) {
      ffCommand = ffCommand.videoFilters(`scale='min(iw,iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`)
    }
    ffCommand.save(filePath)
  })
  return transcodesInProgress[key]
}
