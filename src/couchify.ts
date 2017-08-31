import * as acorn from 'acorn'
import * as ESTree from 'estree'
import * as fs from 'fs'
import * as glob from 'glob'
import * as mime from 'mime-types'
import * as path from 'path'
import * as util from 'util'
const babelify = require('babelify')
const moduleDeps = require('module-deps')
const transformDeps = require('transform-deps')

export const readFileAsync = util.promisify(fs.readFile)

export type Attachment = {
    content_type: string
    data: string
}

export type CouchifyOptions = {
    id?: string
    baseDocumentsDir?: string
    attachmentsDir?: string
    babelPlugins?: any[]
    babelPresets?: any[]
    filtersDir?: string
    listsDir?: string
    showsDir?: string
    updatesDir?: string
    viewsDir?: string
    globIgnorePatterns?: string[]
}

export type DependencyResolution = {
    deps: { [s: string]: string }
    file: string
    id: string
    source: string
}

export type DesignDocument = {
    _id: string
    language: string
    _rev?: string
    _attachments?: { [key: string]: Attachment }
    commons?: { [key: string]: string }
    views?: {
        [key: string]: string | { [key: string]: string }
    }
    shows?: { [key: string]: string }
    lists?: { [key: string]: string }
    filters?: { [key: string]: string }
    updates?: { [key: string]: string }
    rewrites?: Rewrite[]
}

export type FunctionResolution = DependencyResolution & {
    entry?: boolean
    exports: { [s: string]: string }
    resolvedDeps: DependencyResolution[]
    type: string
}

export type Rewrite = {
    from: string
    to: string
    method: string
    query: { [key: string]: string }
}

export type ViewFunctionResolution = FunctionResolution | {
    source: { map: string, reduce: string }
}

const defaultOptions: CouchifyOptions = {
    attachmentsDir: 'public',
    filtersDir: 'filters',
    listsDir: 'lists',
    showsDir: 'shows',
    updatesDir: 'updates',
    viewsDir: 'views',
    globIgnorePatterns: ['**/node_modules/**'],
    babelPresets: [],
    babelPlugins: []
}

