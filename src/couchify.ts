import * as acorn from 'acorn'
import * as ESTree from 'estree'
import * as $glob from 'glob'
import * as mime from 'mime-types'
import * as path from 'path'
import * as uniq from 'uniq'
import { CouchifyError, ErrorType } from './error'
import { accessAsync, readFileAsync } from './helpers'
import {
    Attachment,
    CouchifyOptions,
    DependencyResolution,
    DesignDocument,
    FunctionResolution,
    ViewFunctionResolution
} from './types'
const babelify = require('babelify')
const moduleDeps = require('module-deps')
const transformDeps = require('transform-deps')

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

const MODULE_EXPORTS = 'module.exports='

export function couchify(options: CouchifyOptions): Promise<DesignDocument> {
    options = { ...defaultOptions, ...options }

    if (!options.baseDocumentsDir) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_PROVIDED_BASE_DOCUMENTS_DIR))
    }

    if (!options.id) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_PROVIDED_ID))
    }

    const designFunctionDirs = uniq([
        options.filtersDir,
        options.listsDir,
        options.showsDir,
        options.updatesDir,
        options.viewsDir
    ])

    if (designFunctionDirs.length !== 5) {
        return Promise.reject(new CouchifyError(ErrorType.NOT_UNIQUE_DIRNAMES))
    }

    const baseDocumentsDir = path.resolve(options.baseDocumentsDir)
    const attachmentsDir = path.join(baseDocumentsDir, options.attachmentsDir)

    const globOptions = { ignore: options.globIgnorePatterns, nodir: true }

    return accessAsync(baseDocumentsDir).then(() => _couchify(options, globOptions, designFunctionDirs, attachmentsDir, baseDocumentsDir))
}

function _couchify(options: CouchifyOptions, globOptions, designFunctionDirs: string[], attachmentsDir: string, baseDocumentsDir: string): Promise<DesignDocument> {
    return Promise.all([
        glob(`+(${designFunctionDirs.join('|')})/*.{${['js', 'json' /* TODO: test json */]}}`, { ...globOptions, ...{ cwd: baseDocumentsDir } }),
        glob('**/*', { ...globOptions, ...{ cwd: attachmentsDir } })
    ]).then(([designFiles, attachmentFiles]) => {

        const designTasks = designFiles
            .map(relativePath => designFunctionEntry(baseDocumentsDir, relativePath, options))

        const attachmentTasks = attachmentFiles
            .map(relativePath => attachmentEntry(attachmentsDir, relativePath))

        return Promise.all([Promise.all(designTasks), Promise.all(attachmentTasks)]).then(([entries, attachments]) => {

            const resolvedDeps: DependencyResolution[] = []
            const rewriteTasks: Promise<any>[] = []

            const resolutionIndex = entries.reduce((acc, entry) => {
                entry.resolvedDeps
                    .filter(d => !(acc.hasOwnProperty(d.file)))
                    .forEach(d => {
                        resolvedDeps.push(d)
                        acc[d.file] = resolvedDeps.length - 1
                        rewriteTasks.push(
                            rewriteRequires(stripJSTags(d.source), name => `./${acc[d.deps[name]]}`)
                                .then(code => {
                                    d.source = code
                                    return d
                                })
                        )
                    })

                rewriteTasks.push(entry.type !== 'views'
                    ? rewriteRequires(MODULE_EXPORTS + entry.exports.default, name => `commons/${acc[entry.deps[name]]}`)
                        .then(code => {
                            entry.source = code.slice(MODULE_EXPORTS.length)
                            return entry
                        })
                    : Promise.all([entry.exports.map, entry.exports.reduce].map(d => {
                        return !d
                            ? null
                            : rewriteRequires(MODULE_EXPORTS + ' ' + d, name => `views/lib/${acc[entry.deps[name]]}`)
                    })).then(([map, reduce]) => {
                        (entry as ViewFunctionResolution).source = {
                            map: map && map.slice(MODULE_EXPORTS.length),
                            reduce: reduce && reduce.slice(MODULE_EXPORTS.length)
                        }
                        return entry
                    })
                )

                return acc
            }, {})

            return Promise.all(rewriteTasks).then(values => designDocument(values, resolutionIndex, resolvedDeps, attachments, options))
        })
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
function glob(pattern: string, globOptions: $glob.IOptions): Promise<string[]> {
    return new Promise((resolve, reject) => {
        $glob(pattern, globOptions, (err, files) => err === null ? resolve(files) : reject(err))
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

const designFunctionTypes = ['filters', 'lists', 'shows', 'updates', 'views']

function determineDesignFunctionType(name: string, opts: CouchifyOptions): string {
    return designFunctionTypes[[opts.filtersDir, opts.listsDir, opts.showsDir, opts.updatesDir, opts.viewsDir].indexOf(name)]
}

function designFunctionEntry(baseDocumentsDir: string, relativePath: string, options: CouchifyOptions) {
    return resolveDependencies(path.join(baseDocumentsDir, relativePath), options).then(deps => {
        const entry = deps[deps.length - 1] as FunctionResolution
        entry.exports = extractExports(entry.source, acorn.parse(entry.source), options)
        entry.resolvedDeps = deps.slice(0, -1)
        const frags = relativePath.split('/')
        entry.type = determineDesignFunctionType(frags[0], options)
        return entry
    })
}

function attachmentEntry(attachmentsDir: string, relativePath: string): Promise<Attachment> {
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
}

function designDocument(values: FunctionResolution[], resolutionIndex, resolvedDeps: DependencyResolution[], attachments: Attachment[], options: CouchifyOptions) {
    const res: DesignDocument = {
        _id: `_design/${options.id}`,
        language: 'javascript'
    }

    if (attachments.length) {
        res._attachments = attachments.reduce((acc, attachment) => {
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

                const view = (res.views[key] as any)

                if (view.map === null) {
                    delete view.map
                }

                if (view.reduce === null) {
                    delete view.reduce
                }

                if (Object.keys(viewsLib).length) {
                    res.views.lib = viewsLib
                }
            }
        }
    })

    return res
}
