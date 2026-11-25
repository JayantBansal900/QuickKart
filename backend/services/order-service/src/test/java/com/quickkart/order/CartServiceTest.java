package com.quickkart.order;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CartResponse;
import com.quickkart.order.dto.UpdateCartItemRequest;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.entity.CartItem;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.repository.CartItemRepository;
import com.quickkart.order.repository.CartRepository;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.service.CartService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CartServiceTest {

    @Mock
    private CartRepository cartRepository;

    @Mock
    private CartItemRepository cartItemRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private com.quickkart.order.repository.ProductVariantRepository variantRepository;

    @InjectMocks
    private CartService cartService;

    private User testUser;
    private Cart testCart;
    private Product testProduct;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(10L);
        testUser.setEmail("test@example.com");

        testCart = new Cart(testUser);
        testCart.setId(1L);

        testProduct = new Product();
        testProduct.setId(100L);
        testProduct.setName("Test Laptop");
        testProduct.setPrice(new BigDecimal("999.99"));
        testProduct.setStockQuantity(50);
    }

    @Test
    void getCart_CreatesNewCart_WhenNotExist() {
        when(userRepository.findByEmailForUpdate("test@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(10L)).thenReturn(Optional.empty());
        when(cartRepository.save(any(Cart.class))).thenReturn(testCart);
        when(cartItemRepository.findByCartId(1L)).thenReturn(Collections.emptyList());

        CartResponse response = cartService.getCart("test@example.com");

        assertNotNull(response);
        assertEquals(1L, response.getCartId());
        verify(cartRepository, times(1)).save(any(Cart.class));
    }

    @Test
    void addToCart_Success() {
        when(userRepository.findByEmailForUpdate("test@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(10L)).thenReturn(Optional.of(testCart));
        when(productRepository.findById(100L)).thenReturn(Optional.of(testProduct));
        when(variantRepository.countByProductId(100L)).thenReturn(0L);
        when(cartItemRepository.findByCartIdAndProductIdAndVariantIsNull(1L, 100L)).thenReturn(Optional.empty());
        when(cartItemRepository.findByCartId(1L)).thenReturn(Collections.emptyList());

        AddCartItemRequest request = new AddCartItemRequest();
        request.setProductId(100L);
        request.setQuantity(2);

        CartResponse response = cartService.addToCart("test@example.com", request);

        assertNotNull(response);
        verify(cartItemRepository, times(1)).save(any(CartItem.class));
    }

    @Test
    void clearCart_Success() {
        when(userRepository.findByEmailForUpdate("test@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(10L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartId(1L)).thenReturn(Collections.emptyList());

        cartService.clearCart("test@example.com");

        verify(cartItemRepository, times(1)).deleteByCartId(1L);
    }
}
