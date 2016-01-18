// dependencies
const Immutable = require('immutable');
const minitrue = require('minitrue');
const _ = require('lodash');
const invariant = require('invariant');

// helpers
const isImmutable = (obj) => {
    return Immutable.Iterable.isIterable(obj);
};

const makeState = function(value) {
    return {
        v: value
    };
};

const getState = function(state) {
    return state.v;
};

const setState = function(state, value) {
    state.v = value;
};

// sentinel values
const IS_REDUX = {};
const STORE = {k: 'STORE'};
const VALUE = {k: 'VALUE'};
const NOT_SET = {};
// sentinel values to differentiate staged tree and the single-source of truth tree
const SOURCE = {};
const STAGED = {};

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

    reduceAtPathWith(store, action, isTransaction) {

        return {
            type: REDUCE_AT_PATH,
            payload: {
                store,
                action,
                isTransaction
            }
        };

    }

};

const wrapReducer = (stateTree, path, reducer) => {

    const sourceTreeCursor = stateTree.cursor(SOURCE).deref();
    const stagedTreeCursor = stateTree.cursor(STAGED);

    return (state, wrappedAction) => {

        if(wrappedAction.type !== REDUCE_AT_PATH) {

            const newState = reducer.call(void 0, getState(state), wrappedAction);
            setState(state, newState);

            sourceTreeCursor.cursor(path).cursor(VALUE).update(() => {
                return newState;
            });

            stagedTreeCursor.update((stagedTree) => {
                return stagedTree.updateIn(path, Immutable.Map(), (subtree) => {
                    return subtree.set(VALUE, newState);
                });
            });

            return state;
        }

        const {action, isTransaction} = wrappedAction.payload;

        const newState = reducer.call(void 0, getState(state), action);
        setState(state, newState);

        if(!isTransaction) {
            sourceTreeCursor.cursor(path).cursor(VALUE).update(() => {
                return newState;
            });
        }

        stagedTreeCursor.update((stagedTree) => {
            return stagedTree.updateIn(path, Immutable.Map(), (subtree) => {
                return subtree.set(VALUE, newState);
            });
        });

        return state;
    };
};

/**
 * Convert each leaf into a wrapped redux store
 *
 * @param  {[type]} createStore [description]
 * @param  {[type]} state       [description]
 * @param  {[type]} path        [description]
 *
 * @return {[type]}             [description]
 */
const convertTree = (createStore, __wrapReducer, cursor, path) => {

    const maybeTree = cursor.deref();

    if(maybeTree && _.isObject(maybeTree) && maybeTree.__REDUX_TREE === IS_REDUX) {
        maybeTree.deref().forEach((value, key) => {
            convertTree(createStore, __wrapReducer, maybeTree.cursor(key), path.concat([key]));
        });
        return;
    }

    if(!isImmutable(maybeTree)) {

        invariant(_.isFunction(maybeTree), `Expected state to be a reducing function at path ${String(path)}. Given ${maybeTree}`);

        const reducer = maybeTree;

        // convert leaf into immutable map
        cursor.update(() => {
            return Immutable.Map();
        });

        const wrappedReduxStore = createStore(__wrapReducer(path, reducer), makeState());

        const value = getState(wrappedReduxStore.getState());

        cursor.cursor(VALUE).update(() => value);
        cursor.cursor(STORE).update(() => wrappedReduxStore);

        return;
    }

    maybeTree.forEach((value, key) => {
        convertTree(createStore, __wrapReducer, cursor.cursor(key), path.concat([key]));
    });

};

// buildTree: Probe => Probe
const buildTree = (createStore, tree) => {

    invariant(tree && _.isObject(tree) && tree.__REDUX_TREE === IS_REDUX, `Not a redux-tree. Given ${tree}`);

    // this splits up state tree into a single source of truth and a tree with staged changes
    const override = minitrue({});
    override.cursor(SOURCE).update(() => {
        return tree;
    });

    // create empty snapshot
    override.cursor(STAGED).update(() => {
        return Immutable.Map();
    });

    // build phase

    const __wrapReducer = wrapReducer.bind(void 0, override);

    convertTree(createStore, __wrapReducer, tree, []);

    // set snapshot of state tree
    override.cursor(STAGED).update(() => {
        return tree.deref();
    });

    return override;
};

