const Immutable = require('immutable');
const minitrue = require('minitrue');
const _ = require('lodash');
const invariant = require('invariant');

// sentinel values
const IS_REDUX = {t: 'IS_REDUX'};
const STORE = {k: 'STORE'};
const VALUE = {k: 'VALUE'};
const NOT_SET = {};
// sentinel values to differentiate staged tree and the single-source of truth tree
const SOURCE = {t: 'SOURCE'};
const STAGED = {t: 'STAGED'};

// actions
const RESET = {a: 'RESET'};
const COMMIT = {a: 'COMMIT'};
const REDUCE_AT_PATH = {a: 'REDUCE_AT_PATH'};

// action creators
// all of these functions return FSA compliant objects
const actionsCreate = {

    reset() {
        return {
            type: RESET
        };
    },

    commit() {
        return {
            type: COMMIT
        };
    },

    reduceAtPathWith(store, action, isTransaction, sourceCursor, stagedCursor) {

        return {
            type: REDUCE_AT_PATH,
            payload: {
                store,
                action,
                isTransaction,
                sourceCursor,
                stagedCursor
            }
        };
    }

};

const wrapReducer = (reducer) => {

    return (state, wrappedAction) => {

        if(wrappedAction.type !== REDUCE_AT_PATH) {
            state = reducer.call(void 0, state, wrappedAction);
            return state;
        }

        const {payload} = wrappedAction;

        const {action, isTransaction, sourceCursor, stagedCursor} = payload;

        state = reducer.call(void 0, state, action);

        if(!isTransaction) {

            sourceCursor.update(() => {
                return state;
            });
        }

        stagedCursor.update(() => {
            return state;
        });

        return state;
    };
};

const buildFromSchema = (destCursor, schemaCursor, createStore) => {

    let maybeTree = schemaCursor.deref();

    if(maybeTree && _.isObject(maybeTree) && maybeTree.__REDUX_TREE === IS_REDUX) {

        maybeTree.forEach((value, key) => {
            buildFromSchema(destCursor.cursor(key), maybeTree.cursor(key), createStore);
        });

        return;
    }

    if(isImmutable(maybeTree)) {

        const schemaIterable = maybeTree;

        schemaIterable.forEach((value, key) => {
            buildFromSchema(destCursor.cursor(key), schemaCursor.cursor(key), createStore);
        });

        return;
    }

    const reducer = maybeTree;
    const path = destCursor.path();

    invariant(_.isFunction(reducer), `Expected state to be a reducing function at path ${path}. Given ${reducer}`);

    const wrappedReduxStore = createStore(wrapReducer(reducer));

    const value = wrappedReduxStore.getState();

    destCursor.cursor(VALUE).update(() => value);
    destCursor.cursor(STORE).update(() => wrappedReduxStore);
};

const buildStoreTreeWith = (schemaTree, createStore) => {

    invariant(
        schemaTree &&
        _.isObject(schemaTree) &&
        schemaTree.__REDUX_TREE === IS_REDUX, `Not a redux-tree. Given ${schemaTree}`);

    const storeTree = minitrue({});

    storeTree.cursor(SOURCE).update(() => {
        return Immutable.Map();
    });

    buildFromSchema(storeTree.cursor(SOURCE), schemaTree, createStore);

    storeTree.cursor(STAGED).update(() => {
        return storeTree.cursor(SOURCE).deref();
    });

    return storeTree;
};

// handles reseting staged changes, or commits
const reduceWithTree = (storeTree, transacAction) => {

    switch(transacAction.type) {

    case RESET:

        storeTree.cursor(STAGED).update(() => {
            return storeTree.cursor(SOURCE).deref();
        });

        break;

    case COMMIT:

        let stagedTree = storeTree.cursor(STAGED).deref();

        storeTree.cursor(SOURCE).update((prevTree) => {

            stagedTree = prevTree.mergeDeep(stagedTree);

            return stagedTree;
        });

        storeTree.cursor(STAGED).update(() => {
            return stagedTree;
        });

        break;

    case REDUCE_AT_PATH:

        const {store, action, isTransaction, sourceCursor, stagedCursor} = transacAction.payload;

        store.dispatch({
            type: REDUCE_AT_PATH,
            payload: {
                action,
                isTransaction,
                sourceCursor,
                stagedCursor
            }
        });

        break;
    }

    return storeTree;
};

