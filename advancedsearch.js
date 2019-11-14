/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-07-15
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example issues an advanced search for assets, shows pagewise request of search results and prints the results to
 * stdout.
 */
var fs = require('fs');
var https = require('https');
var PlatformTools = require('./PlatformTools');

/**
 * Promises delivery of the content o the specified file containing a query description for an advanced search.
 *
 * @method loadAdvancedSearchDescription
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param advancedSearchDescriptionFilePath file system path to a file containing a query description for an advanced
 *          search
 * @return {Promise} promising {"options": options, "advancedSearchDescription": advancedSearchDescription} containing
 *          valid options for the next HTTP request against the platform and the advancedSearchDescription text in the
 *          specified file.
 */
var loadAdvancedSearchDescription = function(options, advancedSearchDescriptionFilePath) {
    var deferred = Promise.defer();
    // Read the advanced search description from file and continue:
    fs.readFile(advancedSearchDescriptionFilePath, 'utf-8', whenFileRead);
    function whenFileRead(e, advancedSearchDescription) {
        if(!e) {
            deferred.resolve({"options" : options, "advancedSearchDescription" : PlatformTools.removeUTF8BOM(advancedSearchDescription)});
        } else {
            console.log("Error reading file '" + advancedSearchDescriptionFilePath + "':\n" + e + "\n");
            deferred.reject();
        }
    }
    return deferred.promise;
};

/**
 * Promises delivery of a formatted string containing the results of an advanced search.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} advancedSearchDescriptionFilePath file system path to a file containing a query description for an
 *          advanced search
 * @param {Array} pages the pages containing the aa:assets, which make up the result of the advanced search
 * @return {Promise} promising {"options": options, "text": text} containing valid options for the next HTTP request
 *          against the platform and a formatted string containing the results of the advanced search
 */
var stringify = function(options, pages, advancedSearchDescriptionFilePath) {
    var deferred = Promise.defer();

    var text = '';
    if(pages && 0 < pages.length) {
        var assetNo = 0;
        for (var pageNo = 0; pageNo < pages.length; ++pageNo) {
            text += "Page#: " + (pageNo + 1) + ", search description from file '" + advancedSearchDescriptionFilePath + "'\n";
            var foundAssets = pages[pageNo]['aa:asset'];
            for (var j = 0; j < foundAssets.length; ++j) {
                var asset = foundAssets[j];
                var id = asset.base.id;
                var name = asset.common.name;
                text += "\tAsset#: " + (++assetNo) + ", id: " + id + ", name: '" + name + "'\n";
            }
        }
    } else {
        text = "No hits!";
    }
    deferred.resolve({"options": options, "text": text});

    return deferred.promise;
};

/**
 * Promises delivery of the results of an advanced search.
 *
 * @method advancedSearch
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlAdvancedSearch resolved URL for the advanced search
 * @param {String} advancedSearchDescription a query description for the advanced search
 * @return {Promise} promising {"options": options, "pages": pages} containing valid options for the next HTTP request
 *          against the platform and the pages containing the aa:assets, which make up the result of the advanced
 *          search
 */
