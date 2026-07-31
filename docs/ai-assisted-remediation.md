# AI-Assisted Remediation Documentation

## Overview
AI-RCA service analyzes incident evidence and generates advisory "Suggested Fix" proposals.

## Non-Autonomous Design Safety
The AI system does **NOT** directly execute restarts, modify code, push branches, or alter infrastructure. Human review and explicit approval creation via the API Gateway is strictly required for every operational action.
