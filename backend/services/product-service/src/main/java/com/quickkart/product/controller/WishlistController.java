package com.quickkart.product.controller;

import com.quickkart.product.dto.ProductResponse;
import com.quickkart.product.entity.Product;
import com.quickkart.product.entity.WishlistItem;
import com.quickkart.product.exception.ProductNotFoundException;
import com.quickkart.product.repository.ProductRepository;
import com.quickkart.product.repository.WishlistRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** The signed-in customer's wishlist: products saved for later. */
@RestController
@RequestMapping("/api/wishlist")
public class WishlistController {

    private static final int MAX_ITEMS = 200;

    private final WishlistRepository wishlist;
    private final ProductRepository products;
    private final JdbcTemplate jdbc;

    public WishlistController(WishlistRepository wishlist, ProductRepository products, JdbcTemplate jdbc) {
        this.wishlist = wishlist;
        this.products = products;
        this.jdbc = jdbc;
    }

    /** Saved products, newest first. */
    @GetMapping
    @Transactional(readOnly = true)
    public List<ProductResponse> list(Authentication auth) {
        List<WishlistItem> items = wishlist.findByUserIdOrderByCreatedAtDesc(userId(auth));
        Map<Long, Product> byId = products.findAllById(items.stream().map(WishlistItem::getProductId).toList()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        return items.stream().map(i -> byId.get(i.getProductId())).filter(p -> p != null).map(ProductResponse::fromEntity).toList();
    }

    /** Just the ids, so product cards can show a filled heart. */
    @GetMapping("/ids")
    @Transactional(readOnly = true)
    public List<Long> ids(Authentication auth) {
        return wishlist.findByUserIdOrderByCreatedAtDesc(userId(auth)).stream().map(WishlistItem::getProductId).toList();
    }

    /** Idempotent: saving an already saved product is fine. */
    @PutMapping("/{productId}")
    @Transactional
    public ResponseEntity<Void> add(Authentication auth, @PathVariable Long productId) {
        Long userId = userId(auth);
        if (!products.existsById(productId)) throw new ProductNotFoundException(productId);
        if (!wishlist.existsByUserIdAndProductId(userId, productId)) {
            if (wishlist.findByUserIdOrderByCreatedAtDesc(userId).size() >= MAX_ITEMS)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Your wishlist is full (" + MAX_ITEMS + " items)");
            try {
                wishlist.saveAndFlush(new WishlistItem(userId, productId));
            } catch (DataIntegrityViolationException alreadySaved) {
                // a parallel request saved it first
            }
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{productId}")
    @Transactional
    public ResponseEntity<Void> remove(Authentication auth, @PathVariable Long productId) {
        wishlist.deleteItem(userId(auth), productId);
        return ResponseEntity.noContent().build();
    }

    private Long userId(Authentication auth) {
        return jdbc.queryForList("select id from users where email = ?", Long.class, auth.getName()).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found"));
    }
}
