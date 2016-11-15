'use strict';
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2016 IBM Corp.
 *
 * All rights reserved.
 *
 *******************************************************************************/
 
//Load modules
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var async = require('async');
var rest = require(__dirname + '/lib/rest.js');
var helper = require(__dirname + '/lib/helper.js');
var AdmZip = require('adm-zip');
var logger = {log: console.log, error: console.error, debug: console.log, warn: console.log};

function ibc(log_outputs) {
	if(log_outputs && log_outputs.info) logger.log = log_outputs.info;		//send normal logs here
	if(log_outputs && log_outputs.error) logger.error = log_outputs.error;	//send error logs here
	if(log_outputs && log_outputs.warn) logger.warn = log_outputs.warn;		//send warn logs here
	if(log_outputs && log_outputs.debug) logger.debug = log_outputs.debug;	//send debug logs here
}
ibc.chaincode = {
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
		options: {},
		peers: [],
		timestamp: 0,
		users: [],
		unzip_dir: '',
		version: '',
		zip_url: '',
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
		logger.error('! [ibc-js] Input Error - ibc.load()', errors);
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
								options: options.network.options,
								peers: [],
								timestamp: 0,
								users: [],
								unzip_dir: '',
								version: '',
								zip_url: '',
					}
				};

	// Step 1
	ibc.prototype.network(options.network.peers, options.network.options);

	// Step 2 - optional - only for secure networks
	if(options.network.users && options.network.users.length > 0){
		ibc.chaincode.details.users = options.network.users;
		var arr = [];
		for(var i in ibc.chaincode.details.peers){
			arr.push(i);															//build the list of indexes
		}
		async.each(arr, function(i, a_cb) {
			if(options.network.users[i]){											//make sure we still have a enrollId for this network
				var maxRetry = 2;
				if(options.network.options && options.network.options.maxRetry) maxRetry = options.network.options.maxRetry;
				ibc.prototype.register(i, options.network.users[i].enrollId, options.network.users[i].enrollSecret, maxRetry, a_cb);
			}
			else a_cb();
		}, function(err, data){
			if(err && cb) return cb(err);											//error already formated
			else load_cc();
		});
	}
	else{
		ibc.chaincode.details.users = [];
		logger.log('[ibc-js] No membership users found, assuming this is a network w/o membership');
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
//		2a. Find what shim version
// 		2b. Find the boundaries for Invoke() in the cc
//			2c. Grab function names that need to be exported
//			2d. Create JS invoke functions for golang functions
// 		2e. Find the boundaries for Query() in the cc
//			2f. Grab function names that need to be exported
//			2g. Create JS query functions for golang functions
// 		2h. Find the boundaries for Init() in the cc
//			2i. Record function names that need to be exported
// 3. Call callback()
// ============================================================================================================================
ibc.prototype.load_chaincode = function(options, cb) {
	var errors = [];
	if(!options.zip_url) errors.push('the option "zip_url" is required');
	if(!options.unzip_dir) errors.push('the option "unzip_dir" is required');
	if(!options.git_url) errors.push('the option "git_url" is required');
	if(errors.length > 0){																//check for input errors
		logger.error('! [ibc-js] Input Error - ibc.load_chaincode()', errors);
		if(cb) cb(helper.eFmt('load_chaincode() input error', 400, errors));
		return;																			//get out of dodge
	}

	var go_funcs = [], cc_suspects = [], cc_invocations = [], cc_queries = [], cc_inits = [];
	var found_query = false, found_invoke = false;
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
				logger.log('[ibc-js] Found chaincode in local file system');
				fs.readdir(unzip_cc_dest, cb_got_names);								//yeppers, go use it
			}
		}
	}

	// Step 0.
	function download_it(download_url){
		logger.log('[ibc-js] Downloading zip');
		var file = fs.createWriteStream(zip_dest);
		var handleResponse = function(response) {										//download a .zip of the repo
			response.pipe(file);
			file.on('finish', function() {
				if(response.headers.status === '302 Found'){
					logger.log('redirect...', response.headers.location);
					file.close();
					download_it(response.headers.location);
				}
				else{
					file.close(cb_downloaded);  										//close() is async
				}
			});
		};
		var handleError = function(err) {
			logger.error('! [ibc-js] Download error');
			fs.unlink(zip_dest); 														//delete the file async
			if (cb) cb(helper.eFmt('doad_chaincode() download error', 500, err.message), ibc.chaincode);
		};

		var protocol = download_url.split('://')[0];
		if(protocol === 'https') {														//choose http or https
			https.get(download_url, handleResponse).on('error', handleError);
		}
		else{
			http.get(download_url, handleResponse).on('error', handleError);
		}
	}

	// Step 1.
	function cb_downloaded(){
		logger.log('[ibc-js] Unzipping zip');
		try{
			var zip = new AdmZip(zip_dest);												//unzip the zip we downloaded
			zip.extractAllTo(unzip_dest, /*overwrite*/true);
		}
		catch (err){
			return cb(helper.eFmt('download repo error', 400, err), null);
		}
		logger.log('[ibc-js] Unzip done');
		fs.readdir(unzip_cc_dest, cb_got_names);
		fs.unlink(zip_dest, function(err) {});											//remove zip file, never used again
	}

	// Step 2.
	function cb_got_names(err, obj){
		logger.log('[ibc-js] Scanning files', obj);
		var foundGo = false;
		if(err != null) logger.log('! [ibc-js] fs readdir Error', err);
		else{
			for(var i in obj){
				if(obj[i].indexOf('.go') >= 0){											//look for GoLang files
					if(!found_invoke || !found_query){
						foundGo = true;
						var file = fs.readFileSync(path.join(unzip_cc_dest, obj[i]), 'utf8');
						
						// Step 2a.
						ibc.chaincode.details.version = find_shim(file);
						if(ibc.chaincode.details.version !== ''){						//we can't search for functions until we identify the shim version
							parse_for_invoke(obj[i], file);
							parse_for_query(obj[i], file);
							parse_for_init(obj[i], file);
						}
					}
				}
			}
		}
		
		// done - look for errors/warnings
		var msg = '';
		if(!foundGo){																	//error no go files
			msg = 'did not find any *.go files, cannot continue';
			logger.error('! [ibc-js] Error - ', msg);
			if(cb) return cb(helper.eFmt('load_chaincode() no chaincode', 400, msg), null);
		}
		else{
			
			if(!found_invoke){															//warning no run/invoke functions
				logger.warn('! [ibc-js] Warning - did not find any invoke functions in chaincode\'s "Invoke()", building a generic "invoke"');
				build_invoke_func('invoke');											//this will make chaincode.invoke.invokce(args)
			}
			
			if(!found_query){															//warning no query functions
				logger.warn('! [ibc-js] Warning - did not find any query functions in chaincode\'s "Query()", building a generic "query"');
				build_query_func('query');												//this will make chaincode.query.query(args)
			}

			// Step 3.																	success!
			logger.log('[ibc-js] load_chaincode() finished');
			ibc.chaincode.details.timestamp = Date.now();
			ibc.chaincode.deploy = deploy;
			if(cb) return cb(null, ibc.chaincode);										//all done, send it to callback
		}
	}
	
	//regex to find the shim version for this chaincode
	function find_shim(file){
		var ret = '';
		if(file == null) logger.error('! [ibc-js] fs readfile Error');
		else{
			logger.log('[ibc-js] Parsing file for shim version');
			
			var shim_regex = /github.com\/\S+\/shim/g;									//find chaincode's shim version
			var result = file.match(shim_regex);
			if(result[0]){
				logger.log('[ibc-js] Found shim version:', result[0]);
				ret = result[0];
			}
		}
		return ret;
	}

	//look for Invokes
	function parse_for_invoke(name, str){
		if(str == null) logger.error('! [ibc-js] fs readfile Error');
		else{
			logger.log('[ibc-js] Parsing file for invoke functions -', name);
			
			// Step 2a.
			var go_func_regex = /func\s+\(\w+\s+\*SimpleChaincode\)\s+(\w+)/g;			//find chaincode's go lang functions
			var result;
			while ( (result = go_func_regex.exec(str)) ) {
				go_funcs.push({name: result[1], pos: result.index});
			}
			var i_start = 0;
			var i_stop = 0;
			var invokeFunctionName = 'Run';												//use Run for obc peer adn Invoke for hyperledger
			if(ibc.chaincode.details.version.indexOf('hyperledger/fabric/core/chaincode/shim') >= 0) invokeFunctionName = 'Invoke';
			
			for(var i in go_funcs){
				if(go_funcs[i].name === invokeFunctionName){
					i_start = go_funcs[i].pos;											//find start and stop positions around the "Invoke()" function
					if(go_funcs[Number(i) + 1] == null) i_stop = i_start * 2;			//invoke is the last function.. so uhhhh just make up a high number
					else i_stop = go_funcs[Number(i) + 1].pos;
					break;
				}
			}
			
			if(i_start > 0 && i_stop > 0){
				// Step 2c.
				var regex = /function\s+.=\s+["'](\w+)["']/g;							//find the exposed chaincode functions in "Invoke()""
				var result2;
				while ( (result2 = regex.exec(str)) ) {
					cc_suspects.push({name: result2[1], index: result2.index});			//store this for future parsing like query & init
					if(result2.index > i_start && result2.index < i_stop){				//make sure its inside Invoke()
						cc_invocations.push(result2[1]);								//build a list of function names
					}
				}
			
				if(cc_invocations.length > 0){
					found_invoke = true;
				
					// Step 2d.
					ibc.chaincode.details.func.invoke = [];
					for(i in cc_invocations){											//build the rest call for each function
						build_invoke_func(cc_invocations[i]);
					}
				}
			}
		}
	}
	
	//look for Queries
	function parse_for_query(name, str){
		if(str == null) logger.error('! [ibc-js] fs readfile Error');
		else{
			logger.log('[ibc-js] Parsing file for query functions -', name);
			
			// Step 2e.
			var q_start = 0;
			var q_stop = 0;
			for(var i in go_funcs){
				if(go_funcs[i].name === 'Query'){
					q_start = go_funcs[i].pos;											//find start and stop positions around the "Query()" function
					if(go_funcs[Number(i) + 1] == null) q_stop = q_start * 2;			//query is the last function.. so uhhhh just make up a high number
					else q_stop = go_funcs[Number(i) + 1].pos;
					break;
				}
			}
			
			if(q_start > 0 && q_stop > 0){
				// Step 2f.
				for(i in cc_suspects){
					if(cc_suspects[i].index > q_start && cc_suspects[i].index < q_stop){//make sure its inside Query()
						cc_queries.push(cc_suspects[i].name);							//build a list of function names
					}
				}
			
				if(cc_queries.length > 0){
					found_query = true;
				
					// Step 2g.
					ibc.chaincode.details.func.query = [];
					for(i in cc_queries){												//build the rest call for each function
						build_query_func(cc_queries[i]);
					}
				}
			}
		}
	}
	
	//look for Inits
	function parse_for_init(name, str){
		if(str == null) logger.error('! [ibc-js] fs readfile Error');
		else{
			//logger.log('[ibc-js] Parsing file for init functions -', name);
			
			// Step 2h.
			var q_start = 0;
			var q_stop = 0;
			for(var i in go_funcs){
				if(go_funcs[i].name === 'Init'){
					q_start = go_funcs[i].pos;											//find start and stop positions around the "Init()" function
					if(go_funcs[Number(i) + 1] == null) q_stop = q_start * 2;			//init is the last function.. so uhhhh just make up a high number
					else q_stop = go_funcs[Number(i) + 1].pos;
					break;
				}
			}
			
			if(q_start > 0 && q_stop > 0){
				for(i in cc_suspects){
					if(cc_suspects[i].index > q_start && cc_suspects[i].index < q_stop){//make sure its inside Init()
						cc_inits.push(cc_suspects[i].name);								//build a list of function names
					}
				}
			
				if(cc_inits.length > 0){
				
					// Step 2i.
					ibc.chaincode.details.func.init = [];
					for(i in cc_inits){													//no rest call to build, just remember it in 'details'
						ibc.chaincode.details.func.init.push(name);
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
	ibc.chaincode.details.options = {quiet: true, timeout: 60000, tls: true};			//defaults
	
	if(!arrayPeers || arrayPeers.constructor !== Array) errors.push('network input arg should be array of peer objects');
	
	if(options){
		if(options.quiet === true || options.quiet === false) ibc.chaincode.details.options.quiet = options.quiet;	//optional fields
		if(!isNaN(options.timeout)) ibc.chaincode.details.options.timeout = Number(options.timeout);
		if(options.tls === true || options.tls === false) ibc.chaincode.details.options.tls = options.tls;
	}
	
	for(var i in arrayPeers){															//check for errors in peers input obj
		if(!arrayPeers[i].id) 		errors.push('peer ' + i + ' is missing the field id');
		if(!arrayPeers[i].api_host) errors.push('peer ' + i + ' is missing the field api_host');
		if(options && options.tls === false){
			if(!arrayPeers[i].api_port) errors.push('peer ' + i + ' is missing the field api_port');
		}
		else{
			if(!arrayPeers[i].api_port_tls) errors.push('peer ' + i + ' is missing the field api_port_tls');
		}
	}

	if(errors.length > 0){																//check for input errors
		logger.error('! [ibc-js] Input Error - ibc.network()', errors);
	}
	else{
		ibc.chaincode.details.peers = [];
		for(i in arrayPeers){
			var pos = arrayPeers[i].id.indexOf('_') + 1;
			var temp = 	{
							name: arrayPeers[i].id.substring(pos) + '-' + arrayPeers[i].id.substring(0, 12) + '...:' + arrayPeers[i].api_port_tls,
							api_host: arrayPeers[i].api_host,
							api_port: arrayPeers[i].api_port,
							api_port_tls:  arrayPeers[i].api_port_tls,
							id: arrayPeers[i].id,
							tls: ibc.chaincode.details.options.tls
						};
			if(options && options.tls === false){										//if not tls rebuild a few things
				temp.name = arrayPeers[i].id.substring(pos) + '-' + arrayPeers[i].id.substring(0, 12) + '...:' + arrayPeers[i].api_port;
			}
	
			logger.log('[ibc-js] Peer: ', temp.name);									//print the friendly name
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
					timeout: ibc.chaincode.details.options.timeout,
					quiet: ibc.chaincode.details.options.quiet
		}, logger);
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
					timeout: ibc.chaincode.details.options.timeout,
					quiet: ibc.chaincode.details.options.quiet
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
		logger.error('[ibc-js] Input Error - ibc.save()', errors);
		if(cb) cb(helper.eFmt('save() input error', 400, errors));
	}
	else{
		var fn = 'chaincode.json';														//default name
		if(ibc.chaincode.details.deployed_name) fn = ibc.chaincode.details.deployed_name + '.json';
		var dest = path.join(dir, fn);
		fs.writeFile(dest, JSON.stringify({details: ibc.chaincode.details}), function(e){
			if(e != null){
				logger.warn('[ibc-js] ibc.save() warning', e);
				if(cb) cb(helper.eFmt('save() fs write error', 500, e), null);
			}
			else {
				if(cb) cb(null, null);
			}
		});
	}
};

// ============================================================================================================================
// EXTERNAL - clear() - clear the temp directory
// ============================================================================================================================
ibc.prototype.clear =  function(cb){
	logger.log('[ibc-js] removing temp dir');
	helper.removeThing(tempDirectory, cb);											//remove everything in this directory
};

//============================================================================================================================
// EXTERNAL chain_stats() - get blockchain stats
//============================================================================================================================
ibc.prototype.chain_stats =  function(cb){
	var options = {path: '/chain'};													//very simple API, get chainstats!

	rest.get(options, null, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] Chain Stats - failure:', statusCode, data);
			if(cb) cb(helper.eFmt('chain_stats() error', statusCode, data), null);
		}
		else{
			logger.log('[ibc-js] Chain Stats - success');
			if(cb) cb(null, data);
		}
	});
};

//============================================================================================================================
// EXTERNAL block_stats() - get block meta data
//============================================================================================================================
ibc.prototype.block_stats =  function(id, cb){
	var options = {path: '/chain/blocks/' + id};									//i think block IDs start at 0, height starts at 1, fyi

	rest.get(options, null, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] Block Stats ', id , '- failure:', statusCode);
			if(cb) cb(helper.eFmt('block_stats() error', statusCode, data), null);
		}
		else{
			logger.log('[ibc-js] Block Stats ', id , '- success');
			if(cb) cb(null, data);
		}
	});
};

