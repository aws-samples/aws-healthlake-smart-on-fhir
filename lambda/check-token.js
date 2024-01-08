// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

'use strict';
const func = require('./func');
const axios = require('axios');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

module.exports.handler = async (event) => {
    let token = event.bearerToken;

    let response, body, encodedBody, authorization;

    //get client secrets from Secrets Manager
    const secret_name = 'SOF-HL';
    const client = new SecretsManagerClient({
        region: process.env.AWS_REGION,
    });

    try {
        response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name,
                VersionStage: 'AWSCURRENT', // VersionStage defaults to AWSCURRENT if unspecified
            })
        );
    } catch (error) {
        throw error;
    }

    const secret = JSON.parse(response.SecretString);
    const roleARN = secret.hl_role_arn;
    const API_KEY = secret.api_key;
    const API_URL2 = new URL(secret.auth_endpoint_introspect);
    const enhancedLogging = secret.lambda_enhanced_logging;

    let inputEvent = event;
    if (enhancedLogging === 'true') {
        console.log('INPUT EVENT: ' + JSON.stringify(inputEvent));
    } else {
        inputEvent.bearerToken = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
        console.log('INPUT EVENT: ' + JSON.stringify(inputEvent));
    }

    body = { token: token };
    encodedBody = func.urlEncode(body);
    authorization = 'Bearer ' + API_KEY;

    try {
        axios.interceptors.request.use((req) => {
            if (enhancedLogging === 'true')
                console.log('REQUEST SENT TO OAuth2 SERVER: ' + '\r\n', JSON.stringify(req, null, 2));
            return req;
        });
        const { data } = await axios.post(API_URL2.href, encodedBody, {
            hostname: API_URL2.host,
            path: API_URL2.pathname,
            protocol: API_URL2.protocol,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: '*/*',
                Host: API_URL2.hostname,
                Authorization: authorization, //encoding base64
            },
        });
        if (enhancedLogging === 'true') console.log('OAuth2 SERVER RESPONSE :' + '\r\n', JSON.stringify(data, null, 2));
        response = data;
        response.isAuthorized = response.active;
    } catch (error) {
        if (enhancedLogging === 'true')
            console.log('OAuth2 SERVER ERROR OCCURRED: \r\n', JSON.stringify(error, null, 2));
        throw error;
    }

    const authPayload = {
        authPayload: {
            iss: secret.auth_endpoint_token,
            aud: event.datastoreEndpoint,
            iat: response.iat,
            nbf: response.nbf,
            exp: response.exp,
            isAuthorized: response.isAuthorized,
            scope: response.scope,
        },
        iamRoleARN: roleARN,
    };
    console.log('RESPONSE SENT TO HEALTHLAKE:' + '\r\n', JSON.stringify(authPayload, null, 2));
    return authPayload;
};
