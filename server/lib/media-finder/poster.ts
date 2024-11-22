import fs from 'node:fs/promises'
import FfmpegCommand from 'fluent-ffmpeg'

const transcodesInProgress: { [key: string]: Promise<string> } = {}

export async function getPosterOfFile(fileUrl: URL, fileId: string): Promise<string> {
  const filePath = `/tmp/${fileId}.jpg`
  try {
    await fs.access(filePath)
    return filePath
  }
  catch (error) {
    // It's okay if poster file doesn't exist, it just means it's not been create yet
  }
  if (fileId in transcodesInProgress) {
    return transcodesInProgress[fileId]
  }
  transcodesInProgress[fileId] = new Promise((resolve, reject) => {
    const ffCommand = new FfmpegCommand()
    ffCommand
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
      .videoFilters('scale=\'min(iw,iw)\':\'min(300,ih)\':force_original_aspect_ratio=decrease')
      .save(filePath)
  })
  return transcodesInProgress[fileId]
}