var advancedSearch = function(options, urlAdvancedSearch, advancedSearchDescription) {
    var deferred = Promise.defer();

    /// Check presence of the searches resource and continue with HATEOAS:
    options.path = urlAdvancedSearch;
    if (PlatformTools.getAccessToken()) {
        options.headers.Cookie = 'avidAccessToken='+PlatformTools.getAccessToken();
    }
    https.get(options, onSearchesRequestResponded)
        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onSearchesRequestResponded(searchesResponse) {
        if (200 === searchesResponse.statusCode) {
            var body = [];
            searchesResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            searchesResponse.on('end', onSearchesResultData);
            searchesResponse.on('error', function onSearchesRequestError(e) {
                deferred.reject();
            });
            function onSearchesResultData() {
                var searchesResult = JSON.parse(Buffer.concat(body).toString());
                var advancedSearchLinkObject = searchesResult._links['search:advanced-search'];
                if (advancedSearchLinkObject) {
                    /// Doing the advanced search and write the results to stdout:
                    // Here, no URL-template library is used in favor to string surgery:
                    var urlUntemplatedAdvancedSearch = advancedSearchLinkObject.href;
                    urlUntemplatedAdvancedSearch = urlUntemplatedAdvancedSearch.substring(0, urlUntemplatedAdvancedSearch.lastIndexOf('{'));
                    // Send the process query's description:

                    var advancedSearchOptions = {
                        'host'      : options.host
                        , 'path'    : urlUntemplatedAdvancedSearch
                        , 'method'  : 'POST'
                        , 'headers' : {
                            'Content-Type'      : 'application/json'
                            , 'Accept'          : 'application/json'
                            , 'Authorization'   : options.headers.Authorization
                        }
                        , 'agent'   : options.agent
                    };

                    if (options.headers.Cookie) {
                        advancedSearchOptions.headers.Cookie = options.headers.Cookie;
                    }

                    var advancedSearchRequest = https.request(advancedSearchOptions, onAdvancedSearchRequestResponded)
                        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
                    function onAdvancedSearchRequestResponded(advancedSearchResponse) {
                        if (303 === advancedSearchResponse.statusCode || 200 === advancedSearchResponse.statusCode) {
                            var body = [];
                            advancedSearchResponse.on('data', function onDataChunk(data) {
                                body.push(data);
                            });
                            advancedSearchResponse.on('end', onAdvancedSearchResultData);
                            advancedSearchResponse.on('error',  function onAdvancedSearchRequestError(e) {
                                deferred.resolve(options);
                            });
                            function onAdvancedSearchResultData() {
                                // Page through the result:
                                var advancedSearchFirstPageResult = JSON.parse(Buffer.concat(body).toString());
                                // Do we have results:
                                var firstPage = advancedSearchFirstPageResult._embedded;
                                if(firstPage) {
                                    var allPages = [firstPage];
                                    // If we have more results, follow the next link and get the next page:
                                    var linkToNextPage = advancedSearchFirstPageResult._links.next;
                                    if(linkToNextPage) {
                                        PlatformTools.pageThroughResults(options, linkToNextPage.href)
                                            .then(function collect(pages) {
                                                allPages = allPages.concat(pages);
                                            })
                                            .then(function () {
                                                deferred.resolve({"options": options, "pages": allPages});
                                            });
                                    } else {
                                        deferred.resolve({"options": options, "pages": allPages});
                                    }
                                }  else {
                                    deferred.resolve({"options": options, "pages": []});
                                }
                            }
                        } else {
                            console.log("Advanced search request failed with '" + advancedSearchResponse.statusMessage +"'");
                            deferred.reject();
                        }
                    }
                    advancedSearchRequest.write(advancedSearchDescription);
                    advancedSearchRequest.end();
                } else {
                    console.log('Advanced search not supported');
                    deferred.reject();
                }
            }
        } else {
            console.log("Searches request failed with code '" + searchesResponse.statusMessage + "'");
            deferred.reject();
        }
    }
    return deferred.promise;
};


if (8 !== process.argv.length) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + " <apidomain> <httpbasicauthstring> <servicetype> <serviceversion> <realm> <advancedsearchdescriptionfilepath>");
} else {
    var apiDomain = process.argv[2];
    var httpBasicAuthString = process.argv[3];
    var serviceType = process.argv[4];
    var serviceVersion = process.argv[5];
    var realm = process.argv[6];
    var advancedSearchDescriptionFilePath = process.argv[7];

    var registryServiceVersion = '0';
    var defaultSimpleSearchUriTemplate = 'https://' + apiDomain + '/apis/' +  serviceType + ';version=' + serviceVersion + ';realm=' + realm + '/searches';

    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain).catch(PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, httpBasicAuthString);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.findInRegistry(options, apiDomain, [serviceType], registryServiceVersion, 'search:searches', defaultSimpleSearchUriTemplate, realm);}, PlatformTools.failAndExit)
        //.then(function(options) {return {"options" : options, "UriTemplates" : [defaultSimpleSearchUriTemplate]};}, PlatformTools.failAndExit) // for debugging purposes
        .then(function(options) {return loadAdvancedSearchDescription(options, advancedSearchDescriptionFilePath);}, PlatformTools.failAndExit)
        .then(function(it) {
            var urlUntemplatedSearch = it.options.UriTemplates[0];
            var options = it.options.options;
            return advancedSearch(options, urlUntemplatedSearch, it.advancedSearchDescription);
        }, PlatformTools.failAndExit)
        .then(function(it) {
            var options = it.options;
            var pages = it.pages;
            return stringify(options, pages, advancedSearchDescriptionFilePath);
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