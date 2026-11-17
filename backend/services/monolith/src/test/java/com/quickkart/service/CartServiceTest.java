package com.quickkart.service;

import com.quickkart.dto.AddCartItemRequest;
import com.quickkart.dto.CartResponse;
import com.quickkart.dto.UpdateCartItemRequest;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.exception.CartItemNotFoundException;
import com.quickkart.exception.InsufficientStockException;
import com.quickkart.exception.ProductNotFoundException;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
import com.quickkart.repository.ProductRepository;
import com.quickkart.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
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

    @InjectMocks
    private CartService cartService;

    private User testUser;
    private Cart testCart;
    private Product testProduct;

    @BeforeEach
    void setUp() {
        testUser = new User(1L, "Alice", "alice@example.com", "hash", "USER");
        testCart = new Cart(100L, testUser);
        testProduct = new Product(10L, "Mechanical Keyboard", "RGB Keychron", new BigDecimal("120.00"), 10, "Electronics");
    }

    @Test
    void getCart_ShouldReturnCartForAuthenticatedUser() {
        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartId(100L)).thenReturn(Collections.emptyList());

        CartResponse response = cartService.getCart("alice@example.com");

        assertNotNull(response);
        assertEquals(100L, response.getCartId());
        assertTrue(response.getItems().isEmpty());
        assertEquals(BigDecimal.ZERO, response.getTotalAmount());
    }

    @Test
    void addToCart_ShouldAddNewProduct_WhenNotAlreadyInCart() {
        AddCartItemRequest request = new AddCartItemRequest(10L, 2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(productRepository.findById(10L)).thenReturn(Optional.of(testProduct));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.empty());

        CartItem createdItem = new CartItem(1L, testCart, testProduct, 2);
        when(cartItemRepository.save(any(CartItem.class))).thenReturn(createdItem);
        when(cartItemRepository.findByCartId(100L)).thenReturn(List.of(createdItem));

        CartResponse response = cartService.addToCart("alice@example.com", request);

        assertNotNull(response);
        assertEquals(1, response.getItems().size());
        assertEquals("Mechanical Keyboard", response.getItems().get(0).getProductName());
        assertEquals(2, response.getItems().get(0).getQuantity());
        assertEquals(new BigDecimal("240.00"), response.getTotalAmount());
        verify(cartItemRepository).save(any(CartItem.class));
    }

    @Test
    void addToCart_ShouldIncreaseQuantity_WhenProductAlreadyInCart() {
        AddCartItemRequest request = new AddCartItemRequest(10L, 3);
        CartItem existingItem = new CartItem(1L, testCart, testProduct, 2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(productRepository.findById(10L)).thenReturn(Optional.of(testProduct));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.of(existingItem));

        when(cartItemRepository.findByCartId(100L)).thenReturn(List.of(existingItem));

        CartResponse response = cartService.addToCart("alice@example.com", request);

        assertEquals(5, existingItem.getQuantity());
        assertEquals(1, response.getItems().size());
        assertEquals(5, response.getItems().get(0).getQuantity());
        verify(cartItemRepository).save(existingItem);
    }

    @Test
    void addToCart_ShouldThrowInsufficientStockException_WhenRequestedExceedsStock() {
        AddCartItemRequest request = new AddCartItemRequest(10L, 15); // stock is 10

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(productRepository.findById(10L)).thenReturn(Optional.of(testProduct));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.empty());

        assertThrows(InsufficientStockException.class, () ->
                cartService.addToCart("alice@example.com", request)
        );
        verify(cartItemRepository, never()).save(any(CartItem.class));
    }

    @Test
    void addToCart_ShouldThrowProductNotFoundException_WhenProductDoesNotExist() {
        AddCartItemRequest request = new AddCartItemRequest(999L, 1);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(productRepository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ProductNotFoundException.class, () ->
                cartService.addToCart("alice@example.com", request)
        );
    }

    @Test
    void updateCartItemQuantity_ShouldUpdate_WhenStockSufficient() {
        UpdateCartItemRequest request = new UpdateCartItemRequest(4);
        CartItem existingItem = new CartItem(1L, testCart, testProduct, 2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.of(existingItem));
        when(cartItemRepository.findByCartId(100L)).thenReturn(List.of(existingItem));

        CartResponse response = cartService.updateCartItemQuantity("alice@example.com", 10L, request);

        assertEquals(4, existingItem.getQuantity());
        assertEquals(4, response.getItems().get(0).getQuantity());
        verify(cartItemRepository).save(existingItem);
    }

    @Test
    void updateCartItemQuantity_ShouldThrowInsufficientStockException_WhenExceedsStock() {
        UpdateCartItemRequest request = new UpdateCartItemRequest(25);
        CartItem existingItem = new CartItem(1L, testCart, testProduct, 2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.of(existingItem));

        assertThrows(InsufficientStockException.class, () ->
                cartService.updateCartItemQuantity("alice@example.com", 10L, request)
        );
        verify(cartItemRepository, never()).save(any(CartItem.class));
    }

    @Test
    void updateCartItemQuantity_ShouldThrowCartItemNotFoundException_WhenItemNotInCart() {
        UpdateCartItemRequest request = new UpdateCartItemRequest(2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartIdAndProductId(100L, 999L)).thenReturn(Optional.empty());

        assertThrows(CartItemNotFoundException.class, () ->
                cartService.updateCartItemQuantity("alice@example.com", 999L, request)
        );
    }

    @Test
    void removeFromCart_ShouldDeleteItem() {
        CartItem existingItem = new CartItem(1L, testCart, testProduct, 2);

        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartIdAndProductId(100L, 10L)).thenReturn(Optional.of(existingItem));
        when(cartItemRepository.findByCartId(100L)).thenReturn(Collections.emptyList());

        CartResponse response = cartService.removeFromCart("alice@example.com", 10L);

        verify(cartItemRepository).delete(existingItem);
        assertTrue(response.getItems().isEmpty());
    }

    @Test
    void clearCart_ShouldDeleteAllItemsForCart() {
        when(userRepository.findByEmailForUpdate("alice@example.com")).thenReturn(Optional.of(testUser));
        when(cartRepository.findByUserId(1L)).thenReturn(Optional.of(testCart));
        when(cartItemRepository.findByCartId(100L)).thenReturn(Collections.emptyList());

        CartResponse response = cartService.clearCart("alice@example.com");

        verify(cartItemRepository).deleteByCartId(100L);
        assertTrue(response.getItems().isEmpty());
        assertEquals(BigDecimal.ZERO, response.getTotalAmount());
    }
}
