/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-07-12
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example queries process instances, shows pagewise request of query results and prints the results to stdout.
 */
var https = require('https');
var PlatformTools = require('./PlatformTools');

/**
 * Promises delivery of a formatted string containing the results of a process query.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} rawSearchExpression the search expression for the process query
 * @param {Array} pages the pages containing the orchestration:processes, which make up the result of the process query
 * @return {Promise} promising {"options": options, "text": text} containing valid options for the next HTTP request
 *          against the platform and a formatted string containing the results of the process query
 */
var stringify = function(options, pages, rawSearchExpression) {
    var deferred = Promise.defer();

    var text = '';
    if(pages && 0 < pages.length) {
        var assetNo = 0;
        for (var pageNo = 0; pageNo < pages.length; ++pageNo) {
            text += "Page#: " + (pageNo + 1) + ", search expression: '" + rawSearchExpression + "'\n";
            var foundAssets = pages[pageNo]['orchestration:process'];
            for (var j = 0; j < foundAssets.length; ++j) {
                var asset = foundAssets[j];
                var id = asset.base.id;
                var name = asset.common.name;
                text += "\tProcessItem#: " + (++assetNo) + ", id: " + id + ", name: '" + name + "'\n";
            }
        }
    } else {
        text = "No hits!";
    }
    deferred.resolve({"options": options, "text": text});

    return deferred.promise;
};

/**
 * Promises delivery of the results of a process query.
 *
 * @method advancedSearch
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlProcessQuery resolved URL for the process query
 * @param {String} rawSearchExpression the search expression for the process query
 * @return {Promise} promising {"options": options, "pages": pages} containing valid options for the next HTTP request
 *          against the platform and the pages containing the items, which make up the result of the process query
 */
var queryProcesses = function(options, urlProcessQuery, rawSearchExpression) {
    var deferred = Promise.defer();

    // Create and send the process query's description:
    var processQueryExpression = '<query version=\'1.0\'><search><quick>'+rawSearchExpression+'</quick></search></query>';
    var processQueryContent = '{"query" : "'+processQueryExpression+'"}';
    var processQueryRequestOptions = {
        'host'      : options.host
        , 'path'    : urlProcessQuery
        , 'method'  : 'POST'
        , 'headers' : {
            'Content-Type'  : 'application/json'
            , 'Accept'      : 'application/json'
            , 'Authorization': options.headers.Authorization
        }
        , 'agent'   : options.agent
    };

    var processQueryRequest = https.request(processQueryRequestOptions, onProcessQueryRequestResponded)
        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onProcessQueryRequestResponded(processQueryResponse) {
        if (303 === processQueryResponse.statusCode || 200 === processQueryResponse.statusCode) {
            var body = [];
            processQueryResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            processQueryResponse.on('end', onProcessQueryResultData);
            processQueryResponse.on('error',  function onProcessQueryRequestError(e) {
                deferred.resolve(options);
            });
            function onProcessQueryResultData() {
                // Page through the result:
                var processQueryFirstPageResult = JSON.parse(Buffer.concat(body).toString());
                // Do we have results:
                var firstPage = processQueryFirstPageResult._embedded;
                if(firstPage) {
                    var allPages = [firstPage];
                    // If we have more results, follow the next link and get the next page:
                    var linkToNextPage = processQueryFirstPageResult._links.next;
                    if(linkToNextPage) {
                        PlatformTools.pageThroughResults(options, linkToNextPage.href)
                            .then(function collect(pages) {
                                allPages = allPages.concat(pages);
                            })
                            .then(function () {
                                deferred.resolve({"options": options, "pages": allPages});
                            })
                            .catch(function() {
                                deferred.reject();
                            });
                    } else {
                        deferred.resolve({"options": options, "pages": allPages});
                    }
                } else {
                    deferred.resolve({"options": options, "pages": []});
                }
            }
        } else {
            deferred.reject()
        }
    }
    processQueryRequest.write(processQueryContent);
    processQueryRequest.end();

    return deferred.promise;
};

if (6 !== process.argv.length || "'" === process.argv[5] || "'" !== process.argv[5][0] || "'" !== process.argv[5][process.argv[5].length - 1]) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + " <apidomain> <httpbasicauthstring> <orchestrationserviceversion> <realm> '<simplesearchexpression>'");
} else {
    var apiDomain = process.argv[2];
    var httpBasicAuthString = process.argv[3];
    var orchestrationServiceVersion = process.argv[3];
    var realm = process.argv[4];
    var rawSearchExpression = process.argv[5].substring(1, process.argv[5].length - 1);

    var orchestrationServiceType = 'avid.orchestration.ctc';
    var registryServiceVersion = '0';
    var defaultOrchestrationUriTemplate = 'https://' + apiDomain + '/apis/' + orchestrationServiceType + ';version=' + orchestrationServiceVersion + ';realm=' + realm + '/process-queries/{id}';


    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain).catch(PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, httpBasicAuthString);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.findInRegistry(options, apiDomain, [orchestrationServiceType], registryServiceVersion, 'orchestration:process-query', defaultOrchestrationUriTemplate, realm);}, PlatformTools.failAndExit)
        .then(function(it) {
            var options = it.options;
            var urlUntemplatedProcessQuery = it.UriTemplates[0];
            urlUntemplatedProcessQuery = urlUntemplatedProcessQuery.substring(0, urlUntemplatedProcessQuery.lastIndexOf('{id}'));
            return queryProcesses(options, urlUntemplatedProcessQuery, rawSearchExpression);
        }, PlatformTools.failAndExit)
        .then(function(it) {
            return stringify(it.options, it.pages, rawSearchExpression);
        }, PlatformTools.failAndExit)
        .then(function(it) {
            console.log(it.text);
            return it.options;
        }, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getAuthEndpoint(it, apiDomain);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getCurrentToken(it);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.removeToken(it);}, PlatformTools.failAndExit)
        .then(function() {console.log("End"); process.exit();})
        .catch(PlatformTools.failAndExit);
}