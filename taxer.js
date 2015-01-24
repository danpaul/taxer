(function(){

var _ = require('underscore');
var async = require('async');

/**

Options include: knexObject, tableName

*/
module.exports = function(options, callback){

    if( !options.knex || !options.tableName ){
        callback(newError('Incorrect arguments passed to Taxer on initialization.'));
        return;
    }

    var self = this
    this.knex = options.knex
    this.tableName = options.tableName

    this.init = function(){
        // check if table exists
        self.knex.schema.hasTable(self.tableName)
            .then(function(exists) {
                if( !exists ){
                    // create the table
                    self.knex.schema.createTable(self.tableName, function(table){
                        table.integer('parent').index()
                        table.integer('child').index()
                    })
                    .then(function(){ callback(); })
                    .catch(callback)
                } else { callback(); }
            })
            .catch(callback)
    }

    this.init();

};

}())