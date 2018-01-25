/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-07-08
 * Time: 12:00
 * Project: CTMS
 */

// Todos:
// - Encapsulate these functionalities in PlatformTools.js
// -- Use logging with winston. -> Last argument needs to be {} basically: logger.debug("X: %d and Y: %d", 42, 21 {});
// -- Use JSONPath.
// -- Use url-template (check with legal).

var https = require('https');
// Set httpsProxyAgent to enable proxying of requests:
var HttpsProxyAgent = require('https-proxy-agent');
var httpsProxyAgent = null;//new HttpsProxyAgent('http://127.0.0.1:8888');

var sessionRefresher;


/**
 * Performs the default action/sideeffect, if a request timed out. Currently just a message is logged.
 *
 * @method onRequestTimeout
 */
var onRequestTimeout = function() {
    console.log("Request has timed out");
};

/**
 * Retrieves the the default request timeout in ms.
 *
 * @method getDefaultRequestTimeoutms
 * @return the default request timeout in ms
 */
var getDefaultRequestTimeoutms = function() {
    return 60000;
};

/**
 * Ends the process with failure.
 */
var failAndExit = function() {
    console.log('End');
    clearInterval(sessionRefresher);
    process.exit(-1);
};

/**
 * Promises delivery of the auth endpoint resource.
 *
 * @method getAuthEndpoint
 * @param {Object} lastOptions (optional) valid options for the next HTTP request against the platform, if null is passed,
 *          new options will applied internally
 * @param apiDomain address to get the authorization endpoint
 * @return {Promise} promising {"options": options, "response": authEndpointResult} containing valid options for the
 *          next HTTP request against the platform and the auth endpoint result in the gotten response.
 */
var getAuthEndpoint = function(lastOptions, apiDomain) {
    var deferred = Promise.defer();

    var options
        = lastOptions
            ? lastOptions
            : {
                  'host'    : apiDomain
                , 'method'  : 'GET'
                , 'headers' : {
                    'Content-Type'  : 'application/json'
                    , 'Accept'      : 'application/hal+json'
                }
                , 'agent' : httpsProxyAgent
            };
    options.path = '/auth';

    https.get(options, onAuthRequestResponded)
        .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onAuthRequestResponded(authResponse) {
        if(303 === authResponse.statusCode || 200 === authResponse.statusCode) {
            var body = [];
            authResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            authResponse.on('end', onAuthResultData);
            authResponse.on('error', function onAuthRequestError() {
                deferred.reject();
            });
            function onAuthResultData() {
                var rawAuth = JSON.parse(Buffer.concat(body).toString());
                deferred.resolve({"response": rawAuth, "options": options});
            }
        } else {
            console.log("Getting Auth Endpoint request failed with '" + authResponse.statusMessage + "'");
            deferred.reject();
        }
    }
    return deferred.promise;
};

/**
 * Promises delivery of the identity providers resource.
 *
 * @method getIdentityProviders
 * @param {Object} lastResult valid options for the next HTTP request against the platform and a response containing the
 *          auth endpoint resource
 * @return {Promise} promising {"options": options, "response": identityProvidersResult} containing valid options for
 *          the next HTTP request against the platform and the identity providers result in the gotten response.
 */
var getIdentityProviders = function(lastResult) {
    var deferred = Promise.defer();

    lastResult.options.path = lastResult.response._links['auth:identity-providers'][0].href;
    https.get(lastResult.options, onIdentityProvidersRequestResponded)
        .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onIdentityProvidersRequestResponded(identityProvidersResponse) {
        if(303 === identityProvidersResponse.statusCode || 200 === identityProvidersResponse.statusCode) {
            var body = [];
            identityProvidersResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            identityProvidersResponse.on('end', onIdentityProvidersResultData);
            identityProvidersResponse.on('error', function onIdentityProvidersRequestError() {
                deferred.reject();
            });
            function onIdentityProvidersResultData() {
                // Get identity providers:
                var rawIdentityProviders = JSON.parse(Buffer.concat(body).toString());

                deferred.resolve({"response": rawIdentityProviders, "options": lastResult.options});
            }
        }  else {
            console.log("Getting Identity Providers request failed with '" + identityProvidersResponse.statusMessage + "'");
            deferred.reject();
        }
    }
    return deferred.promise;
};

