package com.quickkart.service;

import com.quickkart.dto.OrderResponse;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Order;
import com.quickkart.entity.OrderItem;
import com.quickkart.entity.Payment;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.exception.EmptyCartException;
import com.quickkart.exception.InsufficientStockException;
import com.quickkart.exception.OrderNotFoundException;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
import com.quickkart.repository.OrderRepository;
import com.quickkart.repository.PaymentRepository;
import com.quickkart.repository.ProductRepository;
import com.quickkart.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import com.quickkart.event.OrderCreatedInternalEvent;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private CartRepository cartRepository;

    @Mock
    private CartItemRepository cartItemRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private OrderService orderService;

    private User testUser;
    private Cart testCart;
    private Product testProduct1;
    private Product testProduct2;

    @BeforeEach
    void setUp() {
        testUser = new User(1L, "Bob", "bob@example.com", "secret", "USER");
        testCart = new Cart(50L, testUser);
        testProduct1 = new Product(1L, "Laptop", "High-end laptop", new BigDecimal("1200.00"), 10, "Electronics");
        testProduct2 = new Product(2L, "Mouse", "Wireless Mouse", new BigDecimal("50.00"), 20, "Electronics");
    }







    @Test
    void getUserOrders_ShouldReturnAllOrdersForUser() {
        Order order1 = new Order(101L, testUser, new BigDecimal("100.00"), "CONFIRMED", LocalDateTime.now());
        Order order2 = new Order(102L, testUser, new BigDecimal("250.00"), "CONFIRMED", LocalDateTime.now());

        when(userRepository.findByEmail("bob@example.com")).thenReturn(Optional.of(testUser));
        when(orderRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(order2, order1));

        List<OrderResponse> orders = orderService.getUserOrders("bob@example.com");

        assertEquals(2, orders.size());
        assertEquals(102L, orders.get(0).getOrderId());
        assertEquals(101L, orders.get(1).getOrderId());
    }

    @Test
    void getOrderById_ShouldReturnOrder_WhenBelongsToUser() {
        Order order = new Order(101L, testUser, new BigDecimal("100.00"), "CONFIRMED", LocalDateTime.now());

        when(userRepository.findByEmail("bob@example.com")).thenReturn(Optional.of(testUser));
        when(orderRepository.findByIdAndUserId(101L, 1L)).thenReturn(Optional.of(order));

        OrderResponse response = orderService.getOrderById("bob@example.com", 101L);

        assertNotNull(response);
        assertEquals(101L, response.getOrderId());
    }

    @Test
    void getOrderById_ShouldThrowOrderNotFoundException_WhenOrderBelongsToDifferentUser() {
        when(userRepository.findByEmail("bob@example.com")).thenReturn(Optional.of(testUser));
        // Order belongs to another user, so findByIdAndUserId returns empty
        when(orderRepository.findByIdAndUserId(999L, 1L)).thenReturn(Optional.empty());

        assertThrows(OrderNotFoundException.class, () ->
                orderService.getOrderById("bob@example.com", 999L)
        );
    }
    @Test void legacyCheckoutCannotBypassConfirmation() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> orderService.checkout("test@example.invalid"));
        verifyNoInteractions(orderRepository, paymentRepository);
    }
}
