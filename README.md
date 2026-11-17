# QuickKart — Production-Ready Microservice E-Commerce Platform

QuickKart is a full-stack, enterprise-grade e-commerce application built with Java 17, Spring Boot 3.3.4, React 18, and TypeScript. It demonstrates modern distributed software engineering practices including API Gateway routing, microservice domain isolation, distributed caching, atomic stock locking, event-driven messaging, zero-dependency correlation ID tracing (`X-Correlation-ID` + MDC), GitHub Actions CI/CD pipelines, and a production-ready AWS deployment architecture.

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.4-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![Java](https://img.shields.io/badge/Java-17-orange.svg)](https://www.oracle.com/java/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker%20Compose-v2-blue.svg)](https://www.docker.com/)
[![CI/CD](https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-blue.svg)](.github/workflows/ci.yml)
[![AWS](https://img.shields.io/badge/AWS-ECS%20%7C%20RDS%20%7C%20ElastiCache-orange.svg)](docs/development/aws-deployment.md)

---

## 🚀 Key Architectural & Operational Features

- **Unified API Gateway**: Spring Cloud Gateway (:8080) providing single-entry routing, CORS handling, and correlation ID generation.
- **Decomposed Microservices**: Isolated services for Product Catalog (`:8082`) and Cart & Orders (`:8083`), alongside Monolith Auth & Payments (`:8081`).
- **Distributed Caching & Stock Locking**: Redis caching for catalog queries and atomic `SET NX PX` distributed locks to prevent overselling during flash sales.
- **Asynchronous Event-Driven Stream**: Apache Kafka integration emitting `OrderCreatedEvent` payloads using `@TransactionalEventListener(phase = AFTER_COMMIT)` to guarantee zero ghost events.
- **Distributed Correlation ID Tracing**: Zero-dependency request correlation (`X-Correlation-ID` + SLF4J MDC) propagating correlation IDs across Gateway and microservices so every log line displays `[correlationId=...]`.
- **Environment Configuration & Profiles**: Environment variable bindings with local defaults, `.env.example` template, and `dev` vs `prod` Spring Boot profiles.
- **GitHub Actions CI/CD Pipeline**: Continuous integration workflow validating TypeScript types, Vite production build, Maven tests across all 4 services, and Docker Compose configuration.
- **Production-Ready AWS Architecture**: Portfolio-friendly AWS architecture design utilizing ECS Fargate, RDS PostgreSQL, ElastiCache Redis, MSK/EC2 Kafka, CloudWatch, and VPC Security Groups.

---

## 📐 System Architecture Diagram

```
                      +-----------------------------+
                      |    React + TypeScript UI    |
                      |      (Vite / Port 3000)     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   Spring Cloud API Gateway  |
                      |         (Port 8080)         |
                      |   X-Correlation-ID Filter   |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+        +------------------+        +------------------+
| Monolith Service |        | Product Service  |        |  Order Service   |
|   (Port 8081)    |        |   (Port 8082)    |        |   (Port 8083)    |
| Auth & Payments  |        | Product Catalog  |        | Cart & Orders    |
| MDC Logging      |        | Redis Cache      |        | Redis Locking    |
+--------+---------+        +--------+---------+        +--------+---------+
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                     +---------------+---------------+
                     |                               |
                     v                               v
          +--------------------+           +--------------------+
          | PostgreSQL Database|           |    Redis Cache     |
          |    (Port 5432)     |           |    (Port 6379)     |
          +--------------------+           +--------------------+
                     ^                               ^
                     |       +---------------+       |
                     +-------| Apache Kafka  |-------+
                             |  (Port 9092)  |
                             +---------------+
```

---

## 📦 Microservice Directory & Port Mapping

| Service Module | Host Port | Technology Stack | Core Responsibilities |
|---|---|---|---|
| Frontend UI | `3000` | React 18, TypeScript, Vite, Tailwind | Single Page App UI for customers & admins |
| `services/api-gateway` | `8080` | Spring Cloud Gateway | Path routing, CORS, `X-Correlation-ID` generation |
| `services/monolith` | `8081` | Spring Boot, Spring Security, JPA | User Auth (JWT), User Profiles, Payments |
| `services/product-service` | `8082` | Spring Boot, JPA, Redis | Product catalog CRUD, search, Redis cache |
| `services/order-service` | `8083` | Spring Boot, JPA, Redis, Kafka | Cart persistence, checkout, Redis locking |
| PostgreSQL | `5432` | PostgreSQL 15 | Relational data persistence |
| Redis Cache | `6379` | Redis 7 | Distributed locking, catalog cache, token blacklist |
| Apache Kafka | `9092` | Apache Kafka 3.7 (KRaft) | Asynchronous event stream for order processing |

---

## 📁 Repository Directory Structure

```
quickkart/
├── .github/                     # GitHub Actions CI/CD Workflows
│   └── workflows/
│       ├── ci.yml               # Automated test, build, and typecheck workflow
│       └── deploy-aws.yml       # AWS ECR & ECS Fargate deployment workflow
├── docs/                        # Engineering & Deployment Documentation Suite
│   ├── api/                     # REST API reference catalog
│   ├── architecture/            # Architectural diagrams & sequence flows
│   ├── development/             # Local native, Docker, CI/CD, and AWS setup guides
│   └── engineering/             # Redis, Kafka, Security, Microservices, Observability
├── infrastructure/              # Infrastructure Configuration & Dockerfiles
│   └── docker/                  # Multi-stage Dockerfiles & Nginx config
├── services/                    # Backend Maven Microservice Modules
│   ├── api-gateway/             # Spring Cloud API Gateway (:8080)
│   ├── monolith/                # Auth & Payments Monolith (:8081)
│   ├── order-service/           # Cart & Order Microservice (:8083)
│   └── product-service/         # Product Catalog Microservice (:8082)
├── src/                         # React 18 TypeScript Frontend Source
├── scripts/                     # Cross-platform startup & verification scripts
├── docker-compose.yml           # Master Production-Ready Compose Stack
├── .env.example                 # Environment variables template
└── README.md                    # Master Project Documentation
```

---

## ⚡ Quick Start Guide

### Option 1: Running with Docker Compose (Recommended)

To start all 8 containerized services in detached mode:

```bash
docker compose up -d --build
```

Verify container status:
```bash
docker compose ps
```

Access Points:
- **Frontend UI**: [http://localhost:3000](http://localhost:3000)
- **API Gateway**: [http://localhost:8080](http://localhost:8080)
- **Actuator Health Checks**: [http://localhost:8080/actuator/health](http://localhost:8080/actuator/health)

Run automated Docker End-to-End verification:
```bash
node scripts/verify-docker-e2e.cjs
```

---

### Option 2: Native Local Development

1. **Install Node Dependencies**:
   ```bash
   npm install
   ```
2. **Launch Stack**:
   ```bash
   npm run dev
   ```
   This script verifies local PostgreSQL and Redis availability, compiles missing Maven JARs, starts all 4 Java backend microservices in the background, and launches Vite on `http://localhost:3000`.

---

## 🧪 Testing & Automated Verification

Run the full verification suite:

```bash
# 1. Typecheck & Build Frontend
npx tsc --noEmit
npm run build

# 2. Run Backend Unit & Integration Tests
mvn test -f services/monolith/pom.xml
mvn test -f services/product-service/pom.xml
mvn test -f services/order-service/pom.xml
mvn test -f services/api-gateway/pom.xml

# 3. Validate Docker Compose Spec
docker compose config

# 4. Run E2E Verification Scripts
node scripts/verify-docker-e2e.cjs
node scripts/verify-gateway.cjs
node scripts/verify-all.cjs
```

---

## 📚 Engineering Documentation Index

Full documentation is available in the [`docs/`](./docs) directory:

- 📊 **[Performance Benchmarks](./docs/engineering/performance.md)** — Empirical latency benchmarks, Redis cache speedup, & checkout metrics.
- 📐 **[Engineering Decisions (ADR)](./docs/engineering/engineering-decisions.md)** — Core architectural choices, trade-offs, & design rationale.
- 🎯 **[Interview Preparation Guide](./docs/interview/project-interview-guide.md)** — 35 deep technical Q&As for software engineering interviews.
- 🏛️ **[System Architecture](./docs/architecture/architecture.md)** — Multi-tier microservice architecture overview.
- 🔄 **[System Flows](./docs/architecture/system-flow.md)** — Checkout sequence, Kafka AFTER_COMMIT, and Redis locking.
- 🔌 **[API Documentation](./docs/api/api-documentation.md)** — REST API endpoint reference catalog.
- 💻 **[Local Development Guide](./docs/development/local-setup.md)** — Native development & Maven setup.
- 🐳 **[Docker Setup Guide](./docs/development/docker-setup.md)** — Docker Compose stack & environment configuration.
- ⚙️ **[CI/CD Pipeline Guide](./docs/development/ci-cd.md)** — GitHub Actions automated build & test workflows.
- ☁️ **[AWS Deployment Architecture](./docs/development/aws-deployment.md)** — Production AWS ECS Fargate, RDS, ElastiCache, MSK, & Security setup.
- 🔍 **[Observability & Logging Guide](./docs/engineering/observability.md)** — Health checks, correlation ID propagation (`X-Correlation-ID`), and SLF4J MDC.
- ⚡ **[Redis Engineering Guide](./docs/engineering/redis.md)** — Caching, distributed stock locking, and token revocation.
- 📩 **[Kafka Engineering Guide](./docs/engineering/kafka.md)** — Topic taxonomy, schemas, and transactional event publishing.
- 🧱 **[Microservices Rationale](./docs/engineering/microservices.md)** — Domain decomposition and database boundaries.
- 🔒 **[Security Architecture](./docs/engineering/security.md)** — JWT, RBAC permissions, and CORS policies.

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