// handles reseting staged changes, or commits
const reduceWithTree = (stateTree, transacAction) => {

    switch(transacAction.type) {

    case RESET:

        stateTree.cursor(STAGED).update(() => {
            const sourceTree = stateTree.cursor(SOURCE).deref();
            return sourceTree.deref();
        });

        break;

    case COMMIT:

        const sourceTree = stateTree.cursor(SOURCE).deref();
        let stagedTree = stateTree.cursor(STAGED).deref();

        sourceTree.update((previous) => {
            stagedTree = previous.mergeDeep(stagedTree);

            // save new snapshot
            stateTree.cursor(STAGED).update(function() {
                return stagedTree;
            });

            return stagedTree;
        });

        // NOTE TO SELF: is this the same as above?
        // sourceTree.update((previous) => {
        //     return stagedTree;
        // });

        break;

    case REDUCE_AT_PATH:

        const {store, action, isTransaction} = transacAction.payload;

        store.dispatch({
            type: REDUCE_AT_PATH,
            payload: {
                action,
                isTransaction
            }
        });

        break;
    }

    return stateTree;
};

const createStoreFromTree = (sourceTree, createStore) => {

    const stateTree = buildTree(createStore, sourceTree);

    const store = createStore(reduceWithTree, stateTree);

    let isTransaction = false;

    return {

        // usual redux store methods

        /**
         * akin to getState() via path
         *
         * @param  {[type]} keyValue    [description]
         * @param  {[type]} notSetValue [description]
         *
         * @return {[type]}             [description]
         */
        getState(keyValue, notSetValue) {

            const cursor = sourceTree.cursor(keyValue).cursor([VALUE]);

            invariant(cursor.exists(), `Invalid path. Given: ${keyValue}`);

            return cursor.deref(notSetValue);
        },

        /**
         * dispatch a given action to a reducer at keyValue path
         *
         * @param  {[type]} keyValue [description]
         * @param  {[type]} action   [description]
         *
         * @return {[type]}          [description]
         */
        dispatch(keyValue, action) {

            const cursorAtPath = sourceTree.cursor(keyValue);

            // fetch redux store at keyValue path
            const cursorStore = cursorAtPath.cursor(STORE);

            invariant(cursorStore.exists(), `Invalid path. Given: ${keyValue}`);

            const reduxStore = cursorStore.deref(NOT_SET);

            invariant(reduxStore !== NOT_SET, `Invalid redux store at path. Found: ${reduxStore} at ${keyValue}`);

            store.dispatch(actionsCreate.reduceAtPathWith(reduxStore, action, isTransaction));

            return action;
        },

        subscribe(keyValue, listener) {

            invariant(_.isFunction(listener), `Expected function. Given ${listener}`);

            const cursor = sourceTree.cursor(keyValue);
            const cursorVal = cursor.cursor(VALUE);

            if(!cursorVal.exists()) {
                return cursor.observe(listener);
            }

            return cursorVal.observe(listener);
        },

        replaceReducer(keyValue, nextReducer) {
            const cursor = sourceTree.cursor(keyValue);
            cursor.cursor([STORE]).update((wrappedStore) => {
                wrappedStore.replaceReducer(wrapReducer(stateTree, cursor.path(), nextReducer));
                return wrappedStore;
            });
        },

        // additional methods

        getTree() {
            return sourceTree;
        },

        observable(keyValue) {
            return {
                observe(listener) {

                    invariant(_.isFunction(listener), `Expected function. Given ${listener}`);

                    // TODO: refactor/cleanup
                    const cursor = sourceTree.cursor(keyValue);
                    const cursorVal = cursor.cursor([VALUE]);

                    if(!cursorVal.exists()) {
                        return cursor.observe(listener);
                    }

                    return cursorVal.observe(listener);
                }
            };
        },

        reset() {
            return store.dispatch(actionsCreate.reset());
        },

        transaction(newValue = NOT_SET) {

            if(newValue !== NOT_SET) {
                isTransaction = !!newValue;
            }

            return isTransaction;
        },

        commit() {
            return store.dispatch(actionsCreate.commit());
        },
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
