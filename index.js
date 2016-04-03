'use strict';
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2016 IBM Corp.
 *
 * All rights reserved.
 *
 *******************************************************************************/
/*
	Updated: 03/15/2016
*/

//Load modules
var fs = require('fs');
var path = require('path');
var https = require('https');
var async = require('async');
var rest = require(__dirname + '/lib/rest.js');
var helper = require(__dirname + '/lib/helper.js');
var AdmZip = require('adm-zip');


function ibc() {}
ibc.chaincode = {																	//init it all
	query: {},
	invoke: {},
	deploy: null,
	details:{
		deployed_name: '',
		func: {
			invoke: [],
			query: []
		},
		git_url: '',
		peers: [],
		timestamp: 0,
		users: [],
		unzip_dir: '',
		zip_url: '',
		options: {}
	}
};
ibc.selectedPeer = 0;
ibc.q = [];																			//array of unix timestamps, 1 for each unsettled action
ibc.lastPoll = 0;																	//unix timestamp of the last time we polled
ibc.lastBlock = 0;																	//last blockheight found
var tempDirectory = path.join(__dirname, './temp');									//	=./temp - temp directory name


// ============================================================================================================================
// EXTERNAL - load() - wrapper on a standard startup flow.
// 1. load network peer data
// 2. register users with security (if present)
// 3. load chaincode and parse
// ============================================================================================================================
ibc.prototype.load = function(options, cb){
	var errors = [];
	if(!options.network || !options.network.peers) errors.push('the option "network.peers" is required');

	if(!options.chaincode || !options.chaincode.zip_url) errors.push('the option "chaincode.zip_url" is required');
	if(!options.chaincode || !options.chaincode.unzip_dir) errors.push('the option "chaincode.unzip_dir" is required');
	if(!options.chaincode || !options.chaincode.git_url) errors.push('the option "chaincode.git_url" is required');
	if(errors.length > 0){															//check for input errors
		console.log('! [ibc-js] Input Error - ibc.load()', errors);
		if(cb) cb(helper.eFmt('load() input error', 400, errors));
		return;																		//get out of dodge
	}

	ibc.chaincode = {																//empty it all
					query: {
						read: read
					},
					invoke: {},
					deploy: null,
					details:{
								deployed_name: '',
								func: {
									invoke: [],
									query: []
								},
								git_url: '',
								peers: [],
								timestamp: 0,
								users: [],
								unzip_dir: '',
								zip_url: '',
								options: options.network.options
					}
				};

	// Step 1
	ibc.prototype.network(options.network.peers, options.network.options);

	// Step 2 - optional - only for secure networks
	if(options.network.users){
		options.network.users = helper.filter_users(options.network.users);			//only use the appropriate IDs filter out the rest
	}
	if(options.network.users && options.network.users.length > 0){
		ibc.chaincode.details.users = options.network.users;
		var arr = [];
		for(var i in ibc.chaincode.details.peers){
			arr.push(i);															//build the list of indexes
		}
		async.each(arr, function(i, a_cb) {
			if(options.network.users[i]){											//make sure we still have a user for this network
				ibc.prototype.register(i, options.network.users[i].username, options.network.users[i].secret, a_cb);
			}
			else a_cb();
		}, function(err, data){
			if(err && cb) return cb(err);											//error already formated
			else load_cc();
		});
	}
	else{
		ibc.chaincode.details.users = [];
		console.log('[ibc-js] No membership users found after filtering, assuming this is a network w/o membership');
		load_cc();
	}

	// Step 3
	function load_cc(){
		ibc.prototype.load_chaincode(options.chaincode, cb);						//download/parse and load chaincode
	}
};

