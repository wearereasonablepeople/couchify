export interface Attachment {
    id?: string
    content_type: string
    data: string
}

export interface CouchifyOptions {
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

export interface DependencyResolution {
    entry?: boolean
    deps: { [s: string]: string }
    file: string
    id: string
    source: string
}

export interface FunctionResolution extends DependencyResolution {
    output: string
    resolvedDeps: DependencyResolution[]
    path: string[]
}

export interface DesignDocument {
    _id: string
    language: string
    _rev?: string
    _attachments?: { [key: string]: Attachment }
    commons?: { [key: string]: string }
    views?: {
        lib?: { [key: string]: string }
        [key: string]: string | { [key: string]: string }
    }
    shows?: { [key: string]: string }
    lists?: { [key: string]: string }
    filters?: { [key: string]: string }
    updates?: { [key: string]: string }
    rewrites?: Rewrite[]
}

export interface Rewrite {
    from: string
    to: string
    method: string
    query: { [key: string]: string }
}
