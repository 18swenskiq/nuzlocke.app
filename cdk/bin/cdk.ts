#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NuzlockeAppStack } from '../lib/nuzlocke-app-stack';

const app = new cdk.App();

new NuzlockeAppStack(app, 'NuzlockeAppStack', {
  env: { region: 'us-east-1' },
});

app.synth();