//============================================================================================================================
//read() - read generic variable from chaincode state - ! [legacy. do not use it anymore 4/1/2016]
//============================================================================================================================
function read(args, enrollId, cb){
	if(typeof enrollId === 'function'){ 											//if cb is in 2nd param use known enrollId
		cb = enrollId;
		enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
	}
	if(enrollId == null) {															//if enrollId not provided, use known valid one
		enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
	}

	var options = {path: '/chaincode'};
	var body = {
				jsonrpc: '2.0',
				method: 'query',
				params: {
					type: 1,
					chaincodeID:{
						name: ibc.chaincode.details.deployed_name
					},
					ctorMsg: {
						function: 'query',
						args: args
					},
					secureContext: enrollId
				},
				id: Date.now()
	};

	rest.post(options, null, body, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] (Read) - failure:', statusCode);
			if(cb) cb(helper.eFmt('read() error', statusCode, data), null);
		}
		else{
			logger.log('[ibc-js] (Read) - success:', data);
			if(cb){
				if(data.error) cb(helper.eFmt('query() resp error', 400, data.error), null);
				else if(data.result) cb(null, data.result.message);
				else cb(null, data.OK);
			}
		}
	});
}

//============================================================================================================================
// EXTERNAL - register() - register a enrollId with a peer (only for a blockchain network with membership)
//============================================================================================================================
ibc.prototype.register = function(index, enrollId, enrollSecret, maxRetry, cb) {
	register(index, enrollId, enrollSecret, maxRetry, 1, cb);
};

