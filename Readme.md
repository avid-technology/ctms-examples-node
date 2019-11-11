# Please Read Me #
* Implementation:
    * The examples are implemented with Node.js v4.4.5.
    * The examples use REST and HATEOAS.
    * All examples are configured to use a request timeout of 60s each.
    * If appropriate for an example, the CTMS Registry is queried for the resource in question, instead using a hard coded URL.
        * It is assumed that the CTMS Registry runs in version 0 (hard coded).
        * If the CTMS Registry is unreachable or the resource in question cannot be found, a default URL template will be applied.
    * There are some error checks but those are very general and might not cover all cases. Esp. timeouts or unreachable endpoints could happen at any time during the application of REST and HATEOAS.
    * No optimization and no parallelization (e.g. for requesting results from the platform) was implemented.
        * Esp. the examples use HATEOAS to get all links. Instead of HATEOAS all links could be used hard coded or being "bookmarked" without HATEOAS (resulting in execution), but this is not the idea behind RESTful interfaces. Also mind, that those links could change in future so the only save way is to get the via HATEOAS. The examples do only use these URLs directly: https://$apidomain/auth, https://$apidomain/api/middleware/service/ping, https://$apidomain/apis/servicetype;version=0;realm=$realm/locations and https://$apidomain/apis/servicetype;version=0;realm=$realm/searches other URLs are resolved via HATEOAS!
    * For testing purposes, it was required to disable the env NODE_TLS_REJECT_UNAUTHORIZED to accept arbitrary SSL certificates. Please notice, that this may not be acceptable for productive code.

* Dependencies:
    * Additionally, the Node.js modules 'https' and 'uuid' were used and need to be installed manually via npm.
    * Optionally, e.g. for debugging purposes, the Node.js module 'https-proxy-agent' can be installed to configure a proxy agent for outgoing requests, respective sections in 'PlatformTools.js' can just be uncommented.

* Running the examples:
    * Install Node.js v4.4.5.
    * Install the above enumerated dependent Node.js modules via npm.
    * => When running the scripts on a terminal, make sure you have specified correct command line arguments: node _script_.js _apidomain_ _httpbasicauthstring_ _[servicetype]_ _[serviceversion]_ _[realm]_ '_[searchexpression]_' [_advancedsearchdescriptionfilename_]
    * The Orchestration examples do not accept a servicetype parameter, their servicetype is always "avid.orchestration.ctc".
    * The SimpleSearch and QueryProcesses examples await the searchexpression in single quotes as last argument:
        * node simplesearch.js _apidomain_ _httpbasicauthstring_ _servicetype_ _realm_ '_searchexpression_'
        * Example: node simplesearch.js upstream httpbasicauthstring avid.mam.assets.access BEEF "'*'"
        * node queryprocesses.js _apidomain_ _httpbasicauthstring_ _realm_ '_searchexpression_'
        * Example: node queryprocesses.js upstream httpbasicauthstring BEEF "'*'"
    * The AdvancedSearch example awaits the file name of a file containing the advanced search description as last argument:
        * node advancedSearch.js _apidomain_ _httpbasicauthstring_ _servicetype_ _realm_ _advancedsearchdescriptionfilename_
        * Example: advancedSearch.js upstream httpbasicauthstring avid.mam.assets.access BEEF Resources\MAMAdvancedSearchDescription.txt
    * The queryserviceregistry example needs no servicetype (always "avid.ctms.registry") and no realm (always "global"/"") argument. __The registry is not yet part of the release, therefor it must be assured, that the "avid.ctms.registry" service is running on the platform instance in question.__
        * node queryserviceregistry.js _apidomain_ _httpbasicauthstring_
        * Example: queryserviceregistry.js upstream httpbasicauthstring
    * Optionally, e.g. for debugging purposes, the Node.js module 'https-proxy-agent' can be installed to configure a proxy agent for outgoing requests, respective sections in 'PlatformTools.js' can just be uncommented.
        * Notice, that using a proxy can reduce the performance of HTTP requests.
        * Notice also, that having set proxy options as shown above while *no proxy* is configured can reduce the performance of HTTP requests by an order of magnitude!