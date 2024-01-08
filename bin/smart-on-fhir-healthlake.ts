// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AllResourcesStack } from '../lib/smart-on-fhir-healthlake-stack';

const app = new cdk.App();

const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const tagName = app.node.tryGetContext('tagName');
const tagValue = app.node.tryGetContext('tagValue');
const prefix = app.node.tryGetContext('prefix');

const myAllResourcesStack = new AllResourcesStack(app, 'myAllResourcesStack', {
    env: { account: account, region: region },
    stackName: prefix + 'AllResourcesStack',
});
cdk.Tags.of(myAllResourcesStack).add(tagName, tagValue);

app.synth();
