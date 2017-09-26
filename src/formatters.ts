import * as acorn from 'acorn'
import * as ESTree from 'estree'
import * as mime from 'mime-types'
import * as path from 'path'
import { Attachment, CouchifyOptions, DependencyResolution, FunctionResolution } from './interfaces'

const designFunctionTypes = ['filters', 'lists', 'shows', 'updates', 'views']

const esModuleTagMatcher = new RegExp('^Object.defineProperty\\(exports\\, "__esModule"\, \{\\s+value\:\\s+true\\s+\}\\)\;')
const useStrictMatcher = /^[\'\"]{1,}use strict[\'\"]{1,}\;\s+/

export function formatAsDesignFunctionEntry(baseDocumentsDir: string, relativePath: string, deps: DependencyResolution[], options: CouchifyOptions) {
  const entry = deps[deps.length - 1] as FunctionResolution
  entry.exports = extractExports(entry.source)
  entry.resolvedDeps = deps.slice(0, -1)
  const frags = relativePath.split('/')
  entry.type = designFunctionTypes[[
    options.filtersDir,
    options.listsDir,
    options.showsDir,
    options.updatesDir,
    options.viewsDir
  ].indexOf(frags[0])]
  return entry
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
function extractExports(source: string): { [key: string]: string } | null {
  const ast = acorn.parse(source)
  const moduleExports: { [key: string]: string } = {}

  if (!Array.isArray(ast.body)) {
      return moduleExports
  }

  for (let node of ast.body) {
      if (!(node && typeof node.type === 'string')) {
          continue
      }

      if (node.type === 'ExpressionStatement'
          && node.expression
          && node.expression.type === 'AssignmentExpression'
          && node.expression.left && node.expression.left.type === 'MemberExpression'
          && node.expression.right && node.expression.right.type === 'FunctionExpression') {

          moduleExports.default = buildFunction(source, node, node.expression.right.body)
          break

      } else if (node.type === 'VariableDeclaration'
          && Array.isArray(node.declarations)
          && node.declarations[0].type === 'VariableDeclarator') {

          const varId = node.declarations[0].id as ESTree.Identifier
          const varAssignment = node.declarations[0].init as ESTree.AssignmentExpression
          const varAssignmentLeft = varAssignment.left as ESTree.MemberExpression

          if (varAssignmentLeft) {
              const varAssignmentLeftObject = varAssignmentLeft.object as ESTree.Identifier
              const varAssignmentLeftProperty = varAssignmentLeft.property as ESTree.Identifier
              if (varAssignmentLeftObject.name === 'exports' && varId.name === varAssignmentLeftProperty.name) {
                  const varAssignmentRight = varAssignment.right as ESTree.FunctionExpression
                  moduleExports[varId.name] = buildFunction(source, node, varAssignmentRight.body)
              }
          }
      }
  }

  return moduleExports
}

function buildFunction(source: string, node: ESTree.Node, wrapper: ESTree.BlockStatement) {
    const func = wrapper.body[wrapper.body.length - 1] as any
    source = source.slice(0, (node as any).start)
           + source.slice(func.start, func.end)
           + source.slice((node as any).end)

    source = source.replace(useStrictMatcher, '')
    source = source.replace(esModuleTagMatcher, '')

    return '(function(){\n\n' + source.trim() + '\n\n}())'
}
