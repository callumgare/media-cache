import fs from 'node:fs/promises'
import type { FfmpegCommand } from 'fluent-ffmpeg'
import Ffmpeg from 'fluent-ffmpeg'

const transcodesInProgress: { [key: string]: Promise<string> } = {}

export async function getPosterOfFile(fileUrl: URL, fileId: number, maxHeight: number = 0): Promise<string> {
  const key = `${fileId}-${maxHeight}`
  const filePath = `/tmp/${key}.jpg`
  try {
    await fs.access(filePath)
    return filePath
  }
  catch {
    // It's okay if poster file doesn't exist, it just means it's not been create yet
  }
  if (key in transcodesInProgress) {
    return transcodesInProgress[key]
  }
  transcodesInProgress[key] = new Promise((resolve, reject) => {
    let ffCommand: FfmpegCommand = Ffmpeg()
    ffCommand = ffCommand
      .on('start', function (command: string) {
        console.log('Running ffmpeg command:', command)
      })
      .on('end', function (stdout: string | null, stderr: string | null) {
        if (stderr) console.log(stderr)
        if (stdout) console.log(stdout)
        console.log('Transcoding succeeded !')
        resolve(filePath)
      })
      .on('error', function (err: Error, stdout: string | null, stderr: string | null) {
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
