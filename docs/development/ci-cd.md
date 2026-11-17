# QuickKart CI/CD Pipeline & GitHub Actions Guide

This document details the Continuous Integration (CI) and Continuous Deployment (CD) workflows implemented for QuickKart using **GitHub Actions**.

## Overview of Workflows

```
      [Git Push / Pull Request to main]
                      │
                      ▼
 ┌──────────────────────────────────────────┐
 │       GitHub Actions CI (.github)        │
 ├──────────────────────────────────────────┤
 │ 1. Frontend Typecheck (npx tsc)          │
 │ 2. Frontend Production Build (Vite)     │
 │ 3. Parallel Service Test Matrix (Maven)  │
 │    - services/api-gateway                │
 │    - services/product-service            │
 │    - services/order-service              │
 │    - services/monolith                   │
 │ 4. Docker Compose Spec Validation        │
 └────────────────────┬─────────────────────┘
                      │
                      ▼
 ┌──────────────────────────────────────────┐
 │    AWS CD Pipeline (deploy-aws.yml)      │
 ├──────────────────────────────────────────┤
 │ 1. AWS OIDC Authentication               │
 │ 2. ECR Container Image Tagging & Push    │
 │ 3. ECS Fargate Service Revision Update   │
 └──────────────────────────────────────────┘
```

---

## 1. Continuous Integration Workflow (`ci.yml`)

The primary CI pipeline runs automatically on every `push` or `pull_request` to the `main` or `master` branches.

### Pipeline Jobs & Stages

#### Job 1: `frontend-build`
- **Environment**: `ubuntu-latest`
- **Steps**:
  1. Check out repository code.
  2. Setup Node.js 18 with npm cache.
  3. Install dependencies using `npm ci`.
  4. Run strict TypeScript compiler verification (`npx tsc --noEmit`).
  5. Run Vite production build (`npm run build`).

#### Job 2: `backend-test-matrix`
- **Environment**: `ubuntu-latest`
- **Matrix Strategy**: Parallel execution across all microservice directories (`services/api-gateway`, `services/product-service`, `services/order-service`, `services/monolith`).
- **Steps**:
  1. Check out repository code.
  2. Setup JDK 17 (Temurin) with Maven dependency caching.
  3. Execute `mvn test -f ${{ matrix.service }}/pom.xml`.

#### Job 3: `docker-compose-validate`
- **Environment**: `ubuntu-latest`
- **Steps**:
  1. Check out repository code.
  2. Validate `docker-compose.yml` file syntax, port mappings, and context definitions (`docker compose config`).

---

## 2. Continuous Deployment Workflow (`deploy-aws.yml`)

The CD pipeline builds container images, tags them with git commit SHAs, pushes them to **Amazon Elastic Container Registry (ECR)**, and triggers rolling updates on **Amazon Elastic Container Service (ECS)** Fargate tasks.

### AWS Secrets & IAM OIDC Setup
To trigger automatic AWS deployment without storing static long-lived AWS keys in GitHub, the workflow utilizes **OpenID Connect (OIDC)**:

| GitHub Action Secret | Description | Example / Required Format |
|---|---|---|
| `AWS_ROLE_ARN` | AWS IAM Role ARN configured with ECR/ECS permissions | `arn:aws:iam::123456789012:role/QuickKartGitHubCDRole` |
| `JWT_SECRET` | Base64-encoded JWT signing secret | Secret string passed to ECS Task Definition |
| `POSTGRES_PASSWORD` | RDS PostgreSQL master password | Secret string |

---

## 3. Rollback & Deployment Recovery

If a newly deployed container fails health checks in AWS ECS:
1. **ECS Deployment Circuit Breaker**: Automatically detects task crash loops via Actuator `/actuator/health` and stops rolling out the updated version.
2. **Automatic Rollback**: ECS reverts service traffic to the previous healthy task definition revision automatically.
