/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-07-14
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example enumerates the entries in the service registry and writes the results to stdout.
 */
var https = require('https');
var PlatformTools = require('./PlatformTools');


function onServiceRootsRequestError(e) {
    console.error(e);
}

/**
 * Promises delivery of a formatted string containing the results of querying the service registry.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {Array} resources the resources, which make up the result of the service registry query
 * @return {Promise} promising {"options": options, "text": text} containing valid options for the next HTTP request
 *          against the platform and a formatted string containing the results of the service registry query
 */
var stringify = function(options, resources) {
    var deferred = Promise.defer();

    var text ='';
    if (resources) {
        for (var name in resources) {
            if(resources.hasOwnProperty(name)) {
                text += "Resource: '"+name+"'\n";
                if(resources[name].length) {
                    for(var i = 0; i < resources[name].length; ++i) {
                        var serviceHref = resources[name][i].href;
                        text += '\t'+(i + 1)+'. <'+serviceHref+'>\n';
                    }
                } else {
                    var serviceHref = resources[name].href;
                    text += '\t1. <'+serviceHref+'>\n';
                }
            }
        }
    } else {
        text += "No services registered.";
    }
    deferred.resolve({"options": options, "text": text});

    return deferred.promise;
};

/**
 * Promises delivery of the results of a service registry query.
 *
 * @method queryRegistry
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} apiDomain address to issue the advanced search against
 * @return {Promise} promising {"options": options, "resources": resources} containing valid options for the next HTTP
 *          request against the platform and the resources, which make up the result of the service registry query
 */
var queryRegistry = function(options, apiDomain) {
    var deferred = Promise.defer();

    var registryServiceType = 'avid.ctms.registry';

    /// Check, whether the service registry is available:
    var registryURL = 'https://'+apiDomain+'/apis/'+registryServiceType+';version=0/serviceroots';
    options.path = registryURL;
    https.get(options, onServiceRootsRequestResponded)
        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onServiceRootsRequestResponded(serviceRootsResponse) {
        if(200 === serviceRootsResponse.statusCode) {
            var body = [];
            serviceRootsResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            serviceRootsResponse.on('end', onServiceRootsResultData);
            serviceRootsResponse.on('error', onServiceRootsRequestError);
            function onServiceRootsResultData() {
                var serviceRootsResult = JSON.parse(Buffer.concat(body).toString());

                deferred.resolve({"options": options, "resources": serviceRootsResult.resources})
            }
        } else {
            console.log("Serviceroot request failed with '" + serviceRootsResponse.statusMessage + "'");
            deferred.reject();
        }
    }

    return deferred.promise;
};


if (5 !== process.argv.length) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + " <apidomain> <username> <password>");
} else {
    var apiDomain = process.argv[2];
    var username = process.argv[3];
    var password = process.argv[4];


    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, username, password);
        }, PlatformTools.failAndExit)
        .then(function(options) {return queryRegistry(options, apiDomain);}, PlatformTools.failAndExit)
        .then(function(it) {
            return stringify(it.options, it.resources);
        }, PlatformTools.failAndExit)
        .then(function(it) {console.log(it.text); return it.options;}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getAuthEndpoint(it, apiDomain);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getCurrentToken(it);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.removeToken(it);}, PlatformTools.failAndExit)
        .then(function() {console.log("End"); process.exit();})
        .catch(PlatformTools.failAndExit);
}