export function couchify(options: CouchifyOptions) {
    options = { ...defaultOptions, ...options }

    if (!options.baseDocumentsDir) {
        throw new Error('you must provide a directory')
    }

    if (!options.id) {
        throw new Error('you must provide a ddoc id')
    }

    const { filtersDir, listsDir, showsDir, updatesDir, viewsDir } = options
    const baseDocumentsDir = path.resolve(options.baseDocumentsDir)
    const attachmentsDir = path.join(baseDocumentsDir, options.attachmentsDir)
    const whitelistedRootDirs = [filtersDir, listsDir, showsDir, updatesDir, viewsDir]
    const envExtensions = Object.keys(require.extensions).map(d => d.substring(1))
    const globOptions = { ignore: options.globIgnorePatterns, nodir: true }
    const globMatchPattern = `+(${whitelistedRootDirs.join('|')})/*.{${envExtensions}}`

    return new Promise((resolve, reject) => {

        Promise.all([
            globPromise(globMatchPattern, { ...globOptions, ...{ cwd: baseDocumentsDir } }),
            globPromise('**/*', { ...globOptions, ...{ cwd: attachmentsDir } })
        ])
            .then(([designFiles, attachments]) => {
                const tasks =
                    designFiles.map(relativePath => {
                        const absPath = path.join(baseDocumentsDir, relativePath)

                        return resolveDependencies(absPath, options).then(deps => {
                            const entry = deps[deps.length - 1] as FunctionResolution
                            entry.exports = extractExports(entry.source, acorn.parse(entry.source), options)
                            entry.resolvedDeps = deps.slice(0, -1)

                            const frags = relativePath.split('/')
                            entry.type = frags[0]

                            return entry
                        })
                            .then(res => res)
                            .catch((designTaskErr: Error) => {
                                console.warn('could not extract design function: ' + designTaskErr.message)
                                throw designTaskErr
                            })
                    })

                const attachmentTasks = attachments.map(relativePath => {
                    const absPath = path.join(attachmentsDir, relativePath)
                    return readFileAsync(absPath)
                        .then(data => {
                            const contentType = mime.contentType(path.basename(absPath))
                            return {
                                id: relativePath,
                                content_type: contentType || 'application/octet-stream',
                                data: data.toString('base64')
                            }
                        })
                })

                Promise
                    .all([Promise.all(tasks), Promise.all(attachmentTasks)])
                    .then(([entries, attachmentsResult]) => {
                        const resolvedDeps: DependencyResolution[] = []
                        const rewriteTasks: Promise<any>[] = []

                        const resolutionIndex = entries.reduce((acc, entry) => {
                            entry.resolvedDeps
                                .filter(d => !(acc.hasOwnProperty(d.file)))
                                .forEach(d => {
                                    resolvedDeps.push(d)
                                    acc[d.file] = resolvedDeps.length - 1
                                    rewriteTasks.push(new Promise((rewriteResolve, rewriteReject) => {
                                        rewriteRequires(stripJSTags(d.source), name => `./${acc[d.deps[name]]}`)
                                            .then(code => {
                                                d.source = code
                                                rewriteResolve(d)
                                            }).catch(er => rewriteReject(er))
                                    }))
                                })

                            rewriteTasks.push(new Promise((rewriteResolve, rewriteReject) => {
                                if (entry.type !== 'views') {
                                    rewriteRequires('module.exports=' + entry.exports.default, name => `commons/${acc[entry.deps[name]]}`)
                                        .then(code => {
                                            entry.source = code.slice('module.exports='.length)
                                            rewriteResolve(entry)
                                        }).catch(er => rewriteReject(er))
                                } else {
                                    Promise.all([entry.exports.map, entry.exports.reduce].map(d => {
                                        return !d
                                            ? null
                                            : rewriteRequires('module.exports= ' + d, name => `views/lib/${acc[entry.deps[name]]}`)
                                    })).then(([map, reduce]) => {
                                        (entry as ViewFunctionResolution).source = {
                                            map: map && map.slice('module.exports='.length),
                                            reduce: reduce && reduce.slice('module.exports='.length)
                                        }
                                        rewriteResolve(entry)
                                    }).catch(er => rewriteReject(er))
                                }
                            }))

                            return acc
                        }, {})

                        Promise.all(rewriteTasks)
                            .then(values => {
                                const res: DesignDocument = {
                                    _id: `_design/${options.id}`,
                                    language: 'javascript',
                                    _attachments: attachmentsResult.reduce((acc, attachment) => {
                                        acc[attachment.id] = { content_type: attachment.content_type, data: attachment.data }
                                        return acc
                                    }, {} as { [key: string]: Attachment })
                                }

                                values.forEach(value => {
                                    if (!value.hasOwnProperty('entry')) {
                                        if (!res.hasOwnProperty('commons')) {
                                            res.commons = {}
                                        }

                                        res.commons[String(resolutionIndex[value.id])] = value.source
                                    } else {
                                        if (!res.hasOwnProperty(value.type)) {
                                            res[value.type] = {}
                                        }

                                        const key = path.basename(value.file).replace(path.extname(value.file), '')
                                        res[value.type][key] = value.source

                                        const viewsLib: { [key: string]: string } = {}

                                        if (value.type === 'views') {
                                            value.resolvedDeps.forEach(d => {
                                                viewsLib[String(resolutionIndex[d.id])] = resolvedDeps[resolutionIndex[d.id]].source
                                            })
                                            if (res[value.type][key].map === null) {
                                                delete res[value.type][key].map
                                            }
                                            if (res[value.type][key].reduce === null) {
                                                delete res[value.type][key].reduce
                                            }
                                            if (Object.keys(viewsLib).length) {
                                                res[value.type].lib = viewsLib
                                            }
                                        }
                                    }
                                })
                                resolve(res)
                            }).catch(er => reject(er))
                    }).catch(er => reject(er))
            }).catch(er => reject(er))
    })
}

