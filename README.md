ibm-blockchain-js
=========

A set of libraries for easily interacting with IBM's Blockchain

*Version*: 0.0.3
*Updated*: 01/19/2016

## Installation

```
npm install ibm-blockchain-js --save
```

## Usage

```
var obc = require('ibm-blockchain-js')
  
//add usage stuff
```


## Examples

	-----------------------------------------------------------------
	Use:	var obc = require('./obc-js');
			dsh - to do, fill this out
			
	-----------------------------------------------------------------
	Example:
	contract = {
					init: function({args}, cb){},					//example
					invoke: function({args}, cb){},					//example
					cc:{
						read: function(name, cb, lvl),				//use the go code Query() function
						write: function(name, val, cb),				//use the go code Write() function
						deploy: function(func, args, cb),			//if successful will also set cc.details.name, func & args are optional
						readNames: function(cb, lvl),				//read all variables in chaincode state space
						details: {
							host: "",								//peer to hit
							port: "",
							url:  "",								//direct link to .zip of chaincode
							path: "",								//
							name: "",								//hashed name of chaincode, deploy() will set it, else user sets it
							dir: "",								//path to chaincode directory from zip
							func: [],
							vars: []
						}
					}
				}
				
	Error Format:
	{
		name: "short name of error" 
		code: http status code as integer
		details: "long description OR user friendly error OR error obj"
	}

## Release History

* 0.0.1 Internal Dev Version
* 0.0.2 Switched to using Nodegit
* 0.0.3 Moved back to unzip and download cause of Nodegit dependencies.