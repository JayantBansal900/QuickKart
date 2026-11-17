# QuickKart API Documentation Catalog

QuickKart exposes a comprehensive set of RESTful APIs accessible through the **API Gateway** (`http://localhost:8080`) as well as direct microservice endpoints for internal/development purposes.

## Global Headers & Standards

- **Content-Type**: `application/json`
- **Authorization**: `Bearer <JWT_TOKEN>` (Required for protected endpoints)
- **Response Format**: Standard JSON response objects with HTTP status codes (200, 201, 400, 401, 403, 404, 409, 500).

---

## 1. Authentication & User Profile APIs (`Monolith Service :8081`)

Gateway Route: `/api/auth/**` $\rightarrow$ `http://localhost:8081/api/auth/**`

### `POST /api/auth/register`
Register a new customer account.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "ROLE_USER"
  }
  ```

### `POST /api/auth/login`
Authenticate user credentials and receive a signed JWT token.
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "email": "jane@example.com",
    "name": "Jane Doe",
    "role": "ROLE_USER"
  }
  ```

### `GET /api/auth/profile`
Fetch authenticated user profile details.
- **Access**: Authenticated (`ROLE_USER` or `ROLE_ADMIN`)
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: User details DTO.

### `POST /api/auth/logout`
Blacklist the active JWT token in Redis until expiration.
- **Access**: Authenticated
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: `{"message": "Logged out successfully"}`

---

## 2. Product Catalog APIs (`Product Service :8082`)

Gateway Route: `/api/products/**` $\rightarrow$ `http://localhost:8082/api/products/**`  
Admin Gateway Route: `/api/admin/products/**` $\rightarrow$ `http://localhost:8082/api/admin/products/**`

### `GET /api/products`
Retrieve active product list. Supports optional query parameters.
- **Access**: Public
- **Query Parameters**: `category` (optional string), `search` (optional string)
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "name": "Wireless Noise-Canceling Headphones",
      "description": "High-fidelity audio with 30-hour battery life",
      "price": 199.99,
      "stockQuantity": 50,
      "category": "Electronics",
      "imageUrl": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e"
    }
  ]
  ```

### `GET /api/products/{id}`
Retrieve a single product by ID.
- **Access**: Public
- **Response (200 OK)**: Product object.
- **Response (404 Not Found)**: `{"error": "Product not found with id: X"}`

### `POST /api/admin/products`
Create a new product catalog item.
- **Access**: Admin only (`ROLE_ADMIN`)
- **Headers**: `Authorization: Bearer <admin_token>`
- **Request Body**:
  ```json
  {
    "name": "Smart Watch Ultra",
    "description": "Fitness tracking with GPS",
    "price": 299.99,
    "stockQuantity": 30,
    "category": "Electronics",
    "imageUrl": "https://images.unsplash.com/..."
  }
  ```
- **Response (201 Created)**: Created Product Object.

### `PUT /api/admin/products/{id}`
Update an existing product item.
- **Access**: Admin only (`ROLE_ADMIN`)
- **Response (200 OK)**: Updated Product Object.

### `DELETE /api/admin/products/{id}`
Delete a product from the catalog.
- **Access**: Admin only (`ROLE_ADMIN`)
- **Response (204 No Content)**

---

## 3. Cart & Order APIs (`Order Service :8083`)

Gateway Route: `/api/cart/**` $\rightarrow$ `http://localhost:8083/api/cart/**`  
Gateway Route: `/api/orders/**` $\rightarrow$ `http://localhost:8083/api/orders/**`

### `GET /api/cart`
Get current user's active shopping cart.
- **Access**: Authenticated
- **Response (200 OK)**:
  ```json
  {
    "id": 10,
    "userId": 1,
    "items": [
      {
        "id": 101,
        "productId": 1,
        "productName": "Wireless Noise-Canceling Headphones",
        "price": 199.99,
        "quantity": 2,
        "subtotal": 399.98
      }
    ],
    "totalPrice": 399.98
  }
  ```

### `POST /api/cart/items`
Add an item to the shopping cart.
- **Access**: Authenticated
- **Request Body**: `{"productId": 1, "quantity": 2}`
- **Response (200 OK)**: Updated Cart object.

### `PUT /api/cart/items/{itemId}`
Update quantity of an item in the cart.
- **Access**: Authenticated
- **Request Body**: `{"quantity": 5}`
- **Response (200 OK)**: Updated Cart object.

### `DELETE /api/cart/items/{itemId}`
Remove an item from the cart.
- **Access**: Authenticated
- **Response (200 OK)**: Updated Cart object.

### `POST /api/orders/checkout`
Convert current user cart into a confirmed order. Uses Redis inventory locking and emits Kafka `OrderCreatedEvent`.
- **Access**: Authenticated
- **Response (201 Created)**:
  ```json
  {
    "id": 501,
    "userId": 1,
    "totalAmount": 399.98,
    "status": "PENDING",
    "createdAt": "2026-09-11T04:20:00Z",
    "items": [
      {
        "productId": 1,
        "productName": "Wireless Noise-Canceling Headphones",
        "price": 199.99,
        "quantity": 2
      }
    ]
  }
  ```

### `GET /api/orders`
Get order history for authenticated user.
- **Access**: Authenticated
- **Response (200 OK)**: Array of Order objects.

---

## 4. Payment APIs (`Monolith Service :8081`)

Gateway Route: `/api/payments/**` $\rightarrow$ `http://localhost:8081/api/payments/**`

### `POST /api/payments/process`
Simulate or execute payment for an order.
- **Access**: Authenticated
- **Request Body**:
  ```json
  {
    "orderId": 501,
    "paymentMethod": "CREDIT_CARD",
    "cardNumber": "4242424242424242"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "transactionId": "TXN-994821",
    "orderId": 501,
    "status": "SUCCESS",
    "timestamp": "2026-09-11T04:21:00Z"
  }
  ```

---

## 5. Actuator & Health Check APIs

| Service | Endpoint | Port | Description |
|---|---|---|---|
| API Gateway | `http://localhost:8080/actuator/health` | 8080 | Gateway health status |
| Monolith Service | `http://localhost:8081/actuator/health` | 8081 | Backend health status (Includes DB & Redis details) |
| Product Service | `http://localhost:8082/actuator/health` | 8082 | Product microservice health |
| Order Service | `http://localhost:8083/actuator/health` | 8083 | Order microservice health |
