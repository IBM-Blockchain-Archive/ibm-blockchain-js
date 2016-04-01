'use strict';
/*******************************************************************************
 * Copyright (c) 2016 IBM Corp.
 *
 * All rights reserved.
 * 
 *******************************************************************************/
 
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
//filter_users() - return only client level usernames - [1=client, 2=nvp, 4=vp, 8=auditor accurate as of 2/18]
//==================================================================
module.exports.filter_users = function(users){										//this is only needed in a permissioned network
	var valid_users = [];
	for(var i = 0; i < users.length; i++) {
		if(users[i].username.indexOf('user_type1') === 0){							//type should be 1 for client
			valid_users.push(users[i]);
		}
	}
	return valid_users;
};