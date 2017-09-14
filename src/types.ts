import { FunctionResolution } from './interfaces'

export type ViewFunctionResolution = FunctionResolution | {
  source: { map: string, reduce: string }
}