// ============================================================================================================================
// EXTERNAL - load_chaincode() - load the chaincode and parssssssssse
// 0. Load the github or zip
// 1. Unzip & scan directory for files
// 2. Iter over go files
// 		2a. Find the boundaries for Run() in the cc
//		2b. Grab function names that need to be exported
//		2c. Create JS invoke functions for golang functions
// 		2d. Find the boundaries for Query() in the cc
//		2e. Grab function names that need to be exported
//		2f. Create JS query functions for golang functions
// 3. Call callback()
// ============================================================================================================================
ibc.prototype.load_chaincode = function(options, cb) {
	var errors = [];
	if(!options.zip_url) errors.push('the option "zip_url" is required');
	if(!options.unzip_dir) errors.push('the option "unzip_dir" is required');
	if(!options.git_url) errors.push('the option "git_url" is required');
	if(errors.length > 0){																//check for input errors
		console.log('! [ibc-js] Input Error - ibc.load_chaincode()', errors);
		if(cb) cb(helper.eFmt('load_chaincode() input error', 400, errors));
		return;																			//get out of dodge
	}

	var go_funcs = [], cc_suspects = [], cc_invocations = [], cc_queries = [];
	var found_query = false, found_run = false;
	var zip_dest = path.join(tempDirectory,  '/file.zip');								//	=./temp/file.zip
	var unzip_dest = path.join(tempDirectory,  '/unzip');								//	=./temp/unzip
	var unzip_cc_dest = path.join(unzip_dest, '/', options.unzip_dir);					//	=./temp/unzip/DIRECTORY
	ibc.chaincode.details.zip_url = options.zip_url;
	ibc.chaincode.details.unzip_dir = options.unzip_dir;
	ibc.chaincode.details.git_url = options.git_url;
	ibc.chaincode.details.deployed_name = options.deployed_name;

	if(!options.deployed_name || options.deployed_name === ''){							//lets clear and re-download
		ibc.prototype.clear(cb_ready);
	}
	else{
		cb_ready();
	}

	// check if we already have the chaincode in the local filesystem, else download it
	function cb_ready(){
		try{fs.mkdirSync(tempDirectory);}
		catch(e){ }
		fs.access(unzip_cc_dest, cb_file_exists);										//check if files exist yet
		function cb_file_exists(e){
			if(e != null){
				download_it(options.zip_url);											//nope, go download it
			}
			else{
				console.log('[ibc-js] Found chaincode in local file system');
				fs.readdir(unzip_cc_dest, cb_got_names);								//yeppers, go use it
			}
		}
	}

	// Step 0.
	function download_it(download_url){
		console.log('[ibc-js] Downloading zip');
		var file = fs.createWriteStream(zip_dest);
		https.get(download_url, function(response) {
			response.pipe(file);
			file.on('finish', function() {
				if(response.headers.status === '302 Found'){
					console.log('redirect...', response.headers.location);
					file.close();
					download_it(response.headers.location);
				}
				else{
					file.close(cb_downloaded);  										//close() is async
				}
			});
		}).on('error', function(err) {
			console.log('! [ibc-js] Download error');
			fs.unlink(zip_dest); 														//delete the file async
			if (cb) cb(helper.eFmt('doad_chaincode() download error', 500, err.message), ibc.chaincode);
		});
	}

	// Step 1.
	function cb_downloaded(){
		console.log('[ibc-js] Unzipping zip');
		var zip = new AdmZip(zip_dest);
		zip.extractAllTo(unzip_dest, /*overwrite*/true);
		console.log('[ibc-js] Unzip done');
		fs.readdir(unzip_cc_dest, cb_got_names);
		fs.unlink(zip_dest, function(err) {});											//remove zip file, never used again
	}

	// Step 2.
	function cb_got_names(err, obj){
		console.log('[ibc-js] Scanning files', obj);
		var foundGo = false;
		if(err != null) console.log('! [ibc-js] fs readdir Error', err);
		else{
			for(var i in obj){
				if(obj[i].indexOf('.go') >= 0){											//look for GoLang files
					if(!found_run || !found_query){
						foundGo = true;
						var file = fs.readFileSync(path.join(unzip_cc_dest, obj[i]), 'utf8');
						parse_for_invoke(obj[i], file);
						parse_for_query(obj[i], file);
					}
				}
			}
		}
		
		// done - look for errors/warnings
		var msg = '';
		if(!foundGo){																	//error no go files
			msg = 'did not find any *.go files, cannot continue';
			console.log('! [ibc-js] Error - ', msg);
			if(cb) return cb(helper.eFmt('load_chaincode() no chaincode', 400, msg), null);
		}
		else{
			
			if(!found_run){																//warning no run/invoke functions
				msg = 'did not find any invoke functions in chaincode\'s "Run()"';
				console.log('! [ibc-js] Warning -', msg);
			}
			
			if(!found_query){															//warning no query functions
				msg = 'did not find any query functions in chaincode\'s "Query()"';
				console.log('! [ibc-js] Warning -', msg);
			}

			// Step 3.																	success!
			console.log('[ibc-js] load_chaincode() finished');
			ibc.chaincode.details.timestamp = Date.now();
			ibc.chaincode.deploy = deploy;
			if(cb) return cb(null, ibc.chaincode);										//all done, send it to callback
		}
	}

	function parse_for_invoke(name, str){
		if(str == null) console.log('! [ibc-js] fs readfile Error');
		else{
			console.log('[ibc-js] Parsing file for invoke functions -', name);
			
			// Step 2a.
			var go_func_regex = /func\s+\(\w+\s+\*SimpleChaincode\)\s+(\w+)/g;			//find chaincode's go lang functions
			var result;
			while ( (result = go_func_regex.exec(str)) ) {
				go_funcs.push({name: result[1], pos: result.index});
			}
			
			var i_start = 0;
			var i_stop = 0;
			for(var i in go_funcs){
				if(go_funcs[i].name.toLowerCase() === 'run'){
					i_start = go_funcs[i].pos;											//find start and stop positions around the "Run()" function
					if(go_funcs[Number(i) + 1] == null) i_stop = i_start * 2;			//run is the last function.. so uhhhh just make up a high number
					else i_stop = go_funcs[Number(i) + 1].pos;
					break;
				}
			}
			
			if(i_start > 0 && i_stop > 0){
				// Step 2b.
				var regex = /function\s+==\s+["'](\w+)["']/g;							//find the exposed chaincode functions in "Run()""
				var result2;
				while ( (result2 = regex.exec(str)) ) {
					cc_suspects.push(result2[1]);										//store this for when parsing query which runs next
					if(result2.index > i_start && result2.index < i_stop){				//make sure its inside Run()
						cc_invocations.push(result2[1]);
					}
				}
			
				if(cc_invocations.length > 0){
					found_run = true;
				
					// Step 2c.
					ibc.chaincode.details.func.invoke = [];
					for(i in cc_invocations){											//build the rest call for each function
						build_invoke_func(cc_invocations[i]);
					}
				}
			}
		}
	}
		
	function parse_for_query(name, str){
		if(str == null) console.log('! [ibc-js] fs readfile Error');
		else{
			console.log('[ibc-js] Parsing file for query functions -', name);
			
			// Step 2a.
			var q_start = 0;
			var q_stop = 0;
			for(var i in go_funcs){
				if(go_funcs[i].name.toLowerCase() === 'query'){
					q_start = go_funcs[i].pos;											//find start and stop positions around the "Query()" function
					if(go_funcs[Number(i) + 1] == null) q_stop = q_start * 2;			//query is the last function.. so uhhhh just make up a high number
					else q_stop = go_funcs[Number(i) + 1].pos;
					break;
				}
			}
			
			if(q_start > 0 && q_stop > 0){
				// Step 2b.
				for(i in cc_suspects){
					if(cc_suspects[i].index > q_start && cc_suspects[i].index < q_stop){//make sure its inside Query()
						cc_queries.push(cc_suspects[i][1]);
					}
				}
			
				if(cc_queries.length > 0){
					found_query = true;
				
					// Step 2c.
					ibc.chaincode.details.func.query = [];
					for(i in cc_queries){												//build the rest call for each function
						build_query_func(cc_queries[i]);
					}
				}
			}
		}
	}
};

// ============================================================================================================================
// EXTERNAL - network() - setup network configuration to hit a rest peer
// ============================================================================================================================
ibc.prototype.network = function(arrayPeers, options){
	var errors = [];
	var quiet = true;
	var timeout = 60000;
	if(!arrayPeers || arrayPeers.constructor !== Array) errors.push('network input arg should be array of peer objects');
	
	if(options){
		if(options.quiet === true || options.quiet === false) quiet = options.quiet;	//optional fields
		if(!isNaN(options.timeout)) timeout = Number(options.timeout);
	}
	
	for(var i in arrayPeers){															//check for errors in peers input obj
		if(!arrayPeers[i].id) 		errors.push('peer ' + i + ' is missing the field id');
		if(!arrayPeers[i].api_host) errors.push('peer ' + i + ' is missing the field api_host');
		if(options.tls === false){
			if(!arrayPeers[i].api_port) errors.push('peer ' + i + ' is missing the field api_port');
		}
		else{
			if(!arrayPeers[i].api_port_tls) errors.push('peer ' + i + ' is missing the field api_port_tls');
		}
	}

	if(errors.length > 0){																//check for input errors
		console.log('! [ibc-js] Input Error - ibc.network()', errors);
	}
	else{
		ibc.chaincode.details.peers = [];
		for(i in arrayPeers){
			var pos = arrayPeers[i].id.indexOf('_') + 1;
			var temp = 	{
							name: arrayPeers[i].id.substring(pos) + '-' + arrayPeers[i].api_host + ':' + arrayPeers[i].api_port_tls,
							api_host: arrayPeers[i].api_host,
							api_port: arrayPeers[i].api_port,
							api_port_tls:  arrayPeers[i].api_port_tls,
							id: arrayPeers[i].id,
							tls: true													//default
						};
			if(options.tls === false){													//if not tls rebuild a few things
				temp.tls = false;
				temp.name = arrayPeers[i].id.substring(pos) + '-' + arrayPeers[i].api_host + ':' + arrayPeers[i].api_port;
			}
	
			console.log('[ibc-js] Peer: ', temp.name);									//print the friendly name
			ibc.chaincode.details.peers.push(temp);
		}

		rest.init({																		//load default values for rest call to peer
					host: ibc.chaincode.details.peers[0].api_host,
					port: pick_port(0),
					headers: {
								'Content-Type': 'application/json',
								'Accept': 'application/json',
							},
					ssl: ibc.chaincode.details.peers[0].tls,
					timeout: timeout,
					quiet: quiet
		});
	}
};

//pick tls or non-tls port based on the tls setting
function pick_port(pos){
	var port = ibc.chaincode.details.peers[pos].api_port_tls;
	if(ibc.chaincode.details.peers[pos].tls === false) port = ibc.chaincode.details.peers[pos].api_port;
	return port;
}


// ============================================================================================================================
// EXTERNAL - switchPeer() - switch the default peer to hit
// ============================================================================================================================
ibc.prototype.switchPeer = function(index) {
	if(ibc.chaincode.details.peers[index]) {
		rest.init({																		//load default values for rest call to peer
					host: ibc.chaincode.details.peers[index].api_host,
					port: pick_port(index),
					headers: {
								'Content-Type': 'application/json',
								'Accept': 'application/json',
							},
					ssl: ibc.chaincode.details.peers[index].tls,
					timeout: 60000,
					quiet: true
		});
		ibc.selectedPeer = index;
		return true;
	} else {
		return false;
	}
};

// ============================================================================================================================
// EXTERNAL - save() - write chaincode details to a json file
// ============================================================================================================================
ibc.prototype.save =  function(dir, cb){
	var errors = [];
	if(!dir) errors.push('the option "dir" is required');
	if(errors.length > 0){																//check for input errors
		console.log('[ibc-js] Input Error - ibc.save()', errors);
		if(cb) cb(helper.eFmt('save() input error', 400, errors));
	}
	else{
		var fn = 'chaincode.json';														//default name
		if(ibc.chaincode.details.deployed_name) fn = ibc.chaincode.details.deployed_name + '.json';
		var dest = path.join(dir, fn);
		fs.writeFile(dest, JSON.stringify({details: ibc.chaincode.details}), function(e){
			if(e != null){
				console.log('[ibc-js] ibc.save() error', e);
				if(cb) cb(helper.eFmt('save() fs write error', 500, e), null);
			}
			else {
				//console.log(' - saved ', dest);
				if(cb) cb(null, null);
			}
		});
	}
};

// ============================================================================================================================
// EXTERNAL - clear() - clear the temp directory
// ============================================================================================================================
ibc.prototype.clear =  function(cb){
	console.log('[ibc-js] removing temp dir');
	helper.removeThing(tempDirectory, cb);											//remove everything in this directory
};

//============================================================================================================================
// EXTERNAL chain_stats() - get blockchain stats
//============================================================================================================================
ibc.prototype.chain_stats =  function(cb){
	var options = {path: '/chain'};									//very simple API, get chainstats!

	options.success = function(statusCode, data){
		console.log('[ibc-js] Chain Stats - success');
		if(cb) cb(null, data);
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] Chain Stats - failure:', statusCode, e);
		if(cb) cb(helper.eFmt('chain_stats() error', statusCode, e), null);
	};
	rest.get(options, '');
};