/**
 * Promises MC|UX-based authorization with the passed identity providers HAL resource.
 *
 * @param {Object} lastResult valid options for the next HTTP request against the platform and a response containing the
 *          identity providers resource
 * @param apiDomain address to get "auth"
 * @param username  MC|UX login
 * @param password  MC|UX password
 * @return {Promise} promising authorization {options} containing valid options for the next HTTP request against the
 *          platform
 */
var authorize = function(lastResult, apiDomain, username, password) {
    var deferred = Promise.defer();

    var identityProviders = lastResult.response._embedded['auth:identity-provider'];
    var urlAuthorization;
    for(var i = 0; i < identityProviders.length; ++i) {
        if('mcux' === identityProviders[i]['kind']) {
            var logins = identityProviders[i]['_links']['auth-mcux:login'];
            urlAuthorization = logins.length ? logins[0]['href'] : undefined;
            break;
        }
    }

    if(urlAuthorization) {
        var authorizationContent = '{"username" : "' + username + '", "password" : "' + password + '"}';
        var loginOptions = {
            'host'      : lastResult.options.host
            , 'path'    : urlAuthorization
            , 'method'  : 'POST'
            , 'headers' : {
                'Content-Type'  : 'application/json'
                , 'Accept'      : 'application/json'
            }
            , 'agent' : httpsProxyAgent
        };
        var loginRequest = https.request(loginOptions, onLoginRequestResponded)
            .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
        function onLoginRequestResponded(loginResponse) {
            if(303 === loginResponse.statusCode || 200 === loginResponse.statusCode) {
                var allCookies = '';
                var cookieHeaderFieldValue;

                for(var p in loginResponse.headers) {
                    if (loginResponse.headers.hasOwnProperty(p) && 'set-cookie' === p.toLowerCase()) {
                        cookieHeaderFieldValue = loginResponse.headers[p];
                        break;
                    }
                }

                for(var i = 0; i < cookieHeaderFieldValue.length; ++i) {
                    allCookies += cookieHeaderFieldValue[i]+';';
                }
                lastResult.options.headers = lastResult.options.headers ? lastResult.options.headers : {};
                lastResult.options.headers['Cookie'] = allCookies;

                var refreshPeriodMilliseconds = 120000;
                sessionRefresher
                    = setInterval(function sessionKeepAlive() {
                        // TODO: this is a workaround, see {CORE-7359}. In future the access token prolongation API should be used.
                        var urlPing = 'https://'+apiDomain+'/api/middleware/service/ping';
                        var pingOptions = {
                            'host'      : lastResult.options.host
                            , 'path'    : urlPing
                            , 'headers' : {
                                'Content-Type'  : 'application/json'
                                , 'Accept'      : 'application/json'
                                , 'Cookie'      : allCookies
                            }
                            , 'agent' : httpsProxyAgent
                        };
                        https.get(pingOptions, undefined)
                            .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
                    }
                    , refreshPeriodMilliseconds);
                deferred.resolve(lastResult.options);
            } else {
                console.log("Authorization request failed with '" + loginResponse.statusMessage + "'");
                deferred.reject();
            }
        }
        loginRequest.write(authorizationContent);
        loginRequest.end();
    } else {
        deferred.reject();
    }

    return deferred.promise;
};

/**
 * Promises the results of the CTMS Registry lookup or promises the default URI for the resource in question.
 *
 * @param {Object} lastOptions valid options for the next HTTP request against the platform
 * @param apiDomain address to access the CTMS Registry
 * @param {Array} serviceTypes array of service types, of which the resource in question should be looked up in the CTMS
 *          Registry
 * @param {String} registryServiceVersion version of the CTMS Registry to query
 * @param {String} resourceName resource to look up in the CTMS Registry, such as "search:simple-search"
 * @param {String} orDefaultUriTemplate URI template which will be returned in the promise, if the CTMS Registry is
 *          unreachable or the resource in question cannot be found
 * @return {Promise} promising {"options": options, "UriTemplates": uriTemplates} containing valid options for the next
 *          HTTP request against the platform and an array containing URI templates, under which the queried resource
 *          can be found. If the CTMS Registry is unreachable or the resource in question cannot be found, the array of
 *          URI templates will contain the orDefaultUriTemplate as single entry.
 */
