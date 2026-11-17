# QuickKart Production AWS Deployment Architecture Guide

This document details the production AWS architecture design, service selection rationale, security posture, networking, cost optimization, and deployment steps for QuickKart.

---

## 🏛️ Target AWS Architecture Overview

```
                           [ Internet Users ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │   AWS Application Load Balancer│
                   │      (Public Subnets / ALB)   │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │    Amazon S3 + CloudFront     │
                   │    (React Frontend Static SPA)│
                   └───────────────┬───────────────┘
                                   │
                                   ▼ Port 8080 (HTTPS/HTTP)
                   ┌───────────────────────────────┐
                   │      Amazon ECS / Fargate     │
                   │     (Spring Cloud Gateway)    │
                   └───────┬───────┬───────┬───────┘
                           │       │       │
          ┌────────────────┘       │       └────────────────┐
          ▼ Port 8081              ▼ Port 8082              ▼ Port 8083
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│ Amazon ECS Fargate │   │ Amazon ECS Fargate │   │ Amazon ECS Fargate │
│  Monolith Service  │   │  Product Service   │   │   Order Service    │
└─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘
          │                        │                        │
          ├────────────────────────┴────────────────────────┤
          │                                                 │
          ▼ Port 5432              ▼ Port 6379              ▼ Port 9092
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│   Amazon RDS for   │   │ AWS ElastiCache    │   │  Amazon MSK / EC2  │
│     PostgreSQL     │   │     for Redis      │   │    Apache Kafka    │
└────────────────────┘   └────────────────────┘   └────────────────────┘
```

---

## 🛠️ AWS Service Selection & Trade-Off Rationale

| Layer | Selected AWS Service | Rationale & Portfolio Justification | Alternative Considered |
|---|---|---|---|
| **Frontend** | Amazon S3 + CloudFront | High performance, static asset caching, global CDN delivery, low cost (< $1/mo). | ECS Nginx container |
| **API Gateway & Microservices** | AWS ECS on Fargate | Serverless container execution; no EC2 server management; independent scaling per service. | AWS EKS (Kubernetes) — Avoided for excessive overhead/cost. |
| **Relational Database** | Amazon RDS PostgreSQL (db.t4g.micro) | Managed automated backups, multi-AZ option, security patching. | Self-hosted PostgreSQL on EC2. |
| **In-Memory Cache** | AWS ElastiCache for Redis | Fully managed Redis instance, low-latency stock locking, session storage. | Redis container on EC2. |
| **Message Broker** | Amazon MSK / EC2 Kafka | Event stream broker for `OrderCreatedEvent` payloads. | SQS/SNS (Avoided to maintain Kafka `@TransactionalEventListener` compatibility). |
| **Observability** | AWS CloudWatch Logs & Container Insights | Centralized log aggregation, CPU/memory metric dashboards, alarm alerts. | Self-hosted ELK stack. |

---

## 🔒 Security Groups & Network Isolation

QuickKart follows least-privilege security group layering within a **Virtual Private Cloud (VPC)** with public and private subnets:

```
[VPC: 10.0.0.0/16]
├── Public Subnets (10.0.1.0/24, 10.0.2.0/24)
│   └── ALB Security Group (`sg-alb`): Accepts 80/443 from 0.0.0.0/0.
│
└── Private Subnets (10.0.10.0/24, 10.0.11.0/24)
    ├── ECS Services Security Group (`sg-ecs`): Accepts 8080/8081/8082/8083 ONLY from `sg-alb`.
    ├── RDS Database Security Group (`sg-rds`): Accepts 5432 ONLY from `sg-ecs`.
    ├── ElastiCache Security Group (`sg-redis`): Accepts 6379 ONLY from `sg-ecs`.
    └── Kafka Security Group (`sg-kafka`): Accepts 9092/29092 ONLY from `sg-ecs`.
```

---

## 💰 Portfolio Cost Awareness & Management

| AWS Component | Instance / Tier | Estimated Monthly Cost | Stopping / Shutdown Command |
|---|---|---|---|
| ECS Fargate (4 Services) | 0.25 vCPU / 0.5 GB per task | ~$15 - $25 / mo | `aws ecs update-service --desired-count 0` |
| RDS PostgreSQL | `db.t4g.micro` (AWS Free Tier eligible) | ~$12 / mo (or Free) | `aws rds stop-db-instance` |
| ElastiCache Redis | `cache.t4g.micro` | ~$13 / mo | Delete cluster when not testing |
| S3 + CloudFront | Standard static hosting | < $1.00 / mo | N/A |

### Total Estimated Cost
~$40 - $50 / month when actively running; **$0 / month** when ECS tasks are paused and RDS is stopped.

---

## 📋 Component Status Matrix

| Component | Status | Verification Context |
|---|---|---|
| **Multi-Stage Dockerfiles** | **IMPLEMENTED & VERIFIED** | Tested via `docker compose up -d --build` |
| **Spring Boot Actuator / MDC** | **IMPLEMENTED & VERIFIED** | Tested via `node scripts/verify-all.cjs` |
| **GitHub Actions CI (`ci.yml`)** | **IMPLEMENTED & VERIFIED** | Configured under `.github/workflows/ci.yml` |
| **AWS CD Pipeline (`deploy-aws.yml`)** | **IMPLEMENTED & READY** | Configured under `.github/workflows/deploy-aws.yml` |
| **AWS Infrastructure Setup Guide** | **DOCUMENTED** | Fully specified in this document |
| **Live AWS Cloud Hosting** | **READY FOR DEPLOYMENT** | Available for deployment on-demand with AWS credentials |