//============================================================================================================================
// EXTERNAL block_stats() - get block meta data
//============================================================================================================================
ibc.prototype.block_stats =  function(id, cb){
	var options = {path: '/chain/blocks/' + id};							//i think block IDs start at 0, height starts at 1, fyi
	options.success = function(statusCode, data){
		console.log('[ibc-js] Block Stats - success');
		if(cb) cb(null, data);
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] Block Stats - failure:', statusCode);
		if(cb) cb(helper.eFmt('block_stats() error', statusCode, e), null);
	};
	rest.get(options, '');
};

//============================================================================================================================
//read() - read generic variable from chaincode state - ! [legacy. do not use it anymore 4/1/2016]
//============================================================================================================================
function read(name, username, cb){
	if(typeof username === 'function'){ 									//if cb is in 2nd param use known username
		cb = username;
		username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
	}
	if(username == null) {													//if username not provided, use known valid one
		username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
	}

	var options = {
		path: '/devops/query'
	};
	var body = {
					chaincodeSpec: {
						type: 'GOLANG',
						chaincodeID: {
							name: ibc.chaincode.details.deployed_name,
						},
						ctorMsg: {
							function: 'query',
							args: [name]
						},
						secureContext: username
					}
				};
	//console.log('body', body);
	options.success = function(statusCode, data){
		console.log('[ibc-js] Read - success:', data);
		if(cb) cb(null, data.OK);
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] Read - failure:', statusCode);
		if(cb) cb(helper.eFmt('read() error', statusCode, e), null);
	};
	rest.post(options, '', body);
}

