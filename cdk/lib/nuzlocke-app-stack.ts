import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as fs from 'fs';

export class NuzlockeAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const siteDomain = 'nuzlocke.spkymnr.xyz';
    const siteUrl = `https://${siteDomain}`;
    const localDevUrl = 'http://localhost:5173';

    const googleOAuthClientId = new cdk.CfnParameter(this, 'GoogleOAuthClientId', {
      type: 'String',
      description: 'Google OAuth web client ID for the Cognito Google identity provider.',
    });

    const googleOAuthClientSecret = new cdk.CfnParameter(this, 'GoogleOAuthClientSecret', {
      type: 'String',
      noEcho: true,
      description: 'Google OAuth web client secret for the Cognito Google identity provider.',
    });

    // ACM Certificate for nuzlocke.spkymnr.xyz (DNS validation via Cloudflare in pipeline)
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: siteDomain,
      validation: acm.CertificateValidation.fromDns(),
    });

    // S3 bucket for website content
    const websiteBucket = new s3.Bucket(this, 'NuzlockeWebsiteBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    // S3 bucket for authenticated user's cloud save files.
    const savesBucket = new s3.Bucket(this, 'NuzlockeSavesBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'nuzlocke-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
    });

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool,
      clientId: googleOAuthClientId.valueAsString,
      clientSecretValue: cdk.SecretValue.unsafePlainText(googleOAuthClientSecret.valueAsString),
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'nuzlocke-web',
      generateSecret: false,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `${siteUrl}/auth/callback`,
          `${localDevUrl}/auth/callback`,
          'http://127.0.0.1:5173/auth/callback',
        ],
        logoutUrls: [
          `${siteUrl}/auth/signed-out`,
          `${localDevUrl}/auth/signed-out`,
          'http://127.0.0.1:5173/auth/signed-out',
        ],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });
    userPoolClient.node.addDependency(googleProvider);

    const userPoolDomainPrefix = 'nuzlocke-spkymnr-auth';
    const userPoolDomain = userPool.addDomain('AuthDomain', {
      cognitoDomain: {
        domainPrefix: userPoolDomainPrefix,
      },
    });
    const cognitoAuthDomain = userPoolDomain.baseUrl();

    const savesApiFunction = new lambda.Function(this, 'SavesApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/saves')),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        SAVES_BUCKET_NAME: savesBucket.bucketName,
      },
    });
    savesBucket.grantReadWrite(savesApiFunction);

    const jwtIssuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const savesAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer('SavesAuthorizer', jwtIssuer, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const savesApi = new apigwv2.HttpApi(this, 'SavesApi', {
      apiName: 'nuzlocke-saves-api',
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.OPTIONS,
          apigwv2.CorsHttpMethod.PUT,
        ],
        allowOrigins: [siteUrl, localDevUrl, 'http://127.0.0.1:5173'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const savesIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'SavesIntegration',
      savesApiFunction,
    );

    savesApi.addRoutes({
      path: '/api/saves',
      methods: [apigwv2.HttpMethod.GET],
      integration: savesIntegration,
      authorizer: savesAuthorizer,
    });

    savesApi.addRoutes({
      path: '/api/saves/{saveId}',
      methods: [
        apigwv2.HttpMethod.DELETE,
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
      ],
      integration: savesIntegration,
      authorizer: savesAuthorizer,
    });

    // Logging bucket for CloudFront access logs
    const logBucket = new s3.Bucket(this, 'CloudFrontLogsBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [
        { expiration: cdk.Duration.days(30) },
      ],
    });

    logBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [logBucket.arnForObjects('*')],
      principals: [new iam.ServicePrincipal('logging.s3.amazonaws.com')],
    }));

    // CloudFront Function to rewrite URLs for SPA/static site routing
    // e.g. /new → /new/index.html so S3 can find the pre-rendered page
    const urlRewriteFunction = new cloudfront.Function(this, 'UrlRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          if (uri === '/') {
            request.uri = '/index.html';
          } else if (uri.endsWith('/')) {
            request.uri = uri.slice(0, -1) + '.html';
          } else if (!uri.includes('.')) {
            request.uri += '.html';
          }
          return request;
        }
      `),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // CloudFront distribution
    const apiOriginDomain = `${savesApi.apiId}.execute-api.${this.region}.amazonaws.com`;
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        functionAssociations: [{
          function: urlRewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      additionalBehaviors: {
        'api/saves*': {
          origin: new origins.HttpOrigin(apiOriginDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
      },
      domainNames: [siteDomain],
      certificate: certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      logBucket: logBucket,
      logFilePrefix: 'cloudfront-logs/',
    });

    // Deploy website assets to S3 (assets are copied into ./assets by the CI pipeline)
    const assetsPath = path.join(__dirname, '../assets');
    const authConfig = s3deploy.Source.jsonData('auth-config.json', {
      apiBaseUrl: '/api',
      cognitoDomain: cognitoAuthDomain,
      clientId: userPoolClient.userPoolClientId,
      logoutUri: `${siteUrl}/auth/signed-out`,
      redirectUri: `${siteUrl}/auth/callback`,
      region: this.region,
      scopes: ['openid', 'email', 'profile'],
      userPoolId: userPool.userPoolId,
    });

    const sources = fs.existsSync(assetsPath)
      ? [s3deploy.Source.asset(assetsPath), authConfig]
      : [authConfig];

    const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources,
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
      memoryLimit: 512,
      prune: fs.existsSync(assetsPath),
    });
    deployment.node.addDependency(userPoolDomain);

    // CDK doesn't always auto-grant CloudFront invalidation permissions
    deployment.handlerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }));

    if (fs.existsSync(assetsPath)) {
      console.log('Deploying frontend assets from:', assetsPath);
    } else {
      console.log('Assets directory not found at:', assetsPath);
      console.log('Deploying runtime auth config only - bucket content will not be pruned');
    }

    // Stack outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: siteDomain,
      description: 'Custom domain name',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ACM certificate ARN',
    });

    new cdk.CfnOutput(this, 'SavesBucketName', {
      value: savesBucket.bucketName,
      description: 'S3 bucket for user cloud save files',
    });

    new cdk.CfnOutput(this, 'SavesApiEndpoint', {
      value: savesApi.apiEndpoint,
      description: 'HTTP API endpoint for cloud save files',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito user pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito web app client ID',
    });

    new cdk.CfnOutput(this, 'CognitoAuthDomain', {
      value: cognitoAuthDomain,
      description: 'Cognito hosted UI domain',
    });

    new cdk.CfnOutput(this, 'GoogleOAuthCallbackUrl', {
      value: `${cognitoAuthDomain}/oauth2/idpresponse`,
      description: 'Add this URL to the Google OAuth client Authorized redirect URIs',
    });
  }
}
