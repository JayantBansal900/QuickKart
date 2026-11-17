package com.quickkart.order;

import com.quickkart.order.dto.OrderResponse;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.entity.CartItem;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.exception.InsufficientStockException;
import com.quickkart.order.repository.CartItemRepository;
import com.quickkart.order.repository.CartRepository;
import com.quickkart.order.repository.OrderItemRepository;
import com.quickkart.order.repository.OrderRepository;
import com.quickkart.order.repository.PaymentRepository;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class OrderConcurrencyIntegrationTest {

    @Autowired
    private OrderService orderService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CartRepository cartRepository;

    @Autowired
    private CartItemRepository cartItemRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    private User userA;
    private User userB;
    private Product scarceProduct;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        cartItemRepository.deleteAll();
        cartRepository.deleteAll();

        userA = userRepository.findByEmail("concurrent_a@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("User A", "concurrent_a@quickkart.com", "pass", "USER")));
        userB = userRepository.findByEmail("concurrent_b@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("User B", "concurrent_b@quickkart.com", "pass", "USER")));

        userA.setEmailVerified(true);userA.setAccountStatus("ACTIVE");userRepository.saveAndFlush(userA);
        userB.setEmailVerified(true);userB.setAccountStatus("ACTIVE");userRepository.saveAndFlush(userB);
        // Exactly 1 unit available in stock
        scarceProduct = productRepository.save(new Product(
                "Limited Edition Smartphone",
                "Flagship Phone",
                new BigDecimal("999.00"),
                1,
                "Electronics"
        ));

        // Setup Cart for User A
        Cart cartA = cartRepository.findByUserId(userA.getId())
                .orElseGet(() -> cartRepository.save(new Cart(userA)));
        cartItemRepository.deleteByCartId(cartA.getId());
        CartItem itemA = new CartItem(cartA, scarceProduct, 1);
        cartItemRepository.save(itemA);

        // Setup Cart for User B
        Cart cartB = cartRepository.findByUserId(userB.getId())
                .orElseGet(() -> cartRepository.save(new Cart(userB)));
        cartItemRepository.deleteByCartId(cartB.getId());
        CartItem itemB = new CartItem(cartB, scarceProduct, 1);
        cartItemRepository.save(itemB);
    }

    @Test
    void concurrentCheckout_ForFinalUnit_ExactlyOneSucceeds_NoOverselling() throws Exception {
        int threads = 2;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch readyLatch = new CountDownLatch(threads);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch finishLatch = new CountDownLatch(threads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger insufficientStockCount = new AtomicInteger(0);

        // Task for User A
        executor.submit(() -> {
            readyLatch.countDown();
            try {
                startLatch.await(5, TimeUnit.SECONDS);
                OrderResponse resp = orderService.checkout(userA.getEmail(), request(userA.getEmail()));
                if (resp != null) {
                    successCount.incrementAndGet();
                }
            } catch (InsufficientStockException ex) {
                insufficientStockCount.incrementAndGet();
            } catch (Exception e) {
                // other exceptions
            } finally {
                finishLatch.countDown();
            }
        });

        // Task for User B
        executor.submit(() -> {
            readyLatch.countDown();
            try {
                startLatch.await(5, TimeUnit.SECONDS);
                OrderResponse resp = orderService.checkout(userB.getEmail(), request(userB.getEmail()));
                if (resp != null) {
                    successCount.incrementAndGet();
                }
            } catch (InsufficientStockException ex) {
                insufficientStockCount.incrementAndGet();
            } catch (Exception e) {
                // other exceptions
            } finally {
                finishLatch.countDown();
            }
        });

        // Wait for all threads ready
        assertTrue(readyLatch.await(5, TimeUnit.SECONDS));

        // Fire simultaneously
        startLatch.countDown();

        // Wait for both to complete
        assertTrue(finishLatch.await(10, TimeUnit.SECONDS));
        executor.shutdown();

        // VERIFY STRICT CONCURRENCY OUTCOMES:
        // 1. Exactly 1 user succeeded in purchasing the unit
        assertEquals(1, successCount.get(), "Exactly one user must successfully check out the final unit");

        // 2. Exactly 1 user received InsufficientStockException
        assertEquals(1, insufficientStockCount.get(), "The other user must fail with InsufficientStockException");

        // 3. Database stock must be exactly 0, never negative
        Product finalProduct = productRepository.findById(scarceProduct.getId()).orElseThrow();
        assertEquals(0, finalProduct.getStockQuantity(), "Stock must be exactly 0, no overselling allowed");
    }
    @Autowired private com.quickkart.order.service.CartService cartService;
    private com.quickkart.order.dto.CheckoutRequest request(String email) {
        var r=new com.quickkart.order.dto.CheckoutRequest();r.setPaymentMethod("COD");r.setIdempotencyKey(java.util.UUID.randomUUID().toString());r.setCartFingerprint(cartService.getCart(email).getFingerprint());r.setRecipientName("Customer");r.setDeliveryAddress("123 Test Street");r.setDeliveryPhone("9876543210");return r;
    }
}