//============================================================================================================================
// EXTERNAL - register() - register a username with a peer (only for a blockchain network with membership)
//============================================================================================================================
ibc.prototype.register = function(index, enrollID, enrollSecret, cb) {
	console.log('[ibc-js] Registering ', ibc.chaincode.details.peers[index].name, ' w/enrollID - ' + enrollID);
	var options = {
		path: '/registrar',
		host: ibc.chaincode.details.peers[index].api_host,
		port: pick_port(index),
		ssl: ibc.chaincode.details.peers[index].tls
	};

	var body = 	{
					enrollId: enrollID,
					enrollSecret: enrollSecret
				};

	options.success = function(statusCode, data){
		console.log('[ibc-js] Registration success:', enrollID);
		ibc.chaincode.details.peers[index].user = enrollID;								//remember a valid user for this peer
		if(cb) cb(null, data);
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] Register - failure:', enrollID, statusCode);
		if(cb) cb(helper.eFmt('register() error', statusCode, e), null);
	};
	rest.post(options, '', body);
};

//============================================================================================================================
//deploy() - deploy chaincode and call a cc function
//============================================================================================================================
function deploy(func, args, deploy_options, username, cb){
	if(typeof username === 'function'){ 										//if cb is in 2nd param use known username
		cb = username;
		username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
	}
	if(username == null) {														//if username not provided, use known valid one
		username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
	}

	console.log('[ibc-js] Deploying Chaincode - Starting');
	console.log('[ibc-js] \tfunction:', func, ', arg:', args);
	console.log('\n\n\t Waiting...');											//this can take awhile
	var options = {path: '/devops/deploy'};
	var body = 	{
					type: 'GOLANG',
					chaincodeID: {
							path: ibc.chaincode.details.git_url
						},
					ctorMsg:{
							'function': func,
							'args': args
					},
					secureContext: username
				};
	//console.log('!body', body);
	options.success = function(statusCode, data){
		ibc.chaincode.details.deployed_name = data.message;
		ibc.prototype.save(tempDirectory);										//save it so we remember we have deployed
		if(deploy_options.save_path != null) ibc.prototype.save(deploy_options.save_path);					//user wants the updated file somewhere
		if(cb){
			var wait_ms = 40000;												//default wait after deploy, peer may still be starting
			if(deploy_options.delay_ms && Number(deploy_options.delay_ms)) wait_ms = deploy_options.delay_ms;
			console.log('\n\n\t deploy success [waiting another', (wait_ms / 1000) ,'seconds]');
			console.log('deployed name', ibc.chaincode.details.deployed_name);
			
			setTimeout(function(){
				console.log('[ibc-js] Deploying Chaincode - Complete');
				cb(null, data);
			}, wait_ms);														//wait extra long, not always ready yet
		}
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] deploy - failure:', statusCode);
		if(cb) cb(helper.eFmt('deploy() error', statusCode, e), null);
	};
	rest.post(options, '', body);
}

