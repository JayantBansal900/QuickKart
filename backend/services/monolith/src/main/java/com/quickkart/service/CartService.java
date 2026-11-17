package com.quickkart.service;

import com.quickkart.dto.AddCartItemRequest;
import com.quickkart.dto.CartItemResponse;
import com.quickkart.dto.CartResponse;
import com.quickkart.dto.UpdateCartItemRequest;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.exception.CartItemNotFoundException;
import com.quickkart.exception.InsufficientStockException;
import com.quickkart.exception.ProductNotFoundException;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
import com.quickkart.repository.ProductRepository;
import com.quickkart.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class CartService {

    private final CartRepository cartRepository;
    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    public CartService(
            CartRepository cartRepository,
            CartItemRepository cartItemRepository,
            ProductRepository productRepository,
            UserRepository userRepository) {
        this.cartRepository = cartRepository;
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public CartResponse getCart(String userEmail) {
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);
        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse addToCart(String userEmail, AddCartItemRequest request) {
        if(request.getQuantity()==null || request.getQuantity()<1) throw new IllegalArgumentException("Quantity must be positive");
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        Product product = productRepository.findById(request.getProductId())
                .orElseThrow(() -> new ProductNotFoundException(request.getProductId()));

        Optional<CartItem> existingItemOpt = cartItemRepository.findByCartIdAndProductId(cart.getId(), product.getId());

        if (existingItemOpt.isPresent()) {
            CartItem existingItem = existingItemOpt.get();
            int newQuantity = Math.addExact(existingItem.getQuantity(), request.getQuantity());

            if (newQuantity > product.getStockQuantity()) {
                throw new InsufficientStockException(
                        "Insufficient stock for product: " + product.getName() +
                                ". Available: " + product.getStockQuantity() +
                                ", requested total: " + newQuantity
                );
            }

            existingItem.setQuantity(newQuantity);
            cartItemRepository.save(existingItem);
        } else {
            if (request.getQuantity() > product.getStockQuantity()) {
                throw new InsufficientStockException(
                        "Insufficient stock for product: " + product.getName() +
                                ". Available: " + product.getStockQuantity() +
                                ", requested: " + request.getQuantity()
                );
            }

            CartItem newItem = new CartItem(cart, product, request.getQuantity());
            cartItemRepository.save(newItem);
        }

        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse updateCartItemQuantity(String userEmail, Long productId, UpdateCartItemRequest request) {
        if(request.getQuantity()==null || request.getQuantity()<1) throw new IllegalArgumentException("Quantity must be positive");
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        CartItem cartItem = cartItemRepository.findByCartIdAndProductId(cart.getId(), productId)
                .orElseThrow(() -> new CartItemNotFoundException("Product not found in cart with id: " + productId));

        Product product = cartItem.getProduct();
        if (request.getQuantity() > product.getStockQuantity()) {
            throw new InsufficientStockException(
                    "Insufficient stock for product: " + product.getName() +
                            ". Available: " + product.getStockQuantity() +
                            ", requested: " + request.getQuantity()
            );
        }

        cartItem.setQuantity(request.getQuantity());
        cartItemRepository.save(cartItem);

        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse removeFromCart(String userEmail, Long productId) {
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        CartItem cartItem = cartItemRepository.findByCartIdAndProductId(cart.getId(), productId)
                .orElseThrow(() -> new CartItemNotFoundException("Product not found in cart with id: " + productId));

        cartItemRepository.delete(cartItem);

        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse clearCart(String userEmail) {
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        cartItemRepository.deleteByCartId(cart.getId());

        return buildCartResponse(cart);
    }

    private User getUserByEmail(String email) {
        return userRepository.findByEmailForUpdate(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with email: " + email));
    }

    private Cart getOrCreateCart(User user) {
        return cartRepository.findByUserId(user.getId())
                .orElseGet(() -> cartRepository.save(new Cart(user)));
    }

    private CartResponse buildCartResponse(Cart cart) {
        List<CartItem> items = cartItemRepository.findByCartId(cart.getId());
        List<CartItemResponse> itemResponses = items.stream()
                .map(CartItemResponse::fromEntity)
                .collect(Collectors.toList());

        BigDecimal totalAmount = itemResponses.stream()
                .map(CartItemResponse::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        CartResponse response=new CartResponse(cart.getId(), itemResponses, totalAmount);
        response.setFingerprint(CartQuote.fingerprint(items));
        return response;
    }
}
