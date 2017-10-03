import * as acorn from 'acorn'
import * as mime from 'mime-types'
import * as path from 'path'
import { Attachment, CouchifyOptions, DependencyResolution, FunctionResolution } from './interfaces'
import {CouchifyError, ErrorType} from './error'

const designFunctionTypes = ['filters', 'lists', 'shows', 'updates', 'views']

const esModuleTagMatcher = new RegExp('^Object.defineProperty\\(exports\\, "__esModule"\, \{\\s+value\:\\s+true\\s+\}\\)\;')
const useStrictMatcher = /^[\'\"]{1,}use strict[\'\"]{1,}\;\s+/

export function formatAsDesignFunctionEntry(relativePath: string, deps: DependencyResolution[], options: CouchifyOptions): FunctionResolution {
  const entry = deps[deps.length - 1] as FunctionResolution
  const pathFragments = relativePath.split(/[/.]/).slice(0, -1)
  const iife = transformExportsToIife(entry.source)
  if (!iife) throw new CouchifyError(ErrorType.NO_EXPORT, relativePath)
  const root = designFunctionTypes[[
    options.filtersDir,
    options.listsDir,
    options.showsDir,
    options.updatesDir,
    options.viewsDir
  ].indexOf(pathFragments[0])]
  return {
    ...entry,
    output: iife,
    resolvedDeps: deps.slice(0, -1),
    path: [root, ...pathFragments.slice(1)]
  }
}

export function formatAsAttachmentEntry(attachmentsDir: string, relativePath: string, absPath: string, data: any): Attachment {
  const contentType = mime.contentType(path.basename(absPath))
  return {
    id: relativePath,
    content_type: contentType || 'application/octet-stream',
    data: data.toString('base64')
  }
}

/**
 * Traverse an [[ESTree.Program]] and extract the enclosed functions with the CouchDB signature.
 *
 * @param source  CommonJS source.
 */
function transformExportsToIife(source: string): string | null {
  const ast = acorn.parse(source)

  if (!Array.isArray(ast.body)) {
    return null
  }

  const exportExpression:any = ast.body.find(node =>
    node &&
    node.type === 'ExpressionStatement' &&
    typeof node.expression === 'object' &&
    node.expression.type === 'AssignmentExpression' &&
    typeof node.expression.left === 'object' &&
    node.expression.left.type === 'MemberExpression' &&
    typeof node.expression.right === 'object' &&
    node.expression.right.type === 'FunctionExpression'
  )

  if (!exportExpression) {
    return null
  }

  const functionBody = exportExpression.expression.right.body;
  const returnValue = functionBody.body[functionBody.body.length - 1] as any
  const extractedReturnValue = source.slice(0, exportExpression.start)
                             + source.slice(returnValue.start, returnValue.end)
                             + source.slice(exportExpression.end)

  const cleanedReturnValue = extractedReturnValue.replace(useStrictMatcher, '')
                                                 .replace(esModuleTagMatcher, '')
                                                 .trim()

  return '(function(){\n\n' + cleanedReturnValue + '\n\n}())'
}