//============================================================================================================================
//heart_beat() - interval function to poll against blockchain height (has fast and slow mode)
//============================================================================================================================
var slow_mode = 10000;
var fast_mode = 500;
function heart_beat(){
	if(ibc.lastPoll + slow_mode < Date.now()){									//slow mode poll
		//console.log('[ibc-js] Its been awhile, time to poll');
		ibc.lastPoll = Date.now();
		ibc.prototype.chain_stats(cb_got_stats);
	}
	else{
		for(var i in ibc.q){
			var elasped = Date.now() - ibc.q[i];
			if(elasped <= 3000){												//fresh unresolved action, fast mode!
				console.log('[ibc-js] Unresolved action, must poll');
				ibc.lastPoll = Date.now();
				ibc.prototype.chain_stats(cb_got_stats);
			}
			else{
				//console.log('[ibc-js] Expired, removing');
				ibc.q.pop();													//expired action, remove it
			}
		}
	}
}

function cb_got_stats(e, stats){
	if(e == null){
		if(stats && stats.height){
			if(ibc.lastBlock != stats.height) {									//this is a new block!
				console.log('[ibc-js] New block!', stats.height);
				ibc.lastBlock  = stats.height;
				ibc.q.pop();													//action is resolved, remove
				if(ibc.monitorFunction) ibc.monitorFunction(stats);				//call the user's callback
			}
		}
	}
}

