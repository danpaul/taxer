(function(){

	var async = require('async')
	var assert = require('assert')
	var _ = require('underscore')
	var Taxer = require('../taxer')

	var dbCreds = {
	    client: 'mysql',
	    connection: {
			host: 'localhost',
			user: 'root',
			password: 'root',
			database: 'taxer',
			port:  8889
	    }
	}

	var knex = require('knex')(dbCreds)

	var test = {};
	var taxer;

	test.runTest = function(callbackIn){
		taxer = new Taxer({
			knex: knex,
			tableName: 'test_category',
			useCache: true
		}, function(err){
			if(err){ callbackIn(err); }
			else{ test.runTests(callbackIn) }
		})

	}

	test.runTests = function(callbackIn){

		async.series([
			// empty test table
			function(callback){
				knex('test_category').truncate()
					.then(function(){ callback(); })
					.catch(callback)
			},

			// add top level node
			function(callback){ taxer.add(1, null, callback) },

			// add child of top level node
			function(callback){ taxer.add(2, 1, callback) },

			// add second child
			function(callback){ taxer.add(3, 1, callback) },

			// add sub-child
			function(callback){ taxer.add(4, 2, callback) },

			// get children from cache
			function(callback){
				taxer.getChildrenFromCache(1, -1, function(err, children){
					if( err ){ callback(err) }
					else{
						validateChildren(children)
						callback()
					}
				})
			},

			// get children from db
			function(callback){
				taxer.getChildrenFromDb(1, -1, function(err, children){
					if(err){ callback(err) }
					else{
						validateChildren(children)
						callback()
					}
				})
			},


			// get children from cache, limit depth
			function(callback){
				taxer.getChildrenFromCache(1, 1, function(err, children){
					if(err){ callback(err) }
					else{
						_.each([2, 3], function(num){
							assert(_.contains(children, num), 'Incorrect children in cache depth limit')
						})
						assert((children.length === 2), 'Incorrect number of children in cache depth limit')
						callback()
					}
				})
			},

			// get children from db, limit depth
			function(callback){
				taxer.getChildrenFromDb(1, 1, function(err, children){
					if(err){ callback(err) }
					else{
						_.each([2, 3], function(num){
							assert(_.contains(children, num), 'Incorrect children in DB depth limit')
						})
						assert((children.length === 2), 'Incorrect number of children in DB depth limit')
						callback()
					}
				})
			},

			// add new nodes
			function(callback){ taxer.add(10, null, callback) },
			function(callback){ taxer.add(11, 10, callback) },
			function(callback){ taxer.add(12, 11, callback) },
			function(callback){ taxer.add(13, 11, callback) },

			// move nodes
			function(callback){ taxer.move(11, 10, 4, callback); },

		], callbackIn);
	}

	var validateChildren = function(children){
		assert((children.length === 3), 'Incorrect number of children returned.')
		_.each([2, 3, 4], function(num){
			assert(_.contains(children, num), 'Unexpected children returned')
		})
	}

	test.callTest = function(){
		test.runTest(function(err){
			if(err){
				console.log( 'An error occurred: ')
				console.log(err)
			} else {
				console.log('success')
			}
		})
	}

	test.callTest();

	module.exports = test

}())