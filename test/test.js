(function(){

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

	test.runTest = function(){
		var taxer = new Taxer({
			knex: knex,
			tableName: 'category'
		}, function(err){
			if(err){ console.log(err); }
			else{
console.log('success');
			}
		})
	}


	test.runTest();

	module.exports = test

}())