//============================================================================================================================
// EXTERNAL- monitor_blockheight() - exposed function that user can use to get callback when any new block is written to the chain
//============================================================================================================================
ibc.prototype.monitor_blockheight = function(cb) {								//hook in your own function, triggers when chain grows
	setInterval(function(){heart_beat();}, fast_mode);
	ibc.monitorFunction = cb;													//store it
};

//============================================================================================================================
// EXTERNAL- get_transactions() - exposed function to find a transaction based on its UDID
//============================================================================================================================
ibc.prototype.get_transactions = function(udid, cb) {
	var options = {
		path: '/transactions/' + udid
	};

	options.success = function(statusCode, data){
		console.log('[ibc-js] Get Transaction - success:', data);
		if(cb) cb(null, data);
	};
	options.failure = function(statusCode, e){
		console.log('[ibc-js] Get Transaction - failure:', statusCode);
		if(cb) cb(helper.eFmt('read() error', statusCode, e), null);
	};
	rest.get(options, '');
};

//============================================================================================================================
//													Helper Functions() 
//============================================================================================================================
//build_invoke_func() - create JS function that calls the custom goLang function in the chaincode
//==================================================================
function build_invoke_func(name){
	if(ibc.chaincode.invoke[name] != null){											//skip if already exists
		//console.log('[ibc-js] \t skip, func', name, 'already exists');
	}
	else {
		console.log('[ibc-js] Found cc invoke function: ', name);
		ibc.chaincode.details.func.invoke.push(name);
		ibc.chaincode.invoke[name] = function(args, username, cb){					//create the function in the chaincode obj
			if(typeof username === 'function'){ 									//if cb is in 2nd param use known username
				cb = username;
				username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
			}
			if(username == null) {													//if username not provided, use known valid one
				username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
			}

			var options = {path: '/devops/invoke'};
			var body = {
							chaincodeSpec: {
								type: 'GOLANG',
								chaincodeID: {
									name: ibc.chaincode.details.deployed_name,
								},
								ctorMsg: {
									function: name,
									args: args
								},
								secureContext: username
							}
						};

			options.success = function(statusCode, data){
				console.log('[ibc-js]', name, ' - success:', data);
				ibc.q.push(Date.now());												//new action, add it to queue
				if(cb) cb(null, data);
			};
			options.failure = function(statusCode, e){
				console.log('[ibc-js]', name, ' - failure:', statusCode, e);
				if(cb) cb(helper.eFmt('invoke() error', statusCode, e), null);
			};
			rest.post(options, '', body);
		};
	}
}

