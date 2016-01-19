# redux-tree

> Organize your redux stores in a tree-like structure 

**NOTE: WORK IN PROGRESS; API IS UNSTABLE UNTIL `v1.x`**

redux-trees are tree-like structured schemas where the [leaves](https://en.wikipedia.org/wiki/Tree_(data_structure)#Terminologies_used_in_Trees) are either **another redux-tree** or a **redux compatible reducer** (*not both*).

redux-trees are considered schemas because the user would build the final redux-tree (representing the app state) into a redux-like store. This redux-like store has the usual [Store API methods](https://github.com/rackt/redux/blob/master/docs/api/Store.md#store-methods), except that the first argument is an array (or Iterable of) of keys defining the path to the reducer:

```js
getState(path, notSetValue)
dispatch(path, action)
subscribe(path, listener)
replaceReducer(path, nextReducer)
```

**NOTE:** When redux-trees are built into a redux-like store, any and all reducers (functions) are *implicitly* converted into redux stores. Thus, the API methods of `getState`, `dispatch`, `subscribe`, `replaceReducer` work exactly like a redux `Store` when the path points to the reducer.

## Usage

```
$ npm install --save redux-tree
```

```js
const {createStore} = require('redux');

const {tree: reduxTree, createStore: createStoreFromTree} = require('redux-tree');

const appStore = createStoreFromTree(createStore, tree);

// create and compose reusable redux-trees

// 1. Define and combine your reducers in a tree-like structured schema:
const paginationTree = reduxTree({
    page: pageReducer,
    sortBy: sortByReducer,
    orderBy: orderByReducer
});

// 2. (optional) Other redux-tree(s) may be combined, along with any other reducers:
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

// 3. Initialize a redux-like store from a given redux-tree:
// 
// Each reducer at the leaves of the tree are converted into redux stores 
// via the given `createStore` function (which may be enhanced).
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

## Prior Art

**Canonical Reducer Composition**

- https://github.com/gajus/canonical-reducer-composition



*TBA*

## License

MIT
