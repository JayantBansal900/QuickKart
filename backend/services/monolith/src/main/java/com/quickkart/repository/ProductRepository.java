package com.quickkart.repository;

import com.quickkart.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Long id);

    Optional<Product> findBySku(String sku);

    long countByStockQuantityLessThan(int threshold);

    long countByStockQuantityBetween(int min, int max);

    long countByStockQuantityLessThanEqual(int threshold);

    // On-sale products only: discontinued rows stay in the table (orders reference them) but are not
    // part of the store, so admin counts match what shoppers can see.
    String ON_SALE = "(p.availability IS NULL OR UPPER(p.availability) <> 'DISCONTINUED')";

    @Query("SELECT COUNT(p) FROM Product p WHERE " + ON_SALE)
    long countOnSale();

    @Query("SELECT COUNT(p) FROM Product p WHERE " + ON_SALE + " AND p.stockQuantity BETWEEN :min AND :max")
    long countOnSaleWithStockBetween(@Param("min") int min, @Param("max") int max);

    @Query("SELECT COUNT(p) FROM Product p WHERE " + ON_SALE + " AND p.stockQuantity <= 0")
    long countOnSaleOutOfStock();
}
