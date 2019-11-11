/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-06-28
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example traverses the structure of the folder tree (location structure) with embedded resources and prints the
 * results to stdout.
 */
var https = require('https');
var PlatformTools = require('./PlatformTools');


function onError(e) {
    console.error(e);
}

function repeatChar(count, ch) {
    var txt = '';
    for (var i = 0; i < count; ++i) {
        txt += ch;
    }
    return txt;
}

var toItemInfo = function(item, depth) {
    return {
        name: item.common.name
        , type: item.base.type
        , depth: depth
        , href: item._links.self.href
        , hasChildren: item._links["loc:collection"]
    };
};

/**
 * Promises delivery of a formatted string containing the results of a folder structure traversal.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {Array} items the items, which make up the result of the folder structure traversal
 * @return {Promise} promising {"options": options, "text": text} containing valid options for the next HTTP request
 *          against the platform and a formatted string containing the results of the folder structure traversal
 */
var stringify = function(options, items) {
    var deferred = Promise.defer();

    var text = '';
    for (var i = 0; i < items.length; ++i) {
        var itemInfo = items[i];
        text += repeatChar(itemInfo.depth, '\t') + (itemInfo.hasChildren ? '- (collection) ' : '') + 'depth: ' + itemInfo.depth + ' ' + itemInfo.name + '\n';
    }
    deferred.resolve({"options": options, "text": text});

    return deferred.promise;
};

/**
 * Promises delivery of items representing the results of a folder structure traversal.
 *
 * @method traverse
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {Object} rootItem an item representing the very root item
 * @param {int} depth the depth, on which the traversal should start
 * @return {Promise} promising {"options": options, "pages": pages} containing valid options for the next HTTP request
 *          against the platform and the pages containing the aa:assets, which make up the result of the folder
 *          structure traversal
 */
var traverse = function(options, rootItem, depth) {
    var deferred = Promise.defer();

    var results = [];

    options.path = rootItem.href.replace(new RegExp(' ', 'g'), '%20');
    https.get(options, onItemRequestResponded)
        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onItemRequestResponded(itemResponse) {
        var body = [];
        itemResponse.on('data', function onDataChunk(data) {
            body.push(data);
        });
        itemResponse.on('end', onItemResultData);
        itemResponse.on('error', onItemRequestError);
        function onItemRequestError(e) {
            console.log('Get items failed for <' + rootItem.href + '>.');
            deferred.reject();
        }
        function onItemResultData() {
            var itemsFirstPageResults = JSON.parse(Buffer.concat(body).toString());
            results.push(toItemInfo(itemsFirstPageResults, depth));

            var items = [];

            var embedded = itemsFirstPageResults._embedded;
            var collection = embedded ? embedded['loc:collection'] : undefined;
            var firstPage = collection ? collection._embedded : undefined;
            var pagesGot = Promise.defer();
            if (firstPage) {
                var firstPageItems = firstPage['loc:item'];
                if (firstPageItems) {
                    if (firstPageItems.length) {
                        for (var i = 0; i < firstPageItems.length; ++i) {
                            items.push(firstPageItems[i]);
                        }
                    } else {
                        items.push(firstPageItems);
                    }
                }
                // Get the items of the folder pagewise:
                var linkToNextPage = collection._links.next;
                if (linkToNextPage) {
                    PlatformTools.pageThroughResults(options, linkToNextPage.href)
                        .then(function collect(pages) {
                            for (var pageNo = 0; pageNo < pages.length; ++pageNo) {
                                var foundAssets = pages[pageNo]['loc:item'];
                                for (var j = 0; j < foundAssets.length; ++j) {
                                    var asset = foundAssets[j];
                                    items.push(asset);
                                }
                            }
                            pagesGot.resolve();
                        });
                } else {
                    pagesGot.resolve();
                }
            } else {
                pagesGot.resolve();
            }
            pagesGot.promise
                .then(function continueProcessing() {
                    var itemInfos = new Array(items.length);
                    for (var iii = 0; iii < items.length; ++iii) {
                        itemInfos[iii] = toItemInfo(items[iii], depth + 1);
                    }

                    var ii = 0;
                    (function next() {
                        var nextItemInfo = itemInfos[ii++];
                        if (!nextItemInfo) {
                            deferred.resolve({"options": options, "items": results});
                        } else {
                            if (nextItemInfo.hasChildren) {
                                traverse(options, nextItemInfo, depth + 1)
                                    .then (function(result) {
                                        results = results.concat(result.items);
                                        next();
                                    });

                            } else {
                                results.push(nextItemInfo);
                                next();
                            }
                        }
                    })();
                });
        }
    }

    return deferred.promise;
};

/**
 * Promises delivery of the very root item of a folder structure.
 *
 * @method getRootItem
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlLocations resolved URL for the locations
 * @return {Promise} promising {"options": options, "rootItem": rootItem} containing valid options for the next HTTP
 *          request against the platform and the very root item of the folder structure
 */
var getRootItem = function(options, urlLocations) {
    var deferred = Promise.defer();

    /// Check presence of the locations resource and continue with HATEOAS:
    options.path = urlLocations;
    https.get(options, onLocationsRequestResponded)
        .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onLocationsRequestResponded(locationsResponse) {
        if (200 === locationsResponse.statusCode) {
            var body = [];
            locationsResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            locationsResponse.on('end', onLocationsResultData);
            locationsResponse.on('error', onLocationsRequestError);
            function onLocationsRequestError(e) {
                console.log('Get locations resource failed for <' + options.path + '>.');
                deferred.reject();
            }

            function onLocationsResultData() {
                /// Get the root folder URL:
                var locationsResult = JSON.parse(Buffer.concat(body).toString());
                var urlRootItem = locationsResult._links["loc:root-item"].href ;


                /// The root item:
                // !!
                // The MAM Connectivity Toolkit Connector does always embed all items of a folder. For other
                // service types, the query parameter embed=asset must be added if necessary.
                // E.g. resulting in => https://upstream/apis/$serviceType;version=0;realm=BEEF/locations/folders
                // !!
                var rootItem = {
                    href : urlRootItem
                };

                deferred.resolve({"options": options, "rootItem": rootItem});
            }
        } else {
            console.log("Locations request failed with code '" + locationsResponse.statusMessage + "'");
            deferred.reject();
        }
    }

    return deferred.promise;
};


if (7 !== process.argv.length) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + ' <apidomain> <httpbasicauthstring> <servicetype> <serviceversion> <realm>');
} else {
    var apiDomain = process.argv[2];
    var httpBasicAuthString = process.argv[3];
    var serviceType = process.argv[4];
    var serviceVersion = process.argv[5];
    var realm = process.argv[6];

    var registryServiceVersion = '0';
    var defaultLocationsUriTemplate = 'https://' + apiDomain + '/apis/' + serviceType + ';version=' + serviceVersion + ';realm=' + realm + '/locations';


    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain).catch(PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, httpBasicAuthString);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.findInRegistry(options, apiDomain, [serviceType], registryServiceVersion, 'loc:locations', defaultLocationsUriTemplate, realm);}, PlatformTools.failAndExit)
        .then(function(it) {
            var urlUntemplatedLocations = it.UriTemplates[0];
            var options = it.options;
            return getRootItem(options, urlUntemplatedLocations);
        }, PlatformTools.failAndExit)
        .then(function(it) {return traverse(it.options, it.rootItem, 0);}, PlatformTools.failAndExit)
        .then(function(it) {
            return stringify(it.options, it.items);
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