function register(index, enrollId, enrollSecret, maxRetry, attempt, cb){
	logger.log('[ibc-js] Registering ', ibc.chaincode.details.peers[index].name, ' w/enrollId - ' + enrollId);
	var options = {
		path: '/registrar',
		host: ibc.chaincode.details.peers[index].api_host,
		port: pick_port(index),
		ssl: ibc.chaincode.details.peers[index].tls
	};

	var body = 	{
					enrollId: enrollId,
					enrollSecret: enrollSecret
				};
	rest.post(options, null, body, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] Register - failure x' + attempt + ' :', enrollId, statusCode);
			if(attempt <= maxRetry){													//lets try again after a short delay, maybe the peer is still starting
				logger.log('[ibc-js] \tgoing to try to register again in 30 secs');
				setTimeout(function(){register(index, enrollId, enrollSecret, maxRetry, ++attempt, cb);}, 30000);
			}
			else{
				if(cb) cb(helper.eFmt('register() error', statusCode, data), null);		//give up
			}
		}
		else {
			logger.log('[ibc-js] Registration success x' + attempt + ' :', enrollId);
			ibc.chaincode.details.peers[index].enrollId = enrollId;						//remember a valid enrollId for this peer
			if(cb) cb(null, data);
		}
	});
}

//============================================================================================================================
// EXTERNAL - unregister() - unregister a enrollId from a peer (only for a blockchain network with membership), enrollId can no longer make transactions
//============================================================================================================================
ibc.prototype.unregister = function(index, enrollId, cb) {
	logger.log('[ibc-js] Unregistering ', ibc.chaincode.details.peers[index].name, ' w/enrollId - ' + enrollId);
	var options = {
		path: '/registrar/' + enrollId,
		host: ibc.chaincode.details.peers[index].api_host,
		port: pick_port(index),
		ssl: ibc.chaincode.details.peers[index].tls
	};

	rest.delete(options, null, null, function(statusCode, data){
		if(statusCode != null){
			logger.log('[ibc-js] Unregistering - failure:', enrollId, statusCode);
			if(cb) cb(helper.eFmt('unregister() error', statusCode, data), null);
		}
		else {
			logger.log('[ibc-js] Unregistering success:', enrollId);
			ibc.chaincode.details.peers[index].enrollId = null;								//unremember a valid enrollId for this peer
			if(cb) cb(null, data);
		}
	});
};

