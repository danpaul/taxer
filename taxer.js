(function(){

var _ = require('underscore');
var async = require('async');

/**

Options include:
    knexObject,
    tableName,
    useCache

*/
module.exports = function(options, callback){

    if( !options.knex || !options.tableName ){
        callback(newError('Incorrect arguments passed to Taxer on initialization.'));
        return;
    }

    var self = this

    self.knex = options.knex
    self.tableName = options.tableName
    self.useCache = (options.useCache) ? options.useCache : false;

    if( self.useCache ){
        self.parentChildMap = {};
        self.childParentMap = {};
    }

    // adds id to hierarchy
    // if parent is null or 0, id is at the top level
    this.add = function(id, parent, callbackIn){

        if( !parent ){ parent = 0 }

        // add to DB
        self.knex(self.tableName)
            .insert({'child': id, 'parent': parent })
            .then(function(){
                if( self.useCache ){ self.addToCache(id, parent); }
                callbackIn()
            })
            .catch(callbackIn)
    }

    this.addToCache = function(child, parent){

        var parentString = parent.toString()
        var childString = child.toString()

        // initialize obj varialbes if unset
        if( typeof(self.parentChildMap[parentString]) === 'undefined' ){
            self.parentChildMap[parentString] = [];
        }
        if( typeof(self.parentChildMap[childString]) === 'undefined' ){
            self.parentChildMap[childString] = [];
        }

        if( typeof(self.childParentMap[childString]) === 'undefined' ){
            self.childParentMap[childString] = [];
        }
        if( typeof(self.childParentMap[parentString]) === 'undefined' ){
            self.childParentMap[parentString] = [];
        }

        // add values to map if not already present
        if( !_.contains(self.parentChildMap[parentString], child) ){
            self.parentChildMap[parentString].push(child)
        }
        if( !_.contains(self.childParentMap[childString], parent) ){
            self.childParentMap[childString].push(parent)
        }
    }

    // gets childrent to depth, if depth is -1, will get all children
    // passes back values as a single merged array
    this.getChildren = function(id, depth, callbackIn){
        if( self.useCache ){
            this.getChildrenFromCache(id, depth, callbackIn);
        } else {
            this.getChildrenFromDb(id, depth, callbackIn);
        }
    }


    // follows same spec as getChildren
    this.getChildrenFromDb = function(id, depth, callbackIn){

        var parentIds = [id]
        var first = true
        var allChildren = {}
        var currentDepth = 0

        async.whilst(
            function(){
                if( currentDepth > depth && depth > 0 ){ return false }
                return( parentIds.length !== 0 )
            },
            function(callback){
                var newParentIds = []

                if( first ){
                    first = false
                } else {
                    _.each(parentIds, function(parentId){
                        allChildren[parentId.toString()] = parentId
                    })
                }

                self.knex(self.tableName)
                    .whereIn('parent', parentIds)
                    .select(['child'])
                    .then(function(children){
                        _.each(children, function(child){
                            var childId = child['child'];
                            if( typeof(allChildren[childId.toString()]) === 'undefined' ){
                                newParentIds.push(childId)
                            }
                        })
                        parentIds = newParentIds
                        if( depth > 0 ){ currentDepth++ }
                        callback()
                    })
                    .catch(callback)
            },
            function(err){
                if(err){ callbackIn(err) }
                else{
                    callbackIn(null, _.values(allChildren))
                }
            }
        )
    }


    // follows same spec as getChildren
    this.getChildrenFromCache = function(id, depth, callbackIn){

        var allChildren = {};
        var children = self.parentChildMap[id.toString()];
        var currentDepth = 0;

        if( typeof(children) === 'undefined' ){
            callbackIn(null, []);
            return;
        }

        while( children.length !== 0 && (depth > currentDepth || depth < 0 ) ){
            var nextChildren = [];
            // for each child
            _.each(children, function(topChild){
                allChildren[topChild.toString()] = topChild;
                // for each child of child
                _.each(self.parentChildMap[topChild.toString()], function(child){
                    if( (child !== id) &&
                        (typeof(allChildren[child.toString()]) === 'undefined' )
                    ){
                        nextChildren.push(child)
                    }
                })
            })
            children = nextChildren
            if( depth >= 0 ){ currentDepth++ }
        }
        callbackIn(null, _.values(allChildren))
    }

    this.getTree = function(parent, depthLimit, callbackIn){
        if(serlf.useCache){
            this.getTreeFromCache(parent, depthLimit, callbackIn);
        } else {
            this.getTreeFromDb(parent, depthLimit, callbackIn);
        }
    }

    this.getTreeFromCache = function(parent, depthLimit, callbackIn){

        var treeMap = {};
        treeMap[parent.toString()] = {id: parent, children: self.parentChildMap[parent]}

        var children = self.parentChildMap[parent];
        var currentDepth = 0;

        // build map of id to objects
        while( children.length !== 0  && (depthLimit < 0 || currentDepth < depthLimit) ){
            var nextChildren = [];
            _.each(children, function(child){
                if( typeof(treeMap[child.toString()]) === 'undefined' ){
                    var childsChildren = self.parentChildMap[child.toString()];
                    treeMap[child.toString()] = {id: child, children: childsChildren}
                    _.each(childsChildren, function(childsChild){
                        if( typeof(treeMap[childsChild.toString()]) === 'undefined' ){
                            nextChildren.push(childsChild)
                        }
                    })
                }
            })
            children = _.uniq(nextChildren);
            if( depthLimit >= 0 ){ currentDepth++; }            
        }

        // create object tree
        _.each(treeMap, function(node, id){
            var nodesChildren = node.children;
            node.children = [];
            _.each(nodesChildren, function(nodesChild){
                if( typeof(treeMap[nodesChild.toString()]) !== 'undefined' ){
                    node.children.push(treeMap[nodesChild.toString()])
                } else {
                    node.children.push(null)
                }
                
            })
        })

        callbackIn(null, treeMap[parent.toString()]);

    }
/******************************************************************************/
    this.getTreeFromDb = function(parent, depthLimit, callbackIn){

        var  children = [parent]
        var currentDepth = 0
        var treeMap = {}
        treeMap[parent.toString()] = {id: parent, children: []};

        async.whilst(
            function(){
                return(children.length !== 0
                       && (depthLimit < 0 || currentDepth < depthLimit));
            },
            function(callback){
                var nextChildren = []

                // query DB for children
                self.knex(self.tableName)
                    .whereIn('parent', [parent])
                    .select(['parent', 'child'])
                    .then(function(rows){
                        _.each(rows, function(row){
                            var ps = row.parent.toString()
                            var cs = row.child.toString()
                            if( typeof(treeMap[ps]) === 'undefined' ){
                                treeMap[ps] = {id: row.parent, children: []}
                            }

                            treeMap[ps.toString()].children.push(row.child)
                            if( typeof(treeMap[cs]) === 'undefined' ){
                                nextChildren.push(row.child)
                                treeMap[cs] = {id: row.child, children: []}
                            }
                        })
                        children = _.uniq(nextChildren)
// console.log(treeMap)
// console.log(children)
                        if( depthLimit >= 0 ){ currentDepth++ }
                        callback()
                    })
                    .catch(callback)
            },
            function(err){
                if( err ){ callbackIn(err) }
                else{
console.log(treeMap)
                    callbackIn()
                }
            }
        )

    }

    this.init = function(){
        // check if table exists
        self.knex.schema.hasTable(self.tableName)
            .then(function(exists) {
                if( !exists ){
                    // create the table
                    self.knex.schema.createTable(self.tableName, function(table){
                        table.integer('parent')
                        table.integer('child')
                        table.primary(['parent', 'child'])
                    })
                    .then(function(){ callback(); })
                    .catch(callback)
                } else { callback(); }
            })
            .catch(callback)
    }

    // signature: current parent, child, new parent, callback
    this.move = function(child, currentParent, newParent, callbackIn){
        async.series([
            // unlink from old parent
            function(callback){ self.unlink(child, currentParent, callback) },
            // link to new parent
            function(callback){ self.add(child, newParent, callback) }
        ], callbackIn)
    }

    // removes link from parent to child
    this.unlink = function(child, parent, callbackIn){
        // unlink from the database
        self.unlinkFromDb(child, parent, function(err){
            if(err){ callbackIn(err) }
            else{
                if( self.useCache ){ self.unlinkFromCache(child, parent) }
                callbackIn()
            }
        })
    }

    // removes link between child and parent from cache
    this.unlinkFromCache = function(child, parent){
        self.parentChildMap[parent] = _.without(self.parentChildMap[parent], child)
        self.childParentMap[child] = _.without(self.childParentMap[child], parent)
    }

    // unlinks child from parent in DB
    this.unlinkFromDb = function(child, parent, callbackIn){
        self.knex(self.tableName)
            .where({'parent': parent, 'child': child})
            .del()
            .then(function(){ callbackIn() })
            .catch(callbackIn)
    }

    this.init();

};

}())