# couchify

use next generation JS in your [CouchDB](http://couchdb.apache.org) apps.

[![Build Status](https://travis-ci.org/wearereasonablepeople/couchify.svg?branch=master)](http://travis-ci.org/tetsuo/couchify)

`couchify` uses [babel](https://babeljs.io) to transpile your modular ES2015 application code into ES5, and will recursively analyze the `require()` calls in order to build a flat representation of your application's dependency tree in CouchDB.


# Install

With `npm` or `yarn`, do:

```
npm install couchify
```

# Example

Following example shows how you can create a _show_ function which uses `gamma` module from npm.

So, given this directory structure:

```
myapp/
├── shows/
│   └── foo.js
└── bar.js
```

`foo.js` looks like this:

```js
export default ({ require }) => () => {
    const gamma = require('gamma')
    return require('../bar').x + gamma(5) + '\n'
}
```

`couchify` needs to know where your list/update/view/show/etc functions are located in the first place. By default, it assumes that they are under the `baseDocumentsDir` you provided, so, by default, _view_ functions are searched in the `views` folder, _show_ functions in the _shows_, and so on.

Unlike normal CouchDB functions, you need to explicitly provide the CouchDB globals (e.g. `require`, `emit` and so on) into these functions. This makes it possible to test your functions easily during development. Just use `require()` in your design functions how you would normally use it in other places, and everything will be fine.

and `bar.js` (which is only put there to demonstrate that you can `require()` from anywhere):

```js
export const x = 'fruits'
```

in this case, a hypothetical `foo.js` test could look like this:

```js
const assert = require('assert')
const foo = require('./shows/foo')({ require }) /* providing 'require' here */
const doc = { n: 555 }
assert.equal(foo(doc), 'fruits' + 3.345252661316333e+49)
```

and you can deploy it with:

```sh
λ ~ couchify myapp/ --name myapp --db mydb
{"ok":true,"id":"_design/myapp","rev":"41-c40f6ce36f17579bbbd2b4371d48c8ce"}
```

and test the _show_ API using `cURL`:

```sh
λ ~ curl -X GET http://127.0.0.1:5984/mydb/_design/myapp/_show/foo
fruits23.999999999999996
```

# API

```js
const couchify = require('couchify').couchify
```

`couchify` expects some `CouchifyOptions` and returns a `Promise`. When this promise is resolved, you get a [design document](http://guide.couchdb.org/draft/design.html) JSON back.

```ts
export type CouchifyOptions = {
    id?: string
    baseDocumentsDir?: string
    babelPlugins?: any[]
    babelPresets?: any[]
    filtersDir?: string
    listsDir?: string
    showsDir?: string
    updatesDir?: string
    viewsDir?: string
    globIgnorePatterns?: string[]
}
```

* `id` is the design document ID (without the `_design/` part).
* `baseDocumentsDir` is where your source code is located. This directory should contain at least one of the `filtersDir`, `listsDir`, `showsDir`, `updatesDir` or `viewsDir` directories. These are respectively is been set to: `filters`, `lists`, `shows`, `updates` and `views`.
* By default, `couchify` only applies [ES2015 preset](https://babeljs.io/docs/plugins/preset-es2015/), you can add extra Babel plugins and presets with `babelPlugins` and `babelPresets` options.

### Rewrites

Just add a `rewrites.json` file in your base documents folder. This file should be formatted like the following example:

```
[
    {
        "from": "",
        "to": "index.html",
        "method": "GET",
        "query": {}
    },
    ...
]
```

See: http://docs.couchdb.org/en/1.3.0/pretty_urls.html

### Deploying

```js
const deploy = require('couchify').deploy
```

Deploy a CouchDB design document.

```ts
export type DeployOptions = {
    remote?: string
    db?: string
    doc?: DesignDocument
    user?: string
    pass?: string
}
```

# CLI

```
couchify DIR [OPTIONS]

Options:
  -n, --name     Design document name.  [default: default]
  -d, --db       Database name.         [default: default]
  -r, --remote   CouchDB endpoint.      [default: localhost:5984]
  -u, --user     CouchDB username.
  -p, --pass     CouchDB password.
  -y, --dry      Dry run.               [default: false]
  -v, --version  Show version number.
  -h, --help     Show this message.
```

Design document name must be unique per database. It is set to `default`, by default.

When `--dry` flag is set, `couchify` will only output the design document JSON and not deploy it.

# Limitations

* You can use `require()` inside the body of your design functions only, top-level `require()` calls are ignored.
* Currently `require()` does not work in _reduce_ functions. (See: https://wiki.apache.org/couchdb/CommonJS_Modules)

# Roadmap

See the [Issues page](https://github.com/wearereasonablepeople/couchify/issues) for a list of known bugs & planned features.

# Development

To install dependencies, do:

```
yarn
```

Start TypeScript compiler in watch mode:

```
npm run build -- --watch
```

Run linter:

```
npm run lint
```

Run tests:

```
npm run test
```
