import * as fs from 'fs'
import * as $glob from 'glob'
import * as util from 'util'

export const readFileAsync = util.promisify(fs.readFile)

export const accessAsync = util.promisify(fs.access)

export function glob(pattern: string, globOptions: $glob.IOptions): Promise<string[]> {
  return new Promise((resolve, reject) => {
      $glob(pattern, globOptions, (err, files) => err === null ? resolve(files) : reject(err))
  })
}
