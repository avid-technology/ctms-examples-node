/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-06-23
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example issues a simple search for assets, shows pagewise request of search results and prints the results to stdout.
 */
var https = require('https');
var PlatformTools = require('./PlatformTools');

/**
 * Promises delivery of a formatted string containing the results of a simple search.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {Array} resources the resources, which make up the result of the simple search
 * @return {Promise} promising {"options": options, "text": text} containing valid options for the next HTTP request
 *          against the platform and a formatted string containing the results of the simple search
 */
var stringify = function(options, pages, rawSearchExpression) {
    var deferred = Promise.defer();

    var text = '';
    if(pages && 0 < pages.length) {
        var assetNo = 0;
        for (var pageNo = 0; pageNo < pages.length; ++pageNo) {
            text += "Page#: " + (pageNo + 1) + ", search expression: '" + rawSearchExpression + "'\n";
            var foundAssets = pages[pageNo]['aa:asset'];
            for (var j = 0; j < foundAssets.length; ++j) {
                var asset = foundAssets[j];
                var id = asset.base.id;
                var name = (undefined != asset.common.name) ? asset.common.name : "";
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
 * Promises delivery of the results of a simple search.
 *
 * @method simpleSearch
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlSimpleSearch resolved URL for the advanced search
 * @return {Promise} promising {"options": options, "pages": pages} containing valid options for the next HTTP request
 *          against the platform and the pages containing the items, which make up the result of the simple search
 */
var simpleSearch = function (options, urlSimpleSearch) {
    var deferred = Promise.defer();

    // Page through the result:
    var allPages = [];
    PlatformTools.pageThroughResults(options, urlSimpleSearch)
        .then(function collect(pages) {
            allPages = allPages.concat(pages);
        })
        .then(function () {
            deferred.resolve({"options":options, "pages":allPages});
        })
        .catch(function() {
            deferred.reject();
        });

    return deferred.promise;
};


if (8 !== process.argv.length || "'" === process.argv[7] || "'" !== process.argv[7][0] || "'" !== process.argv[7][process.argv[7].length - 1]) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + " <apidomain> <httpbasicauthstring> <servicetype> <serviceversion> <realm> '<simplesearchexpression>'");
} else {
    var apiDomain = process.argv[2];
    var httpBasicAuthString = process.argv[3];
    var serviceType = process.argv[4];
    var serviceVersion = process.argv[5];
    var realm = process.argv[6];
    var rawSearchExpression = process.argv[7].substring(1, process.argv[7].length - 1);

    var registryServiceVersion = '0';
    var defaultSimpleSearchUriTemplate = 'https://' + apiDomain + '/apis/' + serviceType + ';version=' + serviceVersion + ';realm=' + realm + '/searches/simple?search={search}{&offset,limit,sort}';


    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain).catch(PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, httpBasicAuthString);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.findInRegistry(options, apiDomain, serviceType, registryServiceVersion, 'search:simple-search', defaultSimpleSearchUriTemplate, realm);}, PlatformTools.failAndExit)
        //.then(function(options) {return {"options" : options, "UriTemplates" : [defaultSimpleSearchUriTemplate]};}, PlatformTools.failAndExit) // for debugging purposes
        .then(function(it) {
            var urlUntemplatedSearch= it.UriTemplates[0];
            urlUntemplatedSearch = urlUntemplatedSearch.substring(0, urlUntemplatedSearch.lastIndexOf('=') + 1);

            var searchExpression = encodeURIComponent(rawSearchExpression);
            var urlSimpleSearchResultPageURL = urlUntemplatedSearch + searchExpression;
            return simpleSearch(it.options, urlSimpleSearchResultPageURL);
        }, PlatformTools.failAndExit)
        .then(function(it) {
            return stringify(it.options, it.pages, rawSearchExpression);
        }, PlatformTools.failAndExit)
        .then(function(it) {console.log(it.text); return it.options;}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getAuthEndpoint(it, apiDomain);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getCurrentToken(it);}, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.removeToken(it);}, PlatformTools.failAndExit)
        .then(function() {console.log("End"); process.exit();})
        .catch(PlatformTools.failAndExit);
}