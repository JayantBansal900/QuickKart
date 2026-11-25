package com.quickkart.order.repository;

import com.quickkart.order.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CartItemRepository extends JpaRepository<CartItem, Long> {

    Optional<CartItem> findByCartIdAndProductId(Long cartId, Long productId);

    /** The line for a product that has no sizes/colours. */
    Optional<CartItem> findByCartIdAndProductIdAndVariantIsNull(Long cartId, Long productId);

    /** The line for one size/colour of a product. */
    Optional<CartItem> findByCartIdAndProductIdAndVariantId(Long cartId, Long productId, Long variantId);

    List<CartItem> findByCartId(Long cartId);

    void deleteByCartIdAndProductId(Long cartId, Long productId);

    void deleteByCartId(Long cartId);
}