const createStoreFromTree = (schemaTree, createStore) => {

    const storeTree = buildStoreTreeWith(schemaTree, createStore);

    const superStore = createStore(reduceWithTree, storeTree);

    const sourceTree = storeTree.cursor(SOURCE);
    const stagedTree = storeTree.cursor(STAGED);

    let isTransaction = false;

    return {

        // usual redux store methods

        getState(keyPath) {

            const cursorValue = sourceTree.cursor(keyPath).cursor(VALUE);

            invariant(cursorValue.exists(), `Invalid path. Given: ${keyPath}`);

            return cursorValue.deref();
        },

        dispatch(keyPath, action) {

            const sourceCursor = sourceTree.cursor(keyPath);
            const stagedCursor = stagedTree.cursor(keyPath);

            // fetch redux store at keyPath
            const cursorStore = sourceCursor.cursor(STORE);

            invariant(cursorStore.exists(), `Invalid path. Given: ${keyPath}`);

            const reduxStore = cursorStore.deref(NOT_SET);

            invariant(reduxStore !== NOT_SET, `Invalid redux store at path. Found: ${reduxStore} at ${keyPath}`);

            superStore.dispatch(actionsCreate.reduceAtPathWith(
                reduxStore,
                action,
                isTransaction,
                sourceCursor.cursor(VALUE),
                stagedCursor.cursor(VALUE)
            ));

            return action;
        },

        subscribe(keyPath, listener) {

            invariant(_.isFunction(listener), `Expected function. Given ${listener}`);

            const cursor = sourceTree.cursor(keyPath);
            const cursorVal = cursor.cursor(VALUE);

            if(!cursorVal.exists()) {
                return cursor.observe(listener);
            }

            return cursorVal.observe(listener);
        },

        replaceReducer(keyPath, nextReducer) {

            const sourceCursor = sourceTree.cursor(keyPath);
            const sourceCursorStore = sourceCursor.cursor(STORE);

            sourceCursorStore.update((store) => {
                store.replaceReducer(wrapReducer(nextReducer));
                return store;
            });

            const stagedCursor = stagedTree.cursor(keyPath);
            stagedCursor.cursor(STORE).update((store) => {

                if(sourceCursorStore.deref() === store) {
                    return store;
                }

                store.replaceReducer(wrapReducer(nextReducer));
                return store;
            });
        },

        // additional methods

        getTree() {
            return sourceTree;
        },

        observable(keyPath) {

            const cursor = sourceTree.cursor(keyPath);
            const cursorVal = cursor.cursor(VALUE);

            return {
                observe(listener) {

                    invariant(_.isFunction(listener), `Expected function. Given ${listener}`);

                    if(!cursorVal.exists()) {
                        return cursor.observe(listener);
                    }

                    return cursorVal.observe(listener);
                }
            };
        },

        reset() {
            return superStore.dispatch(actionsCreate.reset());
        },

        transaction(newValue = NOT_SET) {

            if(newValue !== NOT_SET) {
                isTransaction = !!newValue;
            }

            return isTransaction;
        },

        commit() {
            return superStore.dispatch(actionsCreate.commit());
        }

    };
};

const reduxTree = (obj) => {

    const tree = minitrue(obj);

    tree.__REDUX_TREE = IS_REDUX;

    return tree;
};

module.exports = {
    tree: reduxTree,
    createStore: createStoreFromTree
};

/* helpers */

const isImmutable = (obj) => {
    return Immutable.Iterable.isIterable(obj);
};