//==================================================================
//build_query_func() - create JS function that calls the custom goLang function in the chaincode
//==================================================================
function build_query_func(name){
	if(ibc.chaincode.query[name] != null){											//skip if already exists
		//console.log('[ibc-js] \t skip, func', name, 'already exists');
	}
	else {
		console.log('[ibc-js] Found cc query function: ', name);
		ibc.chaincode.details.func.query.push(name);
		ibc.chaincode.query[name] = function(args, username, cb){					//create the function in the chaincode obj
			if(typeof username === 'function'){ 									//if cb is in 2nd param use known username
				cb = username;
				username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
			}
			if(username == null) {													//if username not provided, use known valid one
				username = ibc.chaincode.details.peers[ibc.selectedPeer].user;
			}

			var options = {path: '/devops/query'};
			var body = {
							chaincodeSpec: {
								type: 'GOLANG',
								chaincodeID: {
									name: ibc.chaincode.details.deployed_name,
								},
								ctorMsg: {
									function: name,
									args: args
								},
								secureContext: username
							}
						};

			options.success = function(statusCode, data){
				console.log('[ibc-js]', name, ' - success:', data);
				ibc.q.push(Date.now());												//new action, add it to queue
				if(cb) cb(null, data);
			};
			options.failure = function(statusCode, e){
				console.log('[ibc-js]', name, ' - failure:', statusCode, e);
				if(cb) cb(helper.eFmt('invoke() error', statusCode, e), null);
			};
			rest.post(options, '', body);
		};
	}
}

module.exports = ibc;