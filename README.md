# redux-tree

> redux stores in a tree-like structure 

*Description TBA.*

**NOTE: WORK IN PROGRESS**

## Usage

```
$ npm install --save redux-tree
```

```js
const {createStore} = require('redux');

const {tree: reduxTree, createStore: createStoreFromTree} = require('redux-tree');

const appStore = createStoreFromTree(createStore, tree);

// create and compose redux-trees

const paginationTree = reduxTree({
    page: pageReducer,
    sortBy: sortByReducer,
    orderBy: orderByReducer
});

const appTree = reduxTree({

    route: routeReducer,

    user: {
        name: nameReducer,
        birthdate: birthdateReducer
    },

    // compose redux-trees
    cards_list: paginationTree,

    decks_list: paginationTree
});

// build the redux store from a given redux-tree.
// each reducer at the leaves of the tree are converted into redux stores via the given
// `createStore` function (which may be enhanced).
const appStore = createStoreFromTree(createStore, appTree);

// dispatch action to a store at path which can either be a key or an array of keys.
// will throw if no redux store is found at the path.
appStore.dispatch(path, action);
appStore.dispatch(['cards_list', 'page'], action);
appStore.dispatch('route', action); // 'route' is resolved to ['route']

// get value state at path
appStore.getState(path);

// usual methods of a redux store
appStore.subscribe(path, listener);
appStore.replaceReducer(path, nextReducer);

// returns object with method observe(listener) that returns unsubscribe()
appStore.observable(path, listener);

// transactions
appStore.reset(); // reset staged changes
const isTransaction = appStore.transaction(); // get transaction flag
appStore.transaction(true); // enable transaction
appStore.transaction(false); // disable transaction; staged changes still persist
appStore.commit(); // commit staged changes

```

## API

#### getState(keyValue, notSetValue)

#### dispatch(keyValue, action)

#### subscribe(keyValue, listener)

#### replaceReducer(keyValue, nextReducer)

#### getTree()

#### observable(keyValue)

#### reset()

#### transaction(flag)

#### commit()

## Implementation

- Internally, the library uses a combination of [Immutable.js](https://github.com/facebook/immutable-js) and cursors ([minitrue](https://github.com/dashed/minitrue), [Probe](https://github.com/dashed/probe), [Providence](https://github.com/dashed/providence))

## License

MIT
