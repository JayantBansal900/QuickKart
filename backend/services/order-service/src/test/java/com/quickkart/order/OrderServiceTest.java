package com.quickkart.order;

import com.quickkart.order.dto.OrderResponse;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.entity.CartItem;
import com.quickkart.order.entity.Order;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.event.OrderCreatedInternalEvent;
import com.quickkart.order.exception.EmptyCartException;
import com.quickkart.order.exception.InsufficientStockException;
import com.quickkart.order.exception.InvalidOrderStatusException;
import com.quickkart.order.exception.OrderNotFoundException;
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
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.ArrayList;
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
    private OrderItemRepository orderItemRepository;

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
    private Product product1;
    private Product product2;

    @BeforeEach
    void setUp() {
        testUser = new User("Alice", "alice@example.com", "pass", "USER");
        testUser.setId(1L);

        testCart = new Cart(testUser);
        testCart.setId(10L);

        product1 = new Product("Laptop", "Electronics", new BigDecimal("999.99"), 10, "Computers");
        product1.setId(101L);

        product2 = new Product("Mouse", "Accessories", new BigDecimal("25.00"), 5, "Electronics");
        product2.setId(102L);
    }











    @Test
    void getOrderById_NotFound_ThrowsOrderNotFoundException() {
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(testUser));
        when(orderRepository.findByIdAndUserId(999L, 1L)).thenReturn(Optional.empty());

        assertThrows(OrderNotFoundException.class, () -> orderService.getOrderById(999L, "alice@example.com"));
    }
    @Test void legacyCheckoutCannotBypassConfirmation() {
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> orderService.checkout("test@example.invalid"));
        verifyNoInteractions(orderRepository, paymentRepository);
    }
}