var findInRegistry = function(lastOptions, apiDomain, serviceTypes, registryServiceVersion, resourceName, orDefaultUriTemplate) {
    var deferred = Promise.defer();

    lastOptions.path = 'https://' + apiDomain + '/apis/avid.ctms.registry;version=' + registryServiceVersion + '/serviceroots';
    https.get(lastOptions, onServiceRootsRequestResponded)
        .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onServiceRootsRequestResponded(serviceRootsTokenResponse) {
        if (303 === serviceRootsTokenResponse.statusCode || 200 === serviceRootsTokenResponse.statusCode) {
            var body = [];
            serviceRootsTokenResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            serviceRootsTokenResponse.on('end', onServiceRootsResultData);
            serviceRootsTokenResponse.on('error', function onServiceRootsRequestError(e) {
                deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
            });
            function onServiceRootsResultData() {
                var serviceRootsResult = JSON.parse(Buffer.concat(body).toString());

                var resources = serviceRootsResult['resources'];
                if (resources) {
                    var theOneResource = resources[resourceName];
                    if (theOneResource) {
                        var foundUriTemplates = [];

                        if (theOneResource.length) {
                            theOneResource.forEach(function(it) {
                                var href = it['href'];
                                serviceTypes.forEach(
                                    function(it2) {
                                        if (0 >= it2.indexOf(href)) {
                                            foundUriTemplates.push(href);
                                        }
                                    }
                                )
                            });

                            if (!foundUriTemplates.length) {
                                console.log(resourceName + ' not registered, defaulting to the specified URI template');
                                deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
                            } else {
                                deferred.resolve({"options": lastOptions,  "UriTemplates": foundUriTemplates});
                            }
                        } else {
                            var href = theOneResource['href'];

                            serviceTypes.forEach(
                                function(it2) {
                                    if (0 >= it2.indexOf(href)) {
                                        foundUriTemplates.push(href);
                                    }
                                }
                            );

                            if (foundUriTemplates.length) {
                                deferred.resolve({"options": lastOptions,  "UriTemplates": foundUriTemplates});
                            } else {
                                console.log(resourceName + ' not registered, defaulting to the specified URI template');
                                deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
                            }
                        }
                    } else {
                        console.log(resourceName + ' not registered, defaulting to the specified URI template');
                        deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
                    }
                } else {
                    console.log('no registered resources found, defaulting to the specified default URI template');
                    deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
                }

            }
        } else {
            console.log('CTMS Registry not reachable (request failed), defaulting to the specified URI template');
            deferred.resolve({"options": lastOptions, "UriTemplates": [orDefaultUriTemplate] });
        }
    }

    return deferred.promise;
};

/**
 * Promises delivery of the current MC|UX session token.
 *
 * @method getCurrentToken
 * @param {"options": options, "response": response} lastResult containing valid options for the
 *          next HTTP request against the platform and a response containing links to authorization related
 *          functionality
 * @return {Promise} promising {"options": options, "response": currentTokenResult} containing valid options for the
 *          next HTTP request against the platform and the current token result in the gotten response.
 */
var getCurrentToken = function(lastResult) {
    var deferred = Promise.defer();
    var tokens = lastResult.response._links['auth:token'];
    var urlCurrentToken;
    for(var i = 0; i < tokens.length; ++i) {
        if('current' === tokens[i]['name']) {
            urlCurrentToken = tokens[i].href;
            break;
        }
    }

    lastResult.options.path = urlCurrentToken;
    https.get(lastResult.options, onCurrentTokenRequestResponded)
        .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onCurrentTokenRequestResponded(currentTokenResponse) {
        if(303 === currentTokenResponse.statusCode || 200 === currentTokenResponse.statusCode) {
            var body = [];
            currentTokenResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            currentTokenResponse.on('end', onCurrentTokenResultData);
            currentTokenResponse.on('error', function onCurrentTokenRequestError(e) {
                deferred.reject();
            });
            function onCurrentTokenResultData() {
                var currentTokenResult = JSON.parse(Buffer.concat(body).toString());
                deferred.resolve({"options": lastResult.options, "response": currentTokenResult});
            }
        } else {
            console.log("Getting Current Token request failed with '" + currentTokenResponse.statusMessage + "'");
            deferred.reject();
        }
    }

    return deferred.promise;
};

/**
 * Promises removal of session identified by the passed session token.
 *
 * @method removeToken
 * @param {"options": options, "response": response} lastResult containing valid options for the
 *          next HTTP request against the platform and a response specifying the session token to remove
 * @return {Promise} promising completion of session removal.
 */
