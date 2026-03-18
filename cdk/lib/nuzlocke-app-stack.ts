import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as path from 'path';
import * as fs from 'fs';

export class NuzlockeAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ACM Certificate for nuzlocke.spkymnr.xyz (DNS validation via Cloudflare in pipeline)
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: 'nuzlocke.spkymnr.xyz',
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
      domainNames: ['nuzlocke.spkymnr.xyz'],
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
    if (fs.existsSync(assetsPath)) {
      const deployment = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
        sources: [s3deploy.Source.asset(assetsPath)],
        destinationBucket: websiteBucket,
        distribution,
        distributionPaths: ['/*'],
        memoryLimit: 512,
      });

      // CDK doesn't always auto-grant CloudFront invalidation permissions
      deployment.handlerRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      }));
    } else {
      console.log('Assets directory not found at:', assetsPath);
      console.log('Skipping frontend deployment - bucket created without content');
    }

    // Stack outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: 'nuzlocke.spkymnr.xyz',
      description: 'Custom domain name',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'ACM certificate ARN',
    });
  }
}
