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
        if( typeof(self.childParentMap[childString]) === 'undefined' ){
            self.childParentMap[childString] = [];
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