var removeToken = function(lastResult) {
    var deferred = Promise.defer();

    var removeTokenOptions = {
        'host'      : lastResult.options.host
        , 'path'    : lastResult.response._links['auth-token:removal'][0].href
        , 'method'  : 'DELETE'
        , 'headers' : {
            'Content-Type'  : 'application/json'
            , 'Accept'      : 'application/json'
            , 'Cookie'      : lastResult.options.headers['Cookie']
        }
        , 'agent' : httpsProxyAgent
    };
    https.get(removeTokenOptions, onRemoveTokenRequestResponded)
        .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onRemoveTokenRequestResponded(removeTokenResponse) {
        if(303 === removeTokenResponse.statusCode || 204 === removeTokenResponse.statusCode) {
            removeTokenResponse.on('data', function noop(){});
            removeTokenResponse.on('end', function onEnd(e) {
                clearInterval(sessionRefresher);
                deferred.resolve();
            });
            removeTokenResponse.on('error', function onRemoveTokenRequestError(e) {
                clearInterval(sessionRefresher);
                deferred.reject();
            });
        } else {
            console.log("Remove Token request failed with '" + removeTokenResponse.statusMessage +"'");
            deferred.reject();
        }
    }

    return deferred.promise;
};

/**
 * Promises delivery of all pages representing the HAL resources available via the passed resultPageURL.
 *
 * Pages through the HAL resources available via the passed urlResultPage and collects the found pages into the promise.
 * If the HAL resource available from urlResultPage has the property "_embedded", its content will be collected into the
 * pages. And if this HAL resource has the property "pageResult._links.next", its href will be used to fetch the next
 * page and call this method recursively.
 *
 * @method pageThroughResults
 * @param {Options} options HTTP options object, authorized against the platform
 * @param {String} urlResultPage URL to a HAL resource, which supports paging
 * @return {Promise} promises delivery of all pages.
 */
var pageThroughResults = function(options, urlResultPage) {
    var deferred = Promise.defer();

    var pages = [];
    // TODO: the extra replacement is required for PAM and acts as temp. fix.
    options.path = urlResultPage.replace(new RegExp(' ', 'g'), '%20');
    https.get(options, onNextPageRequestResponded)
         .setTimeout(getDefaultRequestTimeoutms(), onRequestTimeout);
    function onNextPageRequestResponded(pageResponse) {
        if(303 === pageResponse.statusCode || 200 === pageResponse.statusCode) {
            var body = [];
            pageResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            pageResponse.on('end', onPageResultData);
            pageResponse.on('error', onPageResultError);
            function onPageResultError(e) {
                console.log('Paging failed for <' + urlResultPage + '>.');
                deferred.reject();
            }

            function onPageResultData() {
                var pageResult = JSON.parse(Buffer.concat(body).toString());

                var embeddedResults = pageResult._embedded;
                // Do we have results:
                if (pages && embeddedResults) {
                    pages.push(embeddedResults);

                    // If we have more results, follow the next link and get the next page:
                    var linkToNextPage = pageResult._links.next;
                    if (linkToNextPage) {
                        pageThroughResults(options, linkToNextPage.href)
                            .then(function addToPages(nextPages) {
                                return pages.concat(nextPages);
                            })
                            .then(function done(nextPages) {
                                deferred.resolve(nextPages);
                            })
                            .catch(function() {
                                deferred.reject();
                            });
                    } else {
                        deferred.resolve(pages);
                    }
                } else {
                    deferred.resolve(pages);
                }
            }
        } else {
            console.log('Paging failed for <' + urlResultPage + '>.');
            deferred.reject();
        }
    }

    return deferred.promise;
};

/**
 * Trims the UTF-8 BOM away, if any.
 *
 * @method removeUTF8BOM
 * @param {String} s does potentially have a superfluous UTF-8 BOM
 * @return {String} a string w/o UTF-8 BOM.
 */
var removeUTF8BOM = function(s) {
    return s.startsWith('\uFEFF')
        ? s.substring(1)
        : s;
};

module.exports.getAuthEndpoint = getAuthEndpoint;
module.exports.getIdentityProviders = getIdentityProviders;
module.exports.authorize = authorize;
module.exports.findInRegistry = findInRegistry;
module.exports.getCurrentToken = getCurrentToken;
module.exports.removeToken = removeToken;
module.exports.onRequestTimeout = onRequestTimeout;
module.exports.getDefaultRequestTimeoutms = getDefaultRequestTimeoutms;
module.exports.removeUTF8BOM = removeUTF8BOM;
module.exports.pageThroughResults = pageThroughResults;
module.exports.failAndExit = failAndExit;