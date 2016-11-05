*Are you looking for the Marbles app demo?  That’s not here, head to the [marbles example](https://github.com/IBM-Blockchain/marbles)* 

# ibm-blockchain-js
This is a Node.js library for REST based interaction with [Hyperledger](https://github.com/hyperledger/fabric) [chaincode](https://github.com/hyperledger/fabric/blob/master/docs/FAQ/chaincode_FAQ.md/). 
All `ibm-blockchain-js` documentation is on this page.

*7/22 Update! there is a new gRPC based SDK called [HFC](https://github.com/hyperledger/fabric/tree/master/sdk/node). I will continue to maintain this SDK for as long as REST exists.*

Table Of Contents:

1. [v1.0.0 Migration!](#migrate)
1. [IBC-js Function Documentation](#ibcjs)
1. [Chaincode Functions](#ccfunc)
1. [Object Formats](#formats)
1. [Chaincode Summary File](#ccsf)
1. [FAQ](#faq)

***

## Installation

```
npm install ibm-blockchain-js
```

***

## Usage Steps!
(example code also provided below)

1. Require this module
1. Pass network + chaincode parameters to ibc.load(options, my_cb):
1. Receive chaincode object from callback to ibc.load(). ie: my_cb(e, chaincode)
1. You can now deploy your chaincode (if needed) with chaincode.deploy(func, args, null, cb)
1. Use dot notation on chaincode to call any of your chaincode functions ie:

```js
		// The functions below need to exist in your actual chaincode GoLang file(s) 
		chaincode.query.read(['a'], cb);              //will read variable "a" from current chaincode state
		chaincode.invoke.write(['a', 'test'], cb);    //will write to variable "a"
		chaincode.invoke.remove(['a'], cb);           //will delete variable "a"
		chaincode.invoke.init_marbles([ARGS], cb);    //calls my custom chaincode function init_marbles() and passes it ARGS
```

## Example

```js
	// Step 1 ==================================
	var Ibc1 = require('ibm-blockchain-js');
	var ibc = new Ibc1(/*logger*/);             //you can pass a logger such as winston here - optional
	var chaincode = {};

	// ==================================
	// configure ibc-js sdk
	// ==================================
	var options = 	{
		network:{
			peers:   [{
				"api_host": "xxx.xxx.xxx.xxx",
				"api_port": xxx,
				"api_port_tls": xxx,
				"id": "xxxxxx-xxxx-xxx-xxx-xxxxxxxxxxxx_vpx"
			}],
			users:  [{
				"enrollId": "user1",
				"enrollSecret": "xxxxxxxx"
			}],
			options: {							//this is optional
				quiet: true, 
				timeout: 60000
			}
		},
		chaincode:{
			zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
			unzip_dir: 'marbles-chaincode-master/part2_v1.0.0',
			git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2_v1.0.0'
		}
	};
	
	// Step 2 ==================================
	ibc.load(options, cb_ready);

	// Step 3 ==================================
	function cb_ready(err, cc){								//response has chaincode functions
		app1.setup(ibc, cc);
		app2.setup(ibc, cc);
	
	// Step 4 ==================================
		if(cc.details.deployed_name === ""){				//decide if I need to deploy or not
			cc.deploy('init', ['99'], null, cb_deployed);
		}
		else{
			console.log('chaincode summary file indicates chaincode has been previously deployed');
			cb_deployed();
		}
	}

	// Step 5 ==================================
	function cb_deployed(err){
		console.log('sdk has deployed code and waited');
		chaincode.query.read(['a']);
	}
```
	
	
***
## <a name="migrate"></a>Migrating from v0.0.x to v1.x.x
The interface to your chaincode functions has changed in v1.0.0 from v0.0.13! 
It is only a minor syntax change that should make it more clear to newcomers. 
All invocation functions can now be found under `chaincode.invoke` and all query functions can be found under `chaincode.query`.

Examples:

**query changes** - name change
```js
	//old code
	chaincode.read('a');
	
	//new code 
	chaincode.query.read(['a']);
```

**invoke changes** - name change
```js
	//old code
	chaincode.init_marble(args);
	chaincode.remove(args);
	chaincode.write(name, value);
	
	//new code 
	chaincode.invoke.init_marble(args);
	chaincode.invoke.remove(args);
	chaincode.invoke.write(args);
```

**deploy changes** - added options parameter
```js
	//old code
	chaincode.deploy('init', ['99'], './cc_summaries', cb_deployed);
	
	//new code 
	chaincode.deploy('init', ['99'], {save_path: './cc_summaries', delay_ms: 60000}, cb_deployed);
```

**register changes** - added new parameter
```js
	//old code
	ibc.register(i, enrollId, enrollSecret, [callback]);
	
	//new code 
	ibc.register(i, enrollId, enrollSecret, maxRetry, [callback]);

```

***

## <a name="ibcjs"></a>IBM-Blockchain-JS Documentation
### Usage

Example with standard console logging:
```js
	var Ibc1 = require('ibm-blockchain-js');
	var ibc = new Ibc1();
```

Example with [Winston](https://www.npmjs.com/package/winston) logging:
```js
	var winston = require('winston');
	var logger = new (winston.Logger)({
		transports: [
		new (winston.transports.Console)(),
		new (winston.transports.File)({ filename: 'somefile.log' })
		]
	});
	var Ibc1 = require('ibm-blockchain-js');
	var ibc = new Ibc1(logger);             //you can pass a logger such as winston here - optional
```

### ibc.load(options, [callback])
This is a function that wraps a typical startup using a standard Bluemix IBM Blockchain network. 
Take a look at how this function works, especially how it uses the register() function. 
If this is not applicable for your network (ie you have a custom IBM Blockchain network) you can easily create your own version of `ibc.load()` for your needs. 
It will run in order:

1. ibc.network(options.network.peers, options.network.options) *check out other options in [ibc.network()](#ibcnetwork)*
1. ibc.register(...) 
	- It will register the first peer with the first enrollId, the 2nd peer against the 2nd enrollId and so on.
	- This function only runs if users are found in options.network.users.
	- Any errors in register will stop execution and run callback(err).
1. ibc.load_chaincode(options.chaincode, [callback]) 
1. callback(err, cc) 

Options: 
- **maxRetry** = integer - number of times to retry `ibc.register()` before giving up
- [more] - same options as the function [ibc.network()](#ibcnetwork), click for details 

Ex:

```js
	var options = 	{
		network:{
			peers:   [{
				"api_host": "xxx.xxx.xxx.xxx",
				"api_port": xxx,
				"api_port_tls": xxx,
				"id": "xxxxxx-xxxx-xxx-xxx-xxxxxxxxxxxx_vpx"
			}],
			users:  [{
				"enrollId": "user1",
				"enrollSecret": "xxxxxxxx"
			}],
			options: {            //this is optional, gets passed to ibc.network(peers, options);
				quiet: true, 
				timeout: 60000,
				tls: true,
				maxRetry: 3
			}
		},
		chaincode:{
			zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip', //http/https of a link to download zip
			unzip_dir: 'marbles-chaincode-master/part2_v1.0.0',                                //name/path to folder that contains the chaincode you want to deploy (path relative to unzipped root)
			git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2_v1.0.0',       //git https URL. should point to the desired chaincode repo AND directory
			
			deployed_name: null    //[optional] this is the hashed name of a deployed chaincode.  if you want to run with chaincode that is already deployed set it now, else it will be set when you deploy with the sdk
		}
	};
	
	ibc.load(options, function(err, data){
		//callback here
	});
```

### ibc.load_chaincode(options, [callback])
Load the chaincode you want to use. 
It will be downloaded and parsed. 
The callback will receive (e, obj) where `e` is the error format and `obj` is the chaincode object.
"e" is null when there are no errors.
The chaincode object will have dot notation to the functions in the your chaincode. 

Ex:

```js
	var options = 	{
		zip_url: 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip', //http/https of a link to download zip
		unzip_dir: 'marbles-chaincode-master/part2_v1.0.0',                                        //name/path to folder that contains the chaincode you want to deploy (path relative to unzipped root)
		git_url: 'https://github.com/ibm-blockchain/marbles-chaincode/part2_v1.0.0',             //git https URL. should point to the desired chaincode repo AND directory
		
		deployed_name: null   //[optional] this is the hashed name of a deployed chaincode.  if you want to run with chaincode that is already deployed set it now, else it will be set when you deploy with the sdk
	};
	ibc.load_chaincode(options, cb_ready);
```

### <a name="ibcnetwork"></a>ibc.network(arrayPeers, [options])
Set the information about the peers in the network.
This should be an array of peer objects. 
The options parameter is optional.
Each field in `options` is also optional.

Options: 
- **quiet** = boolean - when true will print out only minimal HTTP debug information. Defaults `true`.
- **timeout** = integer - time in ms to wait for a http response. Defaults `60000`.
- **tls** = boolean - when `false` will use HTTP instead of HTTPS. Defaults `true`.

Ex:

```js
	var peers = [
		{
			"api_host": "xxx.xxx.xxx.xxx",               //ip or hostname of api for this peer
			"api_port": xxx,                             //port for api, non tls (integer)
			"api_port_tls": xxx,                         //port for api with tls. (integer)
			"id": "xxxxxx-xxxx-xxx-xxx-xxxxxxxxxxxx_vpx" //unique id of peer (string)
		}
	]
	ibc.network(peers, {quiet: false, timeout: 120000}); //can pass config options
```

Note **only** the field names you see above  (`api_host`, `api_port`, `api_port_tls`, `id`) are required.
If you are using a Bluemix network you will see lots of other fields in the credentials JSON blob, but they are not needed. 
Its also fine to include the extra fields.
You can ommit the field `api_port_tls` if your network does not support tls. 
Make sure the `options.tls` is `false`.

### ibc.save(path [callback])
Save the [Chaincode Summary File](#ccsf) to a path.

Ex:

```js
	ibc.save('./');
```

### ibc.clear([callback])
Clear any loaded chaincode files including the downloaded chaincode repo, and [Chaincode Summary File](#ccsf).

Ex:

```js
	ibc.clear();
```

### ibc.chain_stats([callback])
Get statistics on the network's chain.  

Ex:

```js
	ibc.chain_stats(function(e, stats){
		console.log('got some stats', stats);
	});
```

Example Chain Stats:

```js
	{
		"height": 10,
		"currentBlockHash": "n7uMlNMiOSUM8s02cslTRzZQQlVfm8wKT9FtL54o0ywy6BkvPMwSzN5R1tpquvqOwFFHyLSoW44n6rkFyvAsBw==",
		"previousBlockHash": "OESGPzacJO2Xc+5PB2zpmYVM8XlrwnEky0L2Ghok9oK1Lr/DWoxuBo2WwBca5zzJGq0fOeRQ7aOHgCjMupfL+Q=="
	}
```

### ibc.block_stats(id, [callback])
Get statistics on a particular block in the chain.  

Ex:

```js
	ibc.block_stats(function(e, stats){
		console.log('got some stats', stats);
	});
```

Example Response:

```js
	{
		"transactions": [
			{
				"type": 3,
				"chaincodeID": "EoABNWUzNGJmNWI1MWM1MWZiYzhlMWFmOThkYThhZDg0MGM2OWFjOWM5YTg4ODVlM2U0ZDBlNjNiM2I4MDc0ZWU2NjY2OWFjOTAzNTg4MzE1YTZjOGQ4ODY4M2Y1NjM0MThlMzMwNzQ3ZmVhZmU3ZWYyMGExY2Q1NGZmNzY4NWRhMTk=",
				"payload": "CrABCAESgwESgAE1ZTM0YmY1YjUxYzUxZmJjOGUxYWY5OGRhOGFkODQwYzY5YWM5YzlhODg4NWUzZTRkMGU2M2IzYjgwNzRlZTY2NjY5YWM5MDM1ODgzMTVhNmM4ZDg4NjgzZjU2MzQxOGUzMzA3NDdmZWFmZTdlZjIwYTFjZDU0ZmY3Njg1ZGExORomCgtpbml0X21hcmJsZRIHcng2YXRzcBIFZ3JlZW4SAjM1EgNCb2I=",
				"uuid": "b3da1d08-19b8-4d8c-a116-b46defb07a7c",
				"timestamp": {
					"seconds": 1453997627,
					"nanos": 856894462
				}
			}
		],
		"stateHash": "81ci8IAOeDh0ZwFM6hE/b3SfXt4tnZFemib7sI95cOsNcYMmtRxBWRBA7qnjPOCGU6snBRsFVnAliZXUigQ03w==",
		"previousBlockHash": "tpjUh4sgbaUQFO8wm8S8nrm7yCrBa4rphIiujfaYAlEVfzI8IZ0mjYMf+GiOZ6CZRNWPmf+5bekmGIfr0H6zdw==",
		"nonHashData": {
			"localLedgerCommitTimestamp": {
			"seconds": 1453997627,
			"nanos": 868868790
			}
		}
	}
```

### ibc.switchPeer(peerIndex)
The SDK will default to use peer[0].  This function will switch the default peer to another index.  

Ex:

```js
	ibc.switchPeer(2);
```
	
### ibc.register(peerIndex, enrollId, enrollsecret, maxRetry, [callback])
Only applicable on a network with security enabled. 
`register()` will register against peer[peerIndex] with the provided credentials.
If successful, the peer will now use this `enrollId` to perform any http requests.
- **peerIndex** = integer - position of peer in peers array (the one you fed ibc.networks()) you want to register against.
- **enrollId** = string - name of secure context user.
- **enrollSecret** = string - password/secret/api key of secure context user.
- **maxRetry** = integer - number of times to retry this call before giving up.

Ex:

```js
	ibc.register(3, 'user1', 'xxxxxx', 3, my_cb);
```

### ibc.monitor_blockheight(callback)
This will call your callback function whenever the block height has changed.
ie. whenever a new block has been written to the chain.
It will also pass you the same response as in `chain_stats()`.

Ex:

```js
	ibc.monitor_blockheight(my_callback);
	function my_callback(e, chainstats){
		console.log('got a new block!', chainstats);
	}
```

### ibc.get_transaction(udid, [callback])
Get information about a particular transaction ID.

Ex:

```js
	ibc.get_transaction('d30a1445-185f-4853-b4d6-ee7b4dfa5534', function(err, data){
		console.log('found trans', err, data);
	});
```

***
***

##<a name="ccfunc"></a>Chaincode Functions
- Chaincode functions are dependent on actually be found inside your Go chaincode
- My advice is to build your chaincode off of the Marble Application one.  This way you get the basic CRUD functions below:

### chaincode.deploy(func, args, [options], [enrollId], [callback])
Deploy the chaincode. 
Call GoLang function named 'func' and feed it 'args'.
Usually "args" is an array of strings.
The `enrollId` parameter should be the desired secure context enrollId that has already been registered against the selected peer. 
If left `null` the SDK will use a known enrollId for the selected peer. (this is only relevant in a permissioned network)

Options: 
- **save_path** = save the [Chaincode Summary File](#ccsf) to 'save_path'. 
- **delay_ms** = time in milliseconds to postpone the callback after deploy. Default is `40000`

Ex:

```js
	chaincode.deploy('init', ['99'], {delay_ms: 60000}, cb_deployed);
```

### chaincode.query.CUSTOM_FUNCTION_NAME(args, [enrollId], [callback])
Will invoke your Go function CUSTOM_FUNCTION_NAME and pass it `args`. 
Usually `args` is an array of strings.
The `enrollId` parameter should be the desired secure context enrollId that has already been registered against the selected peer. 
If left `null` the SDK will use a known enrollId for the selected peer. (this is only relevant in a permissioned network)

Ex:

```js
	chaincode.query.read(['abc'], function(err, data){
		console.log('read abc:', data, err);
	});
```

### chaincode.invoke.CUSTOM_FUNCTION_NAME(args, [enrollId], [callback])
Will query your Go function CUSTOM_FUNCTION_NAME and pass it `args`. 
Usually `args` is an array of strings.
The `enrollId` parameter should be the desired secure context enrollId that has already been registered against the selected peer. 
If left `null` the SDK will use a known enrollId for the selected peer. (this is only relevant in a permissioned network)

Ex:

```js
	chaincode.invoke.init_marbles([args], function(err, data){
		console.log('create marble response:', data, err);
	});
```

### chaincode.query.read(name, [enrollId], [callback]) *depreciated 4/1/2016*
*This function is only here to help people transition from ibc v0.0.x to v1.x.x.*
*You should create your own read() function in your chaincode which will overwrite this prebuilt one.*
*This function will put the `name` argument into `args[0]` and set `function` to `query`.*
*These are passed to the chaincode function `Query(stub *shim.ChaincodeStub, function string, args []string)`.*

Read variable named name from chaincode state. 
This will call the `Query()` function in the Go chaincode. 
The `enrollId` parameter should be the desired secure context enrollId that has already been registered against the selected peer. 
If left `null` the SDK will use a known enrollId for the selected peer. (this is only relevant in a permissioned network)

***
***

##<a name="formats"></a>Formats
### Chaincode Object
This is the main guy.
It is returned in the callback to load_chaincode() and contains all your cc functions + some of the setup/input data.

```js
	chaincode = 
		{
			query: {
				CUSTOM_FUNCTION_NAME1: function(args, cb){etc...};	//call chaincode function and pass it args
				CUSTOM_FUNCTION_NAME2: function(args, cb){etc...};
				^^ etc...
			}
			invoke: {
				CUSTOM_FUNCTION_NAME1: function(args, cb){etc...};	//call chaincode function and pass it args
				CUSTOM_FUNCTION_NAME2: function(args, cb){etc...};
				^^ etc...
			}
			deploy: function(func, args, path, cb),     //deploy loaded chaincode
			details:{                                   //input options get stored here, sometimes its handy
						deployed_name: '',              //hash of deployed chaincode
						func: {
							invoke: [],                 //array of function names found
							query: []                   //array of function names found
						},
						git_url: '',
						peers: [],                      //peer list provided in network()
						timestamp: 0,                   //utc unix timestamp in ms of parsing
						users: [],                      //users provided in load()
						unzip_dir: '',
						zip_url: '',
			}
		};
```

### Error Format

```js
	{
		name: "input error",                       //short name of error
		code: 400,                                 //http error status code, integer
		details: {msg: "did not provide git_url"}  //description of error, obj of unknown makeup
	};
```
	
### <a name="ccsf"></a>Chaincode Summary File
This file is used internally when debugging. 
It is created in ibc.load_chaincode() and updated with chaincode.deploy(). 
A copy can be saved elsewhere with ibc.save(path). 
I found it handy in niche cases, but it will probably be unhelpful to most developers. 

```js
	{
	"details": {
		"deployed_name": "f6c084c42b3bde90c03f214ac6e0426e3e594807901fb1464287f2c3a18ade717bc495298958287594f81bb0d0cfdd3b4346d438d3b587d4fc73cf78ae8f7dfe",
		"func": {
					"invoke": ["init", "delete", "write", "init_marble", "set_user", "open_trade", "perform_trade"],
				},
				{
					"query": []
				},
		"git_url": 'https://github.com/ibm-blockchain/marbles-chaincode/part2_v1.0.0'
		"peers": [{
			"name": "vp1-xxx.xxx.xxx.xxx",
			"api_host": "xxx.xxx.xxx.xxx",
			"api_port": xxx,
			"id": "xxxxx_vp1",
			"tls": false,
			"enrollId": "user1"
		}],
		"timestamp": 1459779181971,
		"users": [{
			"enrollId": "xxx",
			"enrollSecret": "xxx"
		}],
		"unzip_dir": 'marbles-chaincode-master/part2_v1.0.0',
		"zip_url": 'https://github.com/ibm-blockchain/marbles-chaincode/archive/master.zip',
		"options": {}
		}
	}
```

#FAQ

*Do you have any examples that use this?*

- Yes! Head over to the [Marbles Node.js Demo](https://github.com/IBM-Blockchain/marbles)

*How exactly do I write chaincode?*

- We have a "hello world" like tutorial for chaincode over at [Learn Chaincode](https://github.com/IBM-Blockchain/learn-chaincode)

*I'm getting error code 2 in my deploy response?*

- Your chaincode has build issues and is not compiling. Manually build it in your local machine to get details.

*I'm getting error code 1!*

- The shim version your chaincode import has is not the same as the shim the peer is running. ie you are probably running 'Hyperledger' peer code and sending it chaincode with a shim pointing to "OBC-Peer". 