/**
 * Traverse an [[ESTree.Program]] and extract the enclosed functions with the CouchDB signature.
 *
 * @param source  CommonJS source.
 */
function extractExports(source: string, ast: ESTree.Program, options: CouchifyOptions): { [key: string]: string } | null {
    const res: { [key: string]: string } = {}

    if (!Array.isArray(ast.body)) {
        return res
    }

    for (let node of ast.body) {
        if (node && typeof node.type === 'string') {
            if (node.type === 'ExpressionStatement'
                && node.expression
                && node.expression.type === 'AssignmentExpression'
                && node.expression.left && node.expression.left.type === 'MemberExpression'
                && node.expression.right && node.expression.right.type === 'FunctionExpression') {

                res.default = buildFunction(source, node.expression.right.body as ESTree.BlockStatement)
                break
            } else if (node.type === 'VariableDeclaration'
                && node.declarations.length
                && node.declarations[0].type === 'VariableDeclarator') {

                const varId = node.declarations[0].id as ESTree.Identifier
                const varAssignment = node.declarations[0].init as ESTree.AssignmentExpression
                const varAssignmentLeft = varAssignment.left as ESTree.MemberExpression

                if (varAssignmentLeft) {
                    const varAssignmentLeftObject = varAssignmentLeft.object as ESTree.Identifier
                    const varAssignmentLeftProperty = varAssignmentLeft.property as ESTree.Identifier
                    if (varAssignmentLeftObject.name === 'exports' && varId.name === varAssignmentLeftProperty.name) {
                        const varAssignmentRight = varAssignment.right as ESTree.FunctionExpression
                        res[varId.name] = buildFunction(source, varAssignmentRight.body as ESTree.BlockStatement)
                    }
                }
            }
        }
    }

    return res
}

function resolveDependencies(file: string, options: CouchifyOptions): Promise<DependencyResolution[]> {
    return new Promise((resolve, reject) => {
        const deps = []
        const md = moduleDeps({
            transform: [[babelify, {
                presets: [['es2015', {}]].concat(options.babelPresets || []),
                plugins: options.babelPlugins || [],
                babelrc: false,
                ast: false,
                comments: false,
                sourceMaps: false
            }]]
        })
        md.on('data', data => { deps.push(data) })
        md.once('end', () => { resolve(deps) })
        md.once('error', er => reject(er))
        md.end({ file: file })
    })
}

function rewriteRequires(src: string, fn: (name: string) => string | void): Promise<string> {
    return new Promise((resolve) => resolve(transformDeps(src, fn)))
}

/**
 * glob as Promise.
 *
 * @param pattern  A string to search for.
 * @param globOptions  See: https://www.npmjs.com/package/glob
 */
function globPromise(pattern: string, globOptions: glob.IOptions): Promise<string[]> {
    return new Promise((resolve, reject) => {
        glob(pattern, globOptions, (err, files) => err === null ? resolve(files) : reject(err))
    })
}

function buildFunction(source: string, wrapper: ESTree.BlockStatement) {
    const node = wrapper.body.length && wrapper.body[wrapper.body.length - 1] as ESTree.ReturnStatement
    const returnedFn = node.argument as ESTree.FunctionExpression
    const paramNames = returnedFn.params.map((idNode: ESTree.Identifier) => idNode.name)
    const prelude = 'function (' + paramNames.join(', ') + ') '
    const block = returnedFn.body as any
    const res = prelude + source.slice(block.start, block.end)
    return res
}

function stripJSTags(src: string) {
    src = src.replace(/^[\'\"]{1,}use strict[\'\"]{1,}\;\s+/, '')
    src = src.replace(new RegExp('^Object.defineProperty\\(exports\\, "__esModule"\, \{\\s+value\:\\s+true\\s+\}\\)\;'), '')
    return src.replace(/^\s+/, '')
}
