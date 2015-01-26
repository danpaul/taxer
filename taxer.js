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
                if( self.useCache ){ self.updateMaps(parent, id); }
                callbackIn()
            })
            .catch(callbackIn)
    }

    // gets childrent to depth, if depth is -1, will get all children
    // passes back values as a single merged array
    this.getChildren = function(id, depth, callbackIn){
        if( self.useCache ){
            this.getChildrenFromCache(id, depth, callbackIn);
        } else {

        }
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
            children = nextChildren.slice(0)
            if( depth >= 0 ){ depth++ }
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

    this.updateMaps = function(parent, child){

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

    this.init();

};

}())