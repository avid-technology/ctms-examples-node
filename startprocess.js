/**
 * Copyright 2016 by Avid Technology, Inc.
 * User: nludwig
 * Date: 2016-07-12
 * Time: 12:00
 * Project: CTMS
 */

/**
 * This example starts a process and monitors its progress.
 */
var https = require('https');
var uuid = require('uuid');
var PlatformTools = require('./PlatformTools');

/**
 * Promises monitoring of the specified process.
 *
 * @method stringify
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlStartedProcess the URL, which specifies the process instance to monitor
 * @return {Promise} promising completion
 */
var monitorProcess = function(options, urlStartedProcess) {
    var deferred = Promise.defer();

    options.path = urlStartedProcess;
    https.get(options, onStartedProcessRequestResponded)
         .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onStartedProcessRequestResponded(startedProcessResponse) {
        var body = [];
        startedProcessResponse.on('data', function onDataChunk(data) {
            body.push(data);
        });
        startedProcessResponse.on('end', onStartedProcessResultData);
        startedProcessResponse.on('error', onStartedProcessRequestError);
        function onStartedProcessRequestError(e) {
            console.log('Getting started process failed with <' + urlStartedProcess + '>.');
            deferred.reject();
        }
        function onStartedProcessResultData() {
            // Continue monitoring the result:
            var processResult = JSON.parse(Buffer.concat(body).toString());
            var lifecycle = processResult.lifecycle;

            console.log('Lifecycle: '+lifecycle);
            if('pending' === lifecycle || 'running' === lifecycle) {
                var startedProcessLinkObject = processResult._links.self;
                var urlStartedProcess = startedProcessLinkObject.href;

                setTimeout(function waitThenContinueWith() {
                    monitorProcess(options, urlStartedProcess)
                        .then(deferred.resolve);
                }, 500);
            } else {
                deferred.resolve();
            }
        }
    }

    return deferred.promise;
};

/**
 * Promises starting a process.
 *
 * @method startProcess
 * @param {Object} options valid options for the next HTTP request against the platform
 * @param {String} urlStartProcess resolved URL to start processes
 * @return {Promise} promising {options} containing valid options for the next HTTP request
 *          against the platform and completion of process execution
 */
var startProcess = function(options, urlStartProcess) {
    var deferred = Promise.defer();
    /// Create an export process:
    var now = new Date().toISOString();
    var itemToExport = '2016050410152760101291561460050569B02260000003692B00000D0D000005';
    var newProcessName = ('New process as to '+now).replace(new RegExp('[ :-]', 'g'), '_');
    var newProcessId = uuid.v4();

    var processDescription = {
        "base": {
            "id": newProcessId,
            "type": "MAM_EXPORT_FILE",
            "systemType": "interplay-mam",
            "systemID": realm
        },
        "common": {
            "name": newProcessName,
            "creator": "JavaScript_Example",
            "created": now,
            "modifier": "Service-WorkflowEngine",
            "modified": now
        },
        "attachments": [
            {
                "base": {
                    "id": itemToExport,
                    "type": "Asset",
                    "systemType": "interplay-mam",
                    "systemID": realm
                }
            }
        ]
    };

    /// Start the process and write the lifecycle to stdout:
    var startProcessRequestOptions = {
        'host'      : options.host
        , 'path'    : urlStartProcess
        , 'method'  : 'POST'
        , 'headers' : {
            'Content-Type'  : 'application/json'
            , 'Accept'      : 'application/json'
            , 'Authorization':options.headers.Authorization
        }
        , 'agent'   : options.agent
    };

    var startProcessRequest = https.request(startProcessRequestOptions, onStartProcessRequestResponded)
                                   .setTimeout(PlatformTools.getDefaultRequestTimeoutms(), PlatformTools.onRequestTimeout);
    function onStartProcessRequestResponded(startProcessResponse) {
        if (303 === startProcessResponse.statusCode || 200 === startProcessResponse.statusCode) {
            var body = [];
            startProcessResponse.on('data', function onDataChunk(data) {
                body.push(data);
            });
            startProcessResponse.on('end', onStartProcessResultData);
            startProcessResponse.on('error',  function onStartProcessRequestError(e) {
                deferred.reject();
            });
            function onStartProcessResultData() {
                // Start monitoring the started process:
                var processResult = JSON.parse(Buffer.concat(body).toString());
                var lifecycle = processResult.lifecycle;

                console.log('Process: "'+newProcessName+'" - start initiated');
                console.log('Lifecycle: '+lifecycle);
                if('pending' === lifecycle || 'running' === lifecycle) {
                    var startedProcessLinkObject = processResult._links.self;
                    var urlStartedProcess = startedProcessLinkObject.href;

                    monitorProcess(options, urlStartedProcess)
                        .then(function done() {
                           deferred.resolve(options);
                        });
                } else {
                    deferred.resolve(options);
                }
            }
        } else {
            console.log(startProcessResponse.statusCode+' '+startProcessResponse.statusMessage);
            deferred.reject();
        }
    }
    startProcessRequest.write(JSON.stringify(processDescription));
    startProcessRequest.end();

    return deferred.promise;
};


if (6 !== process.argv.length) {
    console.log('Usage: ' + process.argv[0] + ' ' + process.argv[1] + " <apidomain> <httpbasicauthstring> <orchestrationserviceversion> <realm>");
} else {
    var apiDomain = process.argv[2];
    var httpBasicAuthString = process.argv[3];
    var orchestrationServiceVersion = process.argv[4];
    var realm = process.argv[5];

    var orchestrationServiceType = 'avid.orchestration.ctc';
    var registryServiceVersion = '0';
    var defaultOrchestrationUriTemplate = 'https://' + apiDomain + '/apis/' + orchestrationServiceType + ';version=' + orchestrationServiceVersion + ';realm=' + realm + '/processes/{id}{?offset,limit,sort}';


    // Enable tolerant server certificate validation:
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

    PlatformTools
        .getAuthEndpoint(null, apiDomain).catch(PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.getIdentityProviders(it);}, PlatformTools.failAndExit)
        .then(function(it) {
            return PlatformTools.authorize(it, apiDomain, httpBasicAuthString);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.findInRegistry(options, apiDomain, [orchestrationServiceType], registryServiceVersion, 'orchestration:process', defaultOrchestrationUriTemplate, realm);}, PlatformTools.failAndExit)
        .then(function(it) {
            var options = it.options;
            var urlUntemplatedStartProcess = it.UriTemplates[0];
            urlUntemplatedStartProcess = urlUntemplatedStartProcess.substring(0, urlUntemplatedStartProcess.lastIndexOf('{id}'));
            return startProcess(options, urlUntemplatedStartProcess);
        }, PlatformTools.failAndExit)
        .then(function(options) {return PlatformTools.getAuthEndpoint(options, apiDomain);}, PlatformTools.failAndExit)
        .then(function(options) {
            return PlatformTools.getCurrentToken(options);
        }, PlatformTools.failAndExit)
        .then(function(it) {return PlatformTools.removeToken(it);}, PlatformTools.failAndExit)
        .then(function() {console.log("End"); process.exit();})
        .catch(PlatformTools.failAndExit);
}