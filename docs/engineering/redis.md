# Redis Distributed Caching, Locking & Revocation Architecture

QuickKart leverages Redis as a multi-purpose high-performance in-memory data store for caching, concurrency control, and security token management.

## 1. Product Catalog Caching Strategy

- **Purpose**: Reduce PostgreSQL read operations on hot product read paths (`GET /api/products` and `GET /api/products/{id}`).
- **Cache Pattern**: Cache-Aside with Time-to-Live (TTL).
- **Implementation**:
  - When fetching product details, `ProductService` checks Redis under key `product:{id}`.
  - On Cache Hit: Product JSON payload is deserialized and returned directly.
  - On Cache Miss: Product is loaded from PostgreSQL, saved to Redis with a TTL of 10 minutes, and returned to client.
  - On Admin Update/Delete (`PUT` or `DELETE /api/admin/products/{id}`): The cache key `product:{id}` is explicitly evicted to guarantee immediate consistency.

---

## 2. Distributed Inventory Locking

- **Problem**: During flash sales, concurrent order submissions for limited stock items can cause race conditions and negative inventory balances.
- **Solution**: Distributed Lock pattern using Redis atomic operations (`SET ... NX PX`).

```java
// Conceptual implementation in Order Service
String lockKey = "lock:product:" + productId;
String ownerToken = UUID.randomUUID().toString();
Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, ownerToken, Duration.ofSeconds(3));

if (Boolean.TRUE.equals(acquired)) {
    try {
        // Validate stock in DB and deduct
        processStockReservation(productId, quantity);
    } finally {
        // Safe Lua Script unlock ensuring only the owner releases the lock
        String luaScript = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
        redisTemplate.execute(new DefaultRedisScript<>(luaScript, Long.class), Collections.singletonList(lockKey), ownerToken);
    }
} else {
    throw new StockLockException("Resource busy. Please retry.");
}
```

---

## 3. JWT Token Blacklisting on Logout

- **Problem**: Stateless JWTs remain valid until their expiration timestamp, leaving a security vulnerability if a user logs out early.
- **Solution**: In-memory Redis Blacklist.
- **Flow**:
  1. User sends `POST /api/auth/logout` with `Authorization: Bearer <token>`.
  2. The service extracts the token expiration claim.
  3. The token string is stored in Redis under key `blacklist:<token>` with expiration equal to the remaining TTL of the JWT.
  4. The **API Gateway** checks Redis on every incoming protected request. If `blacklist:<token>` exists, request is rejected immediately with HTTP 401.
