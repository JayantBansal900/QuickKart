# QuickKart Local Native Development Guide

This guide explains how to set up, build, run, and test QuickKart natively on your local machine (Windows / macOS / Linux) without Docker containers.

## Prerequisites

Ensure you have the following software installed:
1. **Java JDK 17** (`java -version` should show 17.x.x)
2. **Apache Maven 3.8+** (`mvn -version`)
3. **Node.js 18+ & npm 9+** (`node -v`, `npm -v`)
4. **PostgreSQL 15+** running on port 5432 (default user: `postgres`, password: `postgres`, database: `quickkart`)
5. **Redis Server 7+** running on port 6379 (no password default)
6. **Apache Kafka 3.7+** (optional for local dev if testing order stream events, or use Docker for Kafka only)

---

## Quick Start (Automated Script)

The repository includes an orchestrated cross-platform startup script (`scripts/start-services.cjs`) that checks database/Redis connectivity, compiles any missing JARs, launches background Java microservices, and starts the Vite React dev server.

### 1. Install Node Dependencies
```bash
npm install
```

### 2. Launch Stack in Development Mode
```bash
npm run dev
```

This command will:
1. Check if Redis (`6379`) is running (starts local service if stopped).
2. Check if PostgreSQL (`5432`) is running (starts local service if stopped).
3. Build and launch **Monolith Backend** on port `8081`.
4. Build and launch **Product Service** on port `8082`.
5. Build and launch **Order Service** on port `8083`.
6. Build and launch **API Gateway** on port `8080`.
7. Launch **Vite Development Server** on port `3000`.

---

## Manual Service-by-Service Startup

If you prefer launching microservices individually in separate terminal windows:

### 1. Database & Cache
- Start PostgreSQL on `5432` with database `quickkart`.
- Start Redis on `6379`.

### 2. Monolith Backend (`:8081`)
```bash
cd services/monolith
mvn clean package -DskipTests
java -jar target/quickkart-backend-0.0.1-SNAPSHOT.jar
```

### 3. Product Service (`:8082`)
```bash
cd services/product-service
mvn clean package -DskipTests
java -jar target/product-service-0.0.1-SNAPSHOT.jar
```

### 4. Order Service (`:8083`)
```bash
cd services/order-service
mvn clean package -DskipTests
java -jar target/order-service-0.0.1-SNAPSHOT.jar
```

### 5. API Gateway (`:8080`)
```bash
cd services/api-gateway
mvn clean package -DskipTests
java -jar target/api-gateway-0.0.1-SNAPSHOT.jar
```

### 6. Frontend UI (`:3000`)
```bash
npm run dev
```

---

## Running Verification & Automated Tests

QuickKart includes comprehensive end-to-end verification scripts and JUnit test suites.

### Run JUnit Tests (Backend Services)
```bash
# Test all backend services
mvn test -f services/monolith/pom.xml
mvn test -f services/product-service/pom.xml
mvn test -f services/order-service/pom.xml
mvn test -f services/api-gateway/pom.xml
```

### Run Frontend Typecheck & Build
```bash
npx tsc --noEmit
npm run build
```

### Run E2E Local Service Verification
```bash
node scripts/verify-all.cjs
node scripts/verify-gateway.cjs
```
