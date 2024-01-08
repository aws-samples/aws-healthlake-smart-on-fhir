// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from 'aws-cdk-lib';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretManager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from "aws-cdk-lib/aws-logs";
import * as healthlake from 'aws-cdk-lib/aws-healthlake';

export class AllResourcesStack extends cdk.Stack {

    constructor(scope : cdk.App, id : string, props: cdk.StackProps) {
        super(scope, id, props);

        
        ////READ THE CONFIGURATION PARAMETERS////
        const account = this.node.tryGetContext("account");
        const region = this.node.tryGetContext("region");
        const datastoreName = this.node.tryGetContext("datastoreName");
        const client_id = this.node.tryGetContext("clientId");
        const client_secret = this.node.tryGetContext("clientSecret");
        const prefix = this.node.tryGetContext("prefix");
        const auth_endpoint = this.node.tryGetContext("authEndpoint");
        const auth_endpoint_token = this.node.tryGetContext("authEndpointToken");
        const auth_endpoint_introspect = this.node.tryGetContext("authEndpointIntrospect");
        const api_key = this.node.tryGetContext("srvAPIKey");
        const concurrentExecutions = this.node.tryGetContext("lambdaConcurrentExecutions");
        const preloadData = this.node.tryGetContext("preloadData");
        const preloadDataType = this.node.tryGetContext("preloadDataType");
        const lambdaEnhancedLogging = this.node.tryGetContext("lambdaEnhancedLogging");

        ///IAM SECTION 1////
        //IAM ROLE FOR LAMBDA - TOKEN FUNCTIONS
        const lambdaRole = new iam.Role(this, "lambdaRole", {
            assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal("lambda.amazonaws.com"), new iam.ServicePrincipal("healthlake.amazonaws.com")),
            roleName: prefix + "Lambda-Role"
        });


        ////LAMBDA SECTION////
        //lambda function for checking the access_token
        const checkTokenFunction = new lambda.Function(this, "checkTokenFunction", {
            functionName: prefix + "checkToken",
            description: "Function invoked by HealthLake to verify the validity of a token",
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset("./lambda"),
            handler: "check-token.handler",
            logRetention: logs.RetentionDays.TWO_WEEKS,
            timeout: cdk.Duration.seconds(10),
            role: lambdaRole,
            reservedConcurrentExecutions: concurrentExecutions,
            memorySize: 512
        });
        //gives permission to healthlake to invoke the checkToken function
        checkTokenFunction.grantInvoke(new iam.ServicePrincipal('healthlake.amazonaws.com'));


        //// HEALTHLAKE SECTION ///
        //define metadata for HelathLake datastore creation
      const meta = {
        "authorization_endpoint": auth_endpoint_token,
        "token_endpoint": auth_endpoint_token,
        "token_endpoint_auth_methods_supported": ["client_secret_basic"],
        "grant_types_supported": ["client_credential"],
        "scopes_supported": ["openId", "profile", "launch"],
        "response_types_supported": ["code"],
        "code_challenge_methods_supported": ["S256"],
        "capabilities": ["launch-ehr", "sso-openid-connect", "client-public"],
        "issuer": auth_endpoint + "auth/realms/test",
        "jwks_uri": auth_endpoint + ".well-known/jwks.json",
        "introspection_endpoint": auth_endpoint_introspect,
        "registration_endpoint": auth_endpoint,
        "management_endpoint": auth_endpoint + "user/manage",
        "revocation_endpoint":auth_endpoint + "admin/oauth2/revoke"
        };
    
        var newDatastore: healthlake.CfnFHIRDatastoreProps;
        //checks whether the datastore needs to be preloaded with data
        if (preloadData) {
            newDatastore = {
                datastoreTypeVersion: 'R4',
                datastoreName: prefix + datastoreName,
                identityProviderConfiguration: {
                    authorizationStrategy: 'SMART_ON_FHIR_V1',
                    fineGrainedAuthorizationEnabled: true,
                    //idpLambdaArn: "arn:aws:lambda:us-east-1:123456789012:function:checkToken",
                    idpLambdaArn: checkTokenFunction.functionArn,
                    metadata: JSON.stringify(meta)
                },
                preloadDataConfig: {
                    preloadDataType: preloadDataType
                }
            }
            
        } else {
            newDatastore = {
                datastoreTypeVersion: 'R4',
                datastoreName: prefix + datastoreName,
                identityProviderConfiguration: {
                    authorizationStrategy: 'SMART_ON_FHIR_V1',
                    fineGrainedAuthorizationEnabled: true,
                    //idpLambdaArn: "arn:aws:lambda:us-east-1:123456789012:function:checkToken",
                    idpLambdaArn: checkTokenFunction.functionArn,
                    metadata: JSON.stringify(meta)
                }
            }
        }
    