//============================================================================================================================
// EXTERNAL - check_register() - check if a enrollId is registered or not with a peer
//============================================================================================================================
ibc.prototype.check_register = function(index, enrollId, cb) {
	logger.log('[ibc-js] Checking ', ibc.chaincode.details.peers[index].name, ' w/enrollId - ' + enrollId);
	var options = {
		path: '/registrar/' + enrollId,
		host: ibc.chaincode.details.peers[index].api_host,
		port: pick_port(index),
		ssl: ibc.chaincode.details.peers[index].tls
	};

	rest.get(options, null, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] Check Register - failure:', enrollId, statusCode);
			if(cb) cb(helper.eFmt('check_register() error', statusCode, data), null);
		}
		else{
			logger.log('[ibc-js] Check Register success:', enrollId);
			if(cb) cb(null, data);
		}
	});
};

//============================================================================================================================
//deploy() - deploy chaincode and call a cc function
//============================================================================================================================
function deploy(func, args, deploy_options, enrollId, cb){
	if(typeof enrollId === 'function'){ 											//if cb is in 2nd param use known enrollId
		cb = enrollId;
		enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
	}
	if(enrollId == null) {															//if enrollId not provided, use known valid one
		enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
	}

	logger.log('[ibc-js] Deploy Chaincode - Starting');
	logger.log('[ibc-js] \tfunction:', func, ', arg:', args);
	logger.log('\n\n\t Waiting...');												//this can take awhile
	
	var options = {}, body = {};
	options = {path: '/chaincode'};
	body = 	{
		jsonrpc: '2.0',
		method: 'deploy',
		params: {
			type: 1,
			chaincodeID:{
				path: ibc.chaincode.details.git_url
			},
			ctorMsg: {
				function: func,
				args: args
			},
			secureContext: enrollId
		},
		id: Date.now()
	};

	rest.post(options, null, body, function(statusCode, data){
		// ---- Failure ---- ///
		if(statusCode != null){
			logger.error('[ibc-js] deploy - failure:', statusCode);
			if(cb) cb(helper.eFmt('deploy() error', statusCode, data), null);
		}

		// ---- Success ---- //
		else{
			if(data.result && ibc.chaincode.details.version.indexOf('hyperledger/fabric/core/chaincode/shim') >= 0){//hyperledger response
				ibc.chaincode.details.deployed_name = data.result.message;
			}
			else ibc.chaincode.details.deployed_name = data.message;					//obc-peer response
			
			if(!ibc.chaincode.details.deployed_name || ibc.chaincode.details.deployed_name.length < 32){
				ibc.chaincode.details.deployed_name = '';								//doesnt look right, let code below catch error
			}

			if(ibc.chaincode.details.deployed_name === ''){
				logger.error('\n\n\t deploy resp error - there is no chaincode hash name in response:', data);
				if(cb) cb(helper.eFmt('deploy() error no cc name', 502, data), null);
			}
			else{
				ibc.prototype.save(tempDirectory);										//save it to known place so we remember the cc name
				if(deploy_options && deploy_options.save_path != null) {				//save it to custom route
					ibc.prototype.save(deploy_options.save_path);
				}
				
				if(cb){
					var wait_ms = 45000;												//default wait after deploy, peer may still be starting
					if(deploy_options && deploy_options.delay_ms && Number(deploy_options.delay_ms)) wait_ms = deploy_options.delay_ms;
					logger.log('\n\n\t deploy success [waiting another', (wait_ms / 1000) ,'seconds]');
					logger.log('\t', ibc.chaincode.details.deployed_name, '\n');
					
					setTimeout(function(){
						logger.log('[ibc-js] Deploy Chaincode - Complete');
						cb(null, data);
					}, wait_ms);														//wait extra long, not always ready yet
				}
			}
		}
	});
}

