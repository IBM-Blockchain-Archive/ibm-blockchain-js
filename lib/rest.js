'use strict';
/* global Buffer */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved. 
 *
 * Contributors:
 *   David Huffman - Initial implementation
 *******************************************************************************/
/*
	Version: 0.7.3
	Updated: 11/03/2016
	-----------------------------------------------------------------
	Use:	var rest = require('./rest');
			rest.init({quiet: false});						//set default values here for all calls of 'rest'
			var options = {									//set options here for this call (overrides init)
				host: HOST_HERE,
				path: PATH HERE,
				headers: {"Accept": "application/json"}
			};
			rest.get(options, null, function(errCode, response){
				if(errCode != null) logger.log('Get - failure', errCode, response);
				else logger.log('Get - success', response);
			});
			
	-----------------------------------------------------------------
	
	Valid "options" values: (these are default ones that come from requests module)
	-----------------------------------------------------------------
	host: A domain name or IP address of the server to issue the request to. Defaults to 'localhost'.
	hostname: To support url.parse() hostname is preferred over host
	port: Port of remote server. Defaults to 80.
	localAddress: Local interface to bind for network connections.
	socketPath: Unix Domain Socket (use one of host:port or socketPath)
	method: A string specifying the HTTP request method. Defaults to 'GET'.
	path: Request path. Defaults to '/'. Should include query string if any. E.G. '/index.html?page=12'.
			 An exception is thrown when the request path contains illegal characters. Currently, only spaces are rejected but that may change in the future.
	headers: An object containing request headers.
	auth: Basic authentication i.e. 'user:password' to compute an Authorization header.
	agent: Controls Agent behavior. When an Agent is used request will default to Connection: keep-alive. Possible values:
		undefined (default): use global Agent for this host and port.
		Agent object: explicitly use the passed in Agent.
		false: opts out of connection pooling with an Agent, defaults request to Connection: close.
	keepAlive: {Boolean} Keep sockets around in a pool to be used by other requests in the future. Default = false
	keepAliveMsecs: {Integer} When using HTTP KeepAlive, how often to send TCP KeepAlive packets over sockets being kept alive. 
		Default = 1000. Only relevant if keepAlive is set to true.
	
	Plus my "options" values:
	-----------------------------------------------------------------
	quiet: If true will not print to logger. Defaults false.
	tls: Iff false will use http instead of https. Defaults true.
	timeout: Integer in milliseconds to time out requests. Defaults 20,000
	include_headers: If true the response argument will be {"response":<response>, "headers":<headers>} 
*/

var https_mod = require('https');
var http_mod = require('http');
var querystring = require('querystring');
var default_options = 	{
							quiet: false,
							tls: true,
							timeout: 20000,
							include_headers: false
						};
var logger = {log: console.log, error: console.error, debug: console.log, warn: console.log};

//is the obj empty or not
function isEmpty(obj) {
	for(var prop in obj) {
		if(obj.hasOwnProperty(prop))
			return false;
	}
	return true;
}

//merge fields in obj B to obj A only if they don't exist in obj A
function mergeBtoA(b, a){
	for(var i in b){
		if(a[i] === undefined) {
			a[i] = JSON.parse(JSON.stringify(b[i]));
		}
	}
	return a;
}

