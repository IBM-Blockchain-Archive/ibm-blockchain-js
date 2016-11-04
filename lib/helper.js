'use strict';
/*******************************************************************************
 * Copyright (c) 2016 IBM Corp.
 *
 * All rights reserved.
 * 
 *******************************************************************************/
var fs = require('fs');
var async = require('async');
var path = require('path');

//==================================================================
//eFmt() - format errors
//==================================================================
module.exports.eFmt = function eFmt(name, code, details){							//my error format
	return 	{
		name: String(name),															//error short name
		code: Number(code),															//http code when applicable
		details: details															//error description
	};
};


//==================================================================
//filter_users() - return only client level enrollId - [1=client, 2=nvp, 4=vp, 8=auditor accurate as of 2/18]
//==================================================================
module.exports.filter_users = function(users){										//this is only needed in a permissioned network
	var valid_users = [];
	for(var i = 0; i < users.length; i++) {
		if(users[i].enrollId.indexOf('user_type1') === 0){							//type should be 1 for client
			valid_users.push(users[i]);
		}
	}
	return valid_users;
};

// ============================================================================================================================
//removeThing() - clear the temp directory
// ============================================================================================================================
module.exports.removeThing = function(dir, cb){
	//console.log('!', dir);
	fs.readdir(dir, function (err, files) {
		if(err != null || !files || files.length === 0){
			cb();
		}
		else{
			async.each(files, function (file, cb) {							//over each thing
				file = path.join(dir, file);
				fs.stat(file, function(err, stat) {
					if (err) {
						if(cb) cb(err);
						return;
					}
					if (stat.isDirectory()) {
						module.exports.removeThing(file, cb);				//keep going
					}
					else {
						//console.log('!', dir);
						fs.unlink(file, function(err) {
							if (err) {
								if(cb) cb(err);
								return;
							}
							//console.log('good', dir);
							if(cb) cb();
							return;
						});
					}
				});
			}, function (err) {
				if(err){
					if(cb) cb(err);
					return;
				}
				fs.rmdir(dir, function (err) {
					if(cb) cb(err);
					return;
				});
			});
		}
	});
};