//============================================================================================================================
//heart_beat() - interval function to poll against blockchain height (has fast and slow mode)
//============================================================================================================================
var slow_mode = 10000;
var fast_mode = 500;
function heart_beat(){
	if(ibc.lastPoll + slow_mode < Date.now()){									//slow mode poll
		//logger.log('[ibc-js] Its been awhile, time to poll');
		ibc.lastPoll = Date.now();
		ibc.prototype.chain_stats(cb_got_stats);
	}
	else{
		for(var i in ibc.q){
			var elasped = Date.now() - ibc.q[i];
			if(elasped <= 3000){												//fresh unresolved action, fast mode!
				logger.log('[ibc-js] Unresolved action, must poll');
				ibc.lastPoll = Date.now();
				ibc.prototype.chain_stats(cb_got_stats);
			}
			else{
				//logger.log('[ibc-js] Expired, removing');
				ibc.q.pop();													//expired action, remove it
			}
		}
	}
}

function cb_got_stats(e, stats){
	if(e == null){
		if(stats && stats.height){
			if(ibc.lastBlock != stats.height) {									//this is a new block!
				logger.log('[ibc-js] New block!', stats.height);
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
// EXTERNAL- get_transaction() - exposed function to find a transaction based on its UDID
//============================================================================================================================
ibc.prototype.get_transaction = function(udid, cb) {
	var options = {
		path: '/transactions/' + udid
	};

	rest.get(options, null, function(statusCode, data){
		if(statusCode != null){
			logger.error('[ibc-js] Get Transaction - failure:', statusCode);
			if(cb) cb(helper.eFmt('read() error', statusCode, data), null);
		}
		else{
			logger.log('[ibc-js] Get Transaction - success:', data);
			if(cb) cb(null, data);
		}
	});
};

//============================================================================================================================
//													Helper Functions() 
//============================================================================================================================
//build_invoke_func() - create JS function that calls the custom goLang function in the chaincode
//==================================================================
function build_invoke_func(name){
	if(ibc.chaincode.invoke[name] != null){											//skip if already exists
		//logger.log('[ibc-js] \t skip, func', name, 'already exists');
	}
	else {
		logger.log('[ibc-js] Found cc invoke function: ', name);
		ibc.chaincode.details.func.invoke.push(name);
		ibc.chaincode.invoke[name] = function(args, enrollId, cb){					//create the function in the chaincode obj
			if(typeof enrollId === 'function'){ 									//if cb is in 2nd param use known enrollId
				cb = enrollId;
				enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
			}
			if(enrollId == null) {													//if enrollId not provided, use known valid one
				enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
			}

			var options = {}, body = {};
			options = {path: '/chaincode'};
			body = {
				jsonrpc: '2.0',
				method: 'invoke',
				params: {
					type: 1,
					chaincodeID:{
						name: ibc.chaincode.details.deployed_name
					},
					ctorMsg: {
						function: name,
						args: args
					},
					secureContext: enrollId
				},
				id: Date.now()
			};
			rest.post(options, null, body, function(statusCode, data){
				if(statusCode != null){
					logger.error('[ibc-js]', name, ' - failure:', statusCode, data);
					if(cb) cb(helper.eFmt('invoke() error', statusCode, data), null);
				}
				else{
					logger.log('[ibc-js]', name, ' - success:', data);
					ibc.q.push(Date.now());												//new action, add it to queue
					if(cb) cb(null, data);
				}
			});
		};
	}
}

//==================================================================
//build_query_func() - create JS function that calls the custom goLang function in the chaincode
//==================================================================
function build_query_func(name){
	if(ibc.chaincode.query[name] != null && name !== 'read'){						//skip if already exists
		//logger.log('[ibc-js] \t skip, func', name, 'already exists');
	}
	else {
		logger.log('[ibc-js] Found cc query function: ', name);
		ibc.chaincode.details.func.query.push(name);
		ibc.chaincode.query[name] = function(args, enrollId, cb){					//create the function in the chaincode obj
			if(typeof enrollId === 'function'){ 									//if cb is in 2nd param use known enrollId
				cb = enrollId;
				enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
			}
			if(enrollId == null) {													//if enrollId not provided, use known valid one
				enrollId = ibc.chaincode.details.peers[ibc.selectedPeer].enrollId;
			}
			
			var options = {}, body = {};

			options = {path: '/chaincode'};
			body = {
				jsonrpc: '2.0',
				method: 'query',
				params: {
					type: 1,
					chaincodeID:{
						name: ibc.chaincode.details.deployed_name
					},
					ctorMsg: {
						function: name,
						args: args
					},
					secureContext: enrollId
				},
				id: Date.now()
			};
			
			rest.post(options, null, body, function(statusCode, data){
				if(statusCode != null){
					logger.error('[ibc-js]', name, ' - failure:', statusCode, data);
					if(cb) cb(helper.eFmt('query() error', statusCode, data), null);
				}
				else{
					logger.log('[ibc-js]', name, ' - success:', data);
					if(cb){
						if(data){
							if(data.error) cb(helper.eFmt('query() resp error', 400, data.error), null);
							else if(data.result) cb(null, data.result.message);
							else cb(null, data.OK);
						}
						else cb(helper.eFmt('query() resp error', 502, data), null);		//something is wrong, response is not what we expect
					}
				}
			});
		};
	}
}

module.exports = ibc;
