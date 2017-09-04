import * as fs from 'fs'
import * as util from 'util'

export const readFileAsync = util.promisify(fs.readFile)

export const accessAsync = util.promisify(fs.access)
