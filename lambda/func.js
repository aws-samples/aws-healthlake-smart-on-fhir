// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

function urlEncode(plainBody) {
    var formBody = [];
    for (var property in plainBody) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(plainBody[property]);
        formBody.push(encodedKey + '=' + encodedValue);
    }
    formBody = formBody.join('&');
    return formBody;
}

module.exports.urlEncode = urlEncode;
