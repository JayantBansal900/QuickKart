package com.quickkart.product.repository;

import com.quickkart.product.entity.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long>,
        org.springframework.data.jpa.repository.JpaSpecificationExecutor<Product> {

    /** One GROUP BY query instead of loading every product just to count categories. */
    @Query("SELECT new com.quickkart.product.dto.CategoryCount(UPPER(p.category), COUNT(p)) "
            + "FROM Product p WHERE p.category IS NOT NULL "
            + "AND (p.availability IS NULL OR UPPER(p.availability) <> 'DISCONTINUED') "
            + "AND NOT EXISTS (SELECT c.id FROM Category c WHERE UPPER(c.name) = UPPER(p.category) AND c.active = false) "
            + "GROUP BY UPPER(p.category) ORDER BY UPPER(p.category)")
    List<com.quickkart.product.dto.CategoryCount> countByCategory();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Long id);

    List<Product> findByCategoryIgnoreCase(String category);

    Optional<Product> findBySku(String sku);

    long countByCategoryIgnoreCase(String category);

    @org.springframework.data.jpa.repository.Modifying
    @Query("update Product p set p.category = :newName where upper(p.category) = upper(:oldName)")
    int renameCategory(@Param("oldName") String oldName, @Param("newName") String newName);
}