        const cfnFHIRDatastore = new healthlake.CfnFHIRDatastore(this, 'MyCfnFHIRDatastore', newDatastore);

        ///IAM SECTION 2////
        // IAM Role for Healthlake Operations

    // Policy statement to allow operations on the HealthLake datastore
    const healthlakeStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "healthlake:CreateResource",
          "healthlake:DeleteResource",
          "healthlake:ReadResource",
          "healthlake:ListTagsForResource",
          "healthlake:SearchWithGet",
          "healthlake:SearchWithPost",
          "healthlake:TagResource",
          "healthlake:UntagResource",
          "healthlake:UpdateResource",
          "healthlake:ListFHIRDatastores",
          "healthlake:DescribeFHIRDatastore",
        ],
        resources: [          
            cfnFHIRDatastore.attrDatastoreArn
        ],
        sid: "SOFHealthLakeHL"
      });
      // Policy statement to allow passing the role to HealthLake
    const healthlakeStatement2 = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            "iam:PassRole"
        ],
        resources: [          
            cfnFHIRDatastore.attrDatastoreArn
        ],
        conditions: {
            StringEquals: {
                "iam:PassedToService": "healthlake.amazonaws.com"
            }
        },
        sid: "SOFHealthLakeIAM"
      });

      const healthlakePolicy = new iam.Policy(this, "healthlakePolicy", {
        policyName: prefix + "healthlake-policy",
        statements: [
            healthlakeStatement,
            healthlakeStatement2
        ]
    });

    const healthLakeRole = new iam.Role(this, "healthLakeRole", {
        assumedBy: new iam.CompositePrincipal(new iam.ServicePrincipal("healthlake.amazonaws.com")),
        roleName: prefix + "Role-for-HealthLake"
    }); 

    healthlakePolicy.attachToRole(healthLakeRole);


        // /// SECRETS MANAGER SECTION /// //
    //store client_id and client_secret in Secrets Manager
    const secret = new secretManager.Secret(this, "Secret", {
        secretName: "SOF-HL",
        secretObjectValue: {
            client_id: cdk.SecretValue.unsafePlainText(client_id),
            client_secret: cdk.SecretValue.unsafePlainText(client_secret),
            auth_endpoint: cdk.SecretValue.unsafePlainText(auth_endpoint),
            auth_endpoint_token: cdk.SecretValue.unsafePlainText(auth_endpoint_token),
            auth_endpoint_introspect: cdk.SecretValue.unsafePlainText(auth_endpoint_introspect),
            api_key: cdk.SecretValue.unsafePlainText(api_key),
            hl_role_arn: cdk.SecretValue.unsafePlainText(healthLakeRole.roleArn),
            hl_datastore_name: cdk.SecretValue.unsafePlainText(prefix + datastoreName),
            lambda_enhanced_logging: cdk.SecretValue.unsafePlainText(lambdaEnhancedLogging)
        }
    });

    //// IAM SECTION 3 ////
    // creates and attaches a resource policy to the secret

    secret.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
            "secretsmanager:GetSecretValue",
        ],
        resources: [          
            secret.secretArn
        ],
        sid: "SOFSecretManagerAllow", 
        principals: [
            new iam.ArnPrincipal(lambdaRole.roleArn)
        ]
    }));
    
    
    secret.addToResourcePolicy(new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:PutSecretValue"
        ],
        resources: [          
            secret.secretArn
        ],
        principals:[new iam.AnyPrincipal],
        conditions: {
            StringNotLike: {
                "aws:userId": lambdaRole.roleId + ":*"
            }
        },
        sid: "SOFSecretManagerDeny"

    }))

    // Policies for the lambda functions

    // Policy statement to write logs to CloudWatch Logging
    const accessLogsStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents"
        ],
        resources: [
          ("arn:aws:logs:" + region + ":" + account + ":log-group:/aws/lambda/" + prefix + "checkToken:*")
      ],
        sid: "SOFWriteLambdaLogs"
      });

    // Policy statement to allow lambda to read Secrets Manager
    const accessSecretsStatement = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:ListSecrets"
        ],
        resources: [secret.secretArn],
        sid: "SOFAccessSecretManager"
      });

    const lambdaPolicy2 = new iam.Policy(this, "lambdaPolicy2", {
        policyName: prefix + "lambda-policy",
        statements: [
            accessLogsStatement,
            accessSecretsStatement
        ]
    });

    lambdaPolicy2.attachToRole(lambdaRole);

    }
}