//main http request builder/handler/thingy
function http_req(options, query_params, body, attempt, cb){
	var acceptJson = false, http, http_txt = '', request = null, formatted_body = null;
	var ids = 'abcdefghijkmnopqrstuvwxyz';
	var id = ids[Math.floor(Math.random() * ids.length)];								//random letter to help id calls when there are multiple rest calls
	var cb_fired = false;
	
	if(!attempt || isNaN(attempt)) attempt = 1;											//defaults to attempt # 1
	options = mergeBtoA(default_options, options);
	
	// ----- Handle Call Back ----- //
	function call_cb(ret){
		if(cb_fired === false){															//only call cb once!
			cb_fired = true;
			if(options.include_headers) ret.msg = {response:ret.msg, headers: ret.headers};
			if(ret.code <= 399 && ret.code !== 302) ret.code = null;
			if(cb) cb(ret.code, ret.msg);												//1st arg is error status code, null if no error code
			return;
		}
	}

	// ---- Pick HTTP vs HTTPS ---- //
	if(options.ssl === false || options.tls === false) {
		http = http_mod;																//if options.tls === false use http
		http_txt = '[http ' + options.method + ' - ' + id + ']';
	}
	else{																				//else use https
		http = https_mod;
		http_txt = '[https ' + options.method + ' - ' + id + ']';
	}

	if(!options.quiet) logger.debug(http_txt + ' ' + options.host + ':' + options.port);
	if(!options.quiet) logger.debug(http_txt + ' ' + options.path);
	
	// ---- Sanitize Inputs ---- //
	if(!options.headers) options.headers = {};
	for(var i in options.headers) {														//convert all header keys to lower-case for easier parsing
		var temp = options.headers[i];
		delete options.headers[i];
		if(temp != null){
			options.headers[i.toLowerCase()] = temp;
		}
	}
	
	if(typeof body === 'object' && body != null){
		options.headers['content-type'] = 'application/json';
		formatted_body = JSON.stringify(body);													//stringify body
	}
	else formatted_body = body;
	
	if(options.headers.accept && options.headers.accept.indexOf('json') >= 0) acceptJson = true;
	if(query_params && typeof query_params === 'object') options.path += '?' + querystring.stringify(query_params);

	if(formatted_body) options.headers['content-length'] = Buffer.byteLength(formatted_body);
	else if(options.headers['content-length']) delete options.headers['content-length'];		//we don't need you

	if(!options.quiet && options.method.toLowerCase() !== 'get') logger.debug('  body:', formatted_body);
		
	// --------- Handle Request --------- //
	request = http.request(options, function(resp) {
		var str = '', chunks = 0;
		if(!options.quiet) logger.debug(http_txt + ' Status code: ' + resp.statusCode);
		
		resp.setEncoding('utf8');
		resp.on('data', function(chunk) {														//merge chunks of request
			str += chunk;
			chunks++;
		});
		resp.on('end', function() {																//wait for end before decision
			var ret = 	{
							code: resp.statusCode,
							headers: resp.headers,
							msg: str
						};

			// --------- Process Response - Debug Msgs --------- //
			if(resp.statusCode == 204){															//empty response, don't parse body
				if(!options.quiet) logger.debug(http_txt + ' Data: No Content');
			}
			else if(resp.statusCode === 302){													//redirect
				if(!options.quiet) logger.error(http_txt + ' Error - got a redirect, not what we want');
			}
			else if(resp.statusCode >= 200 && resp.statusCode <= 399){							//valid status codes
				if(acceptJson){
					try{
						ret.msg = JSON.parse(str);												//all good [json resp]
					}
					catch(e){
						if(!options.quiet) logger.error(http_txt + ' Error - response is not JSON: ', str);
						ret.code = 500;
						ret.msg = 'Invalid JSON response: ' + str;
					}
				}
				else {																			//all good [not json resp]
					if(!options.quiet) logger.debug(http_txt + ' Data:', str);
				}
			}
			else {																				//invalid status codes
				if(!options.quiet) logger.error(http_txt + ' Error - status code: ' + resp.statusCode, str);
				if(acceptJson){
					try{
						ret.msg = JSON.parse(str);												//attempt to parse error for JSON
					}
					catch(e){}
				}
			}

			// --------- Call CallBack --------- //
			return call_cb(ret);
		});
	});
	
	// --------- Handle Request Errors --------- //
	request.on('error', function(e) {															//handle error event
		if(e.code === 'ECONNRESET' && attempt <= 3) {											//try ECONNRESETs again
			if(cb_fired === false){
			logger.warn(http_txt + ' Warning - detected ECONNRESET, will try HTTP req again. attempt:' + attempt);
			attempt++;
				cb_fired = true;																	//set this just in case
				setTimeout(function(){ http_req(options, query_params, body, attempt, cb); }, 250 * Math.pow(2, attempt+1));
			}
			return;
		}
		else {
			if(!options.quiet) logger.error(http_txt + ' Error - unknown issue with request: ', e);//catch failed request (failed DNS lookup and such)
			return call_cb({code: 500, headers: null, msg: e});
		}
	});
	
	// --------- Handle Request Timeouts --------- //
	request.setTimeout(Number(options.timeout) || default_options.timeout);
	request.on('timeout', function(){															//handle time out events
		if(!options.quiet) logger.error(http_txt + ' Error - request timed out');
		return call_cb({code: 408, headers: null, msg: 'Request timed out'});
	});
	
	// ----- Body ----- //
	if(formatted_body && formatted_body !== '' && !isEmpty(formatted_body)){
		request.write(formatted_body);
	}
	request.end();																				//send the request
}

//load new default option values
module.exports.init = function(opt, log_outputs){
	for(var i in opt){
		default_options[i] = JSON.parse(JSON.stringify(opt[i]));
	}
	
	if(log_outputs && log_outputs.info) logger.log = log_outputs.info;		//send normal logs here
	if(log_outputs && log_outputs.error) logger.error = log_outputs.error;	//send error logs here
	if(log_outputs && log_outputs.warn) logger.warn = log_outputs.warn;		//send warn logs here
	if(log_outputs && log_outputs.debug) logger.debug = log_outputs.debug;	//send debug logs here
};

//http post
module.exports.post = function (l_options, query_params, body, cb){
	l_options.method = 'POST';
	http_req(l_options, query_params, body, 1 , cb);
};

//http put
module.exports.put = function (l_options, query_params, body, cb){
	l_options.method = 'PUT';
	http_req(l_options, query_params, body, 1 , cb);
};

//http delete
module.exports.delete = function (l_options, query_params, body, cb){
	l_options.method = 'DELETE';
	http_req(l_options, query_params, body, 1 , cb);
};

//http get
module.exports.get = function (l_options, query_params, cb){
	l_options.method = 'GET';
	http_req(l_options, query_params, null, 1 , cb);
};

//http head
module.exports.head = function (l_options, query_params, cb){
	l_options.method = 'HEAD';
	http_req(l_options, query_params, null, 1 , cb);
};
