# QuickKart Docker & Docker Compose Production Setup

QuickKart supports complete end-to-end containerized execution using **Docker** and **Docker Compose (v2)**. This environment spins up all microservices, databases, caching layers, message brokers, and Nginx reverse proxy using production-grade configurations.

## Stack Overview

The Docker Compose stack consists of 8 containerized services:

```
[Client / Browser]
        │
        ▼ Port 3000
┌───────────────────────────┐
│     frontend (Nginx)      │
└─────────────┬─────────────┘
              │
              ▼ Port 8080
┌───────────────────────────┐
│        api-gateway        │
└──────┬──────┬──────┬──────┘
       │      │      │
       │      │      └──────────────────────────┐
       ▼ Port 8081    ▼ Port 8082                ▼ Port 8083
┌─────────────┐┌────────────────────────┐┌──────────────────────┐
│  backend    ││    product-service     ││    order-service     │
│ (Monolith)  ││   (Product Micro)      ││   (Order Micro)      │
└──────┬──────┘└──────────┬─────────────┘└──────────┬───────────┘
       │                  │                         │
       ├──────────────────┴─────────────────────────┤
       │                                            │
       ▼ Port 5432       ▼ Port 6379                ▼ Port 9092
┌─────────────┐   ┌─────────────┐           ┌──────────────┐
│  postgres   │   │    redis    │           │    kafka     │
└─────────────┘   └─────────────┘           └──────────────┘
```

---

## Prerequisites

1. **Docker Engine 24.0+**
2. **Docker Compose v2.20+** (`docker compose version`)

---

## Commands & Operations

### 1. Build and Start Complete Stack
To build images multi-stage from source and start all services in detached mode:
```bash
docker compose up -d --build
```

### 2. Verify Running Containers & Health
```bash
docker compose ps
```
Expected output: All 8 services show status `healthy` or `running`.

| Service Name | Container Name | Host Port | Internal Port | Healthcheck |
|---|---|---|---|---|
| `frontend` | `quickkart-frontend` | 3000 | 80 | HTTP GET `/` (Status 200) |
| `api-gateway` | `quickkart-api-gateway` | 8080 | 8080 | Actuator `/actuator/health` |
| `backend` | `quickkart-backend` | 8081 | 8081 | Actuator `/actuator/health` |
| `product-service` | `quickkart-product-service` | 8082 | 8082 | Actuator `/actuator/health` |
| `order-service` | `quickkart-order-service` | 8083 | 8083 | Actuator `/actuator/health` |
| `postgres` | `quickkart-postgres` | 5432 | 5432 | `pg_isready -U postgres` |
| `redis` | `quickkart-redis` | 6379 | 6379 | `redis-cli ping` |
| `kafka` | `quickkart-kafka` | 9092 | 9092 / 29092 | `kafka-topics.sh --list` |

### 3. View Service Logs
```bash
# Tail logs for all services
docker compose logs -f

# Tail logs for specific service
docker compose logs -f order-service
```

### 4. Run Docker End-to-End Verification Test
QuickKart includes an automated test script that exercises the full Docker Compose stack:
```bash
node scripts/verify-docker-e2e.cjs
```

### 5. Stop and Clean Up Stack
```bash
# Stop containers and preserve volumes
docker compose down

# Stop containers and remove volumes (clean database)
docker compose down -v
```

---

## Network & Service Resolution in Docker

Within the Docker bridge network (`quickkart-network`):
- Services communicate using internal container names (`http://backend:8081`, `http://product-service:8082`, `http://order-service:8083`).
- PostgreSQL host: `postgres:5432`
- Redis host: `redis:6379`
- Kafka host: `kafka:29092` (internal listener) and `localhost:9092` (host listener).
- Environment overrides are set in `docker-compose.yml` under `environment:`.
