package com.quickkart.order.service;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CartItemResponse;
import com.quickkart.order.dto.CartResponse;
import com.quickkart.order.dto.UpdateCartItemRequest;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.entity.CartItem;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.ProductVariant;
import com.quickkart.order.repository.ProductVariantRepository;
import com.quickkart.order.entity.User;
import com.quickkart.order.exception.CartItemNotFoundException;
import com.quickkart.order.exception.InsufficientStockException;
import com.quickkart.order.exception.ProductNotFoundException;
import com.quickkart.order.exception.ResourceNotFoundException;
import com.quickkart.order.repository.CartItemRepository;
import com.quickkart.order.repository.CartRepository;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
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
    private final ProductVariantRepository variantRepository;

    public CartService(
            CartRepository cartRepository,
            CartItemRepository cartItemRepository,
            ProductRepository productRepository,
            UserRepository userRepository,
            ProductVariantRepository variantRepository) {
        this.variantRepository = variantRepository;
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
        ProductVariant variant = resolveVariant(product, request.getVariantId());
        int available = variant == null ? product.getStockQuantity() : variant.getStockQuantity();
        String what = product.getName() + (variant == null ? "" : " (" + variant.label() + ")");

        Optional<CartItem> existingItemOpt = findLine(cart.getId(), product.getId(), variant == null ? null : variant.getId());

        if (existingItemOpt.isPresent()) {
            CartItem existingItem = existingItemOpt.get();
            int newQuantity = Math.addExact(existingItem.getQuantity(), request.getQuantity());

            if (newQuantity > available) {
                throw new InsufficientStockException(
                        "Insufficient stock for product: " + what +
                                ". Available: " + available +
                                ", requested total: " + newQuantity
                );
            }

            existingItem.setQuantity(newQuantity);
            cartItemRepository.save(existingItem);
        } else {
            if (request.getQuantity() > available) {
                throw new InsufficientStockException(
                        "Insufficient stock for product: " + what +
                                ". Available: " + available +
                                ", requested: " + request.getQuantity()
                );
            }

            CartItem newItem = new CartItem(cart, product, request.getQuantity());
            newItem.setVariant(variant);
            cartItemRepository.save(newItem);
        }

        cart.touch();
        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse updateCartItemQuantity(String userEmail, Long productId, UpdateCartItemRequest request) {
        return updateCartItemQuantity(userEmail, productId, null, request);
    }

    @Transactional
    public CartResponse updateCartItemQuantity(String userEmail, Long productId, Long variantId, UpdateCartItemRequest request) {
        if(request.getQuantity()==null || request.getQuantity()<1) throw new IllegalArgumentException("Quantity must be positive");
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        CartItem cartItem = findLine(cart.getId(), productId, variantId)
                .orElseThrow(() -> new CartItemNotFoundException("Product not found in cart with id: " + productId));

        Product product = cartItem.getProduct();
        ProductVariant variant = cartItem.getVariant();
        int available = variant == null ? product.getStockQuantity() : variant.getStockQuantity();
        if (request.getQuantity() > available) {
            throw new InsufficientStockException(
                    "Insufficient stock for product: " + product.getName() + (variant == null ? "" : " (" + variant.label() + ")") +
                            ". Available: " + available +
                            ", requested: " + request.getQuantity()
            );
        }

        cartItem.setQuantity(request.getQuantity());
        cartItemRepository.save(cartItem);

        cart.touch();
        return buildCartResponse(cart);
    }

    @Transactional
    public CartResponse removeFromCart(String userEmail, Long productId) {
        return removeFromCart(userEmail, productId, null);
    }

    @Transactional
    public CartResponse removeFromCart(String userEmail, Long productId, Long variantId) {
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        CartItem cartItem = findLine(cart.getId(), productId, variantId)
                .orElseThrow(() -> new CartItemNotFoundException("Product not found in cart with id: " + productId));

        cartItemRepository.delete(cartItem);

        cart.touch();
        return buildCartResponse(cart);
    }

    private Optional<CartItem> findLine(Long cartId, Long productId, Long variantId) {
        return variantId == null
                ? cartItemRepository.findByCartIdAndProductIdAndVariantIsNull(cartId, productId)
                : cartItemRepository.findByCartIdAndProductIdAndVariantId(cartId, productId, variantId);
    }

    /** A product with sizes can only be bought with one of them chosen; one without cannot be given a size. */
    private ProductVariant resolveVariant(Product product, Long variantId) {
        if (variantId == null) {
            if (variantRepository.countByProductId(product.getId()) > 0) {
                throw new IllegalArgumentException("Choose a size for " + product.getName());
            }
            return null;
        }
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new IllegalArgumentException("That size is not available"));
        if (!variant.getProduct().getId().equals(product.getId())) {
            throw new IllegalArgumentException("That size does not belong to this product");
        }
        return variant;
    }

    @Transactional
    public CartResponse clearCart(String userEmail) {
        User user = getUserByEmail(userEmail);
        Cart cart = getOrCreateCart(user);

        cartItemRepository.deleteByCartId(cart.getId());

        cart.touch();
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
